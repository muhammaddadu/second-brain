/**
 * Vault operations — the one place every surface (app, CLI, MCP) goes through for note I/O.
 * Mutations write via {@link atomicWriteFile} (ADR 0002) and never overwrite silently: creates
 * refuse an existing target and deletes move to trash. The clock is injected so tests get
 * deterministic timestamps (AGENTS.md § Engineering Principles → dependency injection).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { atomicWriteFile } from './atomic.js';
import {
  CURRENT_ENVELOPE_VERSION,
  type NoteEnvelope,
  type NoteMeta,
  parseNote,
  serializeNote,
  setTags,
} from './envelope.js';
import { InvalidPathError, NoteConflictError, NoteExistsError } from './errors.js';
import {
  BRAIN_DIR,
  NOTE_EXTENSION,
  ORDER_FILE,
  RULES_FILE,
  TRASH_DIRNAME,
  VAULT_MARKER_FILE,
} from './paths.js';
import { listTree } from './tree.js';

/** A clock returning an ISO-8601 timestamp; injected for deterministic tests. */
export type Clock = () => string;

export interface VaultOptions {
  /** Defaults to wall-clock ISO time. */
  now?: Clock;
}

export interface Vault {
  readonly root: string;
  readonly now: Clock;
}

/** Fields a caller may set when creating a note; the rest of the envelope is filled in. */
export interface CreateNoteInput {
  title?: string;
  tags?: readonly string[];
  blocks?: unknown[];
}

/** The wall-clock ISO timestamp source used when no clock is injected. */
const defaultClock: Clock = () => new Date().toISOString();

/** Open a vault rooted at an absolute directory path. Does not touch the filesystem. */
export function openVault(root: string, options: VaultOptions = {}): Vault {
  return {
    root: resolve(root),
    now: options.now ?? defaultClock,
  };
}

/**
 * Create the directory (if needed) and mark it as a vault by writing the {@link VAULT_MARKER_FILE}
 * under {@link BRAIN_DIR}. Idempotent — safe to call on an existing vault. This is what makes
 * first-run setup "create a folder and go" without the user hand-building anything.
 */
export async function initVault(root: string, now: Clock = defaultClock): Promise<void> {
  const abs = resolve(root);
  await mkdir(join(abs, BRAIN_DIR), { recursive: true });
  const marker = join(abs, BRAIN_DIR, VAULT_MARKER_FILE);
  if (!(await pathExists(marker))) {
    await atomicWriteFile(marker, `${JSON.stringify({ version: 1, created: now() }, null, 2)}\n`);
  }
}

/** Whether a directory is a Second Brain vault (has the marker under {@link BRAIN_DIR}). */
export async function isVault(root: string): Promise<boolean> {
  return pathExists(join(resolve(root), BRAIN_DIR, VAULT_MARKER_FILE));
}

/**
 * Resolve any vault-relative path to an absolute path, rejecting anything that escapes the vault
 * root or reaches into the reserved {@link BRAIN_DIR}. The trust boundary for caller paths.
 */
function resolveInVault(vault: Vault, relPath: string): string {
  const abs = resolve(vault.root, relPath);
  const rel = relative(vault.root, abs);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new InvalidPathError(`path escapes the vault: ${relPath}`);
  }
  if (rel.split(/[\\/]/)[0] === BRAIN_DIR) {
    throw new InvalidPathError(`path is inside reserved ${BRAIN_DIR}: ${relPath}`);
  }
  return abs;
}

/** Like {@link resolveInVault}, but also requires the path to be a `.note.json` file. */
function resolveNotePath(vault: Vault, relPath: string): string {
  if (!relPath.endsWith(NOTE_EXTENSION)) {
    throw new InvalidPathError(`note path must end with ${NOTE_EXTENSION}: ${relPath}`);
  }
  return resolveInVault(vault, relPath);
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

/** Read and parse a note by its vault-relative path. */
export async function readNote(vault: Vault, relPath: string): Promise<NoteEnvelope> {
  const abs = resolveNotePath(vault, relPath);
  return parseNote(await readFile(abs, 'utf8'));
}

/**
 * Create a new note, filling in `version`, `created`, and `updated` (both = now). Refuses to
 * overwrite an existing file. Returns the created envelope.
 */
export async function createNote(
  vault: Vault,
  relPath: string,
  input: CreateNoteInput = {},
): Promise<NoteEnvelope> {
  const abs = resolveNotePath(vault, relPath);
  if (await pathExists(abs)) {
    throw new NoteExistsError(`note already exists: ${relPath}`);
  }
  const timestamp = vault.now();
  const meta: NoteMeta = {
    tags: input.tags ? [...input.tags] : [],
    created: timestamp,
    updated: timestamp,
  };
  if (input.title !== undefined) meta.title = input.title;
  const note: NoteEnvelope = {
    version: CURRENT_ENVELOPE_VERSION,
    meta,
    blocks: input.blocks ?? [],
  };
  await atomicWriteFile(abs, serializeNote(note));
  return note;
}

/**
 * Persist an edited note, touching `meta.updated` to now (and seeding `created` if it was
 * missing). This is the general save path for body and metadata changes alike.
 */
export async function writeNote(
  vault: Vault,
  relPath: string,
  note: NoteEnvelope,
): Promise<NoteEnvelope> {
  const abs = resolveNotePath(vault, relPath);
  const timestamp = vault.now();
  const updated: NoteEnvelope = {
    ...note,
    meta: { ...note.meta, created: note.meta.created ?? timestamp, updated: timestamp },
  };
  await atomicWriteFile(abs, serializeNote(updated));
  return updated;
}

/**
 * Replace a note's body blocks, preserving all metadata (and touching `updated`). This is the
 * editor autosave path — read current envelope, swap blocks, write. Metadata is untouched unless
 * a separate op changes it (E2 acceptance: metadata survives editing).
 */
export async function updateNoteBlocks(
  vault: Vault,
  relPath: string,
  blocks: unknown[],
): Promise<NoteEnvelope> {
  const note = await readNote(vault, relPath);
  return writeNote(vault, relPath, { ...note, blocks });
}

/** Replace a note's tags, preserving body and other metadata. */
export async function updateNoteTags(
  vault: Vault,
  relPath: string,
  tags: readonly string[],
): Promise<NoteEnvelope> {
  const note = await readNote(vault, relPath);
  return writeNote(vault, relPath, setTags(note, tags));
}

/** Set a note's display title (in metadata), preserving body and other metadata. */
export async function updateNoteTitle(
  vault: Vault,
  relPath: string,
  title: string,
): Promise<NoteEnvelope> {
  const note = await readNote(vault, relPath);
  return writeNote(vault, relPath, { ...note, meta: { ...note.meta, title } });
}

/** Content hash of a note file's bytes — the baseline for the conflict guard (ADR 0002). */
export async function hashNote(vault: Vault, relPath: string): Promise<string> {
  const abs = resolveNotePath(vault, relPath);
  return createHash('sha256')
    .update(await readFile(abs))
    .digest('hex');
}

/**
 * Save blocks only if the file still matches `baseHash` (the hash the caller last read). If the
 * file changed on disk since — an agent, a git pull, another editor — this throws
 * {@link NoteConflictError} instead of clobbering (ADR 0002 compare-and-swap). Returns the new hash.
 */
export async function updateNoteBlocksGuarded(
  vault: Vault,
  relPath: string,
  blocks: unknown[],
  baseHash: string,
): Promise<string> {
  if ((await hashNote(vault, relPath)) !== baseHash) {
    throw new NoteConflictError(`note changed on disk since last read: ${relPath}`);
  }
  await updateNoteBlocks(vault, relPath, blocks);
  return hashNote(vault, relPath);
}

/** Create an empty folder at a vault-relative path (for the tree's "new folder" action). */
export async function createFolder(vault: Vault, relPath: string): Promise<void> {
  await mkdir(resolveInVault(vault, relPath), { recursive: true });
}

/** Read the owner's agent rules ({@link RULES_FILE}), or '' if none exists yet. */
export async function readRules(vault: Vault): Promise<string> {
  try {
    return await readFile(join(vault.root, RULES_FILE), 'utf8');
  } catch {
    return '';
  }
}

/** Write the owner's agent rules; a blank value removes the file (no empty RULES.md left behind). */
export async function writeRules(vault: Vault, text: string): Promise<void> {
  const path = join(vault.root, RULES_FILE);
  if (text.trim()) {
    await atomicWriteFile(path, text.endsWith('\n') ? text : `${text}\n`);
  } else {
    await rm(path, { force: true });
  }
}

/**
 * Persist a folder's manual child order by writing its {@link ORDER_FILE} sidecar (ADR 0005).
 * `folderRel` is `''` for the vault root. `orderedNames` are on-disk entry names (a folder's dir
 * name, a note's `.note.json` filename); the tree treats them as advisory, so callers needn't list
 * every child. Rejects names with path separators — the sidecar orders one folder, never reaches out.
 */
export async function setFolderOrder(
  vault: Vault,
  folderRel: string,
  orderedNames: readonly string[],
): Promise<void> {
  for (const name of orderedNames) {
    if (name.includes('/') || name.includes('\\') || name === '..') {
      throw new InvalidPathError(`order entry must be a bare child name: ${name}`);
    }
  }
  const dir = folderRel === '' ? vault.root : resolveInVault(vault, folderRel);
  await atomicWriteFile(join(dir, ORDER_FILE), `${JSON.stringify(orderedNames, null, 2)}\n`);
}

/** Move a note to a new vault-relative path (across folders). Refuses to overwrite a target. */
export async function moveNote(vault: Vault, fromRel: string, toRel: string): Promise<void> {
  const fromAbs = resolveNotePath(vault, fromRel);
  const toAbs = resolveNotePath(vault, toRel);
  if (await pathExists(toAbs)) {
    throw new NoteExistsError(`destination already exists: ${toRel}`);
  }
  await atomicRename(fromAbs, toAbs);
}

/** Rename a note within its current folder, keeping its location. `newName` includes the extension. */
export async function renameNote(vault: Vault, relPath: string, newName: string): Promise<string> {
  if (!newName.endsWith(NOTE_EXTENSION)) {
    throw new InvalidPathError(`new name must end with ${NOTE_EXTENSION}: ${newName}`);
  }
  if (newName.includes('/') || newName.includes('\\')) {
    throw new InvalidPathError(`new name must not contain path separators: ${newName}`);
  }
  const dir = dirname(relPath);
  const toRel = dir === '.' ? newName : `${dir}/${newName}`;
  await moveNote(vault, relPath, toRel);
  return toRel;
}

/** Sanitize a display title into a safe filename base: no separators or leading dots, spaces collapsed. */
export function titleToFilenameBase(title: string): string {
  return title.replace(/[\\/]/g, '-').replace(/^\.+/, '').replace(/\s+/g, ' ').trim();
}

/** The nth free-name candidate for `base`: "Base", "Base 1", "Base 2", … */
function numberedName(base: string, n: number): string {
  return `${base}${n === 0 ? '' : ` ${n}`}`;
}

/**
 * Create a note in `folder` ('' = root) under the first free name derived from `base`
 * ("Untitled", "Untitled 1", …). The naming policy lives here so every surface de-dupes identically.
 */
export async function createNoteWithUniqueName(
  vault: Vault,
  folder: string,
  base: string,
): Promise<string> {
  for (let n = 0; ; n += 1) {
    const name = `${numberedName(base, n)}${NOTE_EXTENSION}`;
    const relPath = folder ? `${folder}/${name}` : name;
    try {
      await createNote(vault, relPath, { title: base });
      return relPath;
    } catch (error) {
      if (error instanceof NoteExistsError) continue;
      throw error;
    }
  }
}

/** Create a folder under `parent` ('' = root) with the first free name derived from `base`. */
export async function createFolderWithUniqueName(
  vault: Vault,
  parent: string,
  base: string,
): Promise<string> {
  const existing = new Set((await listTree(vault.root)).map((n) => n.path));
  for (let n = 0; ; n += 1) {
    const relPath = parent ? `${parent}/${numberedName(base, n)}` : numberedName(base, n);
    if (!existing.has(relPath)) {
      await createFolder(vault, relPath);
      return relPath;
    }
  }
}

/**
 * Set a note's display title and rename its file to match (sanitized via
 * {@link titleToFilenameBase}, de-duplicated with a numeric suffix in the same folder). The one
 * implementation of "title drives the filename" — app, CLI, and MCP all go through it.
 * Returns the (possibly new) path and the applied title.
 */
export async function setNoteTitle(
  vault: Vault,
  relPath: string,
  title: string,
): Promise<{ path: string; title: string }> {
  const trimmed = title.trim();
  if (!trimmed) return { path: relPath, title: '' };
  await updateNoteTitle(vault, relPath, trimmed);
  const base = titleToFilenameBase(trimmed);
  const currentBase = basename(relPath, NOTE_EXTENSION);
  if (!base || base === currentBase) return { path: relPath, title: trimmed };
  const dir = dirname(relPath);
  for (let n = 0; ; n += 1) {
    const name = `${numberedName(base, n)}${NOTE_EXTENSION}`;
    if (dir !== '.' && `${dir}/${name}` === relPath) return { path: relPath, title: trimmed };
    try {
      return { path: await renameNote(vault, relPath, name), title: trimmed };
    } catch (error) {
      if (error instanceof NoteExistsError) continue;
      throw error;
    }
  }
}

/**
 * The vault-relative trash destination for an entry: a filesystem-safe timestamp prefix keeps
 * repeated deletes of the same name from colliding. Shared by note and folder soft-deletes.
 */
function trashRelFor(vault: Vault, relPath: string): string {
  const stamp = vault.now().replace(/[:.]/g, '-');
  return `${BRAIN_DIR}/${TRASH_DIRNAME}/${stamp}__${basename(relPath)}`;
}

/**
 * Soft-delete a note: move it under {@link BRAIN_DIR}/{@link TRASH_DIRNAME} rather than removing
 * it (no silent data loss — PRD §4.2). Returns the vault-relative trash path it now lives at.
 */
export async function trashNote(vault: Vault, relPath: string): Promise<string> {
  const fromAbs = resolveNotePath(vault, relPath);
  const trashRel = trashRelFor(vault, relPath);
  await atomicRename(fromAbs, join(vault.root, trashRel));
  return trashRel;
}

/** Rename a folder in place (keeping its parent). Refuses to overwrite. Returns the new path. */
export async function renameFolder(
  vault: Vault,
  relPath: string,
  newName: string,
): Promise<string> {
  if (newName.includes('/') || newName.includes('\\')) {
    throw new InvalidPathError(`new name must not contain path separators: ${newName}`);
  }
  const fromAbs = resolveInVault(vault, relPath);
  const parent = dirname(relPath);
  const toRel = parent === '.' ? newName : `${parent}/${newName}`;
  const toAbs = resolveInVault(vault, toRel);
  if (await pathExists(toAbs)) {
    throw new NoteExistsError(`destination already exists: ${toRel}`);
  }
  await atomicRename(fromAbs, toAbs);
  return toRel;
}

/** Move a folder (and its contents) to a new vault-relative path. Refuses to overwrite. */
export async function moveFolder(vault: Vault, fromRel: string, toRel: string): Promise<void> {
  const fromAbs = resolveInVault(vault, fromRel);
  const toAbs = resolveInVault(vault, toRel);
  if (await pathExists(toAbs)) {
    throw new NoteExistsError(`destination already exists: ${toRel}`);
  }
  await atomicRename(fromAbs, toAbs);
}

/** Soft-delete a folder (and its contents) to trash. Returns the trash path it now lives at. */
export async function trashFolder(vault: Vault, relPath: string): Promise<string> {
  const fromAbs = resolveInVault(vault, relPath);
  const trashRel = trashRelFor(vault, relPath);
  await atomicRename(fromAbs, join(vault.root, trashRel));
  return trashRel;
}

/** rename that first ensures the destination directory exists. */
async function atomicRename(fromAbs: string, toAbs: string): Promise<void> {
  await mkdir(dirname(toAbs), { recursive: true });
  await rename(fromAbs, toAbs);
}

/** Permanently remove everything under the vault's trash directory. */
export async function emptyTrash(vault: Vault): Promise<void> {
  await rm(join(vault.root, BRAIN_DIR, TRASH_DIRNAME), { recursive: true, force: true });
}

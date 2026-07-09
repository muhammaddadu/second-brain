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
import { BRAIN_DIR, NOTE_EXTENSION, TRASH_DIRNAME, VAULT_MARKER_FILE } from './paths.js';

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

/** Open a vault rooted at an absolute directory path. Does not touch the filesystem. */
export function openVault(root: string, options: VaultOptions = {}): Vault {
  return {
    root: resolve(root),
    now: options.now ?? (() => new Date().toISOString()),
  };
}

/**
 * Create the directory (if needed) and mark it as a vault by writing the {@link VAULT_MARKER_FILE}
 * under {@link BRAIN_DIR}. Idempotent — safe to call on an existing vault. This is what makes
 * first-run setup "create a folder and go" without the user hand-building anything.
 */
export async function initVault(
  root: string,
  now: Clock = () => new Date().toISOString(),
): Promise<void> {
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

/**
 * Soft-delete a note: move it under {@link BRAIN_DIR}/{@link TRASH_DIRNAME} rather than removing
 * it (no silent data loss — PRD §4.2). Returns the vault-relative trash path it now lives at.
 */
export async function trashNote(vault: Vault, relPath: string): Promise<string> {
  const fromAbs = resolveNotePath(vault, relPath);
  // A filesystem-safe stamp keeps repeated deletes of the same name from colliding.
  const stamp = vault.now().replace(/[:.]/g, '-');
  const trashRel = `${BRAIN_DIR}/${TRASH_DIRNAME}/${stamp}__${basename(relPath)}`;
  const trashAbs = join(vault.root, trashRel);
  await atomicRename(fromAbs, trashAbs);
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
  const stamp = vault.now().replace(/[:.]/g, '-');
  const trashRel = `${BRAIN_DIR}/${TRASH_DIRNAME}/${stamp}__${basename(relPath)}`;
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

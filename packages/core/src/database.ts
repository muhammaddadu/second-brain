/**
 * Databases (E8, ADR 0004): a folder is a database when it contains a `database.json` schema; every
 * note in it is a row whose typed values live under `meta.properties`, keyed by **stable property
 * id** (renaming a property never rewrites rows). Views are presentation, saved in the schema.
 * Because a row *is* a note, everything else (editor, search, export, watcher, agents) already
 * works on rows — this module only owns the schema file, value validation, and row listing.
 * The files stay the source of truth; nothing here writes to the derived index.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWriteFile } from './atomic.js';
import { InvalidPathError } from './errors.js';
import { DATABASE_FILE, noteTitle } from './paths.js';
import { listTree, type TreeNode } from './tree.js';
import { readNote, type Vault, writeNote } from './vault.js';

/** Property types v1 (PRD §3.8). Relations/rollups are deferred (E8 notes). */
export const PROPERTY_TYPES = [
  'text',
  'number',
  'select',
  'multiSelect',
  'date',
  'checkbox',
  'url',
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** One typed column. `id` is stable — renames touch only `name`, never row files. */
export interface PropertyDef {
  id: string;
  name: string;
  type: PropertyType;
  /** Allowed choices for select / multiSelect. */
  options?: string[];
}

/** A saved presentation of the database. `groupBy` is a select property id (board views). */
export interface DatabaseViewDef {
  name: string;
  type: 'table' | 'board';
  groupBy?: string;
}

export interface DatabaseSchema {
  version: 1;
  properties: PropertyDef[];
  views: DatabaseViewDef[];
}

/** One row for a view: the note, its display title, and its (raw) property values by id. */
export interface DatabaseRow {
  path: string;
  title: string;
  properties: Record<string, unknown>;
}

/** Deterministic serialization — same rule as notes: stable shape, trailing newline. */
function serializeSchema(schema: DatabaseSchema): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}

function schemaPath(vault: Vault, folderRel: string): string {
  return join(vault.root, folderRel, DATABASE_FILE);
}

/** Read a folder's database schema, or null when the folder isn't a database / file is malformed. */
export async function readDatabase(
  vault: Vault,
  folderRel: string,
): Promise<DatabaseSchema | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(schemaPath(vault, folderRel), 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    const schema = raw as Partial<DatabaseSchema>;
    if (!Array.isArray(schema.properties) || !Array.isArray(schema.views)) return null;
    return { version: 1, properties: schema.properties, views: schema.views };
  } catch {
    return null;
  }
}

/** Persist a schema (atomic write; ADR 0002). */
export async function writeDatabase(
  vault: Vault,
  folderRel: string,
  schema: DatabaseSchema,
): Promise<void> {
  await atomicWriteFile(schemaPath(vault, folderRel), serializeSchema(schema));
}

/** Turn a folder into a database: seed an empty schema with a default table view. Idempotent. */
export async function createDatabase(vault: Vault, folderRel: string): Promise<DatabaseSchema> {
  const existing = await readDatabase(vault, folderRel);
  if (existing) return existing;
  const schema: DatabaseSchema = {
    version: 1,
    properties: [],
    views: [{ name: 'Table', type: 'table' }],
  };
  await writeDatabase(vault, folderRel, schema);
  return schema;
}

/** Stable, collision-resistant property id (never derived from the name, so renames are free). */
function newPropertyId(): string {
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}

/** Add a property to the schema; returns the new definition (with its generated stable id). */
export async function addProperty(
  vault: Vault,
  folderRel: string,
  input: { name: string; type: PropertyType; options?: string[] },
): Promise<PropertyDef> {
  const schema = await requireDatabase(vault, folderRel);
  const def: PropertyDef = {
    id: newPropertyId(),
    name: input.name,
    type: input.type,
    ...(input.options ? { options: input.options } : {}),
  };
  schema.properties.push(def);
  await writeDatabase(vault, folderRel, schema);
  return def;
}

/** Rename a property by stable id — schema-only; row files are untouched (ADR 0004). */
export async function renameProperty(
  vault: Vault,
  folderRel: string,
  propertyId: string,
  newName: string,
): Promise<void> {
  const schema = await requireDatabase(vault, folderRel);
  const def = schema.properties.find((p) => p.id === propertyId);
  if (!def) throw new InvalidPathError(`no such property: ${propertyId}`);
  def.name = newName;
  await writeDatabase(vault, folderRel, schema);
}

async function requireDatabase(vault: Vault, folderRel: string): Promise<DatabaseSchema> {
  const schema = await readDatabase(vault, folderRel);
  if (!schema) throw new InvalidPathError(`not a database (no ${DATABASE_FILE}): ${folderRel}`);
  return schema;
}

/**
 * Validate + normalize a value for a property type; throws with a plain message on mismatch.
 * `null` always clears the value.
 */
export function validateValue(def: PropertyDef, value: unknown): unknown {
  if (value === null) return null;
  switch (def.type) {
    case 'text':
    case 'url':
      if (typeof value !== 'string') throw new Error(`${def.name} expects text`);
      return value;
    case 'number': {
      const n = typeof value === 'string' ? Number(value) : value;
      if (typeof n !== 'number' || Number.isNaN(n)) throw new Error(`${def.name} expects a number`);
      return n;
    }
    case 'checkbox':
      if (typeof value !== 'boolean') throw new Error(`${def.name} expects true/false`);
      return value;
    case 'date':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new Error(`${def.name} expects a date (ISO string)`);
      }
      return value;
    case 'select':
      if (typeof value !== 'string' || (def.options && !def.options.includes(value))) {
        throw new Error(`${def.name} expects one of: ${def.options?.join(', ') ?? 'a string'}`);
      }
      return value;
    case 'multiSelect': {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        throw new Error(`${def.name} expects a list of strings`);
      }
      const bad = def.options ? value.filter((v) => !def.options?.includes(v)) : [];
      if (bad.length) throw new Error(`${def.name} has unknown options: ${bad.join(', ')}`);
      return value;
    }
    default: {
      const exhausted: never = def.type;
      throw new Error(`unknown property type: ${exhausted}`);
    }
  }
}

/**
 * Set one property value on a row (validated against the folder's schema; `null` clears it).
 * Preserves the note body and all other metadata.
 */
export async function setRowProperty(
  vault: Vault,
  folderRel: string,
  notePath: string,
  propertyId: string,
  value: unknown,
): Promise<void> {
  const schema = await requireDatabase(vault, folderRel);
  const def = schema.properties.find((p) => p.id === propertyId);
  if (!def) throw new InvalidPathError(`no such property: ${propertyId}`);
  const normalized = validateValue(def, value);
  const note = await readNote(vault, notePath);
  const properties = { ...(note.meta.properties ?? {}) };
  if (normalized === null) delete properties[propertyId];
  else properties[propertyId] = normalized;
  await writeNote(vault, notePath, { ...note, meta: { ...note.meta, properties } });
}

/** List a database's rows (its folder's notes, non-recursive) with title + property values. */
export async function listRows(vault: Vault, folderRel: string): Promise<DatabaseRow[]> {
  const tree = await listTree(vault.root);
  const folder = findFolder(tree, folderRel);
  const children = folderRel === '' ? tree : (folder?.children ?? []);
  const notePaths = children.filter((n) => n.type === 'note').map((n) => n.path);
  const rows: DatabaseRow[] = [];
  for (const path of notePaths) {
    try {
      const note = await readNote(vault, path);
      rows.push({
        path,
        title: noteTitle(path, note.meta.title),
        properties: note.meta.properties ?? {},
      });
    } catch {
      // A malformed row must not take down the whole view; it simply doesn't appear.
    }
  }
  return rows;
}

function findFolder(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.type !== 'folder') continue;
    if (node.path === path) return node;
    const inChild = node.children ? findFolder(node.children, path) : null;
    if (inChild) return inChild;
  }
  return null;
}

/**
 * Render a row's properties as a small Markdown header block (name: value lines) for export —
 * the longevity guarantee applies to rows too (PRD §4.4). Returns '' when there is nothing to show.
 */
export function propertiesToMarkdownHeader(
  schema: DatabaseSchema | null,
  properties: Record<string, unknown> | undefined,
): string {
  if (!properties || Object.keys(properties).length === 0) return '';
  const nameOf = (id: string) => schema?.properties.find((p) => p.id === id)?.name ?? id;
  const lines = Object.entries(properties).map(
    ([id, value]) =>
      `**${nameOf(id)}**: ${Array.isArray(value) ? value.join(', ') : String(value)}`,
  );
  return `${lines.join('\n')}\n\n---\n\n`;
}

/** All database folders in the vault (paths that contain a database.json), for surfaces to badge. */
export async function listDatabases(vault: Vault): Promise<string[]> {
  const tree = await listTree(vault.root);
  const folders: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.type === 'folder') {
        folders.push(node.path);
        if (node.children) walk(node.children);
      }
    }
  };
  walk(tree);
  const found: string[] = [];
  for (const folder of ['', ...folders]) {
    if (await readDatabase(vault, folder)) found.push(folder);
  }
  return found.filter(Boolean);
}

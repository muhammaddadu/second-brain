/**
 * The `brain` CLI runner — a thin shell over `packages/core` (no vault logic lives here). Every
 * command resolves a vault (via `--vault` or `BRAIN_VAULT`) and calls core. `run` takes injected IO
 * (env + output sinks) so it is testable in-process; the binary entry (`cli.ts`) wires it to the
 * real process. `--json` gives stable, parseable output for read/search/tree/tag/rules.
 */
import {
  blocksToText,
  createNote,
  embeddingAdapterFromEnv,
  getTags,
  hybridSearch,
  importMarkdownAsNote,
  indexPath,
  isVault,
  listTree,
  markdownToBlocks,
  moveNote,
  noteTitle,
  openSearchIndex,
  openVault,
  readNote,
  readRules,
  rebuildIndex,
  type SearchHit,
  SNIPPET_CLOSE,
  SNIPPET_OPEN,
  setNoteTitle,
  syncIndex,
  type TreeNode,
  trashNote,
  updateNoteBlocks,
  updateNoteTags,
  type Vault,
} from '@brain/core';
import { boolFlag, listFlag, type ParsedArgs, parseArgs, stringFlag } from './args.js';

export interface Io {
  env: NodeJS.ProcessEnv;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = `brain — work with a Second Brain vault from the terminal

Usage: brain <command> [options]   (vault via --vault <path> or BRAIN_VAULT)

Commands:
  tree | list                 Print the folder/note tree
  read <path>                 Show a note (title + text)
  search <query> [--limit N]  Search (semantic when BRAIN_EMBED is set, else keyword)
  create <path> [--title T] [--tags a,b] [--content "markdown"]
  update <path> [--title T] [--tags a,b] [--content "markdown"]
  move <from> <to>            Move a note
  tag <path> [--set a,b | --add x | --remove y]
  trash <path>                Delete a note to trash (recoverable)
  rules                       Show the vault's RULES.md
  index rebuild               Rebuild the derived search index

Add --json to read/search/tree/tag/rules for machine-readable output.`;

/** FTS snippet markers → stripped for clean terminal/JSON output. */
function cleanSnippet(s: string): string {
  return s.replaceAll(SNIPPET_OPEN, '').replaceAll(SNIPPET_CLOSE, '');
}

function printTree(nodes: TreeNode[], io: Io, depth = 0): void {
  for (const node of nodes) {
    io.out(`${'  '.repeat(depth)}${node.type === 'folder' ? '📁' : '📄'} ${node.name}`);
    if (node.children) printTree(node.children, io, depth + 1);
  }
}

async function cmdTree(vault: Vault, args: ParsedArgs, io: Io): Promise<number> {
  const tree = await listTree(vault.root);
  if (boolFlag(args, 'json')) io.out(JSON.stringify(tree, null, 2));
  else printTree(tree, io);
  return 0;
}

async function cmdRead(vault: Vault, args: ParsedArgs, io: Io): Promise<number> {
  const path = args.positionals[1];
  if (!path) return fail(io, 'read: a note path is required');
  const note = await readNote(vault, path);
  if (boolFlag(args, 'json')) {
    io.out(JSON.stringify(note, null, 2));
  } else {
    io.out(`# ${noteTitle(path, note.meta.title)}\n\n${blocksToText(note.blocks)}`);
  }
  return 0;
}

async function cmdSearch(vault: Vault, args: ParsedArgs, io: Io): Promise<number> {
  const query = args.positionals.slice(1).join(' ');
  if (!query) return fail(io, 'search: a query is required');
  const limit = Number(stringFlag(args, 'limit')) || 20;
  const index = openSearchIndex(indexPath(vault));
  try {
    await syncIndex(vault, index); // stand-alone: keep the index current before querying
    const provider = await embeddingAdapterFromEnv(io.env);
    const hits: SearchHit[] = await hybridSearch(index, query, provider, limit);
    if (boolFlag(args, 'json')) {
      io.out(
        JSON.stringify(
          hits.map((h) => ({ ...h, snippet: cleanSnippet(h.snippet) })),
          null,
          2,
        ),
      );
    } else if (hits.length === 0) {
      io.out('No matches.');
    } else {
      for (const h of hits) io.out(`${h.title}  (${h.path})\n  ${cleanSnippet(h.snippet)}`);
    }
    return 0;
  } finally {
    index.close();
  }
}

async function cmdCreate(vault: Vault, args: ParsedArgs, io: Io): Promise<number> {
  const path = args.positionals[1];
  if (!path) return fail(io, 'create: a note path is required (e.g. Folder/Title.note.json)');
  const title = stringFlag(args, 'title');
  const tags = listFlag(args, 'tags');
  const content = stringFlag(args, 'content');
  if (content !== undefined) {
    await importMarkdownAsNote(vault, path, content, {
      ...(title ? { title } : {}),
      ...(tags ? { tags } : {}),
    });
  } else {
    await createNote(vault, path, { ...(title ? { title } : {}), ...(tags ? { tags } : {}) });
  }
  io.out(`Created ${path}`);
  return 0;
}

async function cmdUpdate(vault: Vault, args: ParsedArgs, io: Io): Promise<number> {
  const path = args.positionals[1];
  if (!path) return fail(io, 'update: a note path is required');
  const title = stringFlag(args, 'title');
  const tags = listFlag(args, 'tags');
  const content = stringFlag(args, 'content');
  if (title === undefined && tags === undefined && content === undefined) {
    return fail(io, 'update: nothing to change (pass --title, --tags, and/or --content)');
  }
  // Same behaviour as the app: a title change also renames the file to match (core owns the policy).
  const current = title !== undefined ? (await setNoteTitle(vault, path, title)).path : path;
  if (tags !== undefined) await updateNoteTags(vault, current, tags);
  if (content !== undefined)
    await updateNoteBlocks(vault, current, await markdownToBlocks(content));
  io.out(`Updated ${current}`);
  return 0;
}

async function cmdMove(vault: Vault, args: ParsedArgs, io: Io): Promise<number> {
  const from = args.positionals[1];
  const to = args.positionals[2];
  if (!from || !to) return fail(io, 'move: usage is `brain move <from> <to>`');
  await moveNote(vault, from, to);
  io.out(`Moved ${from} → ${to}`);
  return 0;
}

async function cmdTag(vault: Vault, args: ParsedArgs, io: Io): Promise<number> {
  const path = args.positionals[1];
  if (!path) return fail(io, 'tag: a note path is required');
  const set = listFlag(args, 'set');
  const add = listFlag(args, 'add');
  const remove = listFlag(args, 'remove');
  let next: string[];
  if (set) {
    next = set;
  } else {
    const current = getTags(await readNote(vault, path));
    const removeSet = new Set(remove ?? []);
    next = [...new Set([...current, ...(add ?? [])])].filter((t) => !removeSet.has(t));
  }
  const saved = await updateNoteTags(vault, path, next);
  const tags = getTags(saved);
  if (boolFlag(args, 'json')) io.out(JSON.stringify({ path, tags }, null, 2));
  else io.out(`Tags: ${tags.join(', ') || '(none)'}`);
  return 0;
}

async function cmdTrash(vault: Vault, args: ParsedArgs, io: Io): Promise<number> {
  const path = args.positionals[1];
  if (!path) return fail(io, 'trash: a note path is required');
  await trashNote(vault, path);
  io.out(`Moved ${path} to trash`);
  return 0;
}

async function cmdRules(vault: Vault, args: ParsedArgs, io: Io): Promise<number> {
  const rules = await readRules(vault);
  if (boolFlag(args, 'json')) io.out(JSON.stringify({ rules }, null, 2));
  else io.out(rules || '(no RULES.md)');
  return 0;
}

async function cmdIndex(vault: Vault, args: ParsedArgs, io: Io): Promise<number> {
  if (args.positionals[1] !== 'rebuild') return fail(io, 'index: the only subcommand is `rebuild`');
  const index = openSearchIndex(indexPath(vault));
  try {
    await rebuildIndex(vault, index);
    io.out('Index rebuilt.');
    return 0;
  } finally {
    index.close();
  }
}

function fail(io: Io, message: string): number {
  io.err(message);
  return 1;
}

/** Run the CLI. Returns the process exit code. */
export async function run(argv: string[], io: Io): Promise<number> {
  const args = parseArgs(argv);
  const command = args.positionals[0];
  if (!command || boolFlag(args, 'help')) {
    io.out(USAGE);
    return command ? 0 : 1;
  }

  const vaultPath = stringFlag(args, 'vault') ?? io.env.BRAIN_VAULT;
  if (!vaultPath) return fail(io, 'No vault. Pass --vault <path> or set BRAIN_VAULT.');
  if (!(await isVault(vaultPath))) return fail(io, `Not a Second Brain vault: ${vaultPath}`);
  const vault = openVault(vaultPath);

  try {
    switch (command) {
      case 'tree':
      case 'list':
        return await cmdTree(vault, args, io);
      case 'read':
        return await cmdRead(vault, args, io);
      case 'search':
        return await cmdSearch(vault, args, io);
      case 'create':
        return await cmdCreate(vault, args, io);
      case 'update':
        return await cmdUpdate(vault, args, io);
      case 'move':
        return await cmdMove(vault, args, io);
      case 'tag':
        return await cmdTag(vault, args, io);
      case 'trash':
      case 'delete':
        return await cmdTrash(vault, args, io);
      case 'rules':
        return await cmdRules(vault, args, io);
      case 'index':
        return await cmdIndex(vault, args, io);
      default:
        io.err(`Unknown command: ${command}`);
        io.out(USAGE);
        return 1;
    }
  } catch (error) {
    return fail(io, error instanceof Error ? error.message : String(error));
  }
}

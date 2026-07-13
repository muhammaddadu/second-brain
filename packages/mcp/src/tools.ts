/**
 * The MCP tool registry (E6) — one table entry per tool: name, description, zod input schema, and a
 * thin handler over `packages/core` (no vault logic here; AGENTS.md layering). `server.ts` registers
 * whatever this table contains, so **adding a capability = adding one entry**, and tests can call
 * handlers directly without a transport. Tool descriptions tell agents to read the vault rules
 * before writing (PRD §3.6).
 */
import {
  createNote,
  embeddingAdapterFromEnv,
  exportNoteToMarkdown,
  getTags,
  hybridSearch,
  importMarkdownAsNote,
  indexPath,
  listTree,
  markdownToBlocks,
  moveNote,
  noteTitle,
  openSearchIndex,
  parseEdgeKinds,
  readNote,
  readRules,
  recallRelated,
  SNIPPET_CLOSE,
  SNIPPET_OPEN,
  setNoteTitle,
  syncIndex,
  trashNote,
  updateNoteBlocks,
  updateNoteTags,
  type Vault,
} from '@brain/core';
import { z } from 'zod';

/** One registered MCP tool: metadata + a thin, core-backed handler returning plain text/JSON. */
export interface VaultTool {
  name: string;
  description: string;
  /** Zod raw shape (the SDK builds the JSON schema from it). */
  schema: z.ZodRawShape;
  /** Returns the tool's text result; throw to report an error to the client. */
  handler: (vault: Vault, args: Record<string, unknown>) => Promise<string>;
}

const path = z.string().describe('Vault-relative note path ending in .note.json');

/** Strip the FTS highlight markers — MCP clients want clean text. */
function cleanSnippet(s: string): string {
  return s.replaceAll(SNIPPET_OPEN, '').replaceAll(SNIPPET_CLOSE, '');
}

const WRITE_REMINDER =
  'Read the vault rules first (get_rules) and follow them for placement, naming, and formatting.';

export const VAULT_TOOLS: VaultTool[] = [
  {
    name: 'get_rules',
    description:
      "The owner's rules for this vault — conventions for where notes go, naming, and formatting. Call this before creating or updating notes.",
    schema: {},
    handler: async (vault) => (await readRules(vault)) || '(This vault has no RULES.md yet.)',
  },
  {
    name: 'list_tree',
    description: 'The vault folder/note hierarchy as JSON (paths are vault-relative).',
    schema: {},
    handler: async (vault) => JSON.stringify(await listTree(vault.root), null, 2),
  },
  {
    name: 'search',
    description:
      'Search the vault (keyword full-text; also semantic when the server is configured with an embedding provider). Returns ranked notes with snippets as JSON.',
    schema: {
      query: z.string().describe('What to search for'),
      limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
    },
    handler: async (vault, args) => {
      const index = openSearchIndex(indexPath(vault));
      try {
        await syncIndex(vault, index);
        const provider = await embeddingAdapterFromEnv(process.env);
        const hits = await hybridSearch(
          index,
          String(args.query),
          provider,
          typeof args.limit === 'number' ? args.limit : 20,
        );
        return JSON.stringify(
          hits.map((h) => ({ ...h, snippet: cleanSnippet(h.snippet) })),
          null,
          2,
        );
      } finally {
        index.close();
      }
    },
  },
  {
    name: 'recall',
    description:
      'Multi-hop recall: from a seed note, walk the knowledge graph (wikilinks, shared tags, and semantic similarity when embeddings are configured) and return related notes with shortest trails. Use after search when you need connected context beyond the closest match.',
    schema: {
      path,
      hops: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe('Max graph distance from the seed (default 2)'),
      kinds: z
        .string()
        .optional()
        .describe('Comma-separated edge kinds to traverse: link,tag,semantic,both (default: all)'),
      limit: z.number().int().min(1).max(100).optional().describe('Max hits (default 50)'),
    },
    handler: async (vault, args) => {
      const index = openSearchIndex(indexPath(vault));
      try {
        await syncIndex(vault, index);
        const provider = await embeddingAdapterFromEnv(process.env);
        const kinds =
          typeof args.kinds === 'string' && args.kinds.trim()
            ? parseEdgeKinds(args.kinds)
            : undefined;
        const result = await recallRelated(vault, index, String(args.path), {
          ...(typeof args.hops === 'number' ? { hops: args.hops } : {}),
          ...(kinds ? { kinds } : {}),
          ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
          ...(provider ? { model: provider.model } : {}),
        });
        return JSON.stringify(result, null, 2);
      } finally {
        index.close();
      }
    },
  },
  {
    name: 'read_note',
    description: 'Read a note: its title, tags, and content as plain text.',
    schema: { path },
    handler: async (vault, args) => {
      const relPath = String(args.path);
      const note = await readNote(vault, relPath);
      const markdown = await exportNoteToMarkdown(vault, relPath);
      const tags = getTags(note);
      return `# ${noteTitle(relPath, note.meta.title)}\n${tags.length ? `Tags: ${tags.join(', ')}\n` : ''}\n${markdown}`;
    },
  },
  {
    name: 'create_note',
    description: `Create a new note from Markdown content. ${WRITE_REMINDER}`,
    schema: {
      path,
      content: z.string().describe('Note body as Markdown'),
      title: z.string().optional(),
      tags: z.array(z.string()).optional(),
    },
    handler: async (vault, args) => {
      const relPath = String(args.path);
      const title = typeof args.title === 'string' ? args.title : undefined;
      const tags = Array.isArray(args.tags) ? args.tags.map(String) : undefined;
      if (typeof args.content === 'string' && args.content.trim()) {
        await importMarkdownAsNote(vault, relPath, args.content, {
          ...(title ? { title } : {}),
          ...(tags ? { tags } : {}),
        });
      } else {
        await createNote(vault, relPath, {
          ...(title ? { title } : {}),
          ...(tags ? { tags } : {}),
        });
      }
      return `Created ${relPath}`;
    },
  },
  {
    name: 'update_note',
    description: `Update a note's content (Markdown), title, and/or tags. A title change also renames the file to match. ${WRITE_REMINDER}`,
    schema: {
      path,
      content: z.string().optional().describe('Replacement body as Markdown'),
      title: z.string().optional(),
      tags: z.array(z.string()).optional(),
    },
    handler: async (vault, args) => {
      let relPath = String(args.path);
      if (typeof args.title === 'string') {
        relPath = (await setNoteTitle(vault, relPath, args.title)).path;
      }
      if (Array.isArray(args.tags)) await updateNoteTags(vault, relPath, args.tags.map(String));
      if (typeof args.content === 'string') {
        await updateNoteBlocks(vault, relPath, await markdownToBlocks(args.content));
      }
      return `Updated ${relPath}`;
    },
  },
  {
    name: 'move_note',
    description: `Move a note to a new vault-relative path (refuses to overwrite). ${WRITE_REMINDER}`,
    schema: { from: path, to: path },
    handler: async (vault, args) => {
      await moveNote(vault, String(args.from), String(args.to));
      return `Moved ${args.from} → ${args.to}`;
    },
  },
  {
    name: 'trash_note',
    description: 'Delete a note to the vault trash (recoverable, never a hard delete).',
    schema: { path },
    handler: async (vault, args) => {
      const trashRel = await trashNote(vault, String(args.path));
      return `Moved to trash: ${trashRel}`;
    },
  },
];

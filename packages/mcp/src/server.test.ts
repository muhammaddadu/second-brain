/**
 * E6 acceptance: a scripted MCP client (in-memory transport, same protocol as stdio) runs the
 * canonical flow against a fixture vault with rules — fetch rules → search for placement → update
 * an existing note and create a new one where the rules mandate — asserting on the resulting files.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importMarkdownAsNote, initVault, openVault, readNote, writeRules } from '@brain/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createVaultServer } from './server.js';

let root: string;
let client: Client;

/** Call a tool and return its text payload (throws on tool error). */
async function call(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const first = (result.content as Array<{ type: string; text?: string }>)[0];
  if (result.isError) throw new Error(first?.text ?? 'tool error');
  return first?.text ?? '';
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'brain-mcp-'));
  await initVault(root);
  const vault = openVault(root);
  await writeRules(
    vault,
    '# Rules\n\nDaily summaries go in `Journal/` as `YYYY-MM-DD.note.json`. Project updates belong in the matching `Projects/<name>/index.note.json`.\n',
  );
  await importMarkdownAsNote(vault, 'Projects/alpha/index.note.json', '# Alpha\n\nKickoff done.', {
    title: 'Alpha',
    tags: ['project'],
  });

  const server = createVaultServer(vault);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test-agent', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  await rm(root, { recursive: true, force: true });
});

it('lists every registered tool', async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  expect(names).toEqual([
    'create_note',
    'get_rules',
    'list_tree',
    'move_note',
    'read_note',
    'recall',
    'search',
    'trash_note',
    'update_note',
  ]);
});

it('recall returns shared-tag neighbours from a seed note', async () => {
  const vault = openVault(root);
  await importMarkdownAsNote(vault, 'People/Maya.note.json', 'Likes walkable hotels.', {
    title: 'Maya',
    tags: ['people'],
  });
  await importMarkdownAsNote(vault, 'Journal/prefs.note.json', 'Maya prefers quiet lobbies.', {
    title: 'Prefs',
    tags: ['people'],
  });

  const raw = await call('recall', { path: 'People/Maya.note.json', hops: 1 });
  const parsed = JSON.parse(raw) as { hits: Array<{ path: string; distance: number }> };
  expect(parsed.hits.some((h) => h.path === 'Journal/prefs.note.json')).toBe(true);
  expect(parsed.hits.find((h) => h.path === 'Journal/prefs.note.json')?.distance).toBe(1);
});

it('runs the canonical flow: rules → search → update existing → create per rules', async () => {
  // 1. The agent fetches the owner's rules before writing.
  const rules = await call('get_rules');
  expect(rules).toContain('Journal/');
  expect(rules).toContain('Projects/<name>/index.note.json');

  // 2. It searches for where project updates live.
  const hits = JSON.parse(await call('search', { query: 'kickoff' })) as Array<{ path: string }>;
  expect(hits[0]?.path).toBe('Projects/alpha/index.note.json');

  // 3. It updates that existing note…
  await call('update_note', {
    path: 'Projects/alpha/index.note.json',
    content: '# Alpha\n\nKickoff done. Shipped the first milestone today.',
  });
  const updated = await call('read_note', { path: 'Projects/alpha/index.note.json' });
  expect(updated).toContain('first milestone');

  // 4. …and creates the daily summary where the rules mandate.
  await call('create_note', {
    path: 'Journal/2026-07-09.note.json',
    title: 'Daily summary',
    tags: ['journal'],
    content: 'Summarised the day: milestone shipped.',
  });
  const vault = openVault(root);
  const note = await readNote(vault, 'Journal/2026-07-09.note.json');
  expect(note.meta.title).toBe('Daily summary');
  expect(JSON.stringify(note.blocks)).toContain('milestone shipped');

  // The file really exists on disk where the rules said.
  const raw = await readFile(join(root, 'Journal/2026-07-09.note.json'), 'utf8');
  expect(JSON.parse(raw).version).toBe(1);
});

it('reports tool errors without crashing (e.g. move onto an existing note)', async () => {
  await expect(
    call('move_note', {
      from: 'Journal/2026-07-09.note.json',
      to: 'Projects/alpha/index.note.json',
    }),
  ).rejects.toThrow(/exists/i);
  // The server is still alive afterwards.
  expect(await call('list_tree')).toContain('Journal');
});

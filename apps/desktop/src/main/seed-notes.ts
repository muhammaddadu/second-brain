/**
 * Starter-vault content: a small, folder-organised set that explains the product and gives
 * search / RAG something real to work with — not an empty tree. Only seeded on create, never when
 * opening an existing folder. Authored as native block JSON directly so main never imports the
 * Markdown converter (jsdom can't be bundled into the Electron main process).
 */
import {
  addProperty,
  createDatabase,
  createNote,
  readRules,
  setRowProperty,
  type Vault,
  writeRules,
} from '@brain/core';

const h = (level: 1 | 2 | 3, text: string): unknown => ({
  type: 'heading',
  props: { level },
  content: [{ type: 'text', text, styles: {} }],
});
const p = (text: string): unknown => ({
  type: 'paragraph',
  content: [{ type: 'text', text, styles: {} }],
});
const li = (text: string): unknown => ({
  type: 'bulletListItem',
  content: [{ type: 'text', text, styles: {} }],
});
const mermaid = (src: string): unknown => ({
  type: 'codeBlock',
  props: { language: 'mermaid' },
  content: [{ type: 'text', text: src, styles: {} }],
});

interface SeedNote {
  path: string;
  title: string;
  tags: string[];
  blocks: unknown[];
}

const SEED_NOTES: SeedNote[] = [
  {
    path: 'Welcome.note.json',
    title: 'Welcome',
    tags: ['guide'],
    blocks: [
      h(1, 'Welcome to your Second Brain'),
      p(
        'A local-first place to think, write, and find things again. Every note is a plain file in a folder you own — nothing leaves your machine unless you choose to connect a provider.',
      ),
      mermaid(
        'graph LR\n  You["You"] --> Vault["Your vault (plain files)"]\n  Agents["AI agents"] --> Vault\n  Vault --> Search["Find by keyword or meaning"]',
      ),
      p(
        'This starter set explains how everything works — edit or delete any of it. Right-click the sidebar to add your own notes and folders.',
      ),
      li('Guide — how folders, tags, search, agents, and diagrams work.'),
      li('Ideas — the thinking behind the app.'),
      li('Journal — an example daily note.'),
    ],
  },
  {
    path: 'Guide/Organising with folders and tags.note.json',
    title: 'Organising with folders and tags',
    tags: ['guide', 'organisation'],
    blocks: [
      h(1, 'Folders and tags'),
      p(
        'Your folder tree is the organisation — there is no hidden database mapping notes to places. Drag a note onto a folder to move it, or onto the gap between notes to reorder; the order is remembered.',
      ),
      p(
        'Tags live in a note’s metadata and cut across folders, so a single note can belong to many themes at once. Use folders for where something lives and tags for what it is about.',
      ),
      li('Move: drop onto a folder’s middle.'),
      li('Reorder: drop on a sibling’s top or bottom edge.'),
      li('Rename a note by editing its title — the file is renamed to match.'),
    ],
  },
  {
    path: 'Guide/Finding anything — search and RAG.note.json',
    title: 'Finding anything — search and RAG',
    tags: ['guide', 'search'],
    blocks: [
      h(1, 'Search and retrieval'),
      p(
        'Press ⌘K anywhere to search. Keyword search is always on and fully local — it matches the exact words in your notes and highlights them in the results.',
      ),
      p(
        'Semantic search is optional. When you turn it on in Settings, the app also finds notes by meaning, so a search for “staying focused” can surface a note about attention and deep work even if those exact words never appear. Keyword and semantic results are blended into one ranked list.',
      ),
      p(
        'The recommended setup runs a small model (EmbeddingGemma) entirely on your device, so semantic search stays private and works offline. You can also point it at Ollama, OpenAI, or another provider.',
      ),
    ],
  },
  {
    path: 'Guide/AI agents and your rules.note.json',
    title: 'AI agents and your rules',
    tags: ['guide', 'agents'],
    blocks: [
      h(1, 'Let agents work in your vault'),
      p(
        'The whole vault is designed to be readable and writable by AI agents through a CLI and an MCP server, so you can ask an assistant to “summarise my last 24 hours and file the notes where they belong.”',
      ),
      p(
        'Agents follow rules you define — conventions for where things go and how they are named — so their edits fit your system instead of fighting it. Because everything is plain files, an agent’s changes are just ordinary note edits you can review, keep, or undo.',
      ),
      mermaid(
        'sequenceDiagram\n  You->>Agent: Summarise today\n  Agent->>Vault: Search + read notes\n  Agent->>Vault: Write summary\n  Vault-->>You: New note, filed by your rules',
      ),
    ],
  },
  {
    path: 'Guide/Diagrams and rich content.note.json',
    title: 'Diagrams and rich content',
    tags: ['guide', 'diagrams'],
    blocks: [
      h(1, 'Diagrams render inline'),
      p(
        'Write a Mermaid code block and it renders as a diagram right in the note — flowcharts, sequence diagrams, and more. The source stays editable, and it exports cleanly as Markdown.',
      ),
      mermaid(
        'flowchart TD\n  Idea([Idea]) --> Note[Capture as a note]\n  Note --> Tag[Tag & file it]\n  Tag --> Find[Find it later by meaning]',
      ),
      p('Type “/mermaid” in the editor to drop in a starter diagram.'),
    ],
  },
  {
    path: 'Ideas/Why local-first and private by default.note.json',
    title: 'Why local-first and private by default',
    tags: ['ideas', 'principles'],
    blocks: [
      h(1, 'Principles'),
      p(
        'Your notes are the source of truth, not a cloud service. They are documented JSON files in folders you control, so the vault stays usable even with the app uninstalled — and a whole-vault Markdown export always works.',
      ),
      li('Local-first: everything works offline; nothing is sent anywhere by default.'),
      li(
        'Files-first: search indexes and embeddings are derived and rebuildable — never the only copy of anything.',
      ),
      li('No lock-in: open formats, Markdown export at every surface.'),
      p(
        'Privacy is a default, not a setting you have to discover: semantic search ships with an on-device model, and any hosted provider is an explicit opt-in.',
      ),
    ],
  },
  {
    path: 'Journal/Example daily note.note.json',
    title: 'Example daily note',
    tags: ['journal'],
    blocks: [
      h(1, 'A day with your second brain'),
      p(
        'Daily notes are a nice home for quick capture — meetings, ideas, links, and small wins. Give them a consistent place (like this Journal folder) and an agent can roll them up for you later.',
      ),
      h(3, 'Today'),
      li('Set up my vault and read the guide.'),
      li('Tried ⌘K search and moved a few notes around.'),
      li('Coffee with [[People/Ada Lovelace]] — type [[ anywhere to link a note.'),
      li('Idea: keep a running list of book highlights to revisit.'),
    ],
  },
  {
    path: 'People/Ada Lovelace.note.json',
    title: 'Ada Lovelace',
    tags: ['person'],
    blocks: [
      h(1, 'Ada Lovelace'),
      p(
        'A "People" note is just a note. Write `[[Ada Lovelace]]` (or the full path `[[People/Ada Lovelace]]`) in any other note and it becomes a link back here — see "Linked from" at the bottom of a note for everything that points to it.',
      ),
    ],
  },
];

/** Starter agent rules (RULES.md) matching the seeded folders — owner-editable in Settings (E6). */
const SEED_RULES = `# Vault rules

Conventions for anyone — human or AI agent — writing to this vault. Edit freely.

- Daily notes and summaries go in \`Journal/\`, one note per day, titled with the date.
- Longer-lived thinking goes in \`Ideas/\`; how-to material goes in \`Guide/\`.
- Prefer updating an existing note over creating a near-duplicate — search first.
- Tag notes with what they are about; keep tags short and lowercase.
`;

/** An example database so the first vault demonstrates tables/boards working (E8). */
async function seedExampleDatabase(vault: Vault): Promise<void> {
  const folder = 'Projects';
  await createDatabase(vault, folder);
  const status = await addProperty(vault, folder, {
    name: 'Status',
    type: 'select',
    options: ['Planned', 'In progress', 'Done'],
  });
  const priority = await addProperty(vault, folder, { name: 'Priority', type: 'number' });
  const rows: Array<{
    file: string;
    title: string;
    text: string;
    status: string;
    priority: number;
  }> = [
    {
      file: 'Set up my vault.note.json',
      title: 'Set up my vault',
      text: 'Created the vault and read the guide. Rows are ordinary notes — open one and write.',
      status: 'Done',
      priority: 1,
    },
    {
      file: 'Try the board view.note.json',
      title: 'Try the board view',
      text: 'Switch this database to Board and drag this card to Done.',
      status: 'In progress',
      priority: 2,
    },
    {
      file: 'Plan something new.note.json',
      title: 'Plan something new',
      text: 'Add your own rows with New row, or let an agent file them for you.',
      status: 'Planned',
      priority: 3,
    },
  ];
  for (const row of rows) {
    await createNote(vault, `${folder}/${row.file}`, {
      title: row.title,
      tags: ['project'],
      blocks: [p(row.text)],
    });
    await setRowProperty(vault, folder, `${folder}/${row.file}`, status.id, row.status);
    await setRowProperty(vault, folder, `${folder}/${row.file}`, priority.id, row.priority);
  }
}

export async function seedStarterVault(vault: Vault): Promise<void> {
  for (const note of SEED_NOTES) {
    try {
      await createNote(vault, note.path, {
        title: note.title,
        tags: note.tags,
        blocks: note.blocks,
      });
    } catch {
      // Non-fatal: a seed failure must not block opening the vault.
    }
  }
  try {
    if (!(await readRules(vault))) await writeRules(vault, SEED_RULES);
  } catch {
    // Non-fatal, same as note seeding.
  }
  try {
    await seedExampleDatabase(vault);
  } catch {
    // Non-fatal: the database example must not block opening the vault.
  }
}

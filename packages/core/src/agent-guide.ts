/**
 * The agent guide (ADR 0009): an app-maintained `AGENTS.md` at the vault root that tells any AI
 * agent how to work with the vault *directly through the filesystem* — the on-disk contract (note
 * envelope, folders/tags, reserved dirs, safe writes) plus a pointer to the owner's RULES.md. It is
 * versioned and refreshed as the app gains features, but never clobbers an owner's edits. The same
 * body is also packaged as an installable agent skill (see the desktop app's skill install).
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWriteFile } from './atomic.js';
import { AGENT_GUIDE_FILE } from './paths.js';
import type { Vault } from './vault.js';

/** Bump when the guide body changes so existing (unmodified) vault copies auto-refresh. */
export const AGENT_GUIDE_VERSION = 2;

const MARKER = /<!-- second-brain:agent-guide v(\d+) managed:([a-f0-9]+) -->/;

/** The guide body — the on-disk contract an agent needs to read and write notes safely. */
function guideBody(): string {
  return `# Working with this vault (for AI agents)

This folder is a **Second Brain** vault. You can read, search, create, and update notes here **directly as files** — no special API required. Follow the contract below so your changes stay safe and visible to the app.

## File types in a vault

| File | What it is |
|------|------------|
| \`*.note.json\` | A **note** — a JSON envelope (below). One per file, any folder/depth. |
| \`database.json\` | Marks its folder as a **database**; holds the typed column schema + views (see Databases). |
| \`RULES.md\` | The owner's conventions — **read and follow it** before writing. |
| \`.order.json\` | Optional per-folder manual sort order (JSON array of child names). Safe to ignore. |
| \`.brain/\` | Reserved app state (vault marker, trash, derived search index). **Never read or write inside it.** |

## Note format

Each note is a JSON envelope:

\`\`\`json
{
  "version": 1,
  "meta": { "title": "Optional title", "tags": ["ideas"], "created": "2026-07-09T12:00:00Z", "updated": "2026-07-09T12:00:00Z" },
  "blocks": []
}
\`\`\`

- \`meta.tags\` is a flat string array; tags cross folders. \`meta.title\` falls back to the filename if omitted.
- Unknown \`meta\` keys are preserved — you may add your own, but don't drop existing ones when updating.

### Note content (the \`blocks\` array)

\`blocks\` is a **BlockNote** document: an array of block objects. Common shapes:

\`\`\`json
[
  { "type": "heading", "props": { "level": 1 }, "content": [{ "type": "text", "text": "Title", "styles": {} }] },
  { "type": "paragraph", "content": [{ "type": "text", "text": "A sentence.", "styles": {} }] },
  { "type": "bulletListItem", "content": [{ "type": "text", "text": "A point", "styles": {} }] },
  { "type": "codeBlock", "props": { "language": "mermaid" }, "content": [{ "type": "text", "text": "graph TD; A-->B;", "styles": {} }] }
]
\`\`\`

- Inline text lives in \`content\` as \`{ "type": "text", "text": "…", "styles": {} }\`; \`styles\` may include \`bold\`/\`italic\`/etc.
- A \`codeBlock\` with \`props.language: "mermaid"\` renders as a diagram; other languages render as code.
- If you'd rather not hand-write blocks, the **CLI/MCP accept Markdown** and convert it for you.

### Linking notes (wikilinks)

Write \`[[Folder/Note]]\` or \`[[Note Title]]\` as plain text anywhere in a note's content. The app renders it as a clickable link (resolved by exact path, then unique title) and shows it as a **backlink** on the target. No special syntax in the JSON — it's just text inside a paragraph's \`text\`.

## Databases

A folder is a **database** when it contains a \`database.json\`. Each note in that folder is a **row**; its column values live in \`meta.properties\`, keyed by **stable property id**:

\`\`\`json
// Projects/database.json
{
  "version": 1,
  "properties": [
    { "id": "p_status", "name": "Status", "type": "select", "options": ["Todo", "Done"] },
    { "id": "p_due", "name": "Due", "type": "date" }
  ],
  "views": [{ "name": "Table", "type": "table" }, { "name": "Board", "type": "board", "groupBy": "p_status" }]
}
\`\`\`

\`\`\`json
// Projects/Launch.note.json  → a row
{ "version": 1, "meta": { "title": "Launch", "properties": { "p_status": "Todo", "p_due": "2026-08-01" } }, "blocks": [] }
\`\`\`

- Property \`type\` is one of: \`text\`, \`number\`, \`select\`, \`multiSelect\` (array of strings), \`date\` (ISO string), \`checkbox\` (boolean), \`url\`.
- **Add a row** by creating an ordinary note in the folder and setting \`meta.properties\` by property **id** (not name) — it appears in the table automatically. **Don't rename a property's \`id\`**; the \`name\` is just its label.
- A value for a property not in the schema is ignored, not an error.

## Creating and updating notes

1. **Create**: write a new \`<Title>.note.json\` in the target folder with the envelope above. The app picks it up live.
2. **Update**: read the file, change \`blocks\` and/or \`meta\`, keep the rest, and write it back. Preserve \`meta.created\`; refresh \`meta.updated\`.
3. **Write atomically** — write to a temp file in the same folder, then rename over the target — so the app never reads a half-written note.
4. **Don't clobber concurrent edits**: if a note may be open in the app, check that its bytes haven't changed since you read it before overwriting.
5. **Deleting**: prefer moving the file to \`.brain/trash/\` over hard deletion (the app treats deletes as recoverable).

## Finding things

- Every note is plain JSON, so you can search titles, tags, and text by scanning \`.note.json\` files.
- The app keeps a derived index for keyword + semantic search; when its CLI / MCP server are available, prefer those for ranked retrieval. Never treat the index in \`.brain/\` as the source of truth — the files are.

## Longevity

Notes are documented, deterministic JSON and export to Markdown, so anything you write stays usable without this app. Keep content in the files, not in app-only state.
`;
}

function bodyHash(body: string): string {
  return createHash('sha256').update(body.trim()).digest('hex').slice(0, 12);
}

/** The full guide file contents: a version/hash marker line, then the body. */
export function renderAgentGuide(): string {
  const body = guideBody();
  return `<!-- second-brain:agent-guide v${AGENT_GUIDE_VERSION} managed:${bodyHash(body)} -->\n\n${body}`;
}

/** The guide body without the marker — used to package the guide as an installable agent skill. */
export function agentGuideBody(): string {
  return guideBody();
}

/**
 * Ensure the vault's `AGENTS.md` is present and current, **without ever clobbering owner edits**:
 * absent → write it; ours-but-older-and-unmodified → refresh; owner-authored or owner-edited → leave
 * it alone. "Unmodified" means the body still hashes to the value in our marker line.
 */
export async function syncAgentGuide(vault: Vault): Promise<void> {
  const path = join(vault.root, AGENT_GUIDE_FILE);
  let existing: string | null = null;
  try {
    existing = await readFile(path, 'utf8');
  } catch {
    existing = null;
  }
  if (existing === null) {
    await atomicWriteFile(path, renderAgentGuide());
    return;
  }
  const marker = existing.match(MARKER);
  if (!marker) return; // an owner's own AGENTS.md, not ours — never touch it
  const fileVersion = Number(marker[1]);
  const storedHash = marker[2];
  const fileBody = existing.replace(MARKER, '').trim();
  const unmodified = bodyHash(fileBody) === storedHash;
  if (unmodified && fileVersion < AGENT_GUIDE_VERSION) {
    await atomicWriteFile(path, renderAgentGuide());
  }
}

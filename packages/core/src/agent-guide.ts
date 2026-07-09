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
export const AGENT_GUIDE_VERSION = 1;

const MARKER = /<!-- second-brain:agent-guide v(\d+) managed:([a-f0-9]+) -->/;

/** The guide body — the on-disk contract an agent needs to read and write notes safely. */
function guideBody(): string {
  return `# Working with this vault (for AI agents)

This folder is a **Second Brain** vault. You can read, search, create, and update notes here **directly as files** — no special API required. Follow the contract below so your changes stay safe and visible to the app.

## What's in here

- **Notes** are files ending in \`.note.json\`, in any folder, at any depth. The folder tree *is* the organisation.
- **\`RULES.md\`** (if present) holds the owner's conventions — where things go, naming, formatting. **Read it and follow it.**
- **\`.brain/\`** is reserved app state (the vault marker, trash, and a derived search index). **Never read or write inside \`.brain/\`.**
- **\`.order.json\`** (optional, per folder) is a JSON array of child names giving manual sort order. Safe to ignore; if you rewrite a folder, you may update it.

## Note format

Each note is a JSON envelope:

\`\`\`json
{
  "version": 1,
  "meta": { "title": "Optional title", "tags": ["ideas"], "created": "2026-07-09T12:00:00Z", "updated": "2026-07-09T12:00:00Z" },
  "blocks": []
}
\`\`\`

- \`blocks\` is a **BlockNote** document (an array of block objects). A simple paragraph looks like \`{ "type": "paragraph", "content": [{ "type": "text", "text": "Hello", "styles": {} }] }\`.
- \`meta.tags\` is a flat string array; tags cross folders. \`meta.title\` falls back to the filename if omitted.
- Unknown \`meta\` keys are preserved — you may add your own, but don't drop existing ones when updating.

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

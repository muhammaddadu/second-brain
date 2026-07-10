/**
 * Starter RULES.md templates — a running start for owners who don't yet know what to tell their
 * agents. Each is a small, self-contained convention set for a common goal; the Rules editor lets
 * the owner drop one in and adapt it. Plain Markdown (RULES.md is read by agents verbatim).
 */
export interface RuleTemplate {
  id: string;
  name: string;
  /** One line describing the goal it serves, shown under the button. */
  blurb: string;
  body: string;
}

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: 'daily',
    name: 'Daily notes & reviews',
    blurb: 'Journaling, capture, and weekly roll-ups.',
    body: `# Vault rules

- Daily notes live in \`Journal/\` as \`YYYY-MM-DD\`, one per day.
- Quick capture (ideas, links, to-dos) goes into today's daily note under a \`## Inbox\` heading — don't create loose notes for it.
- A weekly review is a note \`Journal/Reviews/YYYY-Www\` that summarises the week's dailies with links back to them.
- When summarising a period, read the dailies in range and link the notes you cite with \`[[…]]\`.
`,
  },
  {
    id: 'para',
    name: 'PARA / second brain',
    blurb: 'Projects, Areas, Resources, Archive.',
    body: `# Vault rules

Organise everything under four top-level folders (the PARA method):

- \`Projects/\` — things with a deadline or outcome. One folder per project, with an \`index\` note.
- \`Areas/\` — ongoing responsibilities (health, finances, team). One note or folder each.
- \`Resources/\` — reference material and topics of interest.
- \`Archive/\` — anything inactive. Move things here instead of deleting.

- Prefer updating an existing note over creating a near-duplicate — search first.
- Link related notes with \`[[…]]\`; tag with the area or topic, lowercase.
`,
  },
  {
    id: 'people',
    name: 'People & meetings',
    blurb: 'A note per person; meetings link to them.',
    body: `# Vault rules

- Every person gets a note in \`People/\` titled with their name (e.g. \`People/Ada Lovelace\`).
- Meeting notes go in \`Meetings/YYYY-MM-DD <topic>\` and link each attendee with \`[[People/Name]]\`.
- When I mention someone who has no note yet, create a stub in \`People/\` and link it.
- Keep each person note's top section as a short profile; append dated bullets below for interactions.
`,
  },
  {
    id: 'projects',
    name: 'Project tracking',
    blurb: 'A folder + status per project.',
    body: `# Vault rules

- Each project is a folder under \`Projects/\` with an \`index\` note describing the goal and status.
- Track tasks in the project's folder; use a database (Table/Board) with a \`Status\` property when it helps.
- Decisions get their own note \`Projects/<name>/decisions/<short-title>\` and are linked from the index.
- When I ask for a status update, read the index + recent notes and write the summary into the index note.
`,
  },
];

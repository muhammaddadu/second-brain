/**
 * Global agent skill install (ADR 0009), generalized to a **target registry**: the same vault
 * contract as the in-vault AGENTS.md, packaged for each agent runtime the owner uses — Claude Code
 * (a SKILL.md in its skills directory), Codex CLI and Gemini CLI (a managed, marker-delimited
 * section appended to their global instruction files, never clobbering the owner's own content).
 * Adding a runtime = adding one registry entry. Install / update / remove are explicit owner
 * actions from Settings → Agent access.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AGENT_GUIDE_VERSION, agentGuideBody } from '@brain/core';
import { app } from 'electron';
import type { AgentSkillStatus } from '../shared/ipc';

const SKILL_NAME = 'second-brain-vault';
const SECTION_START = (version: number) => `<!-- second-brain:agent-skill v${version} start -->`;
const SECTION_START_RE = /<!-- second-brain:agent-skill v(\d+) start -->/;
const SECTION_END = '<!-- second-brain:agent-skill end -->';
const SECTION_RE =
  /\n?<!-- second-brain:agent-skill v\d+ start -->[\s\S]*?<!-- second-brain:agent-skill end -->\n?/;

/** How a runtime consumes the contract: its own file we fully own, or a section in a shared file. */
interface AgentTarget {
  id: string;
  name: string;
  /** Absolute path of the file we write (own it entirely, or manage a section of it). */
  file(): string;
  /** 'own-file' = we own the whole file/dir; 'section' = we manage a delimited block in it. */
  mode: 'own-file' | 'section';
}

/** The runtimes we can install into. Adding one = adding a row (and nothing else). */
const TARGETS: AgentTarget[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    file: () => join(app.getPath('home'), '.claude', 'skills', SKILL_NAME, 'SKILL.md'),
    mode: 'own-file',
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    file: () => join(app.getPath('home'), '.codex', 'AGENTS.md'),
    mode: 'section',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    file: () => join(app.getPath('home'), '.gemini', 'GEMINI.md'),
    mode: 'section',
  },
];

function targetById(id: string): AgentTarget {
  const target = TARGETS.find((t) => t.id === id);
  if (!target) throw new Error(`unknown agent target: ${id}`);
  return target;
}

/** Claude Code skill file: frontmatter (name/description/version) + the shared contract body. */
function renderSkillFile(): string {
  const description =
    'How to read, search, create, and update notes in a Second Brain vault directly through the filesystem. Use when working in a folder that contains a .brain/vault.json marker.';
  return `---\nname: ${SKILL_NAME}\ndescription: ${description}\nversion: ${AGENT_GUIDE_VERSION}\n---\n\n${agentGuideBody()}`;
}

/** The marker-delimited section for shared instruction files (Codex/Gemini). */
function renderSection(): string {
  return `${SECTION_START(AGENT_GUIDE_VERSION)}\n\n${agentGuideBody()}\n${SECTION_END}\n`;
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** Installed version found in a target's file, or null when not installed. */
function installedVersion(target: AgentTarget, text: string | null): number | null {
  if (text === null) return null;
  const match =
    target.mode === 'own-file' ? text.match(/^version:\s*(\d+)/m) : text.match(SECTION_START_RE);
  return match?.[1] ? Number(match[1]) : target.mode === 'own-file' ? 0 : null;
}

export async function agentSkillStatus(): Promise<AgentSkillStatus[]> {
  return Promise.all(
    TARGETS.map(async (target) => {
      const version = installedVersion(target, await readIfExists(target.file()));
      return {
        id: target.id,
        name: target.name,
        installed: version !== null,
        outdated: version !== null && version < AGENT_GUIDE_VERSION,
        path: target.file(),
      };
    }),
  );
}

export async function installAgentSkill(id: string): Promise<void> {
  const target = targetById(id);
  const path = target.file();
  await mkdir(dirname(path), { recursive: true });
  if (target.mode === 'own-file') {
    await writeFile(path, renderSkillFile(), 'utf8');
    return;
  }
  // Shared file: replace our managed section if present, else append — the owner's text is sacred.
  const existing = (await readIfExists(path)) ?? '';
  const next = SECTION_RE.test(existing)
    ? existing.replace(SECTION_RE, `\n${renderSection()}`)
    : `${existing.trimEnd()}${existing.trim() ? '\n\n' : ''}${renderSection()}`;
  await writeFile(path, next, 'utf8');
}

export async function removeAgentSkill(id: string): Promise<void> {
  const target = targetById(id);
  const path = target.file();
  if (target.mode === 'own-file') {
    await rm(dirname(path), { recursive: true, force: true });
    return;
  }
  const existing = await readIfExists(path);
  if (existing === null) return;
  const next = existing.replace(SECTION_RE, '\n');
  // Only our section is removed; the rest of the owner's file stays byte-for-byte.
  await writeFile(path, next.trim() ? next : '', 'utf8');
}

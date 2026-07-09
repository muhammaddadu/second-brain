/**
 * Global agent skill (Claude Code, ADR 0009): the same vault contract as the in-vault AGENTS.md,
 * packaged as an installable SKILL.md so any Claude Code agent can work with a Second Brain vault
 * anywhere — not just in a folder that already has the guide file. Install / update / remove are
 * explicit owner actions from Settings → Agent access.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AGENT_GUIDE_VERSION, agentGuideBody } from '@brain/core';
import { app } from 'electron';
import type { AgentSkillStatus } from '../shared/ipc.js';

const AGENT_SKILL_NAME = 'second-brain-vault';

function agentSkillDir(): string {
  return join(app.getPath('home'), '.claude', 'skills', AGENT_SKILL_NAME);
}

function renderAgentSkill(): string {
  const description =
    'How to read, search, create, and update notes in a Second Brain vault directly through the filesystem. Use when working in a folder that contains a .brain/vault.json marker.';
  return `---\nname: ${AGENT_SKILL_NAME}\ndescription: ${description}\nversion: ${AGENT_GUIDE_VERSION}\n---\n\n${agentGuideBody()}`;
}

export async function agentSkillStatus(): Promise<AgentSkillStatus> {
  try {
    const text = await readFile(join(agentSkillDir(), 'SKILL.md'), 'utf8');
    const m = text.match(/^version:\s*(\d+)/m);
    const version = m ? Number(m[1]) : 0;
    return { installed: true, outdated: version < AGENT_GUIDE_VERSION, path: agentSkillDir() };
  } catch {
    return { installed: false, outdated: false, path: agentSkillDir() };
  }
}

export async function installAgentSkill(): Promise<void> {
  await mkdir(agentSkillDir(), { recursive: true });
  await writeFile(join(agentSkillDir(), 'SKILL.md'), renderAgentSkill(), 'utf8');
}

export async function removeAgentSkill(): Promise<void> {
  await rm(agentSkillDir(), { recursive: true, force: true });
}

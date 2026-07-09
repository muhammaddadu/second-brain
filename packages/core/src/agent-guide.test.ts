import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AGENT_GUIDE_VERSION, renderAgentGuide, syncAgentGuide } from './agent-guide.js';
import { AGENT_GUIDE_FILE } from './paths.js';
import { createFixtureVault, type FixtureVault } from './test-support/fixture-vault.js';
import { openVault } from './vault.js';

describe('syncAgentGuide', () => {
  let fixture: FixtureVault;

  beforeEach(async () => {
    fixture = await createFixtureVault();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  const guidePath = () => join(fixture.root, AGENT_GUIDE_FILE);

  it('writes the guide when absent, with a version+hash marker', async () => {
    await syncAgentGuide(openVault(fixture.root));
    const text = await readFile(guidePath(), 'utf8');
    expect(text).toMatch(new RegExp(`second-brain:agent-guide v${AGENT_GUIDE_VERSION} managed:`));
    expect(text).toContain('.note.json');
    expect(text).toContain('RULES.md');
  });

  it('refreshes an older, unmodified copy to the current version', async () => {
    // Simulate a v0 copy written by an earlier app version, still carrying our marker.
    const current = renderAgentGuide();
    const old = current.replace(/agent-guide v\d+/, 'agent-guide v0');
    await writeFile(guidePath(), old, 'utf8');
    await syncAgentGuide(openVault(fixture.root));
    expect(await readFile(guidePath(), 'utf8')).toBe(current); // upgraded in place
  });

  it('never clobbers an owner-edited guide (hash no longer matches its marker)', async () => {
    const edited = `${renderAgentGuide()}\n\nOwner's own extra notes here.`;
    await writeFile(guidePath(), edited, 'utf8');
    await syncAgentGuide(openVault(fixture.root));
    expect(await readFile(guidePath(), 'utf8')).toBe(edited); // left untouched
  });

  it('leaves an unrelated AGENTS.md (no marker) alone', async () => {
    const theirs = '# My own agents file\n\nNothing to do with the app.\n';
    await writeFile(guidePath(), theirs, 'utf8');
    await syncAgentGuide(openVault(fixture.root));
    expect(await readFile(guidePath(), 'utf8')).toBe(theirs);
  });
});

/**
 * Agent access settings (ADR 0009). Explains that agents can work with the vault directly through
 * its files (every vault carries a maintained AGENTS.md guide), and lets the owner install a global
 * Claude Code skill so any agent knows how to work with a Second Brain vault anywhere.
 */
import { Bot, Check } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AgentSkillStatus } from '../../../shared/ipc';

export function AgentAccessSettings() {
  const [status, setStatus] = useState<AgentSkillStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState('');
  const [savedRules, setSavedRules] = useState('');

  const refresh = useCallback(() => {
    window.vault.agentSkillStatus().then(setStatus).catch(console.error);
  }, []);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    window.vault
      .getRules()
      .then((text) => {
        setRules(text);
        setSavedRules(text);
      })
      .catch(console.error);
  }, []);

  function saveRules() {
    if (rules === savedRules) return;
    window.vault
      .setRules(rules)
      .then(() => setSavedRules(rules))
      .catch(console.error);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-faint mb-2 text-xs font-medium tracking-wide uppercase">Agent access</h2>
      <p className="text-muted mb-4 max-w-prose text-sm leading-relaxed">
        AI agents can read, search, and update this vault directly through its files. Every vault
        carries an <code className="text-ink">AGENTS.md</code> guide at its root — the rules of
        engagement (note format, folders &amp; tags, safe writes) — which the app keeps up to date
        as features land, without overwriting your edits.
      </p>

      <div className="border-edge mb-3 flex flex-col gap-2 rounded-xl border p-4">
        <label htmlFor="vault-rules" className="text-ink text-sm font-medium">
          Your rules (RULES.md)
        </label>
        <p className="text-muted text-xs leading-relaxed">
          Conventions agents should follow before writing — where things go, naming, formatting.
          e.g. “Daily notes go in <code className="text-ink">Journal/YYYY-MM-DD</code>; each project
          gets a folder with an <code className="text-ink">index</code> note.” Leave blank to
          remove.
        </p>
        <textarea
          id="vault-rules"
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          onBlur={saveRules}
          rows={6}
          placeholder="Write your vault conventions here…"
          data-testid="rules-editor"
          className="border-edge bg-raised text-ink placeholder:text-faint focus:border-accent/50 rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed outline-none"
        />
        <span className="text-faint text-[11px]">
          {rules === savedRules
            ? 'Saved · agents read this before writing.'
            : 'Unsaved — click away to save.'}
        </span>
      </div>

      <div className="border-edge flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <Bot size={15} className="text-faint" />
          <span className="text-ink text-sm font-medium">Global agent skill (Claude Code)</span>
          {status?.installed && (
            <span className="text-faint ml-auto flex items-center gap-1 text-xs">
              <Check size={13} className="text-green-700 dark:text-green-400" />
              {status.outdated ? 'Update available' : 'Installed'}
            </span>
          )}
        </div>
        <p className="text-muted text-xs leading-relaxed">
          Install a skill so any Claude Code agent — in any folder — knows how to work with a Second
          Brain vault, not just one that already has the guide file. It's written to your global
          skills directory.
        </p>
        {status && (
          <code className="text-faint truncate text-[11px]" title={status.path}>
            {status.path}
          </code>
        )}
        <div className="flex flex-wrap gap-2">
          {!status?.installed || status.outdated ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => window.vault.installAgentSkill())}
              className="bg-accent text-accent-ink rounded-lg px-3 py-1.5 text-sm disabled:opacity-60"
              data-testid="install-agent-skill"
            >
              {busy ? 'Working…' : status?.outdated ? 'Update skill' : 'Install agent skill'}
            </button>
          ) : null}
          {status?.installed && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => window.vault.removeAgentSkill())}
              className="border-edge text-muted hover:text-ink rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

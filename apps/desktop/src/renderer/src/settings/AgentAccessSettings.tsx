/**
 * Agent access settings (ADR 0009). The owner's RULES.md editor; per-runtime installs of the vault
 * contract (Claude Code, Codex CLI, Gemini CLI — a data-driven list, one row per runtime); and a
 * global `brain` CLI install with status. All installs are explicit, reversible, and show exactly
 * where they write.
 */
import { Bot, Check, TerminalSquare } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AgentSkillStatus, CliStatus } from '../../../shared/ipc';

export function AgentAccessSettings() {
  const [targets, setTargets] = useState<AgentSkillStatus[]>([]);
  const [cli, setCli] = useState<CliStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rules, setRules] = useState('');
  const [savedRules, setSavedRules] = useState('');

  const refresh = useCallback(() => {
    window.vault.agentSkillStatus().then(setTargets).catch(console.error);
    window.vault.cliStatus().then(setCli).catch(console.error);
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

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    try {
      await action();
      refresh();
    } finally {
      setBusy(null);
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

      <div className="border-edge mb-3 flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <Bot size={15} className="text-faint" />
          <span className="text-ink text-sm font-medium">Teach your agents about vaults</span>
        </div>
        <p className="text-muted text-xs leading-relaxed">
          Install the vault contract into each agent runtime you use, so any agent — in any folder —
          knows how to work with a Second Brain vault. Each install is a single file you can remove
          any time.
        </p>
        <div className="flex flex-col gap-2">
          {targets.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center gap-2"
              data-testid={`skill-${t.id}`}
            >
              <span className="text-ink w-28 shrink-0 text-sm">{t.name}</span>
              <code className="text-faint min-w-0 flex-1 truncate text-[11px]" title={t.path}>
                {t.path}
              </code>
              {t.installed && !t.outdated && (
                <span className="text-faint flex items-center gap-1 text-xs">
                  <Check size={13} className="text-green-700 dark:text-green-400" /> Installed
                </span>
              )}
              {(!t.installed || t.outdated) && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run(t.id, () => window.vault.installAgentSkill(t.id))}
                  className="bg-accent text-accent-ink rounded-lg px-2.5 py-1 text-xs disabled:opacity-60"
                >
                  {busy === t.id ? 'Working…' : t.outdated ? 'Update' : 'Install'}
                </button>
              )}
              {t.installed && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run(t.id, () => window.vault.removeAgentSkill(t.id))}
                  className="border-edge text-muted hover:text-ink rounded-lg border px-2.5 py-1 text-xs disabled:opacity-60"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {cli && (
        <div
          className="border-edge flex flex-col gap-3 rounded-xl border p-4"
          data-testid="cli-install"
        >
          <div className="flex items-center gap-2">
            <TerminalSquare size={15} className="text-faint" />
            <span className="text-ink text-sm font-medium">
              <code>brain</code> command line
            </span>
            {cli.installed && !cli.outdated && (
              <span className="text-faint ml-auto flex items-center gap-1 text-xs">
                <Check size={13} className="text-green-700 dark:text-green-400" /> Installed
              </span>
            )}
          </div>
          <p className="text-muted text-xs leading-relaxed">
            Install the <code className="text-ink">brain</code> command globally so you (and
            scripts/agents) can list, search, and edit vaults from any terminal — the app doesn’t
            need to be open.
          </p>
          <code className="text-faint truncate text-[11px]" title={cli.path}>
            {cli.path}
          </code>
          {cli.installed && !cli.onPath && (
            <p className="text-accent text-[11px]">
              That folder isn’t on your PATH yet — add it in your shell profile, e.g.{' '}
              <code>export PATH="$HOME/.local/bin:$PATH"</code>.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {(!cli.installed || cli.outdated) && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run('cli', () => window.vault.installCli())}
                data-testid="install-cli"
                className="bg-accent text-accent-ink rounded-lg px-3 py-1.5 text-sm disabled:opacity-60"
              >
                {busy === 'cli' ? 'Working…' : cli.outdated ? 'Update command' : 'Install command'}
              </button>
            )}
            {cli.installed && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run('cli', () => window.vault.removeCli())}
                className="border-edge text-muted hover:text-ink rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

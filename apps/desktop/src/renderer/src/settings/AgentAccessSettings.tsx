/**
 * Agent access settings (ADR 0009). The owner's RULES.md editor; per-runtime installs of the vault
 * contract (Claude Code, Codex CLI, Gemini CLI — a data-driven list, one row per runtime); and a
 * global `brain` CLI install with status. All installs are explicit, reversible, and show exactly
 * where they write.
 */
import { Bot, Check, Copy, Sparkles, TerminalSquare } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AgentSkillStatus, CliStatus, VaultInfo } from '../../../shared/ipc';
import { RULE_TEMPLATES } from './rules-templates';

export function AgentAccessSettings() {
  const [targets, setTargets] = useState<AgentSkillStatus[]>([]);
  const [cli, setCli] = useState<CliStatus | null>(null);
  const [info, setInfo] = useState<VaultInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rules, setRules] = useState('');
  const [savedRules, setSavedRules] = useState('');
  const [pathNote, setPathNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    window.vault.agentSkillStatus().then(setTargets).catch(console.error);
    window.vault.cliStatus().then(setCli).catch(console.error);
  }, []);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    window.vault.info().then(setInfo).catch(console.error);
    window.vault
      .getRules()
      .then((text) => {
        setRules(text);
        setSavedRules(text);
      })
      .catch(console.error);
  }, []);

  function persistRules(text: string) {
    setRules(text);
    window.vault
      .setRules(text)
      .then(() => setSavedRules(text))
      .catch(console.error);
  }

  function saveRules() {
    if (rules === savedRules) return;
    persistRules(rules);
  }

  /** Drop a starter template in — replace an empty editor, otherwise append below what's there. */
  function applyTemplate(body: string) {
    const next = rules.trim() ? `${rules.trimEnd()}\n\n${body}` : body;
    persistRules(next);
  }

  const vaultRoot = info?.root ?? 'your vault';
  const examplePrompt = `Use my Second Brain vault at ${vaultRoot} — read its AGENTS.md and RULES.md, then summarise what I captured in the last 24 hours and file it into the right notes.`;
  const anySkillInstalled = targets.some((t) => t.installed);

  function copyPrompt() {
    navigator.clipboard
      .writeText(examplePrompt)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
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
          Conventions agents should follow before writing — where things go, naming, formatting. Not
          sure where to start? Drop in a template and adapt it:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {RULE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => applyTemplate(tpl.body)}
              title={tpl.blurb}
              data-testid={`rule-template-${tpl.id}`}
              className="border-edge text-muted hover:text-ink hover:border-accent/40 flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs"
            >
              <Sparkles size={12} className="text-accent" /> {tpl.name}
            </button>
          ))}
        </div>
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

        {anySkillInstalled && (
          <div className="border-edge/70 bg-surface/50 mt-1 flex flex-col gap-2 rounded-lg border p-3">
            <span className="text-ink text-xs font-medium">Now try it</span>
            <p className="text-muted text-xs leading-relaxed">
              You don't call the skill by name — the agent finds it on its own. Just point it at
              your vault. Open your agent in any folder and ask something like:
            </p>
            <div className="border-edge bg-raised flex items-start gap-2 rounded-lg border p-2.5">
              <p className="text-ink flex-1 text-xs italic leading-relaxed">“{examplePrompt}”</p>
              <button
                type="button"
                onClick={copyPrompt}
                title="Copy prompt"
                data-testid="copy-prompt"
                className="text-muted hover:text-ink shrink-0"
              >
                {copied ? (
                  <Check size={14} className="text-green-700 dark:text-green-400" />
                ) : (
                  <Copy size={14} />
                )}
              </button>
            </div>
          </div>
        )}
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
          {/* Plain-language remediation: the command is installed but Terminal can't find it yet.
              One click writes the PATH line into the right shell profile — no dotfile editing. */}
          {cli.installed && !cli.onPath && !pathNote && (
            <p className="text-muted text-[11px] leading-relaxed">
              Almost there — your Terminal doesn't know where to find <code>brain</code> yet. Click
              below and we'll set it up for you.
            </p>
          )}
          {pathNote && (
            <p className="text-[11px] leading-relaxed text-green-700 dark:text-green-400">
              {pathNote}
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
            {cli.installed && !cli.onPath && (
              <button
                type="button"
                disabled={busy !== null}
                data-testid="cli-add-path"
                onClick={() =>
                  void run('cli', async () => {
                    const { shellProfile } = await window.vault.addCliToPath();
                    const name = shellProfile.split('/').pop();
                    setPathNote(
                      `Done — added to ${name}. Open a new Terminal window (or run \`source ${shellProfile}\`) and \`brain\` will work.`,
                    );
                  })
                }
                className="bg-accent text-accent-ink rounded-lg px-3 py-1.5 text-sm disabled:opacity-60"
              >
                {busy === 'cli' ? 'Working…' : 'Make it available in Terminal'}
              </button>
            )}
            {cli.installed && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  void run('cli', async () => {
                    await window.vault.removeCli();
                    setPathNote(null);
                  })
                }
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

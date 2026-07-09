/**
 * Tiny argv parser — positionals plus `--flag`, `--flag value`, and `--flag=value`. Kept dependency-
 * free (the CLI is a thin shell over core; no need for a parsing library). Boolean flags take no value.
 */

/** Flags that never consume the following token as a value. */
const BOOLEAN_FLAGS = new Set(['json', 'help', 'stdin']);

export interface ParsedArgs {
  /** Positional arguments in order (e.g. the command and its operands). */
  positionals: string[];
  /** Flag values; boolean flags are `true`. */
  flags: Record<string, string | true>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue;
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (!BOOLEAN_FLAGS.has(body) && next !== undefined && !next.startsWith('--')) {
      flags[body] = next;
      i += 1;
    } else {
      flags[body] = true;
    }
  }
  return { positionals, flags };
}

/** Read a string flag, or undefined if absent / boolean. */
export function stringFlag(args: ParsedArgs, name: string): string | undefined {
  const v = args.flags[name];
  return typeof v === 'string' ? v : undefined;
}

/** Whether a boolean flag is set. */
export function boolFlag(args: ParsedArgs, name: string): boolean {
  return args.flags[name] === true || args.flags[name] === 'true';
}

/** Split a comma-separated flag (e.g. `--tags a,b,c`) into a trimmed, non-empty list. */
export function listFlag(args: ParsedArgs, name: string): string[] | undefined {
  const v = stringFlag(args, name);
  if (v === undefined) return undefined;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

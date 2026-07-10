/**
 * Pure merge for provider secrets (no Electron deps, so it's unit-testable). A secret update
 * overwrites only its **non-empty** fields; blank/whitespace fields are ignored, not cleared. This
 * is what makes saving one field at a time safe (Bedrock's access key then secret key arrive in
 * separate saves) and makes a blank "leave to keep" field a no-op instead of wiping the keychain.
 */
import type { ProviderSecretInput } from '../shared/ipc';

export function mergeProviderSecret(
  existing: ProviderSecretInput,
  update: ProviderSecretInput,
): { merged: ProviderSecretInput; changed: boolean } {
  const merged: ProviderSecretInput = { ...existing };
  let changed = false;
  for (const key of Object.keys(update) as (keyof ProviderSecretInput)[]) {
    const value = update[key];
    if (typeof value === 'string' && value.trim() && value !== merged[key]) {
      merged[key] = value;
      changed = true;
    }
  }
  return { merged, changed };
}

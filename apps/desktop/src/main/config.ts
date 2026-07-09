/**
 * App config persistence (main process): remembered vaults, user settings, and per-provider
 * encrypted secrets. One JSON file in userData; secrets are ciphertext only (encrypted with the OS
 * keychain via `safeStorage`, ADR 0008) — never plaintext on disk, never sent to the renderer.
 * Loaded shapes are validated/migrated on read so a hand-edited or stale file degrades to defaults.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_EMBEDDING_SETTINGS,
  type EmbeddingSettings,
  OLLAMA_BASE_URL,
  type ProviderKind,
} from '@brain/core';
import { app, safeStorage } from 'electron';
import type { ProviderSecretInput, Settings } from '../shared/ipc.js';

const MAX_RECENT = 8;

export interface Config {
  recent: string[];
  settings: Settings;
  /** Per-provider-kind encrypted secret blobs (base64 ciphertext). */
  secrets: Record<string, string>;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  reduceTransparency: false,
  embedding: DEFAULT_EMBEDDING_SETTINGS,
};

function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

/**
 * Upgrade a persisted `embedding` value to the ADR-0008 shape, validating rather than trusting it.
 * The ADR-0007 flat form (`{ provider, baseUrl, model, apiKey }`) maps to a provider kind +
 * per-kind config; any old apiKey is dropped (the owner re-enters it, now stored in the keychain).
 */
function migrateEmbedding(raw: unknown): EmbeddingSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_EMBEDDING_SETTINGS;
  const candidate = raw as Partial<EmbeddingSettings>;
  if (typeof candidate.enabled === 'boolean' && typeof candidate.configs === 'object') {
    // Already ADR-0008 — merge over the defaults so new provider kinds gain their default config.
    return {
      enabled: candidate.enabled,
      kind: candidate.kind ?? DEFAULT_EMBEDDING_SETTINGS.kind,
      configs: { ...DEFAULT_EMBEDDING_SETTINGS.configs, ...(candidate.configs ?? {}) },
    };
  }
  const old = raw as { provider?: string; baseUrl?: string; model?: string };
  const kind: ProviderKind = (old.baseUrl ?? '').startsWith(OLLAMA_BASE_URL.replace('/v1', ''))
    ? 'ollama'
    : 'openai-compatible';
  const migrated: EmbeddingSettings = structuredClone(DEFAULT_EMBEDDING_SETTINGS);
  migrated.enabled = old.provider === 'openai-compatible';
  migrated.kind = kind;
  if (old.baseUrl || old.model) {
    migrated.configs[kind] = {
      kind,
      baseUrl: old.baseUrl ?? migrated.configs[kind]?.baseUrl ?? '',
      model: old.model ?? '',
    };
  }
  return migrated;
}

export function readConfig(): Config {
  try {
    const raw = JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<Config> & {
      vaultPath?: unknown;
    };
    const recent = Array.isArray(raw.recent) ? raw.recent.filter((p) => typeof p === 'string') : [];
    // Migrate the old single-path format.
    if (typeof raw.vaultPath === 'string' && !recent.includes(raw.vaultPath)) {
      recent.unshift(raw.vaultPath);
    }
    const settings: Settings = { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) };
    settings.embedding = migrateEmbedding(
      (raw.settings as { embedding?: unknown } | undefined)?.embedding,
    );
    // Only keep well-formed ciphertext entries; anything else is dropped, not trusted.
    const secrets: Record<string, string> = {};
    if (raw.secrets && typeof raw.secrets === 'object') {
      for (const [key, value] of Object.entries(raw.secrets)) {
        if (typeof value === 'string') secrets[key] = value;
      }
    }
    return { recent, settings, secrets };
  } catch {
    return { recent: [], settings: DEFAULT_SETTINGS, secrets: {} };
  }
}

export function writeConfig(config: Config): void {
  try {
    writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  } catch {
    // Non-fatal: we just won't persist across launches.
  }
}

/** Put a vault at the head of the recent list (most-recent-first, capped, de-duplicated). */
export function rememberVault(vaultPath: string): void {
  const config = readConfig();
  config.recent = [vaultPath, ...config.recent.filter((p) => p !== vaultPath)].slice(0, MAX_RECENT);
  writeConfig(config);
}

export function readSettings(): Settings {
  return readConfig().settings;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const config = readConfig();
  config.settings = { ...config.settings, ...patch };
  writeConfig(config);
  return config.settings;
}

// --- Embedding provider secrets (OS keychain via safeStorage; ADR 0008) ------

export function secretStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/** Decrypt a provider's stored secret, or `{}` if none / the keychain is unavailable. */
export function readSecret(kind: ProviderKind): ProviderSecretInput {
  const enc = readConfig().secrets[kind];
  if (!enc || !safeStorage.isEncryptionAvailable()) return {};
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(enc, 'base64'))) as ProviderSecretInput;
  } catch {
    return {};
  }
}

/** Encrypt and persist a provider's secret; a blank secret clears it. */
export function writeSecret(kind: ProviderKind, input: ProviderSecretInput): void {
  const config = readConfig();
  const hasAny = Object.values(input).some((v) => typeof v === 'string' && v.trim());
  if (!hasAny) {
    delete config.secrets[kind];
  } else if (safeStorage.isEncryptionAvailable()) {
    config.secrets[kind] = safeStorage.encryptString(JSON.stringify(input)).toString('base64');
  }
  writeConfig(config);
}

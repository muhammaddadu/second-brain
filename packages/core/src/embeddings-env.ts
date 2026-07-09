/**
 * Build an embedding adapter from environment variables — the configuration seam for headless
 * surfaces (CLI, MCP server), which are plain Node with no app keychain. Local / on-device
 * providers need no secret; unset `BRAIN_EMBED` → null (callers fall back to keyword-only search).
 *
 *   BRAIN_EMBED           provider kind: builtin | ollama | lmstudio | openai | openai-compatible | bedrock
 *   BRAIN_EMBED_MODEL     model name / id
 *   BRAIN_EMBED_BASE_URL, BRAIN_EMBED_REGION, BRAIN_EMBED_API_KEY, BRAIN_EMBED_CACHE
 *   (Bedrock also reads AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, or the default AWS chain.)
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  createEmbeddingAdapter,
  type EmbeddingAdapter,
  PROVIDER_KINDS,
  type ProviderConfig,
  type ProviderKind,
} from './embeddings.js';

/** Validate an env value against the provider-kind list (no cast-before-check). */
function parseKind(value: string | undefined): ProviderKind | null {
  return (PROVIDER_KINDS as readonly string[]).includes(value ?? '')
    ? (value as ProviderKind)
    : null;
}

export async function embeddingAdapterFromEnv(
  env: NodeJS.ProcessEnv,
): Promise<EmbeddingAdapter | null> {
  const kind = parseKind(env.BRAIN_EMBED);
  if (!kind) return null;
  const config: ProviderConfig = {
    kind,
    ...(env.BRAIN_EMBED_BASE_URL ? { baseUrl: env.BRAIN_EMBED_BASE_URL } : {}),
    ...(env.BRAIN_EMBED_MODEL ? { model: env.BRAIN_EMBED_MODEL } : {}),
    ...(env.BRAIN_EMBED_REGION ? { region: env.BRAIN_EMBED_REGION } : {}),
    ...(kind === 'builtin'
      ? { cacheDir: env.BRAIN_EMBED_CACHE ?? join(homedir(), '.cache', 'second-brain', 'models') }
      : {}),
  };
  const secrets = {
    ...(env.BRAIN_EMBED_API_KEY ? { apiKey: env.BRAIN_EMBED_API_KEY } : {}),
    ...(env.AWS_ACCESS_KEY_ID ? { awsAccessKeyId: env.AWS_ACCESS_KEY_ID } : {}),
    ...(env.AWS_SECRET_ACCESS_KEY ? { awsSecretAccessKey: env.AWS_SECRET_ACCESS_KEY } : {}),
  };
  return createEmbeddingAdapter(config, secrets);
}

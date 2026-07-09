# 0008. Embedding providers as adapters behind one interface, with local discovery and keychain secrets

**Status:** accepted
**Date:** 2026-07-09
**Deciders:** Muhammad Dadu (owner)
**Supersedes:** the single OpenAI-compatible client of [ADR 0007](0007-embeddings-provider-config-and-vector-storage.md) (that config becomes the `openai-compatible` adapter)

## Context

[ADR 0007](0007-embeddings-provider-config-and-vector-storage.md) shipped semantic search as one hardcoded OpenAI-compatible HTTP client. The owner wants the Settings screen to support **many** embedding providers — local (Ollama, LM Studio), hosted (OpenAI), and enterprise (AWS Bedrock now; Azure/Vertex later) — while staying simple for non-technical users and extensible for future ones. Providers differ in wire format (OpenAI `data[].embedding` vs. Bedrock Titan `{embedding}`), auth (none / bearer key / AWS SigV4), capabilities (some can list models, some can't), and privacy (local keeps text on-device; hosted sends it out). Two cross-cutting questions fall out: **how the code stays open to new providers without special-casing each call site**, and **where secrets (API keys, cloud credentials) live**, given the owner asked for secure storage.

## Decision Drivers

1. **Extensible without touching call sites** — adding a provider should mean writing one class, not editing search/index/IPC code.
2. **Simple by default, powerful when needed** — a casual user picks "Ollama, recommended" and goes; an advanced user configures a custom endpoint or Bedrock.
3. **Local-first / private by default** — embeddings stay off until opted in; local providers keep note text on-device; the UI must make where-text-goes obvious.
4. **Secrets never in plaintext / never in the vault** — API keys and cloud creds encrypted at rest, and never written into a note or the vault dir.
5. **Self-discovery** — detect local runtimes and their models so setup is a click, not a manual URL.

## Decision

**One adapter interface; a provider registry; provider-specific config; secrets in the OS keychain; discovery for local runtimes.**

- **Adapter interface** (in `packages/core`): every provider implements
  `kind`, `model`, `privacyMode() → 'local'|'hosted'`, `maxBatch()`, `dimensions()`,
  `listModels()`, `testConnection() → { ok, message, dimensions? }`, and `embed(texts) → number[][]`.
  The index/search code depends only on this interface (an `EmbeddingProvider` with `embed`), so nothing downstream knows which provider is active.
- **Registry + factory**: `createEmbeddingAdapter(config, secrets)` maps a `kind` to its adapter. Adapters shipped now: `ollama`, `lmstudio`, `openai-compatible` (all thin variants over the OpenAI `/embeddings` shape), `openai` (adds key + model list), and `bedrock` (native, see below). Azure/Vertex are registry entries the UI routes to the custom-endpoint adapter until native adapters land.
- **AWS Bedrock adapter** lazy-imports `@aws-sdk/client-bedrock-runtime` (only when Bedrock is actually used, so the SDK never loads for the common local path) and maps Titan/Cohere embedding responses to `number[][]`; auth uses the default AWS credential chain (profile / env) with optional explicit keys.
- **Secrets via Electron `safeStorage`**: the main process encrypts keys/creds with the OS keychain (macOS Keychain, Windows DPAPI, libsecret) and stores only ciphertext; `config.json` holds non-secret provider config plus opaque secret handles, never plaintext. Core adapters receive resolved secrets at construction — core never touches the keychain (that's a main-process concern, injected).
- **Discovery**: a `scanLocalProviders()` probes well-known local endpoints (Ollama `:11434`, LM Studio `:1234`), reporting `detected | running | needs-setup | connection-failed` and listing available models, powering a one-click "Scan this machine".

## Consequences

- **Easier:** a new provider is one adapter class + a registry line + a config panel; the picker UX, indexing, and search are untouched. Local setup becomes click-scan-test. Secrets are encrypted at rest and isolated to the main process.
- **Harder:** more surface to test (per-adapter `testConnection`/response mapping); the config schema is now a discriminated union per provider (migration below); Bedrock adds an optional heavy dependency (mitigated by lazy import + marking it external, like `node-sqlite3-wasm`); `safeStorage` needs an unavailable-keychain fallback (disable hosted providers / warn rather than store plaintext).
- **Migration:** the ADR-0007 flat `{ provider, baseUrl, model, apiKey }` maps forward to `{ enabled: provider!=='off', kind: baseUrl includes 11434 ? 'ollama' : 'openai-compatible', <kind>: { baseUrl, model } }` with any `apiKey` moved into `safeStorage`; a one-time read-time upgrade in the settings loader handles existing configs.
- **Revisit if:** native Azure/Vertex adapters are needed (add adapters behind the same interface), or providers need per-provider vector namespaces (today a model change re-embeds the whole index — see ADR 0007).

## Links

- Builds on / supersedes the client in: [ADR 0007](0007-embeddings-provider-config-and-vector-storage.md)
- Index the vectors land in: [ADR 0006](0006-wasm-sqlite-for-derived-index.md), [data-model](../architecture/data-model.md) § Index schema
- Epic: [E4 — Search index & RAG](../product/epics/E4-search-rag.md)

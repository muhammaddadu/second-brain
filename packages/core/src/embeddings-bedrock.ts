/**
 * AWS Bedrock embedding adapter (ADR 0008). Kept in its own module and imported lazily by the
 * factory so the AWS SDK is only loaded when Bedrock is actually used — the common local path never
 * pays for it. Maps Titan and Cohere embedding responses to the common `number[][]` shape. Auth uses
 * the default AWS credential chain (profile / environment) unless explicit keys are injected.
 */
import type { EmbeddingAdapter, ProviderSecrets, TestResult } from './embeddings.js';

/** Curated Bedrock embedding models for the UI dropdown (Bedrock has no cheap per-account list API). */
export const BEDROCK_EMBEDDING_MODELS = [
  'amazon.titan-embed-text-v2:0',
  'amazon.titan-embed-text-v1',
  'cohere.embed-english-v3',
  'cohere.embed-multilingual-v3',
];

interface InvokeResult {
  body: Uint8Array;
}
interface BedrockClientLike {
  send(command: unknown): Promise<InvokeResult>;
}

/** Request/response shaping differs by model family. */
function isCohere(modelId: string): boolean {
  return modelId.startsWith('cohere.');
}

export function createBedrockAdapter(
  region: string,
  modelId: string,
  secrets: ProviderSecrets,
): EmbeddingAdapter {
  let dims: number | null = null;
  let clientPromise: Promise<{
    client: BedrockClientLike;
    InvokeModelCommand: new (i: unknown) => unknown;
  }> | null = null;

  // Lazily construct the SDK client on first use so `@aws-sdk/*` never loads for non-Bedrock setups.
  function getClient() {
    if (!clientPromise) {
      clientPromise = import('@aws-sdk/client-bedrock-runtime').then((sdk) => {
        const credentials =
          secrets.awsAccessKeyId && secrets.awsSecretAccessKey
            ? {
                accessKeyId: secrets.awsAccessKeyId,
                secretAccessKey: secrets.awsSecretAccessKey,
              }
            : undefined;
        const client = new sdk.BedrockRuntimeClient(
          credentials ? { region, credentials } : { region },
        ) as unknown as BedrockClientLike;
        return {
          client,
          InvokeModelCommand: sdk.InvokeModelCommand as new (i: unknown) => unknown,
        };
      });
    }
    return clientPromise;
  }

  async function invoke(text: string): Promise<number[]> {
    const { client, InvokeModelCommand } = await getClient();
    const body = isCohere(modelId)
      ? JSON.stringify({ texts: [text], input_type: 'search_document' })
      : JSON.stringify({ inputText: text });
    const res = await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body,
      }),
    );
    const json = JSON.parse(new TextDecoder().decode(res.body)) as {
      embedding?: number[];
      embeddings?: number[][];
    };
    const vec = isCohere(modelId) ? json.embeddings?.[0] : json.embedding;
    if (!Array.isArray(vec)) throw new Error('response was not an embedding');
    dims = vec.length;
    return vec;
  }

  return {
    kind: 'bedrock',
    model: modelId,
    privacyMode: () => 'hosted',
    maxBatch: () => 1, // Titan is one input per call; we serialize for a uniform interface.
    dimensions: () => dims,
    async listModels(): Promise<string[]> {
      return BEDROCK_EMBEDDING_MODELS;
    },
    async testConnection(): Promise<TestResult> {
      try {
        const vec = await invoke('connection test');
        return {
          ok: true,
          message: `Connected to Bedrock — ${vec.length}-dimension embeddings.`,
          dimensions: vec.length,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (/credential|token|access denied|unauthor/i.test(msg)) {
          return { ok: false, message: 'AWS rejected the credentials or lacks Bedrock access.' };
        }
        if (/could not|resolve|region|network|ENOTFOUND/i.test(msg)) {
          return {
            ok: false,
            message: 'Could not reach Bedrock. Check the region and credentials.',
          };
        }
        return { ok: false, message: `Bedrock connection failed: ${msg}` };
      }
    },
    async embed(texts: string[]): Promise<number[][]> {
      const out: number[][] = [];
      for (const text of texts) out.push(await invoke(text));
      return out;
    },
  };
}

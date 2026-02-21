import { Langfuse } from "langfuse";

let langfuseClient: Langfuse | null | undefined;
let loggedMissingConfig = false;

/**
 * Gets langfuse config.
 */
function getLangfuseConfig(): {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
} | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  const baseUrl = process.env.LANGFUSE_BASE_URL?.trim();

  if (!publicKey || !secretKey) {
    return null;
  }

  return {
    publicKey,
    secretKey,
    ...(baseUrl ? { baseUrl } : {}),
  };
}

/**
 * Gets langfuse public key preview.
 */
export function getLangfusePublicKeyPreview(): string | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  if (!publicKey) {
    return null;
  }

  if (publicKey.length <= 10) {
    return publicKey;
  }

  return `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`;
}

/**
 * Returns whether langfuse is configured is true.
 */
export function isLangfuseConfigured(): boolean {
  return getLangfuseConfig() !== null;
}

/**
 * Gets langfuse client.
 */
export function getLangfuseClient(): Langfuse | null {
  if (langfuseClient !== undefined) {
    return langfuseClient;
  }

  const config = getLangfuseConfig();
  if (!config) {
    if (!loggedMissingConfig && process.env.NODE_ENV !== "test") {
      console.warn(
        "Langfuse tracing disabled: missing LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY.",
      );
      loggedMissingConfig = true;
    }
    langfuseClient = null;
    return langfuseClient;
  }

  langfuseClient = new Langfuse({
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
  });
  return langfuseClient;
}

/**
 * Handles flush langfuse client.
 */
export async function flushLangfuseClient(): Promise<void> {
  const client = getLangfuseClient();
  if (!client) {
    return;
  }

  await client.flushAsync();
}

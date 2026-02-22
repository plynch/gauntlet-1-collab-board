import { Langfuse } from "langfuse";

let langfuseClient: Langfuse | null | undefined;
let loggedMissingConfig = false;

function getLangfuseConfig(): {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
  environment: string;
} | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  const baseUrl = process.env.LANGFUSE_BASE_URL?.trim();
  const environment =
    process.env.LANGFUSE_TRACING_ENVIRONMENT?.trim() || "default";

  if (!publicKey || !secretKey) {
    return null;
  }

  return {
    publicKey,
    secretKey,
    environment,
    ...(baseUrl ? { baseUrl } : {}),
  };
}

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

export function isLangfuseConfigured(): boolean {
  return getLangfuseConfig() !== null;
}

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
    environment: config.environment,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
  });
  return langfuseClient;
}

export async function flushLangfuseClient(): Promise<void> {
  const client = getLangfuseClient();
  if (!client) {
    return;
  }

  await client.flushAsync();
}

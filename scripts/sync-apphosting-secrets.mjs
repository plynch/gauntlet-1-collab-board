#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function parseEnvFile(content) {
  const result = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const delimiterIndex = trimmed.indexOf("=");
    if (delimiterIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, delimiterIndex).trim();
    let value = trimmed.slice(delimiterIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value === "") {
      continue;
    }

    value = value.replace(/\\n/g, "\n");
    result[key] = value;
  }

  return result;
}

function runFirebaseSecretSet(projectId, name, value) {
  const command =
    `npx firebase apphosting:secrets:set ${name} -P ${projectId} --data-file=-`;

  execSync(command, {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
    encoding: "utf8",
  });
}

function maskValue(value) {
  if (!value) {
    return "<empty>";
  }
  const start = Math.min(4, value.length);
  const end = Math.min(4, value.length);
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function showHelp() {
  console.log(`Usage: node scripts/sync-apphosting-secrets.mjs [--project <projectId>] [--env-file <path>]

Required: .env.local keys in environment file:
  - OPENAI_API_KEY
  - LANGFUSE_PUBLIC_KEY
  - LANGFUSE_SECRET_KEY

Optional (if present):
  - OPENAI_AGENTS_TRACING_API_KEY
`);
}

function main() {
  const args = process.argv.slice(2);
  let projectId = "gauntlet-1-collab-board";
  let envFile = path.join(process.cwd(), ".env.local");

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--project" || arg === "-p") {
      projectId = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--env-file" || arg === "-e") {
      envFile = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      showHelp();
      return;
    }
  }

  const requiredKeys = [
    "OPENAI_API_KEY",
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
  ];

  const optionalKeys = ["OPENAI_AGENTS_TRACING_API_KEY"];

  const content = fs.readFileSync(envFile, "utf8");
  const env = parseEnvFile(content);

  const missing = requiredKeys.filter((key) => !(key in env) || env[key].trim() === "");
  if (missing.length > 0) {
    throw new Error(`Missing required keys in ${envFile}: ${missing.join(", ")}`);
  }

  const secretsToSet = [
    ...requiredKeys,
    ...optionalKeys.filter((key) => key in env && env[key].trim() !== ""),
  ];

  console.log(`Syncing ${secretsToSet.length} secret(s) to App Hosting project ${projectId}.`);

  for (const key of secretsToSet) {
    const value = env[key];
    console.log(`- setting ${key} (${maskValue(value)})`);
    runFirebaseSecretSet(projectId, key, value);
  }

  console.log("Done. Run firebase apphosting:secrets:describe for verification.");
}

main();

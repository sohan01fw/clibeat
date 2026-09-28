import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { version: currentVersion } = require("../package.json") as { version: string };
const cacheLifetimeMs = 24 * 60 * 60 * 1_000;
const requestTimeoutMs = 1_000;

type UpdateCache = { checkedAt: number; latestVersion: string };

function cachePath() {
  const dataDirectory = join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "clibeat");
  return join(dataDirectory, "update-check.json");
}

function readCache(): UpdateCache | undefined {
  try {
    const cache = JSON.parse(readFileSync(cachePath(), "utf8")) as UpdateCache;
    return typeof cache.checkedAt === "number" && typeof cache.latestVersion === "string" ? cache : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(cache: UpdateCache) {
  try {
    const path = cachePath();
    if (!existsSync(path)) mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(cache), "utf8");
  } catch {
    // An update notice should never prevent CliBeat from starting.
  }
}

function isNewerVersion(candidate: string, installed: string) {
  const parse = (version: string) => version.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10));
  const candidateParts = parse(candidate);
  const installedParts = parse(installed);
  for (let index = 0; index < Math.max(candidateParts.length, installedParts.length); index += 1) {
    const difference = (candidateParts[index] ?? 0) - (installedParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

function printUpdateNotice(latestVersion: string) {
  if (isNewerVersion(latestVersion, currentVersion)) {
    console.log(`Update available: v${currentVersion} → v${latestVersion}\nRun: npm install -g @beatcliapp/clibeat@latest\n`);
  }
}

export async function notifyIfUpdateAvailable() {
  const cache = readCache();
  if (cache && Date.now() - cache.checkedAt < cacheLifetimeMs) {
    printUpdateNotice(cache.latestVersion);
    return;
  }

  try {
    const response = await fetch("https://registry.npmjs.org/@beatcliapp%2fclibeat/latest", {
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) return;
    const { version } = await response.json() as { version?: unknown };
    if (typeof version !== "string") return;
    writeCache({ checkedAt: Date.now(), latestVersion: version });
    printUpdateNotice(version);
  } catch {
    // Offline users should not see an error or a startup delay.
  }
}

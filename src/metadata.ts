import { spawn } from "node:child_process";

/** Converts equivalent YouTube links (share links, timestamps, etc.) to one key. */
export function normalizeMusicUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const host = url.hostname.replace(/^www\./, "");
  let videoId = url.searchParams.get("v");
  if (host === "youtu.be") videoId = url.pathname.split("/")[1];
  if (host.endsWith("youtube.com") && url.pathname.startsWith("/shorts/")) videoId = url.pathname.split("/")[2];
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : `${url.origin}${url.pathname}`;
}

export function getTitle(url: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const command = spawn("yt-dlp", ["--no-playlist", "--skip-download", "--print", "%(title)s", url]);
    let output = "";
    command.stdout.on("data", (chunk) => { output += chunk.toString(); });
    command.on("error", () => resolve(undefined));
    command.on("close", (code) => resolve(code === 0 ? output.trim().split("\n")[0] || undefined : undefined));
  });
}

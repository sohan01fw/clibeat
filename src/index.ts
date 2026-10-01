#!/usr/bin/env -S node --no-warnings
import process from "node:process";
import { Database } from "./database.js";
import { getTitle, normalizeMusicUrl } from "./metadata.js";
import { Player } from "./player.js";
import { draw } from "./ui.js";
import { checkRequirements, printRequirementsError } from "./requirements.js";
import { notifyIfUpdateAvailable } from "./update-check.js";

const db = new Database();
const args = process.argv.slice(2);
let selectedMusicId: number | undefined;
let resumePosition = 0;
const usage = () => console.log(`Usage:
  clibeat <YouTube URL> [--theme <name>]
  clibeat <command>

Commands:
  theme list
  theme set <name>
  theme remove <name>
  list
  add <YouTube URL>
  play <number>
  reset <number>
  remove <number>

Example:
  clibeat play 1`);
const printThemes = () => {
  const active = db.getActiveTheme().name;
  console.log(["Themes:", "", ...db.listThemes().map((theme) => `  ${theme.name.padEnd(10)} ${theme.description}${theme.name === active ? "  (active)" : ""}`)].join("\n"));
};
const printMusic = async () => {
  const music = db.listMusic();
  await Promise.all(music.map(async (track) => {
    if (!track.title) {
      const title = await getTitle(track.url);
      if (title) track.title = db.saveMusic(track.url, title).title;
    }
  }));
  console.log(music.length ? ["Saved tracks:", "", ...music.map((track, index) => `  ${String(index + 1).padEnd(4)} ${track.title ?? "Unknown title"}${track.progressSeconds ? `  (resume ${Math.floor(track.progressSeconds / 60)}:${String(Math.floor(track.progressSeconds % 60)).padStart(2, "0")})` : ""}`)].join("\n") : "No saved tracks yet. Add one with: add <URL>");
};

function saveTrack(rawUrl: string) {
  const url = normalizeMusicUrl(rawUrl);
  // Older saves may contain share/timestamp variants; compare their canonical forms too.
  const existing = db.getMusicByUrl(url) ?? db.listMusic().find((track) => normalizeMusicUrl(track.url) === url);
  return db.saveMusic(existing?.url ?? url);
}

async function saveTrackWithTitle(rawUrl: string) {
  const track = saveTrack(rawUrl);
  const title = await getTitle(track.url);
  return title ? db.saveMusic(track.url, title) : track;
}

async function runCommand(): Promise<string | undefined> {
  const [group, action, value] = args;
  if (group === "theme") {
    if (action === "list") printThemes();
    else if (action === "set" && value) {
      const theme = db.setActiveTheme(value);
      console.log(theme ? `Active theme: ${theme.name}` : `Theme not found: ${value}`);
    } else if (action === "remove" && value) {
      const result = db.removeTheme(value);
      console.log(result === "removed" ? `Removed theme: ${value}` : result === "active" ? "Choose another active theme before removing this one." : `Theme not found: ${value}`);
    } else usage();
    return;
  }
  if (group === "help" || group === "--help" || group === "-h") {
    usage();
    return;
  }
  if (group === "list") {
    await printMusic();
    return;
  }
  if (group === "add" && /^https?:\/\//i.test(action ?? "")) {
      const track = await saveTrackWithTitle(action);
      console.log(`Saved: ${track.title ?? "Unknown title"}`);
    return;
  }
  if (group === "remove" && Number.isInteger(Number(action)) && Number(action) > 0) {
    console.log(db.removeMusicAtPosition(Number(action)) ? `Removed track #${action}.` : `Track #${action} not found.`);
    return;
  }
  if (group === "reset" && Number.isInteger(Number(action)) && Number(action) > 0) {
    console.log(db.resetMusicProgressAtPosition(Number(action)) ? `Reset playback position for track #${action}.` : `Track #${action} not found.`);
    return;
  }
  if (group === "play" && Number.isInteger(Number(action)) && Number(action) > 0) {
      const track = db.getMusicAtPosition(Number(action));
      if (!track) { console.error(`Track #${action} not found.`); return; }
      selectedMusicId = track.id;
      resumePosition = track.progressSeconds;
      return track.url;
  }
  if (["add", "remove", "reset", "play"].includes(group)) { usage(); return; }
  return args.find((arg) => /^https?:\/\//i.test(arg));
}

await notifyIfUpdateAvailable();
const commandUrl = await runCommand();
if (!commandUrl) {
  if (!args.length) usage();
  process.exit(0);
}

const missingRequirements = checkRequirements();
if (missingRequirements.length) {
  printRequirementsError(missingRequirements);
  process.exit(1);
}

const themeIndex = args.findIndex((arg) => arg === "--theme" || arg.startsWith("--theme="));
const requestedTheme = themeIndex < 0 ? undefined : args[themeIndex].startsWith("--theme=") ? args[themeIndex].slice(8) : args[themeIndex + 1];
const theme = requestedTheme ? db.setActiveTheme(requestedTheme) : db.getActiveTheme();
if (!theme) {
  console.error(`Theme not found: ${requestedTheme}`);
  printThemes();
  process.exit(1);
}
// Direct playback must not wait for yt-dlp metadata: mpv already resolves the URL.
const savedTrack = saveTrack(commandUrl);
selectedMusicId ??= savedTrack.id;
resumePosition ||= savedTrack.progressSeconds;

let closed = false;
const cleanup = () => {
  if (closed) return;
  closed = true;
  if (selectedMusicId) db.setMusicProgress(selectedMusicId, player.state.time);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write("\x1b[?25h\x1b[0m\n");
  process.exit();
};
let lastProgressSave = 0;
let supportVisibleUntil = 0;
const player = new Player(
  commandUrl,
  cleanup,
  (volume) => db.setVolume(volume),
  (seconds) => {
    if (selectedMusicId && (seconds < lastProgressSave || seconds - lastProgressSave >= 5)) {
      db.setMusicProgress(selectedMusicId, seconds);
      lastProgressSave = seconds;
    }
  },
  (title) => { if (selectedMusicId) db.setMusicTitle(selectedMusicId, title); },
  db.getVolume(),
  resumePosition,
);
if (process.stdin.isTTY) {
  process.stdin.setEncoding("utf8");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (key: string) => {
    if (key === "q" || key === "\u0003") return player.quit();
    if (key === " ") player.togglePause();
    if (key === "\u001b[D") player.seek(-5);
    if (key === "\u001b[C") player.seek(5);
    if (key === "r") player.restart();
    if (key === "s") supportVisibleUntil = Date.now() + 60_000;
    if (key === "\u001b[A") player.changeVolume(5);
    if (key === "\u001b[B") player.changeVolume(-5);
  });
}
process.on("SIGINT", () => player.quit());
process.stdout.write("\x1b[?25l");
player.start();
setInterval(() => draw(player.state, theme, Date.now() < supportVisibleUntil), 120);

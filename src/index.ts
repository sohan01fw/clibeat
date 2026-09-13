#!/usr/bin/env -S node --no-warnings
import process from "node:process";
import { Database } from "./database.js";
import { getTitle, normalizeMusicUrl } from "./metadata.js";
import { Player } from "./player.js";
import { draw } from "./ui.js";
import { checkRequirements, printRequirementsError } from "./requirements.js";

const db = new Database();
const args = process.argv.slice(2);
let selectedMusicId: number | undefined;
let resumePosition = 0;
const usage = () => console.log(`Usage:
  npm run dev -- <YouTube URL> [--theme <name>]
  npm run dev -- theme list|set <name>|remove <name>
  npm run dev -- music list|add <URL>|play <number>|reset <number>|remove <number>`);
const printThemes = () => {
  const active = db.getActiveTheme().name;
  console.log(["Themes:", "", ...db.listThemes().map((theme) => `  ${theme.name.padEnd(10)} ${theme.description}${theme.name === active ? "  (active)" : ""}`)].join("\n"));
};
const printMusic = async () => {
  const music = db.listMusic();
  for (const track of music) {
    if (!track.title) {
      const title = await getTitle(track.url);
      if (title) track.title = db.saveMusic(track.url, title).title;
    }
  }
  console.log(music.length ? ["Saved music:", "", ...music.map((track, index) => `  ${String(index + 1).padEnd(4)} ${track.title ?? "Unknown title"}${track.progressSeconds ? `  (resume ${Math.floor(track.progressSeconds / 60)}:${String(Math.floor(track.progressSeconds % 60)).padStart(2, "0")})` : ""}`)].join("\n") : "No saved music yet. Add one with: music add <URL>");
};

async function saveWithTitle(rawUrl: string) {
  const url = normalizeMusicUrl(rawUrl);
  const title = await getTitle(url);
  // Older saves may contain share/timestamp variants; compare their canonical forms too.
  const existing = db.listMusic().find((track) => normalizeMusicUrl(track.url) === url);
  return db.saveMusic(existing?.url ?? url, title);
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
  if (group === "music") {
    if (action === "list") await printMusic();
    else if (action === "add" && /^https?:\/\//i.test(value ?? "")) {
      const track = await saveWithTitle(value);
      console.log(`Saved: ${track.title ?? "Unknown title"}`);
    }
    else if (action === "remove" && Number.isInteger(Number(value)) && Number(value) > 0) console.log(db.removeMusicAtPosition(Number(value)) ? `Removed music #${value}.` : `Music #${value} not found.`);
    else if (action === "reset" && Number.isInteger(Number(value)) && Number(value) > 0) console.log(db.resetMusicProgressAtPosition(Number(value)) ? `Reset playback position for music #${value}.` : `Music #${value} not found.`);
    else if (action === "play" && Number.isInteger(Number(value)) && Number(value) > 0) {
      const track = db.getMusicAtPosition(Number(value));
      if (!track) { console.error(`Music #${value} not found.`); return; }
      selectedMusicId = track.id;
      resumePosition = track.progressSeconds;
      return track.url;
    } else usage();
    return;
  }
  return args.find((arg) => /^https?:\/\//i.test(arg));
}

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
const savedTrack = await saveWithTitle(commandUrl);
selectedMusicId ??= savedTrack.id;
resumePosition ||= savedTrack.progressSeconds;

let closed = false;
const cleanup = () => {
  if (closed) return;
  closed = true;
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write("\x1b[?25h\x1b[0m\n");
  process.exit();
};
const player = new Player(commandUrl, cleanup, (volume) => db.setVolume(volume), (seconds) => { if (selectedMusicId) db.setMusicProgress(selectedMusicId, seconds); }, db.getVolume(), resumePosition);
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
    if (key === "\u001b[A") player.changeVolume(5);
    if (key === "\u001b[B") player.changeVolume(-5);
  });
}
process.on("SIGINT", () => player.quit());
process.stdout.write("\x1b[?25l");
player.start();
setInterval(() => draw(player.state, theme), 80);

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defaultThemes, type Theme } from "./themes.js";

export type SavedMusic = { id: number; url: string; title?: string; progressSeconds: number; addedAt: string };

export class Database {
  private readonly db: DatabaseSync;

  constructor() {
    const dataDirectory = join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "beatcli");
    mkdirSync(dataDirectory, { recursive: true });
    this.db = new DatabaseSync(join(dataDirectory, "beatcli.db"));
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS themes (
        name TEXT PRIMARY KEY, description TEXT NOT NULL, accent INTEGER NOT NULL,
        highlight INTEGER NOT NULL, played INTEGER NOT NULL, track INTEGER NOT NULL, status INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS music (
        id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE, title TEXT, progress_seconds REAL NOT NULL DEFAULT 0, added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const musicColumns = this.db.prepare("PRAGMA table_info(music)").all() as { name: string }[];
    if (!musicColumns.some((column) => column.name === "title")) this.db.exec("ALTER TABLE music ADD COLUMN title TEXT");
    if (!musicColumns.some((column) => column.name === "progress_seconds")) this.db.exec("ALTER TABLE music ADD COLUMN progress_seconds REAL NOT NULL DEFAULT 0");
    const insert = this.db.prepare("INSERT OR IGNORE INTO themes (name, description, accent, highlight, played, track, status) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const theme of defaultThemes) insert.run(theme.name, theme.description, theme.accent, theme.highlight, theme.played, theme.track, theme.status);
    if (!this.getSetting("active_theme")) this.setSetting("active_theme", "neon");
  }

  private getSetting(key: string) {
    return (this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value;
  }
  private setSetting(key: string, value: string) {
    this.db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  getActiveTheme(): Theme {
    const name = this.getSetting("active_theme") ?? "neon";
    return this.getTheme(name) ?? this.listThemes()[0];
  }
  setActiveTheme(name: string): Theme | undefined {
    const theme = this.getTheme(name);
    if (theme) this.setSetting("active_theme", theme.name);
    return theme;
  }
  getVolume() {
    const volume = Number(this.getSetting("volume") ?? "50");
    return Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 50;
  }
  setVolume(volume: number) {
    this.setSetting("volume", String(Math.round(Math.max(0, Math.min(100, volume)))));
  }
  getTheme(name: string): Theme | undefined {
    return this.db.prepare("SELECT name, description, accent, highlight, played, track, status FROM themes WHERE lower(name) = lower(?)").get(name) as Theme | undefined;
  }
  listThemes(): Theme[] {
    return this.db.prepare("SELECT name, description, accent, highlight, played, track, status FROM themes ORDER BY name").all() as Theme[];
  }
  removeTheme(name: string): "removed" | "active" | "missing" {
    const theme = this.getTheme(name);
    if (!theme) return "missing";
    if (theme.name === this.getActiveTheme().name) return "active";
    this.db.prepare("DELETE FROM themes WHERE name = ?").run(theme.name);
    return "removed";
  }

  saveMusic(url: string, title?: string) {
    this.db.prepare("INSERT INTO music (url, title) VALUES (?, ?) ON CONFLICT(url) DO UPDATE SET title = COALESCE(excluded.title, music.title)").run(url, title ?? null);
    return this.db.prepare("SELECT id, url, title, progress_seconds AS progressSeconds, added_at AS addedAt FROM music WHERE url = ?").get(url) as SavedMusic;
  }
  listMusic(): SavedMusic[] {
    return this.db.prepare("SELECT id, url, title, progress_seconds AS progressSeconds, added_at AS addedAt FROM music ORDER BY id DESC").all() as SavedMusic[];
  }
  getMusic(id: number): SavedMusic | undefined {
    return this.db.prepare("SELECT id, url, title, progress_seconds AS progressSeconds, added_at AS addedAt FROM music WHERE id = ?").get(id) as SavedMusic | undefined;
  }
  removeMusic(id: number) { return this.db.prepare("DELETE FROM music WHERE id = ?").run(id).changes > 0; }
  getMusicAtPosition(position: number): SavedMusic | undefined {
    return this.listMusic()[position - 1];
  }
  removeMusicAtPosition(position: number) {
    const track = this.getMusicAtPosition(position);
    return track ? this.removeMusic(track.id) : false;
  }
  setMusicProgress(id: number, seconds: number) {
    this.db.prepare("UPDATE music SET progress_seconds = ? WHERE id = ?").run(Math.max(0, seconds), id);
  }
  resetMusicProgressAtPosition(position: number) {
    const track = this.getMusicAtPosition(position);
    if (!track) return false;
    this.setMusicProgress(track.id, 0);
    return true;
  }
}

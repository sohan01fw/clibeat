import type { PlayerState } from "./player.js";
import type { Theme } from "./themes.js";

const color = (code: number, value: string) => `\x1b[38;5;${code}m${value}\x1b[0m`;

function format(seconds: number) {
  if (!Number.isFinite(seconds)) return "--:--";
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}` : `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function draw(state: PlayerState, theme: Theme) {
  const width = Math.max(18, Math.min(52, (process.stdout.columns || 80) - 28));
  const progress = state.duration ? Math.max(0, Math.min(1, state.time / state.duration)) : 0;
  const position = Math.round(progress * (width - 1));
  const waves = Array.from({ length: 36 }, (_, index) => "▁▂▃▄▅▆"[Math.round(1 + Math.abs(Math.sin(Date.now() / 180 + index * 0.63)) * (state.paused ? 1 : 5)) - 1]).join("");
  const title = state.title.length > 64 ? `${state.title.slice(0, 61)}...` : state.title;
  const bar = `${color(theme.played, "━".repeat(position))}${color(theme.highlight, "●")}${color(theme.track, "─".repeat(Math.max(0, width - position - 1)))}`;
  process.stdout.write(`\x1b[2J\x1b[H\n  ${color(theme.accent, "◢")}${color(theme.highlight, " BEATCLI ")}${color(theme.accent, "◣")}  \x1b[2m${theme.name}\x1b[0m\n\n  \x1b[1;97m${title}\x1b[0m\n\n  ${color(theme.highlight, waves)}\n\n  ${bar}  \x1b[97m${format(state.time)} / ${format(state.duration)}\x1b[0m\n\n  ${color(theme.status, state.paused ? "PAUSED" : "PLAYING")}   volume: ${color(theme.highlight, `${Math.round(state.volume)}%`)}\n\n  \x1b[2mspace play/pause   ←/→ seek   r restart   ↑/↓ volume   q quit\x1b[0m\n`);
}

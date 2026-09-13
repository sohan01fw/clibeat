import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, unlink } from "node:fs/promises";
import { createConnection, Socket } from "node:net";

export type PlayerState = { title: string; time: number; duration: number; paused: boolean; volume: number };

export class Player {
  readonly state: PlayerState;
  private readonly socketPath = `/tmp/beatcli-${process.pid}.sock`;
  private socket?: Socket;
  private buffer = "";
  private closed = false;
  constructor(
    private readonly url: string,
    private readonly onExit: () => void,
    private readonly onVolumeChange: (volume: number) => void,
    private readonly onProgressChange: (seconds: number) => void,
    initialVolume: number,
    private readonly initialPosition: number,
  ) {
    this.state = { title: "Loading audio…", time: 0, duration: 0, paused: false, volume: initialVolume };
  }
  start() {
    const mpv = spawn("mpv", ["--no-video", "--force-window=no", "--really-quiet", "--ytdl-format=bestaudio/best", `--input-ipc-server=${this.socketPath}`, `--volume=${this.state.volume}`, `--start=${this.initialPosition}`, this.url], { stdio: ["ignore", "ignore", "pipe"] });
    mpv.on("error", (error) => { console.error(`Could not start mpv: ${error.message}`); this.close(); });
    mpv.on("exit", () => this.close());
    void this.waitForSocket();
  }
  togglePause() { this.command(["cycle", "pause"]); }
  seek(seconds: number) { this.command(["seek", seconds, "relative"]); }
  restart() { this.command(["seek", 0, "absolute"]); }
  changeVolume(amount: number) { this.command(["add", "volume", amount]); }
  quit() { this.command(["quit"]); this.close(); }
  private command(command: unknown[]) { this.socket?.write(`${JSON.stringify({ command })}\n`); }
  private observe(id: number, property: string) { this.socket?.write(`${JSON.stringify({ command: ["observe_property", id, property] })}\n`); }
  private connect() {
    if (this.closed) return;
    this.socket = createConnection(this.socketPath);
    this.socket.on("connect", () => ["media-title", "time-pos", "duration", "pause", "volume"].forEach((property, index) => this.observe(index + 1, property)));
    this.socket.on("data", (data) => this.readEvents(data.toString()));
    this.socket.on("error", () => { if (!this.closed) setTimeout(() => this.connect(), 150); });
  }
  private readEvents(data: string) {
    this.buffer += data;
    const messages = this.buffer.split("\n");
    this.buffer = messages.pop() ?? "";
    for (const message of messages) this.update(message);
  }
  private update(message: string) {
    try {
      const event = JSON.parse(message) as { event?: string; id?: number; data?: unknown };
      if (event.event !== "property-change") return;
      if (event.id === 1 && typeof event.data === "string") this.state.title = event.data;
      if (event.id === 2 && typeof event.data === "number") { this.state.time = event.data; this.onProgressChange(event.data); }
      if (event.id === 3 && typeof event.data === "number") this.state.duration = event.data;
      if (event.id === 4 && typeof event.data === "boolean") this.state.paused = event.data;
      if (event.id === 5 && typeof event.data === "number") { this.state.volume = event.data; this.onVolumeChange(event.data); }
    } catch { /* Ignore incomplete IPC data. */ }
  }
  private async waitForSocket() {
    for (let attempt = 0; attempt < 80 && !this.closed; attempt++) {
      try { await access(this.socketPath, constants.F_OK); this.connect(); return; }
      catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
    }
    if (!this.closed) { console.error("mpv did not open its control socket. Is mpv installed?"); this.close(); }
  }
  private close() {
    if (this.closed) return;
    this.closed = true;
    this.socket?.destroy();
    unlink(this.socketPath).catch(() => undefined).finally(this.onExit);
  }
}

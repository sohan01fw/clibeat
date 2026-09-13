import { spawnSync } from "node:child_process";

export function checkRequirements(): string[] {
  const required = ["mpv", "yt-dlp"];
  return required.filter((command) => {
    const error = spawnSync(command, ["--version"], { stdio: "ignore" }).error as NodeJS.ErrnoException | undefined;
    return error?.code === "ENOENT";
  });
}

export function printRequirementsError(missing: string[]) {
  console.error(`Missing required program${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
  console.error("Install them, then run BeatCLI again. On Ubuntu/Debian: sudo apt install mpv yt-dlp");
}

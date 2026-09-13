# BeatCLI

Play a YouTube or YouTube Music link in a colorful terminal player. BeatCLI saves your music, theme, volume, and playback position locally.

## Requirements

- Node.js 22.5 or newer
- `mpv`
- `yt-dlp`

## Development

```bash
npm install
npm run dev -- "https://www.youtube.com/watch?v=VIDEO_ID"
```

## Commands

```bash
beatcli "YOUTUBE_URL"
beatcli theme list
beatcli theme set ocean
beatcli theme remove amber
beatcli music add "YOUTUBE_URL"
beatcli music list
beatcli music play 1
beatcli music reset 1
beatcli music remove 1
```

Music positions are displayed from `1` and automatically reorder after additions or removals. During playback, use `space` to pause, arrow keys to seek/change volume, `r` to restart, and `q` to quit.

## Local data

BeatCLI stores its SQLite database at `~/.local/share/beatcli/beatcli.db`. It contains saved music, playback positions, selected theme, and volume.

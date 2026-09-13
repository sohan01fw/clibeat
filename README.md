# CliBeat

Play a YouTube or YouTube Music link in a colorful terminal player. CliBeat saves your music, theme, volume, and playback position locally.

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
clibeat "YOUTUBE_URL"
clibeat theme list
clibeat theme set ocean
clibeat theme remove amber
clibeat add "YOUTUBE_URL"
clibeat list
clibeat play 1
clibeat reset 1
clibeat remove 1
```

Music positions are displayed from `1` and automatically reorder after additions or removals. During playback, use `space` to pause, arrow keys to seek/change volume, `r` to restart, and `q` to quit.

## Local data

CliBeat stores its SQLite database at `~/.local/share/clibeat/clibeat.db`. It contains saved music, playback positions, selected theme, and volume.

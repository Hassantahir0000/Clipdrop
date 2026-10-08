# Social Video Downloader

Next.js app for downloading public videos from YouTube, Instagram, Twitter / X and Facebook at the best available quality.

## Requirements

- Node.js 20+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (`brew install yt-dlp`). Keep it updated (`brew upgrade yt-dlp`), since platforms change often.
- [ffmpeg](https://ffmpeg.org/) (`brew install ffmpeg`), used to merge the best video and audio streams.

## Run

```bash
npm install
npm run dev   # http://localhost:3000
```

Optional env vars (put them in `.env.local`, see `.env.example`):

- `NEXT_PUBLIC_GA_ID`: Google Analytics 4 measurement ID (`G-XXXXXXXXXX`). Analytics is off when it's empty.
- `YTDLP_PATH` (default `yt-dlp`) and `MAX_CONCURRENT_DOWNLOADS` (default `3`).

## Analytics events

GA4 automatically records page views, sessions, country/city, device, browser, OS, language, referrer/UTM source and engagement time. The app also sends these custom events:

| Event | Params |
| --- | --- |
| `select_platform`, `platform_auto_switch`, `paste_click` | `platform` |
| `video_lookup` / `video_lookup_success` / `video_lookup_error` | `platform`, `video_count`, `max_quality`, `duration_sec`, `error_message` |
| `select_quality` | `platform`, `quality` |
| `download_start` / `download_complete` / `download_error` / `download_cancel` | `platform`, `quality`, `file_size_mb`, `wait_sec`, `error_message` |

To use the params in GA reports, register them as custom dimensions/metrics (Admin → Custom definitions).

## How it works

| Route | Purpose |
| --- | --- |
| `POST /api/info` | Runs `yt-dlp -J` and returns the title, thumbnail, resolution and size of the best format |
| `GET /api/download` | Server-Sent Events stream. Downloads to a temp dir at the chosen `quality` (`best`, a resolution like `1080`, or `audio` for MP3) and reports progress |
| `GET /api/file/[id]` | Streams the finished file to the browser once, then deletes it |

Format selection is `bv*+ba/b` sorted by resolution, then fps. YouTube then prefers H.264/AAC (`.mp4`). Other platforms prefer the highest bitrate, then H.264/AAC. YouTube 1440p/4K is only available as VP9/AV1, so those downloads come out as `.mkv`.

Because this shells out to yt-dlp and writes temp files, deploy it to a Node server or container (not serverless/edge).

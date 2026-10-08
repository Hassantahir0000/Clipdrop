import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { detectPlatform, getPlatform, type Platform, type PlatformId } from "./platforms";

const YTDLP = process.env.YTDLP_PATH || "yt-dlp";
/**
 * Optional proxy (e.g. http://user:pass@host:port). Platforms, especially YouTube, often answer
 * datacenter IPs with "Sign in to confirm you're not a bot"; a residential proxy gets around that.
 */
const PROXY_ARGS = process.env.YTDLP_PROXY ? ["--proxy", process.env.YTDLP_PROXY] : [];
const MAX_CONCURRENT_DOWNLOADS = Number(process.env.MAX_CONCURRENT_DOWNLOADS || 3);
const FILE_TTL_MS = 15 * 60 * 1000;

/** Best video + best audio merged; fall back to the best single file. */
const FORMAT = "bv*+ba/b";
/**
 * Highest resolution/fps always wins. Among equal resolutions prefer H.264 + AAC so the
 * result is a widely playable .mp4 (4K/1440p on YouTube is VP9/AV1 only and ends up as .mkv).
 * Other platforms rank by bitrate next: Twitter's progressive MP4s don't report a codec but
 * carry several times the bitrate of its HLS streams.
 */
function sortFor(platform: PlatformId, quality: Quality = "best") {
  const order = platform === "youtube" ? "fps,vcodec:h264,acodec:m4a" : "fps,tbr,vcodec:h264,acodec:m4a";
  // `res:N` = largest resolution not above N (or the smallest one if all are above).
  return `${typeof quality === "number" ? `res:${quality}` : "res"},${order}`;
}

export class UserFacingError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Validates the URL against the selected tab. Throws a UserFacingError when it doesn't fit. */
export function validateRequest(rawUrl: unknown, platformId: unknown): { url: string; platform: Platform } {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new UserFacingError("Please paste a link to a post.");
  }
  const platform = getPlatform(typeof platformId === "string" ? platformId : null);
  if (!platform) throw new UserFacingError("Unknown platform.");

  const detected = detectPlatform(rawUrl);
  if (!detected) throw new UserFacingError("That doesn't look like a supported link.");
  if (detected.id !== platform.id) {
    throw new UserFacingError(`That's a ${detected.label} link. Switch to the ${detected.label} tab.`);
  }
  return { url: rawUrl.trim(), platform };
}

/** Turns yt-dlp's stderr into a message we can show to the user. */
export function explainError(stderr: string): string {
  const s = stderr.toLowerCase();
  if (s.includes("not a bot")) {
    return "YouTube is asking this server to prove it isn't a bot. Try again later or from a different network.";
  }
  if (
    s.includes("private") ||
    s.includes("login required") ||
    s.includes("log in") ||
    s.includes("sign in") ||
    s.includes("cookies") ||
    s.includes("authentication")
  ) {
    return "This post is private or requires a login, so it can't be downloaded.";
  }
  if (s.includes("unsupported url")) return "That link isn't a supported post URL.";
  if (s.includes("no video") || s.includes("no media") || s.includes("there's no video")) {
    return "No video was found in this post.";
  }
  if (s.includes("unavailable") || s.includes("not available") || s.includes("404") || s.includes("removed")) {
    return "This post is unavailable. It may have been deleted or restricted in your region.";
  }
  if (s.includes("rate") && s.includes("limit")) {
    return "The platform is rate-limiting requests. Try again in a few minutes.";
  }
  if (s.includes("enoent")) return "yt-dlp is not installed on the server.";
  if (s.includes("cannot parse data") || s.includes("unable to extract")) {
    return "Couldn't read this post. It may be private or deleted, or the platform changed its page. Try updating yt-dlp.";
  }

  const lastError = stderr
    .split("\n")
    .filter((l) => l.startsWith("ERROR:"))
    .pop();
  return lastError ? lastError.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, "") : "Something went wrong fetching this post.";
}

function run(args: string[], signal?: AbortSignal): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(/*turbopackIgnore: true*/ YTDLP, [...PROXY_ARGS, ...args], { signal });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => reject(new UserFacingError(explainError(String(err)), 500)));
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
  });
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/** "best" = highest available, a number = max short-side resolution (e.g. 1080), "audio" = MP3 only. */
export type Quality = "best" | "audio" | number;

export function parseQuality(raw: string | null): Quality {
  if (raw === "audio") return "audio";
  if (raw && /^\d{3,4}$/.test(raw)) return Number(raw);
  return "best";
}

export type QualityOption = {
  /** Short side in pixels (1080 for both 1920×1080 and 1080×1920). */
  short: number;
  fps?: number;
  vcodec?: string;
  filesize?: number;
};

export type MediaItem = {
  index: number;
  title: string;
  thumbnail?: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  vcodec?: string;
  ext?: string;
  filesize?: number;
  hasVideo: boolean;
  /** Available video resolutions, highest first. Empty when the platform doesn't report them. */
  qualities: QualityOption[];
  hasAudio: boolean;
};

export type MediaInfo = {
  title: string;
  uploader?: string;
  webpageUrl?: string;
  items: MediaItem[];
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function toItem(entry: any, index: number): MediaItem {
  const parts: any[] = entry.requested_formats ?? [entry];
  // vcodec is "none" for audio/images, but may be missing entirely for progressive files.
  const video = parts.find((f) => f.vcodec !== "none");
  const sizes = parts.map((f) => f.filesize ?? f.filesize_approx);
  const filesize = sizes.every((n) => typeof n === "number") ? sizes.reduce((a, b) => a + b, 0) : undefined;

  const qualities = listQualities(entry.formats ?? []);
  // Some platforms (e.g. Twitter) don't report codecs, so only an explicit "none" means silent.
  const hasAudio = [...parts, ...(entry.formats ?? [])].some((f: any) => f.acodec !== "none");

  return {
    index,
    title: entry.title || entry.description?.slice(0, 80) || `Video ${index}`,
    thumbnail: entry.thumbnail ?? entry.thumbnails?.at(-1)?.url,
    duration: entry.duration ?? undefined,
    width: video?.width ?? entry.width ?? undefined,
    height: video?.height ?? entry.height ?? undefined,
    fps: video?.fps ?? entry.fps ?? undefined,
    vcodec: codecName(video?.vcodec),
    ext: entry.ext,
    filesize,
    hasVideo: Boolean(video),
    qualities,
    hasAudio,
  };
}

/**
 * One option per resolution. yt-dlp lists formats worst → best according to the -S sort, so the
 * last format seen for a resolution is the one a download at that resolution will pick.
 */
function listQualities(formats: any[]): QualityOption[] {
  const bestAudio = formats.findLast((f) => f.vcodec === "none" && f.acodec && f.acodec !== "none");
  const audioSize: number | undefined = bestAudio ? (bestAudio.filesize ?? bestAudio.filesize_approx) : undefined;

  const byShort = new Map<number, QualityOption>();
  for (const f of formats) {
    if (f.vcodec === "none" || !f.width || !f.height) continue;
    const short = Math.min(f.width, f.height);
    const videoSize: number | undefined = f.filesize ?? f.filesize_approx;
    const muxed = f.acodec && f.acodec !== "none";
    const filesize = videoSize === undefined ? undefined : muxed ? videoSize : audioSize === undefined ? undefined : videoSize + audioSize;
    byShort.set(short, { short, fps: f.fps ?? undefined, vcodec: codecName(f.vcodec), filesize });
  }
  return [...byShort.values()].sort((a, b) => b.short - a.short);
}

function codecName(vcodec: unknown): string | undefined {
  if (typeof vcodec !== "string" || vcodec === "none") return undefined;
  const base = vcodec.split(".")[0].toLowerCase();
  const names: Record<string, string> = {
    avc1: "H.264", h264: "H.264", av01: "AV1", vp09: "VP9", vp9: "VP9", hev1: "HEVC", hvc1: "HEVC", h265: "HEVC",
  };
  return names[base] ?? base.toUpperCase();
}

export async function getInfo(url: string, platform: PlatformId, signal?: AbortSignal): Promise<MediaInfo> {
  const { stdout, stderr, code } = await run(
    ["-J", "--no-warnings", "--no-playlist", "-f", FORMAT, "-S", sortFor(platform), "--", url],
    signal,
  );
  if (code !== 0) throw new UserFacingError(explainError(stderr), 422);

  let data: any;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new UserFacingError("Couldn't read the post's details.", 502);
  }

  // Posts with several videos (tweets, carousels) come back as a playlist.
  const entries: any[] = data._type === "playlist" ? (data.entries ?? []).filter(Boolean) : [data];
  const items = entries.map((e, i) => toItem(e, i + 1)).filter((i) => i.hasVideo);
  if (items.length === 0) throw new UserFacingError("No video was found in this post.", 422);

  return {
    title: data.title || items[0].title,
    uploader: data.uploader ?? data.channel ?? entries[0]?.uploader,
    webpageUrl: data.webpage_url,
    items,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

export type ProgressEvent =
  | { type: "progress"; stage: "downloading"; part: number; percent: number; speed?: number; eta?: number }
  | { type: "progress"; stage: "merging" | "converting" | "finalizing" }
  | { type: "done"; fileId: string; filename: string; size: number }
  | { type: "error"; message: string };

type StoredFile = { dir: string; file: string; filename: string; size: number; expires: number };

// Survive dev hot-reloads by hanging state off globalThis.
const store = globalThis as unknown as {
  __sdFiles?: Map<string, StoredFile>;
  __sdActive?: Set<ChildProcess>;
};
const files = (store.__sdFiles ??= new Map());
const active = (store.__sdActive ??= new Set());

function sweepExpired() {
  const now = Date.now();
  for (const [id, f] of files) {
    if (f.expires < now) {
      files.delete(id);
      void rm(f.dir, { recursive: true, force: true });
    }
  }
}

export function takeFile(id: string): StoredFile | undefined {
  sweepExpired();
  const f = files.get(id);
  if (f) files.delete(id);
  return f;
}

const PROGRESS_PREFIX = "SDPROG ";
const PROGRESS_TEMPLATE =
  "download:" +
  PROGRESS_PREFIX +
  "%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s";

/**
 * Downloads `url` at the requested quality into a temp dir, reporting progress via `emit`.
 * On success the file is registered and can be fetched once with `takeFile(fileId)`.
 */
export async function download(
  url: string,
  platform: PlatformId,
  item: number | undefined,
  quality: Quality,
  emit: (e: ProgressEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  sweepExpired();
  if (active.size >= MAX_CONCURRENT_DOWNLOADS) {
    emit({ type: "error", message: "The server is busy with other downloads. Try again in a moment." });
    return;
  }

  const dir = await mkdtemp(path.join(tmpdir(), "social-dl-"));
  const formatArgs =
    quality === "audio"
      ? ["-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "0"]
      : [
          "-f", FORMAT,
          "-S", sortFor(platform, quality),
          "--merge-output-format", "mp4/mkv",
        ];
  const args = [
    ...formatArgs,
    item ? "--playlist-items" : "--no-playlist",
    ...(item ? [String(item)] : []),
    "--no-warnings",
    "--no-mtime",
    "--newline",
    "--progress-template", PROGRESS_TEMPLATE,
    "-o", path.join(dir, "%(title).80B [%(id)s].%(ext)s"),
    "--", url,
  ];

  const child = spawn(/*turbopackIgnore: true*/ YTDLP, [...PROXY_ARGS, ...args]);
  active.add(child);
  const onAbort = () => child.kill("SIGTERM");
  signal.addEventListener("abort", onAbort);

  let part = 0;
  let stderr = "";
  let buffer = "";

  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith(PROGRESS_PREFIX)) {
        const [done, total, estimate, speed, eta] = line.slice(PROGRESS_PREFIX.length).split("|").map(Number);
        const size = total || estimate;
        emit({
          type: "progress",
          stage: "downloading",
          part: Math.max(part, 1),
          percent: size ? Math.min(100, (done / size) * 100) : 0,
          speed: Number.isFinite(speed) ? speed : undefined,
          eta: Number.isFinite(eta) ? eta : undefined,
        });
      } else if (line.startsWith("[download] Destination:")) {
        part++;
      } else if (line.startsWith("[ExtractAudio]")) {
        emit({ type: "progress", stage: "converting" });
      } else if (line.startsWith("[Merger]")) {
        emit({ type: "progress", stage: "merging" });
      } else if (line.startsWith("[FixupM3u8]") || line.startsWith("[Fixup")) {
        emit({ type: "progress", stage: "finalizing" });
      }
    }
  });
  child.stderr.on("data", (d) => (stderr += d));

  const code = await new Promise<number>((resolve) => {
    child.on("error", (err) => {
      stderr += String(err);
      resolve(1);
    });
    child.on("close", (c) => resolve(c ?? 1));
  });
  active.delete(child);
  signal.removeEventListener("abort", onAbort);

  const cleanup = () => rm(dir, { recursive: true, force: true });

  if (signal.aborted) {
    await cleanup();
    return;
  }
  if (code !== 0) {
    await cleanup();
    emit({ type: "error", message: explainError(stderr) });
    return;
  }

  // Pick the finished output (the largest non-partial file).
  const names = (await readdir(dir)).filter((n) => !n.endsWith(".part") && !n.endsWith(".ytdl"));
  const candidates = await Promise.all(
    names.map(async (n) => ({ name: n, size: (await stat(path.join(dir, n))).size })),
  );
  const output = candidates.sort((a, b) => b.size - a.size)[0];
  if (!output) {
    await cleanup();
    emit({ type: "error", message: "The download finished but no file was produced." });
    return;
  }

  const fileId = randomUUID();
  files.set(fileId, {
    dir,
    file: path.join(dir, output.name),
    filename: output.name,
    size: output.size,
    expires: Date.now() + FILE_TTL_MS,
  });
  emit({ type: "done", fileId, filename: output.name, size: output.size });
}

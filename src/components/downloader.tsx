"use client";

import { useEffect, useRef, useState } from "react";

import { PlatformIcon } from "@/components/platform-icon";
import { track } from "@/lib/analytics";
import { detectPlatform, PLATFORMS, type PlatformId } from "@/lib/platforms";
import type { MediaInfo, MediaItem, ProgressEvent, Quality } from "@/lib/ytdlp";

type Status =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "ready"; info: MediaInfo }
  | { kind: "downloading"; info: MediaInfo; progress?: ProgressEvent }
  | { kind: "done"; info: MediaInfo; filename: string; size: number }
  | { kind: "error"; message: string; info?: MediaInfo };

export function Downloader() {
  const [tab, setTab] = useState<PlatformId>("youtube");
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [selected, setSelected] = useState(1);
  const [quality, setQuality] = useState<Quality>("best");
  const abortRef = useRef<AbortController | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const platform = PLATFORMS.find((p) => p.id === tab)!;
  const busy = status.kind === "fetching" || status.kind === "downloading";

  useEffect(() => () => stopAll(), []);

  function stopAll() {
    abortRef.current?.abort();
    sourceRef.current?.close();
    abortRef.current = null;
    sourceRef.current = null;
  }

  function reset() {
    stopAll();
    setStatus({ kind: "idle" });
    setNotice(null);
    setSelected(1);
    setQuality("best");
  }

  function switchTab(id: PlatformId) {
    if (busy || id === tab) return;
    track("select_platform", { platform: id });
    setTab(id);
    setUrl("");
    reset();
  }

  function onUrlChange(value: string) {
    setUrl(value);
    if (status.kind !== "idle") reset();
    const detected = detectPlatform(value);
    if (detected && detected.id !== tab) {
      track("platform_auto_switch", { from: tab, platform: detected.id });
      setTab(detected.id);
      setNotice(`Looks like a ${detected.label} link, so we switched tabs for you.`);
    } else {
      setNotice(null);
    }
  }

  async function pasteFromClipboard() {
    track("paste_click", { platform: tab });
    try {
      onUrlChange(await navigator.clipboard.readText());
    } catch {
      setNotice("Clipboard access was blocked. Paste the link with Ctrl/⌘ + V.");
    }
  }

  async function fetchInfo(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim() || busy) return;
    stopAll();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: "fetching" });
    setSelected(1);
    track("video_lookup", { platform: tab });
    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, platform: tab }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't fetch this post.");
      const info = data as MediaInfo;
      setStatus({ kind: "ready", info });
      selectItem(info.items[0]);
      track("video_lookup_success", {
        platform: tab,
        video_count: info.items.length,
        max_quality: info.items[0].qualities[0]?.short,
        duration_sec: info.items[0].duration,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Couldn't fetch this post.";
      setStatus({ kind: "error", message });
      track("video_lookup_error", { platform: tab, error_message: message });
    }
  }

  function selectItem(item: MediaItem) {
    setSelected(item.index);
    setQuality(item.qualities[0]?.short ?? "best");
  }

  function startDownload(info: MediaInfo) {
    stopAll();
    const params = new URLSearchParams({ url, platform: tab });
    if (info.items.length > 1) params.set("item", String(selected));
    params.set("quality", String(quality));
    const source = new EventSource(`/api/download?${params}`);
    sourceRef.current = source;
    setStatus({ kind: "downloading", info });
    const startedAt = Date.now();
    const eventParams = { platform: tab, quality: String(quality) };
    track("download_start", eventParams);

    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as ProgressEvent;
      if (event.type === "progress") {
        setStatus({ kind: "downloading", info, progress: event });
      } else if (event.type === "done") {
        source.close();
        setStatus({ kind: "done", info, filename: event.filename, size: event.size });
        track("download_complete", {
          ...eventParams,
          file_size_mb: Math.round(event.size / 1024 / 1024),
          wait_sec: Math.round((Date.now() - startedAt) / 1000),
        });
        const a = document.createElement("a");
        a.href = `/api/file/${event.fileId}`;
        a.download = event.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        source.close();
        setStatus({ kind: "error", message: event.message, info });
        track("download_error", { ...eventParams, error_message: event.message });
      }
    };
    source.onerror = () => {
      // Only fires for unexpected drops: we close the source ourselves on done/error/cancel.
      source.close();
      track("download_error", { ...eventParams, error_message: "connection_lost" });
      setStatus({ kind: "error", message: "Lost connection to the server.", info });
    };
  }

  function cancelDownload() {
    track("download_cancel", { platform: tab, quality: String(quality) });
    stopAll();
    setStatus((s) => (s.kind === "downloading" ? { kind: "ready", info: s.info } : s));
  }

  const info = "info" in status ? status.info : undefined;

  return (
    <div className="w-full max-w-2xl" style={{ "--accent": platform.accent } as React.CSSProperties}>
      {/* Tabs */}
      <div role="tablist" aria-label="Platform" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PLATFORMS.map((p) => {
          const active = p.id === tab;
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={active}
              disabled={busy && !active}
              onClick={() => switchTab(p.id)}
              style={active ? { backgroundColor: p.accent, borderColor: p.accent } : undefined}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition
                ${active ? "text-white shadow-lg" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"}
                disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <PlatformIcon id={p.id} className="size-4" />
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Card */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-900/70 p-5 shadow-2xl backdrop-blur sm:p-6">
        <form onSubmit={fetchInfo} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder={platform.placeholder}
              disabled={busy}
              aria-label={`${platform.label} post link`}
              className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-4 pr-20 text-sm text-white placeholder:text-zinc-500 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={url ? () => onUrlChange("") : pasteFromClipboard}
              disabled={busy}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              {url ? "Clear" : "Paste"}
            </button>
          </div>
          <button
            type="submit"
            disabled={!url.trim() || busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status.kind === "fetching" ? <Spinner /> : null}
            {status.kind === "fetching" ? "Looking up…" : "Get video"}
          </button>
        </form>

        {notice && <p className="mt-3 text-xs text-zinc-400">{notice}</p>}

        {status.kind === "fetching" && <SkeletonPreview />}

        {info && (
          <Preview
            info={info}
            selected={selected}
            onSelect={selectItem}
            quality={quality}
            onQualityChange={(q) => {
              setQuality(q);
              track("select_quality", { platform: tab, quality: String(q) });
            }}
            disabled={status.kind === "downloading"}
          />
        )}

        {status.kind === "error" && (
          <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            <span aria-hidden className="mt-0.5">⚠️</span>
            <p>{status.message}</p>
          </div>
        )}

        {info && status.kind !== "downloading" && (
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => startDownload(info)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
            >
              <DownloadIcon />
              {status.kind === "done" ? "Download again" : downloadLabel(quality, info, selected)}
            </button>
            <button
              onClick={() => {
                setUrl("");
                reset();
              }}
              className="rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-zinc-300 hover:bg-white/5"
            >
              New link
            </button>
          </div>
        )}

        {status.kind === "downloading" && (
          <ProgressPanel progress={status.progress} quality={quality} onCancel={cancelDownload} />
        )}

        {status.kind === "done" && (
          <p className="mt-4 text-center text-sm text-emerald-300">
            ✓ Saved <span className="font-medium">{status.filename}</span> ({formatBytes(status.size)}). Check your
            downloads folder.
          </p>
        )}
      </div>
    </div>
  );
}

function Preview({
  info,
  selected,
  onSelect,
  quality,
  onQualityChange,
  disabled,
}: {
  info: MediaInfo;
  selected: number;
  onSelect: (item: MediaItem) => void;
  quality: Quality;
  onQualityChange: (q: Quality) => void;
  disabled: boolean;
}) {
  const item = info.items.find((i) => i.index === selected) ?? info.items[0];
  return (
    <div className="mt-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <Thumb item={item} className="aspect-video w-full sm:w-56" />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 font-semibold text-white">{item.title || info.title}</h2>
          {info.uploader && <p className="mt-1 truncate text-sm text-zinc-400">{info.uploader}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {item.height && <Badge accent>{qualityLabel(item)}</Badge>}
            {item.width && item.height && (
              <Badge>
                {item.width}×{item.height}
              </Badge>
            )}
            {item.fps && <Badge>{Math.round(item.fps)} fps</Badge>}
            {item.vcodec && <Badge>{item.vcodec}</Badge>}
            {item.filesize && <Badge>≈ {formatBytes(item.filesize)}</Badge>}
          </div>
        </div>
      </div>

      {info.items.length > 1 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            This post has {info.items.length} videos. Pick one
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {info.items.map((it) => (
              <button
                key={it.index}
                disabled={disabled}
                onClick={() => onSelect(it)}
                aria-pressed={it.index === selected}
                className={`overflow-hidden rounded-lg border-2 transition disabled:opacity-50 ${
                  it.index === selected ? "border-[var(--accent)]" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                <Thumb item={it} className="aspect-video w-full" />
              </button>
            ))}
          </div>
        </div>
      )}

      <QualityPicker item={item} value={quality} onChange={onQualityChange} disabled={disabled} />
    </div>
  );
}

function QualityPicker({
  item,
  value,
  onChange,
  disabled,
}: {
  item: MediaItem;
  value: Quality;
  onChange: (q: Quality) => void;
  disabled: boolean;
}) {
  const options: { value: Quality; label: string; hint?: string }[] = item.qualities.length
    ? item.qualities.map((q, i) => ({
        value: q.short,
        label: shortLabel(q.short),
        hint:
          [i === 0 ? "Best" : "", q.fps && q.fps > 30 ? `${Math.round(q.fps)} fps` : "", q.filesize ? `≈ ${formatBytes(q.filesize)}` : ""]
            .filter(Boolean)
            .join(" · ") || undefined,
      }))
    : [{ value: "best", label: "Best", hint: "Highest available" }];
  if (item.hasAudio) options.push({ value: "audio", label: "Audio only", hint: "MP3" });

  return (
    <fieldset className="mt-5" disabled={disabled}>
      <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Quality</legend>
      <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              className={`rounded-xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent)]/15 text-white"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/25 hover:text-white"
              }`}
            >
              <span className="block text-sm font-semibold">{o.label}</span>
              {o.hint && <span className="block truncate text-[11px] text-zinc-400">{o.hint}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Thumb({ item, className }: { item: MediaItem; className: string }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-zinc-800 ${className}`}>
      {item.thumbnail && (
        // Remote CDNs (IG/FB) reject hotlinks with a referrer, so use a plain <img>.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnail}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      )}
      {item.duration ? (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
          {formatDuration(item.duration)}
        </span>
      ) : null}
    </div>
  );
}

function ProgressPanel({
  progress,
  quality,
  onCancel,
}: {
  progress?: ProgressEvent;
  quality: Quality;
  onCancel: () => void;
}) {
  let label = "Starting…";
  let percent: number | null = null;
  let detail = "";

  if (progress?.type === "progress") {
    if (progress.stage === "downloading") {
      label = quality === "audio" || progress.part > 1 ? "Downloading audio" : "Downloading video";
      percent = progress.percent;
      detail = [progress.speed ? `${formatBytes(progress.speed)}/s` : "", progress.eta ? `${formatDuration(progress.eta)} left` : ""]
        .filter(Boolean)
        .join(" · ");
    } else if (progress.stage === "merging") {
      label = "Merging video and audio";
    } else if (progress.stage === "converting") {
      label = "Converting to MP3";
    } else {
      label = "Finishing up";
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium text-white">
          <Spinner />
          {label}
          {typeof quality === "number" ? <span className="text-zinc-500">({shortLabel(quality)})</span> : null}
        </span>
        <span className="tabular-nums text-zinc-400">{percent !== null ? `${percent.toFixed(0)}%` : ""}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full bg-[var(--accent)] transition-[width] duration-300 ${percent === null ? "w-1/3 animate-pulse" : ""}`}
          style={percent !== null ? { width: `${percent}%` } : undefined}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>{detail}</span>
        <button onClick={onCancel} className="rounded-md px-2 py-1 text-zinc-400 hover:bg-white/10 hover:text-white">
          Cancel
        </button>
      </div>
    </div>
  );
}

function SkeletonPreview() {
  return (
    <div className="mt-5 flex animate-pulse flex-col gap-4 sm:flex-row">
      <div className="aspect-video w-full rounded-xl bg-white/5 sm:w-56" />
      <div className="flex-1 space-y-3 py-1">
        <div className="h-4 w-4/5 rounded bg-white/5" />
        <div className="h-3 w-1/3 rounded bg-white/5" />
        <div className="flex gap-2 pt-2">
          <div className="h-6 w-14 rounded-full bg-white/5" />
          <div className="h-6 w-20 rounded-full bg-white/5" />
        </div>
      </div>
    </div>
  );
}

function Badge({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        accent ? "bg-[var(--accent)] text-white" : "bg-white/10 text-zinc-300"
      }`}
    >
      {children}
    </span>
  );
}

function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function qualityLabel(item: MediaItem) {
  const short = Math.min(item.width ?? Infinity, item.height ?? Infinity);
  return Number.isFinite(short) ? shortLabel(short) : "Best";
}

function shortLabel(short: number) {
  if (short >= 4320) return "8K";
  if (short >= 2160) return "4K";
  if (short >= 1440) return "1440p";
  return `${short}p`;
}

function downloadLabel(quality: Quality, info: MediaInfo, selected: number) {
  if (quality === "audio") return "Download MP3";
  if (quality === "best") return "Download best quality";
  const item = info.items.find((i) => i.index === selected);
  const best = item?.qualities[0]?.short === quality;
  return `Download ${shortLabel(quality)}${best ? " (best)" : ""}`;
}

function formatBytes(n: number) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDuration(totalSeconds: number) {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

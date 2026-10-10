"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { PlatformIcon } from "@/components/platform-icon";
import { track } from "@/lib/analytics";
import { detectPlatform, PLATFORMS, type PlatformId } from "@/lib/platforms";
import type { MediaInfo, MediaItem, ProgressEvent, Quality } from "@/lib/ytdlp";

type Problem = { title: string; hint?: string };

type Status =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "ready"; info: MediaInfo }
  | { kind: "downloading"; info: MediaInfo; progress?: ProgressEvent }
  | { kind: "done"; info: MediaInfo; filename: string; size: number }
  | { kind: "error"; problem: Problem; info?: MediaInfo };

const VIDEO_STAGES = ["Downloading video", "Downloading audio", "Merging video and audio", "Finishing up"];
const AUDIO_STAGES = ["Downloading audio", "Converting to MP3"];

export function Downloader({ onPlatformChange }: { onPlatformChange?: (id: PlatformId) => void }) {
  const [tab, setTab] = useState<PlatformId>(PLATFORMS[0].id);
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [selected, setSelected] = useState(1);
  const [quality, setQuality] = useState<Quality>("best");
  const abortRef = useRef<AbortController | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Partial<Record<PlatformId, HTMLButtonElement | null>>>({});
  const [innerRef, height] = useAnimatedHeight();

  const platform = PLATFORMS.find((p) => p.id === tab)!;
  const busy = status.kind === "fetching" || status.kind === "downloading";
  const info = "info" in status ? status.info : undefined;
  const item = info?.items.find((i) => i.index === selected) ?? info?.items[0];
  const showResult = status.kind === "ready" || status.kind === "done" || (status.kind === "error" && !!status.info);
  const hasResult = showResult || status.kind === "downloading";

  useEffect(() => onPlatformChange?.(tab), [tab, onPlatformChange]);
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

  function selectTab(id: PlatformId) {
    if (busy || id === tab) return;
    track("select_platform", { platform: id });
    // Keep the pasted link if it already belongs to the new tab.
    const keep = detectPlatform(url)?.id === id;
    setTab(id);
    if (!keep) setUrl("");
    reset();
  }

  function onTabKey(e: React.KeyboardEvent) {
    const i = PLATFORMS.findIndex((p) => p.id === tab);
    const moves: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowDown: i + 1,
      ArrowLeft: i - 1,
      ArrowUp: i - 1,
      Home: 0,
      End: PLATFORMS.length - 1,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const next = PLATFORMS[(moves[e.key] + PLATFORMS.length) % PLATFORMS.length].id;
    selectTab(next);
    tabRefs.current[next]?.focus();
  }

  function onUrlChange(value: string) {
    setUrl(value);
    if (status.kind !== "idle") reset();
    const detected = detectPlatform(value);
    if (detected && detected.id !== tab) {
      track("platform_auto_switch", { from: tab, platform: detected.id });
      setTab(detected.id);
      setNotice(`Looks like a ${detected.label} link, so we switched tabs for you.`);
    } else if (!value) {
      setNotice(null);
    }
  }

  async function pasteOrClear() {
    if (url) {
      setUrl("");
      reset();
      inputRef.current?.focus();
      return;
    }
    track("paste_click", { platform: tab });
    try {
      onUrlChange((await navigator.clipboard.readText()).trim());
    } catch {
      setNotice("Clipboard access was blocked. Paste the link with Ctrl/⌘ + V.");
      inputRef.current?.focus();
    }
  }

  async function fetchInfo(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    const value = url.trim();
    if (!value) {
      setStatus({
        kind: "error",
        problem: { title: "Paste a link first.", hint: `Copy the share link of a public ${platform.label} post, then paste it above.` },
      });
      return;
    }
    if (!detectPlatform(value)) {
      setStatus({
        kind: "error",
        problem: { title: `That doesn't look like a ${platform.label} link.`, hint: "Check the address, or pick another platform above." },
      });
      return;
    }
    stopAll();
    const controller = new AbortController();
    abortRef.current = controller;
    setNotice(null);
    setStatus({ kind: "fetching" });
    track("video_lookup", { platform: tab });
    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value, platform: tab }),
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
      setStatus({ kind: "error", problem: explain(message) });
      track("video_lookup_error", { platform: tab, error_message: message });
    }
  }

  function selectItem(it: MediaItem) {
    setSelected(it.index);
    setQuality(it.qualities[0]?.short ?? "best");
  }

  function startDownload(info: MediaInfo) {
    stopAll();
    const params = new URLSearchParams({ url: url.trim(), platform: tab, quality: String(quality) });
    if (info.items.length > 1) params.set("item", String(selected));
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
        setStatus({ kind: "error", problem: explain(event.message), info });
        track("download_error", { ...eventParams, error_message: event.message });
      }
    };
    // Only fires for unexpected drops: we close the source ourselves on done/error/cancel.
    source.onerror = () => {
      source.close();
      track("download_error", { ...eventParams, error_message: "connection_lost" });
      setStatus({
        kind: "error",
        problem: { title: "Lost connection to the server.", hint: "Check your connection and try again." },
        info,
      });
    };
  }

  function cancelDownload() {
    track("download_cancel", { platform: tab, quality: String(quality) });
    stopAll();
    setStatus((s) => (s.kind === "downloading" ? { kind: "ready", info: s.info } : s));
  }

  function newLink() {
    setUrl("");
    reset();
    inputRef.current?.focus();
  }

  const panelId = "dl-panel";
  const tabPairs = PLATFORMS.length > 3 ? [PLATFORMS.slice(0, 2), PLATFORMS.slice(2)] : [PLATFORMS];

  return (
    <div className="dl">
      <div className="dl-clip" style={{ height }}>
        <div ref={innerRef} className="dl-inner">
          <div role="tablist" aria-label="Platform" className="dl-tabs">
            {tabPairs.map((pair, i) => (
              <div key={i} role="presentation" className="dl-tab-pair">
                {pair.map((p) => (
                  <button
                    key={p.id}
                    ref={(el) => {
                      tabRefs.current[p.id] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`dl-tab-${p.id}`}
                    aria-selected={p.id === tab}
                    aria-controls={panelId}
                    tabIndex={p.id === tab ? 0 : -1}
                    disabled={busy && p.id !== tab}
                    onClick={() => selectTab(p.id)}
                    onKeyDown={onTabKey}
                    className="dl-tab"
                    style={{ "--accent": p.accent } as React.CSSProperties}
                  >
                    <PlatformIcon id={p.id} className="size-[18px] flex-none" />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <form id={panelId} role="tabpanel" aria-labelledby={`dl-tab-${tab}`} onSubmit={fetchInfo} className="dl-row" noValidate>
            <div className="dl-field">
              <PlatformIcon id={tab} className="size-[18px] flex-none" />
              <input
                ref={inputRef}
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                aria-label={`${platform.label} post link`}
                value={url}
                placeholder={platform.placeholder}
                onChange={(e) => onUrlChange(e.target.value)}
                disabled={busy}
                className="dl-input"
              />
              <button type="button" onClick={pasteOrClear} disabled={busy} className="dl-chip-btn">
                {url ? "Clear" : "Paste"}
              </button>
            </div>
            <button
              type="submit"
              disabled={busy}
              aria-busy={status.kind === "fetching"}
              className={`dl-btn dl-btn-primary dl-get ${hasResult ? "is-quiet" : ""}`}
            >
              {status.kind === "fetching" && <span aria-hidden className="dl-spinner" />}
              <span>{status.kind === "fetching" ? "Looking up…" : "Get video"}</span>
            </button>
          </form>

          {notice && (
            <div role="status" className="dl-notice fade-in">
              <PlatformIcon id={tab} className="size-4 flex-none" />
              <span className="flex-1">{notice}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="dl-dismiss">
                ×
              </button>
            </div>
          )}

          {status.kind === "error" && (
            <div role="alert" className="dl-alert fade-in">
              <span aria-hidden className="dl-alert-icon">
                !
              </span>
              <div>
                <p className="dl-alert-title">{status.problem.title}</p>
                {status.problem.hint && <p className="dl-alert-hint">{status.problem.hint}</p>}
              </div>
            </div>
          )}

          {status.kind === "fetching" && <Skeleton />}

          {showResult && info && item && (
            <Result
              info={info}
              item={item}
              platform={tab}
              onSelect={(it) => {
                selectItem(it);
                track("select_video", { platform: tab, video_index: it.index });
              }}
              quality={quality}
              onQuality={(q) => {
                setQuality(q);
                track("select_quality", { platform: tab, quality: String(q) });
              }}
            />
          )}

          {status.kind === "downloading" && item && (
            <>
              <Summary item={item} platform={tab} quality={quality} />
              <Progress progress={status.progress} audio={quality === "audio"} onCancel={cancelDownload} />
            </>
          )}

          {status.kind === "done" && (
            <div role="status" className="dl-success fade-in">
              <span aria-hidden className="dl-success-icon">
                ✓
              </span>
              <div className="min-w-0">
                <p className="dl-success-title">
                  Saved <span className="mono font-medium">{status.filename}</span> ({formatBytes(status.size)}).
                </p>
                <p className="dl-success-hint">Check your downloads folder.</p>
              </div>
            </div>
          )}

          {showResult && info && (
            <div className="dl-actions">
              <button type="button" onClick={() => startDownload(info)} className="dl-btn dl-btn-primary">
                <span aria-hidden>↓</span>
                {status.kind === "done" ? "Download again" : downloadLabel(quality, item)}
              </button>
              <button type="button" onClick={newLink} className="dl-btn dl-btn-secondary">
                New link
              </button>
            </div>
          )}

          <p className="dl-footnote">
            <span>Public posts only</span>
            <span aria-hidden>·</span>
            <span>Files deleted right after download</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/** Animates the card's height between states by measuring its content. */
function useAnimatedHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, height] as const;
}

function Result({
  info,
  item,
  platform,
  onSelect,
  quality,
  onQuality,
}: {
  info: MediaInfo;
  item: MediaItem;
  platform: PlatformId;
  onSelect: (item: MediaItem) => void;
  quality: Quality;
  onQuality: (q: Quality) => void;
}) {
  const multi = info.items.length > 1;
  return (
    <div className="fade-in flex flex-col gap-4">
      {multi ? (
        <div className="flex flex-col gap-3">
          <div className="dl-label-row">
            <p id="dl-multi-label" className="dl-label">
              This post has {info.items.length} videos. Pick one
            </p>
            {info.uploader && <span className="dl-sublabel">{info.uploader}</span>}
          </div>
          <div role="radiogroup" aria-labelledby="dl-multi-label" className="dl-videos">
            {info.items.map((it, i) => {
              const on = it.index === item.index;
              return (
                <button
                  key={it.index}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`Video ${i + 1}${it.duration ? `, ${formatDuration(it.duration)}` : ""}`}
                  onClick={() => onSelect(it)}
                  className="dl-video"
                >
                  <Thumbnail src={it.thumbnail} />
                  <span className="dl-video-n">{i + 1}</span>
                  {it.duration ? <span className="dl-video-d">{formatDuration(it.duration)}</span> : null}
                  {on && (
                    <span aria-hidden className="dl-video-check">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <Badges item={item} />
        </div>
      ) : (
        <div className="dl-media">
          <div className="dl-thumb">
            <Thumbnail src={item.thumbnail} fallback={platform} />
            {item.duration ? <span className="dl-duration">{formatDuration(item.duration)}</span> : null}
          </div>
          <div className="dl-meta">
            <h3 className="dl-title">{item.title || info.title}</h3>
            {info.uploader && (
              <div className="dl-uploader">
                <PlatformIcon id={platform} className="size-3.5 flex-none" />
                <span>{info.uploader}</span>
              </div>
            )}
            <Badges item={item} />
          </div>
        </div>
      )}

      <QualityPicker item={item} value={quality} onChange={onQuality} />
    </div>
  );
}

function Badges({ item }: { item: MediaItem }) {
  return (
    <div className="dl-badges">
      {item.height ? <span className="dl-badge is-solid">{qualityLabel(item)}</span> : null}
      {item.width && item.height ? (
        <span className="dl-badge">
          {item.width}×{item.height}
        </span>
      ) : null}
      {item.fps ? <span className="dl-badge">{Math.round(item.fps)} fps</span> : null}
      {item.vcodec ? <span className="dl-badge">{item.vcodec}</span> : null}
      {item.filesize ? <span className="dl-badge">≈ {formatBytes(item.filesize)}</span> : null}
    </div>
  );
}

function QualityPicker({ item, value, onChange }: { item: MediaItem; value: Quality; onChange: (q: Quality) => void }) {
  const options: { value: Quality; label: string; best?: boolean; hint?: string }[] = item.qualities.length
    ? item.qualities.map((q, i) => ({
        value: q.short,
        label: shortLabel(q.short),
        best: i === 0,
        hint:
          [q.fps && q.fps > 30 ? `${Math.round(q.fps)} fps` : "", q.filesize ? `≈ ${formatBytes(q.filesize)}` : ""]
            .filter(Boolean)
            .join(" · ") || undefined,
      }))
    : [{ value: "best", label: "Best", hint: "Highest available" }];
  if (item.hasAudio) options.push({ value: "audio", label: "MP3", hint: "Audio only" });

  return (
    <div className="flex flex-col gap-2.5">
      <p id="dl-quality-label" className="dl-label">
        Quality
      </p>
      <div role="radiogroup" aria-labelledby="dl-quality-label" className="dl-qualities">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className="dl-quality"
          >
            <span className="dl-quality-label">
              {o.label}
              {o.best && <span className="dl-quality-tag">Best</span>}
            </span>
            {o.hint && <span className="dl-quality-hint">{o.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Thumbnail({ src, fallback }: { src?: string; fallback?: PlatformId }) {
  // Track the failing URL (not a boolean) so a new src gets a fresh attempt.
  const [failedSrc, setFailedSrc] = useState<string>();
  if (src && src !== failedSrc) {
    // Remote CDNs (IG/FB) reject hotlinks with a referrer, so use a plain <img>.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} />;
  }
  if (!fallback) return null;
  return (
    <div className="dl-thumb-fallback">
      <PlatformIcon id={fallback} className="size-[30px] opacity-90" />
      <span>Preview unavailable</span>
    </div>
  );
}

function Summary({ item, platform, quality }: { item: MediaItem; platform: PlatformId; quality: Quality }) {
  const option = typeof quality === "number" ? item.qualities.find((q) => q.short === quality) : undefined;
  const fps = option?.fps ?? item.fps;
  const parts =
    quality === "audio"
      ? ["MP3", "Audio only"]
      : [
          typeof quality === "number" ? shortLabel(quality) : qualityLabel(item),
          fps ? `${Math.round(fps)} fps` : "",
          option?.filesize ? `≈ ${formatBytes(option.filesize)}` : "",
        ];
  return (
    <div className="dl-summary fade-in">
      <div className="dl-thumb">
        <Thumbnail src={item.thumbnail} fallback={platform} />
      </div>
      <div className="dl-summary-text">
        <span className="dl-summary-title">{item.title}</span>
        <span className="dl-sublabel">{parts.filter(Boolean).join(" · ")}</span>
      </div>
    </div>
  );
}

function Progress({ progress, audio, onCancel }: { progress?: ProgressEvent; audio: boolean; onCancel: () => void }) {
  const stages = audio ? AUDIO_STAGES : VIDEO_STAGES;
  let step = 0;
  let percent: number | null = null;
  let detail = "Connecting…";

  if (progress?.type === "progress") {
    if (progress.stage === "downloading") {
      step = !audio && progress.part > 1 ? 1 : 0;
      percent = progress.percent;
      detail =
        [progress.speed ? `${formatBytes(progress.speed)}/s` : "", progress.eta ? `${formatDuration(progress.eta)} left` : ""]
          .filter(Boolean)
          .join(" · ") || "Downloading…";
    } else {
      step = progress.stage === "converting" ? 1 : progress.stage === "merging" ? 2 : stages.length - 1;
      detail = "Almost there…";
    }
  }
  const label = stages[step];

  return (
    <div role="status" aria-live="polite" className="dl-progress fade-in">
      <div className="dl-progress-head">
        <div className="flex flex-col gap-1">
          <span className="text-[15px] font-semibold">{label}</span>
          <span className="dl-sublabel">
            Step {step + 1} of {stages.length}
          </span>
        </div>
        <span className="dl-pct">{percent === null ? "—" : `${Math.floor(percent)}%`}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === null ? undefined : Math.floor(percent)}
        className="dl-bar"
      >
        {percent === null ? <div className="dl-bar-indet" /> : <div className="dl-bar-fill" style={{ width: `${percent}%` }} />}
      </div>
      <div className="dl-progress-foot">
        <span>{detail}</span>
        <button type="button" onClick={onCancel} className="dl-link-btn">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-hidden className="dl-media fade-in">
      <div className="dl-thumb dl-shimmer" />
      <div className="dl-meta pt-1">
        <div className="dl-shimmer h-4 w-[92%] rounded-md" />
        <div className="dl-shimmer h-4 w-[64%] rounded-md" />
        <div className="dl-block mt-1 h-3 w-[38%] rounded-md" />
        <div className="mt-2 flex gap-1.5">
          <div className="dl-block h-[26px] w-[52px] rounded-[7px]" />
          <div className="dl-block h-[26px] w-[84px] rounded-[7px]" />
          <div className="dl-block h-[26px] w-[56px] rounded-[7px]" />
        </div>
      </div>
    </div>
  );
}

/** Adds a "what to do next" line to the server's error message. */
function explain(message: string): Problem {
  const m = message.toLowerCase();
  if (m.includes("private") || m.includes("login")) {
    return {
      title: message,
      hint: "Only public posts work. If the post opens in a private browser window without signing in, it will work here.",
    };
  }
  if (m.includes("bot") || m.includes("rate-limit") || m.includes("busy")) {
    return { title: message, hint: "This usually clears up within a few minutes." };
  }
  if (m.includes("switch to the")) return { title: message };
  return { title: message, hint: "Check the link and try again." };
}

function downloadLabel(quality: Quality, item?: MediaItem) {
  if (quality === "audio") return "Download MP3";
  if (quality === "best" || item?.qualities[0]?.short === quality) return "Download best quality";
  return `Download ${shortLabel(quality)}`;
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

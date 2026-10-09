"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

import { Downloader } from "@/components/downloader";
import { PlatformIcon } from "@/components/platform-icon";
import { track } from "@/lib/analytics";
import { getPlatform, type PlatformId } from "@/lib/platforms";

type Theme = "dark" | "light";

const STEPS = [
  { title: "Copy the link", body: "Open the post in the app or browser and choose Share, then Copy link." },
  { title: "Paste it here", body: "Drop it into the box and press Get video. We detect the platform for you." },
  { title: "Download", body: "Check the preview, pick a quality, then save the file straight to your device." },
];

const PLATFORM_TILES: { id: PlatformId; name: string; points: string[] }[] = [
  { id: "youtube", name: "YouTube", points: ["Up to 4K at 60 fps", "Videos and Shorts", "Video and audio merged for you"] },
  { id: "instagram", name: "Instagram", points: ["Reels and video posts", "Carousels: pick any video", "Original upload resolution"] },
  { id: "twitter", name: "Twitter / X", points: ["Up to 1080p", "Multi-video posts supported", "x.com and twitter.com links"] },
  { id: "facebook", name: "Facebook", points: ["Public videos and reels", "HD when the uploader provided it", "fb.watch short links work"] },
];

const FAQ = [
  {
    q: "Why did my private post fail?",
    a: "We can only reach what anyone on the internet can see. Private accounts, friends-only posts and anything behind a login return an error instead of a video.",
  },
  {
    q: "What quality do I get?",
    a: "The highest the platform offers for that post by default: up to 4K at 60 fps on YouTube, usually 1080p elsewhere. You can also pick a lower resolution or audio only (MP3). The preview shows resolution, frame rate, codec and file size before you download.",
  },
  {
    q: "Why is my 4K file .mkv?",
    a: "YouTube serves 4K as VP9 or AV1 video with separate audio. We merge them into .mkv so nothing gets re-encoded and you keep full quality. VLC, IINA and most editors open it.",
  },
  { q: "Is it free?", a: "Yes. No account, no trial and no quality limits." },
  {
    q: "Is my data stored?",
    a: "No. Files are deleted right after your download finishes, and we never ask who you are. We use Google Analytics to count visits and see which features get used.",
  },
];

export function Landing() {
  const theme = useTheme();
  const [platform, setPlatform] = useState<PlatformId>("youtube");
  const [openFaq, setOpenFaq] = useState(0);
  const accent = getPlatform(platform)!;

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
    track("toggle_theme", { theme: next });
  }

  function toggleFaq(i: number) {
    const opening = openFaq !== i;
    setOpenFaq(opening ? i : -1);
    if (opening) track("faq_open", { question: FAQ[i].q });
  }

  const onPlatformChange = useCallback((id: PlatformId) => setPlatform(id), []);

  return (
    <div className="lp" style={{ "--accent": accent.accent, "--solid": accent.solid } as React.CSSProperties}>
      <div aria-hidden className="lp-glow" />

      <header className="lp-header">
        <a href="#" className="lp-brand">
          <span aria-hidden className="lp-brand-mark">
            ↓
          </span>
          <span>Clipdrop</span>
        </a>
        <nav className="lp-nav" aria-label="Main">
          <a href="#how" className="lp-nav-link">
            How it works
          </a>
          <a href="#faq" className="lp-nav-link">
            FAQ
          </a>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="lp-theme-btn"
          >
            <span aria-hidden className="lp-theme-dot" />
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </nav>
      </header>

      <main>
        <section className="lp-hero">
          <p className="lp-pill">
            <span>Free</span>
            <span aria-hidden>·</span>
            <span>No sign-up</span>
            <span aria-hidden>·</span>
            <span>YouTube, Instagram, X, Facebook</span>
          </p>
          <h1 className="lp-h1">Save public videos in the best quality available.</h1>
          <p className="lp-lede">
            Paste a link and get the highest resolution the post offers, up to 4K. No account, nothing to install.
          </p>
          <div className="lp-card-slot">
            <Downloader onPlatformChange={onPlatformChange} />
          </div>
        </section>

        <section id="how" aria-labelledby="how-h" className="lp-section">
          <p className="lp-eyebrow">How it works</p>
          <h2 id="how-h" className="lp-h2">
            Three steps, about ten seconds.
          </h2>
          <ol className="lp-grid">
            {STEPS.map((s, i) => (
              <li key={s.title} className="lp-tile">
                <span className="lp-step-n">{String(i + 1).padStart(2, "0")}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="platforms" aria-labelledby="pl-h" className="lp-section">
          <p className="lp-eyebrow">Supported platforms</p>
          <h2 id="pl-h" className="lp-h2">
            Four platforms, full quality.
          </h2>
          <div className="lp-grid">
            {PLATFORM_TILES.map((t) => (
              <div key={t.id} className="lp-tile" style={{ gap: 14 }}>
                <span
                  className="lp-tile-icon"
                  style={{ background: `color-mix(in oklch, ${getPlatform(t.id)!.accent} 12%, transparent)` }}
                >
                  <PlatformIcon id={t.id} className="size-6" />
                </span>
                <h3 style={{ margin: 0 }}>{t.name}</h3>
                <ul>
                  {t.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-h" className="lp-section lp-faq">
          <div>
            <p className="lp-eyebrow">FAQ</p>
            <h2 id="faq-h" className="lp-h2">
              Questions, answered.
            </h2>
          </div>
          <div className="lp-faq-list">
            {FAQ.map((f, i) => (
              <div key={f.q} className="lp-faq-item">
                <h3>
                  <button
                    type="button"
                    aria-expanded={openFaq === i}
                    aria-controls={`faq-a${i}`}
                    onClick={() => toggleFaq(i)}
                    className="lp-faq-q"
                  >
                    {f.q}
                    <span aria-hidden className="lp-faq-plus">
                      +
                    </span>
                  </button>
                </h3>
                {openFaq === i && (
                  <p id={`faq-a${i}`} className="lp-faq-a">
                    {f.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <span className="text-sm font-semibold">Clipdrop</span>
          <p>
            Only download videos you have the right to use. Respect creators&apos; rights and each platform&apos;s terms of
            service. Not affiliated with YouTube, Instagram, X or Facebook.
          </p>
        </div>
      </footer>
    </div>
  );
}

/**
 * The theme lives on <html data-theme> (set before paint by the script in layout.tsx),
 * so read it from there and re-render when it changes.
 */
function useTheme(): Theme {
  return useSyncExternalStore(
    (onChange) => {
      const mo = new MutationObserver(onChange);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => mo.disconnect();
    },
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark"),
    () => "dark",
  );
}

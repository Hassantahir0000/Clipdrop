/**
 * Site-wide identity used by metadata, robots.txt, the sitemap, the manifest and JSON-LD.
 *
 * Search engines and social cards need absolute URLs, so set NEXT_PUBLIC_SITE_URL to the public
 * origin (e.g. https://clipdrop.example). It's read at build time, like every NEXT_PUBLIC_* value.
 */
function resolveSiteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export const SITE = {
  name: "Clipdrop",
  url: resolveSiteUrl(),
  title: "Clipdrop: Free YouTube, Instagram, X & Facebook Video Downloader",
  tagline: "Save public videos in the best quality available.",
  description:
    "Download public videos from YouTube, Instagram, Twitter / X and Facebook in the best quality, up to 4K. Free, no sign-up, nothing to install.",
  keywords: [
    "video downloader",
    "YouTube downloader",
    "YouTube 4K download",
    "Instagram reels downloader",
    "Twitter video downloader",
    "X video downloader",
    "Facebook video downloader",
    "YouTube to MP3",
  ],
  /** Matches --bg in globals.css. */
  colors: { dark: "#0a0a0b", light: "#f7f7f5" },
};

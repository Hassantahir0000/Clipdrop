export type PlatformId = "youtube" | "instagram" | "twitter" | "facebook";

export type Platform = {
  id: PlatformId;
  label: string;
  hosts: string[];
  placeholder: string;
  /** Brand color for tints, rings and the progress bar. */
  accent: string;
  /** Darker shade for filled buttons, so white text keeps AA contrast. */
  solid: string;
};

export const PLATFORMS: Platform[] = [
  {
    id: "youtube",
    label: "YouTube",
    hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
    placeholder: "Paste a YouTube link, e.g. youtube.com/watch?v=…",
    accent: "#ff0033",
    solid: "#d6002b",
  },
  {
    id: "instagram",
    label: "Instagram",
    hosts: ["instagram.com", "instagr.am"],
    placeholder: "Paste an Instagram link, e.g. instagram.com/reel/…",
    accent: "#e1306c",
    solid: "#c41f5a",
  },
  {
    id: "twitter",
    label: "Twitter / X",
    hosts: ["twitter.com", "x.com"],
    placeholder: "Paste a post link, e.g. x.com/user/status/…",
    accent: "#1d9bf0",
    solid: "#0b74b8",
  },
  {
    id: "facebook",
    label: "Facebook",
    hosts: ["facebook.com", "fb.watch", "fb.com"],
    placeholder: "Paste a Facebook link, e.g. facebook.com/watch?v=…",
    accent: "#1877f2",
    solid: "#1463cc",
  },
];

export function getPlatform(id: string | null | undefined): Platform | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

function hostMatches(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** Returns the platform a URL belongs to, or undefined if it's not a supported http(s) link. */
export function detectPlatform(raw: string): Platform | undefined {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  const host = url.hostname.toLowerCase();
  return PLATFORMS.find((p) => p.hosts.some((d) => hostMatches(host, d)));
}

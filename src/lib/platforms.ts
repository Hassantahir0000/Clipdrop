export type PlatformId = "youtube" | "instagram" | "twitter" | "facebook";

export type Platform = {
  id: PlatformId;
  label: string;
  hosts: string[];
  placeholder: string;
  accent: string;
};

export const PLATFORMS: Platform[] = [
  {
    id: "youtube",
    label: "YouTube",
    hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
    placeholder: "https://www.youtube.com/watch?v=…  or  https://youtu.be/…",
    accent: "#ff0033",
  },
  {
    id: "instagram",
    label: "Instagram",
    hosts: ["instagram.com", "instagr.am"],
    placeholder: "https://www.instagram.com/reel/…  or  /p/…",
    accent: "#e1306c",
  },
  {
    id: "twitter",
    label: "Twitter / X",
    hosts: ["twitter.com", "x.com"],
    placeholder: "https://x.com/user/status/…",
    accent: "#1d9bf0",
  },
  {
    id: "facebook",
    label: "Facebook",
    hosts: ["facebook.com", "fb.watch", "fb.com"],
    placeholder: "https://www.facebook.com/…/videos/…  or  https://fb.watch/…",
    accent: "#1877f2",
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

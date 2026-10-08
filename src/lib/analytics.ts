import { sendGAEvent } from "@next/third-parties/google";

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

type Params = Record<string, string | number | boolean | undefined>;

/**
 * Sends a GA4 event. No-op when GA isn't configured (e.g. local dev without NEXT_PUBLIC_GA_ID).
 * Never pass personal data (emails, names, the pasted URL): Google's terms forbid PII in GA.
 */
export function track(name: string, params: Params = {}) {
  if (!GA_ID || typeof window === "undefined") return;
  sendGAEvent("event", name, params);
}

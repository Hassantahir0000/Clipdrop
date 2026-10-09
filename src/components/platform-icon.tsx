import type { PlatformId } from "@/lib/platforms";

/** Full-color platform marks. Size them with width/height on the wrapper class. */
export function PlatformIcon({ id, className }: { id: PlatformId; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      {id === "youtube" && (
        <>
          <rect x="1.5" y="5" width="21" height="14" rx="4.5" fill="#ff0033" />
          <path d="M10 9v6l5.2-3z" fill="#fff" />
        </>
      )}
      {id === "instagram" && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5.5" fill="none" stroke="#e1306c" strokeWidth="2" />
          <circle cx="12" cy="12" r="4" fill="none" stroke="#e1306c" strokeWidth="2" />
          <circle cx="17.2" cy="6.8" r="1.25" fill="#e1306c" />
        </>
      )}
      {id === "twitter" && (
        <path d="M5 4.5l14 15M19 4.5l-14 15" stroke="#1d9bf0" strokeWidth="2.6" strokeLinecap="round" />
      )}
      {id === "facebook" && (
        <>
          <circle cx="12" cy="12" r="10" fill="#1877f2" />
          <path
            d="M13.3 20v-6.6h2.2l.35-2.6H13.3V9.3c0-.75.22-1.25 1.3-1.25h1.35V5.7c-.24-.03-1.04-.1-1.97-.1-1.95 0-3.28 1.19-3.28 3.37v1.86H8.5v2.6h2.2V20z"
            fill="#fff"
          />
        </>
      )}
    </svg>
  );
}

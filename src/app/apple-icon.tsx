import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Same mark as icon.svg. iOS adds its own rounded mask, so the square is full-bleed. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f5f5f4" }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
          <path
            d="M16 8v13m-5.5-5.5L16 21l5.5-5.5M10 24.5h12"
            fill="none"
            stroke="#0a0a0b"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    size,
  );
}

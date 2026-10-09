import { ImageResponse } from "next/og";

import { PLATFORMS } from "@/lib/platforms";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name}: ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: SITE.colors.dark,
          backgroundImage: "radial-gradient(circle at 50% -10%, rgba(255,0,51,0.35), transparent 60%)",
          color: "#f5f5f4",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 700 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "#f5f5f4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="44" height="44" viewBox="0 0 32 32">
              <path
                d="M16 8v13m-5.5-5.5L16 21l5.5-5.5M10 24.5h12"
                fill="none"
                stroke={SITE.colors.dark}
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {SITE.name}
        </div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>
          {SITE.tagline}
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 28, color: "#a3a3a3" }}>
          {PLATFORMS.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 22px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.16)",
              }}
            >
              <div style={{ width: 14, height: 14, borderRadius: 999, background: p.accent }} />
              {p.label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

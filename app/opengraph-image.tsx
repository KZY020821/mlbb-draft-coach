import { ImageResponse } from "next/og";

// The picture shown when the site is shared on Discord, Facebook, WhatsApp or X.
export const alt = "MLBB Draft Coach: the right last pick for your Mobile Legends draft";
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
          justifyContent: "center",
          padding: "72px 80px",
          background: "radial-gradient(circle at 85% 0%, #1b3355 0%, #0a1020 45%, #070b16 100%)",
          color: "#eef2fb",
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="7" fill="#111a2e" />
            <path d="M16 5l9 5v8c0 4.5-3.8 7.6-9 9-5.2-1.4-9-4.5-9-9v-8z" fill="#f5c451" />
            <path d="M12 14h8M12 18h8" stroke="#0b1222" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" }}>MLBB Draft Coach</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 48, fontSize: 84, fontWeight: 800, lineHeight: 1.02, textTransform: "uppercase" }}>
          <span>Lock in the</span>
          <span style={{ color: "#f5c451" }}>right last pick.</span>
        </div>
        <div style={{ marginTop: 36, fontSize: 32, color: "#a9b4cf", maxWidth: 940 }}>
          AI draft suggestions from MPL Indonesia, Philippines and Malaysia pro drafts.
        </div>
      </div>
    ),
    size
  );
}

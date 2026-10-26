import type { MetadataRoute } from "next";

// Makes the site installable as an app (Add to Home Screen / Install app).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MLBB Draft Coach",
    short_name: "Draft Coach",
    description: "Enter the bans and picks from a Mobile Legends draft and get the best last pick or two for your team.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#070b16",
    theme_color: "#070b16",
    categories: ["games", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}

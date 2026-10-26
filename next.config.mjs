/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Browser protections for every page: no framing by other sites (clickjacking), HTTPS only,
  // no MIME sniffing, and only the origin is sent to other sites.
  async headers() {
    return [
      // The service worker must never be cached by the browser, so app updates reach people.
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }]
      },
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ]
      }
    ];
  }
};

export default nextConfig;

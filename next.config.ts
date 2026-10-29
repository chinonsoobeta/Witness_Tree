import type { NextConfig } from "next";

function contentSecurityPolicy(frameAncestors: string, scriptSrc: string) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' https://d3g1406o0uekin.cloudfront.net",
    "font-src 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    "img-src 'self' data: blob:",
    "object-src 'none'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self'",
  ].join("; ");
}

// The site uses no camera, microphone, location, payment or USB access, so a
// page or a script it loads cannot ask for them. Full screen stays open to the
// site itself, because the Explore map offers it.
const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "fullscreen=(self)",
].join(", ");

const SECURITY_HEADERS = {
  "Content-Security-Policy": contentSecurityPolicy("'none'", "'self' 'unsafe-inline'"),
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": PERMISSIONS_POLICY,
} as const;

/*
 * A place's embedded figure (lib/embed/card.ts) is the one thing another site
 * may frame. Its paths drop X-Frame-Options and allow any ancestor; every other
 * path keeps DENY and frame-ancestors 'none'. The embed runs no script, so its
 * policy refuses scripts outright. On 2026-10-29 the owner decided to keep `*`,
 * so any site may frame a place's figure (docs/THREAT_MODEL.md). Narrowing it
 * later means replacing EMBED_FRAME_ANCESTORS with a list of named sites.
 */
const EMBED_FRAME_ANCESTORS = "*";
const EMBED_PATHS = ["en/embed/", "fr/integrer/"] as const;
const EMBED_HEADERS = {
  "Content-Security-Policy": contentSecurityPolicy(EMBED_FRAME_ANCESTORS, "'none'"),
  "Strict-Transport-Security": SECURITY_HEADERS["Strict-Transport-Security"],
  "X-Content-Type-Options": SECURITY_HEADERS["X-Content-Type-Options"],
  "Referrer-Policy": SECURITY_HEADERS["Referrer-Policy"],
  "Permissions-Policy": SECURITY_HEADERS["Permissions-Policy"],
} as const;

const headerList = (headers: Readonly<Record<string, string>>) => Object.entries(headers).map(([key, value]) => ({ key, value }));

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Every path except an embed. Each path matches exactly one kind of rule
      // (tests/security-headers.test.ts).
      { source: `/:path((?!${EMBED_PATHS.map((prefix) => `${prefix}.`).join("|")}).*)`, headers: headerList(SECURITY_HEADERS) },
      ...EMBED_PATHS.map((prefix) => ({ source: `/${prefix}:path+`, headers: headerList(EMBED_HEADERS) })),
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "witnesstree.ca" }],
        destination: "https://www.witnesstree.ca/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { ADDRESS_SEARCH_PATH, addressLookupConfigured, handleAddressSearch, withAddressFlag, type AddressEnv } from "./address";
import { DISTRICT_RESOLVE_PATH, districtIndexConfigured, handleDistrictResolve, withDistrictFlag, type DistrictEnv } from "./district";
import { SHAPE_MEASURE_PATH, coarseGridConfigured, handleShapeMeasure, withShapeFlag, type ShapeEnv } from "./shape";

interface Env extends AddressEnv, DistrictEnv, ShapeEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self' https://d3g1406o0uekin.cloudfront.net",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self'",
].join("; ");

const SECURITY_HEADERS = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
} as const;

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(response);
    }

    // The address route never reaches the app router. It is the only path
    // that touches the provider key, and it answers with no-store.
    if (url.pathname === ADDRESS_SEARCH_PATH) {
      return withSecurityHeaders(await handleAddressSearch(request, env));
    }

    // Resolving a point reads two bytes out of the district index. It is kept
    // off the app router for the same reason as the address route: it answers
    // with no-store and it must not be cached by locale or by page.
    if (url.pathname === DISTRICT_RESOLVE_PATH) {
      return withSecurityHeaders(await handleDistrictResolve(request, env));
    }

    // Measuring a drawn shape reads whole grid tiles. It stays off the app
    // router for the same reasons, and because the shape itself is in the
    // body: routing it through a page would put it in a cache key.
    if (url.pathname === SHAPE_MEASURE_PATH) {
      return withSecurityHeaders(await handleShapeMeasure(request, env));
    }

    // Stamped on every request, so a page can read whether the address field
    // and the district readout can work without being told so by the caller.
    const stamped = withShapeFlag(
      withDistrictFlag(
        withAddressFlag(request, addressLookupConfigured(env)),
        districtIndexConfigured(env),
      ),
      coarseGridConfigured(env),
    );
    return withSecurityHeaders(await handler.fetch(stamped, env, ctx));
  },
};

export default worker;

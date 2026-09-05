// A browser-safe stand-in for next/navigation, used only when building the
// design-sync bundle. The app's real shim (vinext/dist/shims/navigation) reads
// the request through AsyncLocalStorage, so it drags node:async_hooks into an
// esbuild browser bundle and the build fails. Preview cards render in a real
// browser with a real URL, so reading window.location is both buildable and
// more faithful than a hardcoded stub.

const FALLBACK_PATHNAME = "/en";

export function usePathname(): string {
  if (typeof window === "undefined") return FALLBACK_PATHNAME;
  return window.location.pathname || FALLBACK_PATHNAME;
}

export function useSearchParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  // The preview card carries its own ?story= selector, which is not part of
  // the app's query string and must not leak into any href a component builds.
  const params = new URLSearchParams(window.location.search);
  params.delete("story");
  return params;
}

export function useParams<T extends Record<string, string | string[]>>(): T {
  return {} as T;
}

export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    refresh: () => {},
    back: () => {},
    forward: () => {},
    prefetch: () => {},
  };
}

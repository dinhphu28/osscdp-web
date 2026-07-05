import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '@/test/msw/server';
import { tokenStore } from '@/lib/auth/tokenStore';

// --- jsdom polyfills MUI relies on (jsdom lacks both) ---
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver =
  globalThis.ResizeObserver ?? (ResizeObserverStub as unknown as typeof ResizeObserver);

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  })) as unknown as typeof window.matchMedia;
}

// --- MSW lifecycle + per-test reset ---
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => {
  server.resetHandlers();
  tokenStore.clear();
  try {
    sessionStorage.clear();
  } catch {
    /* jsdom storage may be unavailable */
  }
  try {
    localStorage.clear();
  } catch {
    /* jsdom storage may be unavailable */
  }
});
afterAll(() => server.close());

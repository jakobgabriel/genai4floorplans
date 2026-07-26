// Test environment shims. Carbon components observe element size at mount;
// jsdom implements neither ResizeObserver nor matchMedia, so stub both.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

// jsdom has no layout, so Carbon's ComboBox/Dropdown blow up calling
// scrollIntoView on the highlighted option. Stub it.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom has scrollTo but only to log "Not implemented" on every call; the hash
// router scrolls a new page to its top on every route change.
if (typeof window !== "undefined") {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

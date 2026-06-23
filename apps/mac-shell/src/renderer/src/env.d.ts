export {}

declare global {
  interface Window {
    // electronAPI is already declared in src/preload/index.d.ts, which is included in tsconfig.web.json
  }
}

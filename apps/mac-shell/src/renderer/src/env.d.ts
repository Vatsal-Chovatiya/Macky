export {}

declare global {
  interface Window {
    electronAPI: {
      onPttStart: (callback: () => void) => void
      onPttStop: (callback: () => void) => void
      processRequest: () => Promise<any>
      onContextReady: (callback: (data: { screenshot: string; bundleId: string }) => void) => void
    }
  }
}

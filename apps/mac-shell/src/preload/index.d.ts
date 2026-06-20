import { ElectronAPI } from '@electron-toolkit/preload'

interface ElectronCustomAPI {
  onPttStart: (callback: () => void) => () => void
  onPttStop: (callback: () => void) => () => void
  processRequest: (audioBuffer: ArrayBuffer) => Promise<{ success: boolean }>
  onContextReady: (callback: (data: { screenshot: string; bundleId: string }) => void) => () => void
  onAiResponse: (callback: (text: string) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    electronAPI: ElectronCustomAPI
    api: unknown
  }
}

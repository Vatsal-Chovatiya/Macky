import { contextBridge, ipcRenderer } from 'electron'

// Expose a safe API to the React frontend
contextBridge.exposeInMainWorld('electronAPI', {
  // Listen for hotkey events from the Main process
  // Each listener returns a cleanup function to remove the listener
  onPttStart: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('ptt-start', handler)
    return () => ipcRenderer.removeListener('ptt-start', handler)
  },

  onPttStop: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('ptt-stop', handler)
    return () => ipcRenderer.removeListener('ptt-stop', handler)
  },

  // Tell the Main process we are ready to process the request
  processRequest: (audioBuffer: ArrayBuffer) => ipcRenderer.invoke('process-request', audioBuffer),

  onContextReady: (callback: (data: { screenshot: string; bundleId: string }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { screenshot: string; bundleId: string }
    ) => callback(data)
    ipcRenderer.on('context-ready', handler)
    return () => ipcRenderer.removeListener('context-ready', handler)
  },

  // Listen for the final AI text response
  // Strip the IPC event object — only pass the text to the callback
  onAiResponse: (callback: (text: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text)
    ipcRenderer.on('ai-response', handler)
    return () => ipcRenderer.removeListener('ai-response', handler)
  }
})

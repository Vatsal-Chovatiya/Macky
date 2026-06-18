import { contextBridge, ipcRenderer } from 'electron'

// Expose a safe API to the React frontend
contextBridge.exposeInMainWorld('electronAPI', {
  // Listen for hotkey events from the Main process
  onPttStart: (callback: () => void) => ipcRenderer.on('ptt-start', callback),
  onPttStop: (callback: () => void) => ipcRenderer.on('ptt-stop', callback),

  // Tell the Main process we are ready to process the request
  processRequest: () => ipcRenderer.invoke('process-request'),

  onContextReady: (callback: (data: { screenshot: string; bundleId: string }) => void) =>
    ipcRenderer.on('context-ready', (_event, data) => callback(data))
})

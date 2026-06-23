import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

let overlayWindow: BrowserWindow | null = null

export function createOverlayWindow() {
  // Get the primary display (or the one the cursor is on)
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.bounds

  overlayWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Floats over Spaces and Fullscreen apps
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  // Load the React app, but pass a query param so React knows to render the Overlay instead of the Settings UI
  if (process.env.VITE_DEV_SERVER_URL) {
    overlayWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?window=overlay`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'overlay' }
    })
  }

  return overlayWindow
}

export function getOverlayWindow() {
  return overlayWindow
}

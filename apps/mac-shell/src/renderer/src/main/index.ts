import { app, BrowserWindow, ipcMain } from 'electron'
import { setupGlobalHotkey } from './hotkey'
import { captureLogicalScreenshot } from './capture'
import { getActiveBundleId } from './context'

let mainWindow: BrowserWindow

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    /*MY window config */
  })

  // Intialize the hotkey listener
  setupGlobalHotkey(mainWindow)

  //Listen for the PTT stop event from the renderer
  ipcMain.handle('process-request', async (_event, _audioBlob) => {
    console.log('Hotkey released! Firing parallel tasks...')
    const startTime = Date.now()

    // 1. PARALLEL KICK-OFF
    // Fire STT (handled in renderer), Screen Capture, and Context Fetch simultaneously
    const [screenshotBase64, bundleId] = await Promise.all([
      captureLogicalScreenshot(),
      getActiveBundleId()
    ])

    console.log(`Parallel tasks finished in ${Date.now() - startTime}ms`)
    console.log(`Active App: ${bundleId}`)

    // 2. SEND TO RENDERER FOR ROUTING
    // The renderer has the audio transcript from STT.
    // We send the screenshot and bundleId back to the renderer so the Router can decide what to do.
    mainWindow.webContents.send('context-ready', {
      screenshot: screenshotBase64,
      bundleId: bundleId
    })

    return { success: true }
  })
})

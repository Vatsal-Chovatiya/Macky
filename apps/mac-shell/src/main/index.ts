import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { createOverlayWindow, getOverlayWindow } from './overlay'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupGlobalHotkey } from './hotkey'
import { captureLogicalScreenshot } from './capture'
import { getActiveBundleId } from './context'
import { transcribeAudio } from './ai/stt'
import { askVisionLLM } from './ai/vision'
import { parseAIResponse, denormalizeInstructions } from './ai/parser'
import { config } from 'dotenv'

// Load .env at the very start — all modules inherit from process.env
config()

let mainWindow: BrowserWindow

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for macOS
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createOverlayWindow()

  // Initialize the global hotkey listener (Cmd + Option + Space)
  setupGlobalHotkey(mainWindow)

  // Listen for the PTT stop event from the renderer
  ipcMain.handle('process-request', async (_event, audioArrayBuffer) => {
    console.log('Hotkey released! Firing parallel tasks...')
    const startTime = Date.now()

    // Convert ArrayBuffer back to Node Buffer
    const audioBuffer = Buffer.from(audioArrayBuffer)

    // 1. PARALLEL KICK-OFF
    // Fire STT (handled in renderer), Screen Capture, and Context Fetch simultaneously
    const [transcript, capture, bundleId] = await Promise.all([
      transcribeAudio(audioBuffer),
      captureLogicalScreenshot(),
      getActiveBundleId()
    ])

    console.log(`Parallel tasks finished in ${Date.now() - startTime}ms`)
    console.log(`Transcript: "${transcript}"`)
    console.log(`Active App: ${bundleId}`)
    console.log(
      `Capture: ${capture ? `${capture.logicalWidth}x${capture.logicalHeight}, cursor=${capture.cursor ? `(${capture.cursor.x},${capture.cursor.y})` : 'none'}` : 'null'}`
    )
    // 2. THE SMART ROUTER (Sighted vs Blind)
    // TODO:
    // For now, we will just force the "Ask" Lane (Vision) to test it.

    if (capture && transcript.trim()) {
      console.log('🧠 Sending the screenshot to Vision LLM...')
      // Pass the exact image pixel dimensions so the model answers in that pixel
      // space; capture.cursor is already in that same image-pixel space.
      const rawAiResponse = await askVisionLLM(transcript, capture.base64, {
        imageWidth: capture.imageWidth,
        imageHeight: capture.imageHeight,
        cursor: capture.cursor
      })

      // Parse out drawing instructions and strip tags from spoken text
      const { cleanText, instructions } = parseAIResponse(rawAiResponse)

      // Convert the model's image-pixel coordinates into overlay pixels.
      // The model returns coords in the JPEG's pixel space (e.g. 0–1280);
      // we scale proportionally to the logical display (e.g. 0–1440).
      const pixelInstructions = denormalizeInstructions(
        instructions,
        capture.imageWidth,
        capture.imageHeight,
        capture.logicalWidth,
        capture.logicalHeight
      )

      console.log(` Clean Text for TTS: ${cleanText}`)
      console.log(` Drawing Instructions (px):`, pixelInstructions)
      // Send clean text to Main Window (for UI bubble / TTS)
      mainWindow.webContents.send('ai-response', cleanText)

      // Send shapes to Overlay Window (for drawing on screen)
      const overlay = getOverlayWindow()
      if (overlay && !overlay.isDestroyed() && pixelInstructions.length > 0) {
        // Align the overlay exactly with the display that was captured so the
        // image's pixel coordinates map 1:1 onto the overlay. Without this, a
        // capture on a non-primary display would draw at the wrong origin.
        overlay.setBounds(capture.displayBounds)
        overlay.webContents.send('draw-instructions', pixelInstructions)
      }
    } else if (!transcript.trim()) {
      console.warn('Skipping Vision LLM: no transcript (user did not speak or audio was empty)')
      mainWindow.webContents.send(
        'ai-response',
        'No speech detected. Please hold the hotkey while speaking.'
      )
    } else {
      console.warn('Skipping Vision LLM: no screenshot available')
      mainWindow.webContents.send('ai-response', 'Could not capture the screen.')
    }

    // 2. SEND TO RENDERER FOR ROUTING
    // The renderer has the audio transcript from STT.
    // We send the screenshot and bundleId back to the renderer so the Router can decide what to do.
    mainWindow.webContents.send('context-ready', {
      screenshot: capture?.base64 ?? null,
      bundleId: bundleId
    })

    return { success: true }
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

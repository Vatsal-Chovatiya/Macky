import { uIOhook, UiohookKey } from 'uiohook-napi'
import { BrowserWindow } from 'electron'

// Track the state of our modified keys
let isCmdDown = false
let isOptionDown = false
let isHotKeyActive = false

export function setupGlobalHotkey(mainWindow: BrowserWindow) {
  // Listen for key Down
  uIOhook.on('keydown', (e) => {
    if (e.keycode === UiohookKey.Ctrl) isCmdDown = true // uioHook maps cmd to ctrl keycode on Mac
    if (e.keycode === UiohookKey.Alt) isOptionDown = true

    // If both keys are pressed and we have not triggered it yet then:
    if (isCmdDown && isOptionDown && !isHotKeyActive) {
      isHotKeyActive = true
      // Tell the renderer to start recording and process!
      mainWindow.webContents.send('ptt-start')
    }
  })

  // 2. Listen for Key Up
  uIOhook.on('keyup', (e) => {
    if (e.keycode === UiohookKey.Ctrl) isCmdDown = false
    if (e.keycode === UiohookKey.Alt) isOptionDown = false

    // If cmd or option key is released, the user finished speaking
    if ((e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.Alt) && isHotKeyActive) {
      isHotKeyActive = false
      // Tell the renderer to stop recording and process!
      mainWindow.webContents.send('ptt-stop')
    }
  })

  // 3. Start the hook
  uIOhook.start()
}

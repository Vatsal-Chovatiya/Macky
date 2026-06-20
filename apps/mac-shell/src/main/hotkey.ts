import { uIOhook, UiohookKey } from 'uiohook-napi'
import { BrowserWindow, systemPreferences } from 'electron'

// Track the state of our modifier keys
let isCtrlDown = false
let isOptionDown = false
let isHotKeyActive = false

export function setupGlobalHotkey(mainWindow: BrowserWindow) {
  // MAC OS PERMISSION CHECK
  // uiohook requires Accessibility permissions on macOS to read global keystrokes

  // Accessibility permission check (macOS-only app)
  const isTrusted = systemPreferences.isTrustedAccessibilityClient(false)
  if (!isTrusted) {
    console.warn('Macky needs Accessibility permissions to listen to hotkeys!')
    // This will prompt user to open System Settings
    systemPreferences.isTrustedAccessibilityClient(true)
  }

  // 1. Listen for Key Down
  uIOhook.on('keydown', (e) => {
    if (e.keycode === UiohookKey.Ctrl) isCtrlDown = true
    if (e.keycode === UiohookKey.Alt) isOptionDown = true

    // If both keys are pressed and we haven't triggered yet:
    if (isCtrlDown && isOptionDown && !isHotKeyActive) {
      isHotKeyActive = true
      // Tell the renderer to start recording and process!
      mainWindow.webContents.send('ptt-start')
    }
  })

  // 2. Listen for Key Up
  uIOhook.on('keyup', (e) => {
    if (e.keycode === UiohookKey.Ctrl) isCtrlDown = false
    if (e.keycode === UiohookKey.Alt) isOptionDown = false

    // If either key is released while hotkey was active, user finished speaking
    if ((e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.Alt) && isHotKeyActive) {
      isHotKeyActive = false
      // Tell the renderer to stop recording and process!
      mainWindow.webContents.send('ptt-stop')
    }
  })

  // 3. Start the hook
  try {
    uIOhook.start()
    console.log('Global hotkey listener started (Ctrl + Option)')
  } catch (error) {
    console.error(
      'Failed to start global hotkey listener. Please grant Accessibility permissions in System Settings > Privacy & Security > Accessibility, then restart the app.',
      error
    )
  }
}

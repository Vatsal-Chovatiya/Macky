import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupGlobalHotkey } from '../hotkey'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { BrowserWindow } from 'electron'

const mockListeners: Record<string, Function> = {}

vi.mock('uiohook-napi', () => {
  const mockUiohook = {
    on: vi.fn((event, cb) => {
      mockListeners[event] = cb
    }),
    start: vi.fn()
  }
  const mockUiohookKey = {
    Ctrl: 29,
    Alt: 56
  }
  return {
    uIOhook: mockUiohook,
    UiohookKey: mockUiohookKey
  }
})

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  systemPreferences: {
    isTrustedAccessibilityClient: vi.fn().mockReturnValue(true)
  }
}))

describe('setupGlobalHotkey', () => {
  let mockMainWindow: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockMainWindow = {
      webContents: {
        send: vi.fn()
      }
    }

    // Reset module-level state by triggering keyup events for tracked keys
    if (mockListeners['keyup']) {
      mockListeners['keyup']({ keycode: UiohookKey.Ctrl })
      mockListeners['keyup']({ keycode: UiohookKey.Alt })
    }
    vi.clearAllMocks()
  })

  it('starts the uIOhook and registers listeners', () => {
    setupGlobalHotkey(mockMainWindow as BrowserWindow)
    expect(uIOhook.on).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(uIOhook.on).toHaveBeenCalledWith('keyup', expect.any(Function))
    expect(uIOhook.start).toHaveBeenCalled()
  })

  it('does NOT trigger ptt-start when only Ctrl is pressed', () => {
    setupGlobalHotkey(mockMainWindow as BrowserWindow)
    const keydownCallback = mockListeners['keydown']

    keydownCallback({ keycode: UiohookKey.Ctrl })
    expect(mockMainWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('does NOT trigger ptt-start when only Alt is pressed', () => {
    setupGlobalHotkey(mockMainWindow as BrowserWindow)
    const keydownCallback = mockListeners['keydown']

    keydownCallback({ keycode: UiohookKey.Alt })
    expect(mockMainWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('triggers ptt-start when both Ctrl and Alt are pressed', () => {
    setupGlobalHotkey(mockMainWindow as BrowserWindow)
    const keydownCallback = mockListeners['keydown']

    keydownCallback({ keycode: UiohookKey.Ctrl })
    expect(mockMainWindow.webContents.send).not.toHaveBeenCalled()

    keydownCallback({ keycode: UiohookKey.Alt })
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ptt-start')
  })

  it('triggers ptt-start regardless of key press order', () => {
    setupGlobalHotkey(mockMainWindow as BrowserWindow)
    const keydownCallback = mockListeners['keydown']

    // Press Alt first, then Ctrl
    keydownCallback({ keycode: UiohookKey.Alt })
    keydownCallback({ keycode: UiohookKey.Ctrl })

    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ptt-start')
  })

  it('triggers ptt-stop when Ctrl is released while hotkey is active', () => {
    setupGlobalHotkey(mockMainWindow as BrowserWindow)
    const keydownCallback = mockListeners['keydown']
    const keyupCallback = mockListeners['keyup']

    // Activate
    keydownCallback({ keycode: UiohookKey.Ctrl })
    keydownCallback({ keycode: UiohookKey.Alt })
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ptt-start')
    vi.clearAllMocks()

    // Release Ctrl
    keyupCallback({ keycode: UiohookKey.Ctrl })
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ptt-stop')
  })

  it('triggers ptt-stop when Alt is released while hotkey is active', () => {
    setupGlobalHotkey(mockMainWindow as BrowserWindow)
    const keydownCallback = mockListeners['keydown']
    const keyupCallback = mockListeners['keyup']

    // Activate
    keydownCallback({ keycode: UiohookKey.Ctrl })
    keydownCallback({ keycode: UiohookKey.Alt })
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ptt-start')
    vi.clearAllMocks()

    // Release Alt
    keyupCallback({ keycode: UiohookKey.Alt })
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ptt-stop')
  })

  it('does not trigger ptt-stop when an unrelated key is released', () => {
    setupGlobalHotkey(mockMainWindow as BrowserWindow)
    const keydownCallback = mockListeners['keydown']
    const keyupCallback = mockListeners['keyup']

    // Activate
    keydownCallback({ keycode: UiohookKey.Ctrl })
    keydownCallback({ keycode: UiohookKey.Alt })
    expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ptt-start')
    vi.clearAllMocks()

    // Release some other key (e.g. keycode 99)
    keyupCallback({ keycode: 99 })
    expect(mockMainWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('does not trigger ptt-start more than once for held keys', () => {
    setupGlobalHotkey(mockMainWindow as BrowserWindow)
    const keydownCallback = mockListeners['keydown']

    // Press both
    keydownCallback({ keycode: UiohookKey.Ctrl })
    keydownCallback({ keycode: UiohookKey.Alt })
    expect(mockMainWindow.webContents.send).toHaveBeenCalledTimes(1)

    // Simulate key repeat (OS sends repeated keydown events for held keys)
    keydownCallback({ keycode: UiohookKey.Ctrl })
    keydownCallback({ keycode: UiohookKey.Alt })
    expect(mockMainWindow.webContents.send).toHaveBeenCalledTimes(1)
  })
})

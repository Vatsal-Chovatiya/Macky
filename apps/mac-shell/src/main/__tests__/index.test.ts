import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create variables to capture registered callbacks in the file
let registeredIpcHandler: Function | null = null
let whenReadyCallback: Function | null = null

// Mock electron
vi.mock('electron', () => {
  const mockIpcMain = {
    handle: vi.fn((channel, handler) => {
      if (channel === 'process-request') {
        registeredIpcHandler = handler
      }
    })
  }

  const mockWebContents = {
    send: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    openDevTools: vi.fn()
  }

  // Use constructible function instead of arrow function
  const mockBrowserWindow = vi.fn().mockImplementation(function (this: any) {
    this.webContents = mockWebContents
    this.on = vi.fn()
    this.show = vi.fn()
    this.loadURL = vi.fn()
    this.loadFile = vi.fn()
    return this
  })
  ;(mockBrowserWindow as any).getAllWindows = vi.fn().mockReturnValue([])

  const mockApp = {
    whenReady: vi.fn().mockImplementation(() => {
      return {
        then: (cb: Function) => {
          whenReadyCallback = cb
          return Promise.resolve()
        }
      }
    }),
    on: vi.fn()
  }

  return {
    app: mockApp,
    shell: { openExternal: vi.fn() },
    BrowserWindow: mockBrowserWindow,
    ipcMain: mockIpcMain,
    mockWebContents: mockWebContents // Expose to verify IPC sends
  }
})

// Mock @electron-toolkit/utils
vi.mock('@electron-toolkit/utils', () => ({
  electronApp: { setAppUserModelId: vi.fn() },
  optimizer: { watchWindowShortcuts: vi.fn() },
  is: { dev: false }
}))

// Mock the icon asset import
vi.mock('../../../resources/icon.png?asset', () => ({ default: 'mock-icon-path' }))

// Mock helper submodules
vi.mock('../hotkey', () => ({
  setupGlobalHotkey: vi.fn()
}))

vi.mock('../capture', () => ({
  captureLogicalScreenshot: vi.fn()
}))

vi.mock('../context', () => ({
  getActiveBundleId: vi.fn()
}))

// Import after mocking
import { setupGlobalHotkey } from '../hotkey'
import { captureLogicalScreenshot } from '../capture'
import { getActiveBundleId } from '../context'
import * as electron from 'electron'

describe('main index entry point', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    registeredIpcHandler = null
    whenReadyCallback = null

    // Import the module to run its top-level app.whenReady code
    // Use resetModules to ensure the file runs again in a clean state if needed
    vi.resetModules()
    await import('../index')
  })

  it('sets up BrowserWindow, hotkeys and IPC handler when app is ready', async () => {
    // Trigger whenReady callback
    if (whenReadyCallback) {
      await whenReadyCallback()
    }

    expect(electron.BrowserWindow).toHaveBeenCalled()
    expect(setupGlobalHotkey).toHaveBeenCalledWith(expect.any(Object))
    expect(registeredIpcHandler).toBeTypeOf('function')
  })

  it('handles process-request IPC calls by fetching screenshot and active app bundle ID in parallel', async () => {
    // Trigger whenReady to create the window and register the IPC handler
    if (whenReadyCallback) {
      await whenReadyCallback()
    }

    expect(registeredIpcHandler).toBeTypeOf('function')

    // Mock captured context results
    vi.mocked(captureLogicalScreenshot).mockResolvedValue('mock-screenshot-base64')
    vi.mocked(getActiveBundleId).mockResolvedValue('com.example.app')

    // Call the IPC handler
    const event = {}
    const audioBlob = {} // dummy blob
    const result = await registeredIpcHandler!(event, audioBlob)

    // Verify it returns success
    expect(result).toEqual({ success: true })

    // Verify submodules were called
    expect(captureLogicalScreenshot).toHaveBeenCalled()
    expect(getActiveBundleId).toHaveBeenCalled()

    // Verify results were sent to the window's webContents
    const mockWebContents = (electron as any).mockWebContents
    expect(mockWebContents.send).toHaveBeenCalledWith('context-ready', {
      screenshot: 'mock-screenshot-base64',
      bundleId: 'com.example.app'
    })
  })
})

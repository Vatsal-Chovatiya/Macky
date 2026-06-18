import { describe, it, expect, vi, beforeEach } from 'vitest'
import { captureLogicalScreenshot } from '../capture'
import { desktopCapturer, screen } from 'electron'
import sharp from 'sharp'

vi.mock('electron', () => {
  const mockScreen = {
    getCursorScreenPoint: vi.fn(),
    getDisplayNearestPoint: vi.fn()
  }
  const mockDesktopCapturer = {
    getSources: vi.fn()
  }
  return {
    screen: mockScreen,
    desktopCapturer: mockDesktopCapturer
  }
})

vi.mock('sharp', () => {
  const mockSharpInstance = {
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: vi.fn()
  }
  const mockSharp = vi.fn(() => mockSharpInstance)
  return {
    default: mockSharp,
    __mockInstance: mockSharpInstance // Expose for assertion/mocking
  }
})

describe('captureLogicalScreenshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('successfully captures screen, resizes, and returns base64 string', async () => {
    const mockCursorPoint = { x: 100, y: 150 }
    const mockDisplay = {
      id: 98765,
      scaleFactor: 2.0,
      size: { width: 1440, height: 900 }
    }
    const mockBuffer = Buffer.from('mock-jpeg-data')

    // Mock screen methods
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue(mockCursorPoint)
    vi.mocked(screen.getDisplayNearestPoint).mockReturnValue(mockDisplay as any)

    // Mock desktopCapturer methods
    const mockSources = [
      {
        display_id: '98765',
        thumbnail: {
          toPNG: vi.fn(() => Buffer.from('mock-png-data'))
        }
      },
      {
        display_id: '12345',
        thumbnail: {
          toPNG: vi.fn(() => Buffer.from('other-png-data'))
        }
      }
    ]
    vi.mocked(desktopCapturer.getSources).mockResolvedValue(mockSources as any)

    // Mock sharp chain
    const sharpMock = await import('sharp')
    const mockSharpInstance = (sharpMock as any).__mockInstance
    mockSharpInstance.toBuffer.mockResolvedValue(mockBuffer)

    const result = await captureLogicalScreenshot()

    expect(screen.getCursorScreenPoint).toHaveBeenCalled()
    expect(screen.getDisplayNearestPoint).toHaveBeenCalledWith(mockCursorPoint)
    expect(desktopCapturer.getSources).toHaveBeenCalledWith({
      types: ['screen'],
      thumbnailSize: {
        width: 2880,
        height: 1800
      }
    })
    expect(sharp).toHaveBeenCalledWith(Buffer.from('mock-png-data'))
    expect(mockSharpInstance.resize).toHaveBeenCalledWith(1440, 900)
    expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 80 })
    expect(result).toBe(mockBuffer.toString('base64'))
  })

  it('returns null if matching display source is not found', async () => {
    const mockCursorPoint = { x: 100, y: 150 }
    const mockDisplay = {
      id: 98765,
      scaleFactor: 2.0,
      size: { width: 1440, height: 900 }
    }

    vi.mocked(screen.getCursorScreenPoint).mockReturnValue(mockCursorPoint)
    vi.mocked(screen.getDisplayNearestPoint).mockReturnValue(mockDisplay as any)

    // None of the sources match display ID 98765
    const mockSources = [
      {
        display_id: '12345',
        thumbnail: {
          toPNG: vi.fn()
        }
      }
    ]
    vi.mocked(desktopCapturer.getSources).mockResolvedValue(mockSources as any)

    const result = await captureLogicalScreenshot()
    expect(result).toBeNull()
  })

  it('returns null and logs error if capture throws an error', async () => {
    vi.mocked(screen.getCursorScreenPoint).mockImplementation(() => {
      throw new Error('Screen access denied')
    })

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await captureLogicalScreenshot()

    expect(result).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalledWith('Screen capture failed:', expect.any(Error))
    consoleErrorSpy.mockRestore()
  })
})

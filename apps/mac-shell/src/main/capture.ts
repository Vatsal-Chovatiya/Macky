import { desktopCapturer, screen, systemPreferences } from 'electron'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

export async function captureLogicalScreenshot(): Promise<string | null> {
  try {
    // Screen Recording permission check (macOS-only app)
    const hasScreenAccess = systemPreferences.getMediaAccessStatus('screen')
    if (hasScreenAccess !== 'granted') {
      console.warn(
        `Screen Recording permission not granted (status: "${hasScreenAccess}"). ` +
          'Please grant it in System Settings > Privacy & Security > Screen Recording, then restart the app.'
      )
      return null
    }

    // Find the display the cursor is currently on
    const cursorPoint = screen.getCursorScreenPoint()
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint)
    const scaleFactor = currentDisplay.scaleFactor // Usually 2.0 on macbooks

    // Capture the screen
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: currentDisplay.size.width * scaleFactor,
        height: currentDisplay.size.height * scaleFactor
      }
    })

    // Find the source that matches our current displayID
    const targetSource = sources.find((s) => s.display_id === currentDisplay.id.toString())
    if (!targetSource) {
      console.warn('No screen source found matching the current display.')
      return null
    }

    const nativeImage = targetSource.thumbnail

    // Guard against empty thumbnails (happens when Screen Recording permission is denied)
    if (nativeImage.isEmpty()) {
      console.warn(
        'Screen capture returned an empty image. ' +
          'This usually means Screen Recording permission has not been granted.'
      )
      return null
    }

    const pngBuffer = nativeImage.toPNG()
    if (!pngBuffer || pngBuffer.length === 0) {
      console.warn('Screen capture produced an empty PNG buffer.')
      return null
    }

    // Save the raw PNG screenshot for testing purposes before compression/downscaling
    try {
      const testCapturesDir = path.join(__dirname, '../../test_captures')
      if (!fs.existsSync(testCapturesDir)) {
        fs.mkdirSync(testCapturesDir, { recursive: true })
      }
      const rawCapturePath = path.join(testCapturesDir, 'raw_capture.png')
      fs.writeFileSync(rawCapturePath, pngBuffer)
      console.log(`[Testing] Raw capture saved to: ${rawCapturePath}`)
    } catch (err) {
      console.error('Failed to save raw screenshot:', err)
    }

    // DOWNSCALE to Logical Coordinates
    // We resize the physical 2880 x 1800 image down to 1440 x 900
    const logicalWidth = currentDisplay.size.width
    const logicalHeight = currentDisplay.size.height

    // Use Sharp package to resize and convert to base64 JPEG
    const resizedBuffer = await sharp(pngBuffer)
      .resize(logicalWidth, logicalHeight)
      .jpeg({ quality: 80 }) // Compress to save API costs
      .toBuffer()

    return resizedBuffer.toString('base64')
  } catch (e) {
    console.error('Screen capture failed:', e)
    return null
  }
}

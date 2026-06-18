import { desktopCapturer, screen } from 'electron'
import sharp from 'sharp'

export async function captureLogicalScreenshot(): Promise<string | null> {
  try {
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
    if (!targetSource) return null

    const nativeImage = targetSource.thumbnail

    // DOWNSCALE to Logical Coordinates
    // We reize the physical 2080 x 1800 image down to 1280 x 800

    const logicalWidth = currentDisplay.size.width
    const logicalHeight = currentDisplay.size.height

    // Use Sharp package to resize and convert to base64 JPEG
    const resizedBuffer = await sharp(nativeImage.toPNG())
      .resize(logicalWidth, logicalHeight)
      .jpeg({ quality: 80 }) // Compress to save API costs
      .toBuffer()

    return resizedBuffer.toString('base64')
  } catch (e) {
    console.error('Screen capture failed:', e)
    return null
  }
}

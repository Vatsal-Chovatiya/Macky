import { desktopCapturer, screen, systemPreferences } from 'electron'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { standardCanvasSize } from './ai/imagesize'

export interface CaptureResult {
  base64: string
  imageWidth: number
  imageHeight: number
  logicalWidth: number
  logicalHeight: number
  cursor: { x: number; y: number } | null
  displayBounds: { x: number; y: number; width: number; height: number }
}

export async function captureLogicalScreenshot(): Promise<CaptureResult | null> {
  try {
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
    // Physical pixel size of the raw capture (for logging only).
    const sourceSize = nativeImage.getSize()
    console.log(
      `[Capture] Physical: ${sourceSize.width}x${sourceSize.height}, Logical: ${currentDisplay.size.width}x${currentDisplay.size.height}, Scale: ${scaleFactor}`
    )

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
    // Captures area without menu bar
    const bounds = currentDisplay.bounds
    const workArea = currentDisplay.workArea

    // The overlay draws in the work area's LOGICAL points; report them so the
    // renderer maps 1:1.
    const logicalWidth = workArea.width
    const logicalHeight = workArea.height

    // Offset of the work area inside the full display (e.g. y = menu-bar height).
    const cropLeft = Math.max(0, Math.round(workArea.x - bounds.x))
    const cropTop = Math.max(0, Math.round(workArea.y - bounds.y))

    // Resize the raw physical screenshot down to the full logical display size,
    // then extract just the work-area region the overlay can actually draw on.
    const resizedRaw = await sharp(pngBuffer)
      .resize(bounds.width, bounds.height)
      .extract({ left: cropLeft, top: cropTop, width: logicalWidth, height: logicalHeight })
      .png()
      .toBuffer()

    let cursorLocal: { x: number; y: number } | null = null
    if (
      cursorPoint.x >= workArea.x &&
      cursorPoint.x <= workArea.x + workArea.width &&
      cursorPoint.y >= workArea.y &&
      cursorPoint.y <= workArea.y + workArea.height
    ) {
      cursorLocal = {
        x: cursorPoint.x - workArea.x,
        y: cursorPoint.y - workArea.y
      }
    }

    // Composite a high-contrast cursor marker onto the image so the Vision LLM
    // can see where the user is pointing. macOS desktopCapturer omits the cursor.
    let withCursor = resizedRaw
    if (cursorLocal) {
      const markerSize = 56
      const half = markerSize / 2
      const cursorSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${markerSize}" height="${markerSize}" viewBox="0 0 ${markerSize} ${markerSize}">
          <circle cx="${half}" cy="${half}" r="22" fill="none" stroke="#ff00ff" stroke-width="4" opacity="0.9"/>
          <circle cx="${half}" cy="${half}" r="10" fill="#ff00ff" stroke="#ffffff" stroke-width="3"/>
          <line x1="${half}" y1="2" x2="${half}" y2="14" stroke="#ff00ff" stroke-width="3"/>
          <line x1="${half}" y1="${markerSize - 2}" x2="${half}" y2="${markerSize - 14}" stroke="#ff00ff" stroke-width="3"/>
          <line x1="2" y1="${half}" x2="14" y2="${half}" stroke="#ff00ff" stroke-width="3"/>
          <line x1="${markerSize - 2}" y1="${half}" x2="${markerSize - 14}" y2="${half}" stroke="#ff00ff" stroke-width="3"/>
        </svg>`
      )

      const left = Math.round(
        Math.max(0, Math.min(logicalWidth - markerSize, cursorLocal.x - half))
      )
      const top = Math.round(
        Math.max(0, Math.min(logicalHeight - markerSize, cursorLocal.y - half))
      )

      withCursor = await sharp(resizedRaw)
        .composite([{ input: cursorSvg, left, top }])
        .png()
        .toBuffer()
    }

    // Converts to 1280 x 800
    const target = standardCanvasSize(logicalWidth, logicalHeight)
    const { data: jpegBuffer, info } = await sharp(withCursor)
      .resize({
        width: target.width,
        height: target.height,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true })
    console.log(
      `[Capture] Standardized canvas sent to model: ${info.width}x${info.height} (from logical ${logicalWidth}x${logicalHeight})`
    )

    // Cursor reported in the image's pixel coordinate space (matching the JPEG
    // the model sees). Scale from logical display coords → image pixel coords
    // taking any letterbox padding into account.
    const scale = Math.min(info.width / logicalWidth, info.height / logicalHeight)
    const activeWidth = logicalWidth * scale
    const activeHeight = logicalHeight * scale
    const padX = (info.width - activeWidth) / 2
    const padY = (info.height - activeHeight) / 2

    const imageCursor = cursorLocal
      ? {
          x: Math.round(cursorLocal.x * scale + padX),
          y: Math.round(cursorLocal.y * scale + padY)
        }
      : null

    return {
      base64: jpegBuffer.toString('base64'),
      imageWidth: info.width,
      imageHeight: info.height,
      logicalWidth,
      logicalHeight,
      cursor: imageCursor,
      // Position the overlay over the WORK AREA (not the full display) so its
      // (0,0) lines up with the cropped image's (0,0) — i.e. just below the menu bar.
      displayBounds: {
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height
      }
    }
  } catch (e) {
    console.error('Screen capture failed:', e)
    return null
  }
}

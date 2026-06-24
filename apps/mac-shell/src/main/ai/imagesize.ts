export const STANDARD_MAX_WIDTH = 1280
export const STANDARD_MAX_HEIGHT = 800

export function standardCanvasSize(
  width: number,
  height: number,
  maxWidth = STANDARD_MAX_WIDTH,
  maxHeight = STANDARD_MAX_HEIGHT
): { width: number; height: number } {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1)
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  }
}

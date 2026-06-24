export interface Point {
  type: 'point'
  x: number
  y: number
  label?: string
}

export interface Shape {
  type: 'rect' | 'circle' | 'arrow' | 'line'
  props: Record<string, string | number | boolean>
  label?: string
}

export type DrawInstruction = Point | Shape

/**
 * Matches tags like:
 *   [POINT: x: 500, y: 300, label: "Submit button"]
 *   [SHAPE: type: rect, x: 10, y: 10, width: 100, height: 50, label: "area"]
 *
 * The 'g' flag ensures we find all occurrences in the text.
 * The 'i' flag makes it case-insensitive.
 */
const TAG_REGEX = /\[(POINT|SHAPE):\s*([^\]]+)\]/gi

/**
 * Parses key-value pairs from a comma-separated string inside a tag.
 * Handles quoted string values and numeric coercion.
 *
 * Example input: 'x: 500, y: 300, label: "Submit button"'
 * Example output: { x: 500, y: 300, label: "Submit button" }
 */
function parseTagContent(contentStr: string): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = {}

  // Split by comma, but be careful with commas inside quotes
  // We use a simple state machine instead of regex to handle nested commas in quoted strings
  const parts: string[] = []
  let current = ''
  let inQuotes = false
  let quoteChar = ''

  for (const char of contentStr) {
    if (!inQuotes && (char === '"' || char === "'")) {
      inQuotes = true
      quoteChar = char
      current += char
    } else if (inQuotes && char === quoteChar) {
      inQuotes = false
      quoteChar = ''
      current += char
    } else if (!inQuotes && char === ',') {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) {
    parts.push(current.trim())
  }

  for (const part of parts) {
    // Split on the first colon only — values may contain colons (e.g., URLs)
    const colonIndex = part.indexOf(':')
    if (colonIndex === -1) continue

    const key = part.slice(0, colonIndex).trim().toLowerCase()
    let value = part.slice(colonIndex + 1).trim()

    if (!key || !value) continue

    // Remove surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      props[key] = value.slice(1, -1)
    } else if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
      props[key] = value.toLowerCase() === 'true'
    } else if (!isNaN(Number(value))) {
      // Coerce to number if it looks like one
      props[key] = Number(value)
    } else {
      props[key] = value
    }
  }

  return props
}

/**
 * Parses an AI response string, extracting drawing instructions and returning
 * clean text suitable for TTS (with all tags stripped out).
 *
 * @returns An object containing:
 *   - `cleanText`: The AI response with all [POINT:...] and [SHAPE:...] tags removed
 *   - `instructions`: An array of parsed DrawInstruction objects
 */
export function parseAIResponse(text: string): {
  cleanText: string
  instructions: DrawInstruction[]
} {
  const instructions: DrawInstruction[] = []

  const cleanText = text.replace(TAG_REGEX, (_match, tagType: string, contentStr: string) => {
    const props = parseTagContent(contentStr)

    if (tagType.toUpperCase() === 'POINT') {
      instructions.push({
        type: 'point',
        x: Number(props.x) || 0,
        y: Number(props.y) || 0,
        label: props.label != null ? String(props.label) : undefined
      })
    } else {
      // SHAPE tag — the 'type' key determines the shape kind
      const shapeType = String(props.type || 'rect') as 'rect' | 'circle' | 'arrow' | 'line'
      instructions.push({
        type: shapeType,
        props,
        label: props.label != null ? String(props.label) : undefined
      })
    }

    // Return empty string to strip the tag from the spoken text
    return ''
  })

  // Collapse multiple consecutive spaces/newlines left behind by tag removal
  const normalized = cleanText
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { cleanText: normalized, instructions }
}

// Coordinate keys grouped by axis and whether they are absolute positions or relative sizes.
const X_POSITION_KEYS = new Set(['x', 'cx', 'x1', 'x2'])
const X_SIZE_KEYS = new Set(['width', 'r'])
const Y_POSITION_KEYS = new Set(['y', 'cy', 'y1', 'y2'])
const Y_SIZE_KEYS = new Set(['height'])

/**
 * Converts instruction coordinates from the screenshot's pixel space into
 * logical overlay pixels. The model returns coordinates in the image's own
 * pixel space (which may be letterboxed). This function removes the padding
 * and scales them back to the logical display dimensions.
 */
export function denormalizeInstructions(
  instructions: DrawInstruction[],
  imageWidth: number,
  imageHeight: number,
  logicalWidth: number,
  logicalHeight: number
): DrawInstruction[] {
  const scale = Math.min(imageWidth / logicalWidth, imageHeight / logicalHeight)
  const activeWidth = logicalWidth * scale
  const activeHeight = logicalHeight * scale
  const padX = (imageWidth - activeWidth) / 2
  const padY = (imageHeight - activeHeight) / 2

  return instructions.map((inst) => {
    if (inst.type === 'point') {
      return {
        ...inst,
        x: Math.round((inst.x - padX) * (logicalWidth / activeWidth)),
        y: Math.round((inst.y - padY) * (logicalHeight / activeHeight))
      }
    }

    const props: Record<string, string | number | boolean> = { ...inst.props }
    for (const key of Object.keys(props)) {
      const value = props[key]
      if (typeof value !== 'number') continue

      if (X_POSITION_KEYS.has(key)) {
        props[key] = Math.round((value - padX) * (logicalWidth / activeWidth))
      } else if (X_SIZE_KEYS.has(key)) {
        props[key] = Math.round(value * (logicalWidth / activeWidth))
      } else if (Y_POSITION_KEYS.has(key)) {
        props[key] = Math.round((value - padY) * (logicalHeight / activeHeight))
      } else if (Y_SIZE_KEYS.has(key)) {
        props[key] = Math.round(value * (logicalHeight / activeHeight))
      }
    }
    return { ...inst, props }
  })
}


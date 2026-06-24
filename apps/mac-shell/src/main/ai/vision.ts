export interface VisionContext {
  imageWidth: number
  imageHeight: number
  cursor: { x: number; y: number } | null
}

// Shared tag schema + opt-in rules used by the vision pass.
// Coordinates are in the screenshot's PIXEL space (not normalized).
const TAG_RULES = `DRAWING TAGS (append at end of the sentence that describes the element, one tag per element):
[POINT: x: <n>, y: <n>, label: "<short label>"]
[SHAPE: type: rect, x: <n>, y: <n>, width: <n>, height: <n>, label: "<label>"]
[SHAPE: type: circle, cx: <n>, cy: <n>, r: <n>, label: "<label>"]
[SHAPE: type: arrow, x1: <n>, y1: <n>, x2: <n>, y2: <n>, label: "<label>"]
[SHAPE: type: line, x1: <n>, y1: <n>, x2: <n>, y2: <n>, dashed: <true|false>, label: "<label>"]

ALL coordinates are INTEGER PIXEL positions in the screenshot's coordinate space.

WHEN TO EMIT A TAG — STRICT OPT-IN:
- Only emit tags when the user explicitly asks to point, highlight, draw, circle, underline, box, mark, trace, or visually annotate something. If the user just asks a question, reply with plain text only — NO tags.
- Maximum 4 tags per response. One element = one tag. Never tag an element the user did not ask about.
- Never add decorative arrows on top of an element you already highlighted.

SHAPE PICKER — pick the SINGLE best shape per element:
- circle: a single digit, character, icon, or short label (≤ ~3 chars). cx/cy = visual center, r = half the larger dimension + ~4 px.
- rect: a multi-word phrase, formula, or rectangular region. Hug the actual edges, no margin beyond ~6 px.
- line: underline/strike, or one edge of a shape when tracing.
- arrow: ONLY when the user says "point from X to Y".
- point: a single attention pulse — use rarely, prefer circle.

ACCURACY: trace the ACTUAL ink. The figure may be hand-drawn, irregular, asymmetric, or tilted — do NOT assume symmetry, flat/horizontal edges, or right angles unless the ink shows it. A vertex is the exact point where two strokes meet; place each endpoint on the visible ink.

OUTER SILHOUETTE ONLY: when tracing a shape, follow its OUTERMOST boundary. IGNORE internal construction marks — altitudes, medians, right-angle squares, hatching, arrows, and labels (digits/letters) inside or beside the shape. A triangle has exactly 3 corners.

A vertex is where two edges INTERSECT — NOT where a stroke overshoots past the corner. Hand-drawn lines often run a little past the corner; clamp the vertex to the intersection point, ignoring any overshoot tail. Do not extend an edge toward a nearby label (e.g. a "5" written beside the shape is not part of it).

SPEECH: conversational and natural for TTS; never read the tag literals aloud. 1–3 sentences unless asked for detail.`

async function callModel(
  systemContent: string,
  userText: string,
  imageBase64: string
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error(' OPENROUTER_API_KEY is missing in .env file')
    return 'Vision API key is not configured.'
  }
  const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1/chat/completions'
  const model = process.env.VISION_IMAGE_MODEL || 'anthropic/claude-3.7-sonnet'

  const payload = {
    model,
    messages: [
      { role: 'system', content: systemContent },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
        ]
      }
    ],
    max_tokens: 1024,
    temperature: 0 // deterministic — this is coordinate extraction, not creative writing
  }

  try {
    console.log(`Sending request to vision model (${model})...`)
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/macky',
        'X-Title': 'Macky'
      },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const errorText = await response.text()
      console.error(` LLM API Error (${response.status}):`, errorText)
      return `Vision API returned an error: ${response.status}`
    }
    const data = await response.json()
    const aiText = data.choices?.[0]?.message?.content || 'I could not analyze the screen.'
    console.log(' LLM Response received.')
    return aiText
  } catch (error) {
    console.error(' Network error calling LLM:', error)
    return 'I encountered a network error analyzing the screen.'
  }
}

/**
 * Single-pass vision: sends the full screenshot and returns the AI response.
 * The model returns pixel coordinates in the screenshot's own coordinate space
 * (e.g. 0–1280 on X for a 1280px-wide image). The caller scales these to the
 * logical display using the image-to-screen ratio.
 */
export async function askVisionLLM(
  prompt: string,
  screenshotBase64: string,
  ctx: VisionContext
): Promise<string> {
  const cursorNote = ctx.cursor
    ? `A magenta crosshair marker is drawn at pixel position (x=${ctx.cursor.x}, y=${ctx.cursor.y}) — that is the user's mouse cursor.`
    : 'No cursor marker is present in the image.'

  const system = `You are a screen-aware AI assistant. Analyze the screenshot and answer concisely.

COORDINATE SYSTEM — PIXEL COORDINATES on a standardized canvas: the screenshot is exactly ${ctx.imageWidth}x${ctx.imageHeight} pixels. The TOP-LEFT corner is [0, 0] and the BOTTOM-RIGHT corner is [${ctx.imageWidth}, ${ctx.imageHeight}]. x grows rightward (0 = left edge → ${ctx.imageWidth} = right edge); y grows downward (0 = top edge → ${ctx.imageHeight} = bottom edge). Every coordinate value in a tag must be an integer pixel position inside these bounds. ${cursorNote}

${TAG_RULES}`

  return callModel(system, prompt, screenshotBase64)
}

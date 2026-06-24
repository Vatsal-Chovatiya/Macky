import { describe, it, expect } from 'vitest'
import { parseAIResponse, denormalizeInstructions } from '../parser'

describe('parseAIResponse', () => {
  it('strips tags from spoken text and extracts instructions', () => {
    const raw = 'Here is the button [POINT: x: 500, y: 300, label: "Submit"] you asked for.'
    const { cleanText, instructions } = parseAIResponse(raw)

    expect(cleanText).toBe('Here is the button you asked for.')
    expect(instructions).toEqual([{ type: 'point', x: 500, y: 300, label: 'Submit' }])
  })

  it('parses shape tags with their props', () => {
    const raw = 'Box it [SHAPE: type: rect, x: 100, y: 200, width: 300, height: 50, label: "area"]'
    const { instructions } = parseAIResponse(raw)

    expect(instructions[0]).toMatchObject({
      type: 'rect',
      props: { type: 'rect', x: 100, y: 200, width: 300, height: 50, label: 'area' }
    })
  })
})

describe('denormalizeInstructions', () => {
  // Image is 1280×800, logical display is 1440×900
  const IMG_W = 1280
  const IMG_H = 800
  const SCR_W = 1440
  const SCR_H = 900

  it('maps a point from image pixel coords to screen pixel coords', () => {
    // Center of image (640, 400) → center of screen (720, 450)
    const [out] = denormalizeInstructions(
      [{ type: 'point', x: 640, y: 400 }],
      IMG_W,
      IMG_H,
      SCR_W,
      SCR_H
    )
    expect(out).toEqual({ type: 'point', x: 720, y: 450 })
  })

  it('scales x-style fields by width ratio and y-style fields by height ratio', () => {
    // rect at (256, 320) with size (640, 160) in image space
    // x: 256/1280*1440 = 288, y: 320/800*900 = 360
    // w: 640/1280*1440 = 720, h: 160/800*900 = 180
    const [out] = denormalizeInstructions(
      [{ type: 'rect', props: { type: 'rect', x: 256, y: 320, width: 640, height: 160 } }],
      IMG_W,
      IMG_H,
      SCR_W,
      SCR_H
    )
    expect(out).toMatchObject({
      type: 'rect',
      props: { x: 288, y: 360, width: 720, height: 180 }
    })
  })

  it('scales circle radius by width ratio and leaves non-numeric props untouched', () => {
    // cx: 1280/1280*1440 = 1440, cy: 0, r: 128/1280*1440 = 144
    const [out] = denormalizeInstructions(
      [{ type: 'circle', props: { type: 'circle', cx: 1280, cy: 0, r: 128, label: 'ten' } }],
      IMG_W,
      IMG_H,
      SCR_W,
      SCR_H
    )
    expect(out).toMatchObject({
      type: 'circle',
      props: { cx: 1440, cy: 0, r: 144, label: 'ten' }
    })
  })

  it('preserves boolean and string props on lines', () => {
    // x1: 0, y1: 0, x2: 1280/1280*1440 = 1440, y2: 800/800*900 = 900
    const [out] = denormalizeInstructions(
      [
        {
          type: 'line',
          props: { type: 'line', x1: 0, y1: 0, x2: 1280, y2: 800, dashed: true, label: 'edge' }
        }
      ],
      IMG_W,
      IMG_H,
      SCR_W,
      SCR_H
    )
    expect(out).toMatchObject({
      type: 'line',
      props: { x1: 0, y1: 0, x2: 1440, y2: 900, dashed: true, label: 'edge' }
    })
  })

  it('handles identity scaling when image and screen are the same size', () => {
    const [out] = denormalizeInstructions([{ type: 'point', x: 500, y: 300 }], 1440, 900, 1440, 900)
    expect(out).toEqual({ type: 'point', x: 500, y: 300 })
  })
})

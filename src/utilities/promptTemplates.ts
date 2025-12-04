import type { PhotoType } from './photoTypeClassifier'

/**
 * Build specific retouch prompt based on photo type
 */
export function buildRetouchPrompt(photoType: PhotoType): string {
  switch (photoType) {
    case 'bedroom':
      return `Subtle professional retouch of the EXISTING hotel bedroom photo.
Keep the original bed, pillows, bedding, furniture, walls, floor, and camera angle EXACTLY the same.
Do NOT add, remove, or move any objects.

Only improve:
- natural lighting and white balance,
- contrast and color balance,
- clarity and sharpness,
- reduce noise and artifacts.

Realistic interior hotel photography, no CGI, no HDR, no over-smoothing.`.trim()

    case 'dining':
      return `Subtle professional retouch of the EXISTING hotel dining or breakfast buffet photo.
Keep the original tables, chairs, tableware, food trays, decorations, walls, and camera angle EXACTLY the same.
Do NOT add, remove, or move any objects.

Only:
- enhance warm and appetizing lighting,
- refine colors of food and table surfaces,
- improve overall clarity and sharpness,
- reduce noise and artifacts.

Realistic restaurant photography, no CGI, no HDR, no over-smoothing.`.trim()

    case 'lobby':
      return `Subtle professional retouch of the EXISTING hotel lobby photo.
Keep the original furniture, reception desk, decorations, floor, walls, and camera angle EXACTLY the same.
Do NOT add, remove, or move any objects.

Only improve natural lighting, contrast, clarity, and reduce noise.
Realistic interior hotel photography, no CGI, no HDR, no over-smoothing.`.trim()

    case 'pool':
      return `Subtle professional retouch of the EXISTING hotel pool photo.
Keep the original pool, deck, chairs, surroundings, and camera angle EXACTLY the same.
Do NOT add, remove, or move any objects.

Only enhance lighting, water clarity, sky and environment colors, and reduce noise.
Realistic outdoor photography, no CGI, no HDR, no over-smoothing.`.trim()

    case 'bathroom':
      return `Subtle professional retouch of the EXISTING hotel bathroom photo.
Keep the original fixtures, tiles, mirror, sink, shower, and camera angle EXACTLY the same.
Do NOT add, remove, or move any objects.

Only improve lighting, color balance, clarity, and reduce noise.
Realistic interior photography, no CGI, no HDR, no over-smoothing.`.trim()

    default:
      return `Subtle professional retouch of the EXISTING hotel or resort photo.
Keep the original layout, objects, decorations, and camera angle EXACTLY the same.
Do NOT add, remove, or move any objects.

Only improve natural lighting, color balance, contrast, clarity, and reduce noise.
Realistic photography, no CGI, no HDR, no over-smoothing.`.trim()
  }
}

/**
 * Standard negative prompt for all photo types
 */
export const NEGATIVE_PROMPT = `do not change layout, do not change furniture or tableware,
no new objects, no new decorations, no people, no text,
no CGI, no cartoon, no painting style, no extreme HDR,
no distortion, no fisheye, no blur, no over-smoothing,
deformed, distorted, disfigured, bad anatomy, wrong anatomy,
extra limbs, missing limbs, mutation, ugly, disgusting,
amputation, watermark, signature, low quality, jpeg artifacts,
duplicate, morbid, mutilated, out of frame, badly drawn,
cloned face, malformed limbs, five-star luxury hotel,
added furniture, removed furniture, changed composition`.trim()

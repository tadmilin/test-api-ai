/**
 * Standard negative prompt for all photo types
 * Used to prevent unwanted changes during enhancement
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

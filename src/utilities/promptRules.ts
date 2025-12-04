/**
 * Prompt Rules and Constraints for Hotel Photo Enhancement
 * Production-ready rules to prevent distortion and hallucination
 */

export const GEOMETRY_RULES = [
  'preserve original scene geometry',
  'preserve stainless steel reflections and physical lighting',
  'preserve all serving equipment shapes',
  'avoid altering pot size, table curves, or buffet layout',
  'maintain original camera angle and perspective',
  'keep all structural elements unchanged',
]

export const FOOD_RULES = [
  'preserve original food shapes and textures',
  'avoid hallucinating new dishes or changing food type',
  'subtly enhance appetizing appearance without changing food identity',
  'maintain authentic food colors and natural presentation',
  'avoid plastic-like shine or unrealistic smoothing on food',
  'do not add, remove, or modify dishes',
]

export const AMBIENT_RULES = {
  empty_scene: 'add subtle props (candles, small vases, glasses) to fill empty spaces naturally',
  modern_minimal: 'add only soft lighting, avoid clutter, keep minimalist aesthetic',
  buffet_scene: 'allow small ambient props, but do not modify dishes or serving equipment',
  dining_hall: 'enhance table setup but preserve original layout and furniture placement',
  lobby_room: 'add soft shadows and décor only if stylistically consistent with existing design',
}

export const REALISM_RULES = [
  'enhance lighting naturally with soft warm hotel tones',
  'improve depth, clarity, contrast, and reflections realistically',
  'avoid over-saturation or excessive post-processing effects',
  'maintain natural material properties (metal, wood, fabric, glass)',
  'ensure all shadows and reflections are physically accurate',
]

export const NEGATIVE_ENHANCEMENT = [
  'distorted geometry',
  'warped metal',
  'melted shapes',
  'AI artifacts',
  'fake reflections',
  'invented objects',
  'unrealistic lighting',
  'over-saturation',
  'excessive gloss',
  'over-sharpening',
  'wrong food textures',
  'changed dishes',
  'hallucinated props',
  'plastic-looking surfaces',
  'impossible reflections',
  'morphed furniture',
].join(', ')

/**
 * Build dynamic ambience instruction based on scene analysis
 */
export function getAmbienceInstruction(
  photoType: string,
  issues: string[],
  sceneEmpty?: boolean
): string {
  // Determine scene context
  if (sceneEmpty || issues.some(i => i.toLowerCase().includes('empty'))) {
    return AMBIENT_RULES.empty_scene
  }
  
  if (photoType.includes('buffet') || photoType.includes('food_closeup')) {
    return AMBIENT_RULES.buffet_scene
  }
  
  if (photoType.includes('dining')) {
    return AMBIENT_RULES.dining_hall
  }
  
  if (photoType.includes('lobby') || photoType.includes('bedroom')) {
    return AMBIENT_RULES.lobby_room
  }
  
  if (photoType.includes('modern') || issues.some(i => i.toLowerCase().includes('minimal'))) {
    return AMBIENT_RULES.modern_minimal
  }
  
  return AMBIENT_RULES.lobby_room // default
}

/**
 * Build comprehensive constraint text for GPT
 */
export function buildConstraintsText(): string {
  return `
CRITICAL CONSTRAINTS to prevent distortion:
${GEOMETRY_RULES.map(r => `- ${r}`).join('\n')}

FOOD PRESERVATION RULES:
${FOOD_RULES.map(r => `- ${r}`).join('\n')}

REALISM RULES:
${REALISM_RULES.map(r => `- ${r}`).join('\n')}
`.trim()
}

/**
 * Get full negative prompt for SDXL
 */
export function getFullNegativePrompt(baseNegative: string): string {
  return `${baseNegative}, ${NEGATIVE_ENHANCEMENT}`
}

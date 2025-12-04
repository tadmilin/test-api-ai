/**
 * Prompt Rules and Constraints for Hotel Photo Enhancement
 * Production-ready rules to prevent distortion and hallucination
 */

// 1) GEOMETRY_RULES - ป้องกัน AI ทำให้โต๊ะ, ถาดอาหาร, หม้อ, reflection เพี้ยน
export const GEOMETRY_RULES = `
Preserve all geometric structures: buffet tables, serving trays, chafing dishes,
metal reflections, lighting angles, furniture edges, walls, and room perspective.
Do not bend, warp, melt, stretch, or reshape any objects.
Do not alter reflections or metallic surfaces.
`

// 2) FOOD_RULES - ป้องกันอาหารเพี้ยน, สีเปลี่ยน, เพิ่มเมนูใหม่
export const FOOD_RULES = `
Preserve food identity, ingredients, arrangement, shapes, texture, color tone.
Do not invent new dishes. Do not replace curry or soup color.
Do not modify food geometry. Do not change portion size.
Enhance only clarity, vibrancy, appetizing appeal.
`

// 3) REALISM_RULES - ตกแต่งแบบธรรมชาติ ห้ามเกินจริง
export const REALISM_RULES = `
Maintain natural realism. No fantasy lighting.
No artificial glow. No repainting of materials.
Retain all real-world textures and physical accuracy.
`

// 4) AMBIENT_RULES + Helper Function - เลือก ambience ตามภาพนั้น
export const AMBIENT_RULES: Record<string, string> = {
  buffet: "Subtle dining ambience. Add mild reflections, warm light, NO food changes.",
  dining: "Slight table decor allowed: small vase, napkins, subtle lighting.",
  empty: "Add soft ambience only. No major props.",
  room: "Enhance window light, fabric, wood tone. No layout changes.",
}

export function getAmbienceInstruction(type: string): string {
  return AMBIENT_RULES[type] || ""
}

// 5) NEGATIVE_ENHANCEMENT - ลดความเสี่ยงภาพเละโดยเฉพาะอาหาร + โลหะ
export const NEGATIVE_ENHANCEMENT = `
distorted geometry, warped metal, melted reflections, fake dishes,
invented objects, low-resolution texture, blurry edges, AI artifacts,
plastic-looking food, unnatural shine, incorrect shadows,
incorrect perspective, duplicated items, floating objects
`

// 6) ฟังก์ชันรวม Negative Prompt
export function getFullNegativePrompt(base: string): string {
  return `${base}, ${NEGATIVE_ENHANCEMENT}`
}

/**
 * Build comprehensive constraint text for GPT
 */
export function buildConstraintsText(): string {
  return `
CRITICAL CONSTRAINTS to prevent distortion:
${GEOMETRY_RULES.trim()}

FOOD PRESERVATION RULES:
${FOOD_RULES.trim()}

REALISM RULES:
${REALISM_RULES.trim()}
`.trim()
}

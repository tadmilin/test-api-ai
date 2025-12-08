export type TemplateType = 'single' | 'dual' | 'triple' | 'quad'
export type TemplateStyle = 'minimal' | 'classic' | 'graphic'

interface TemplatePromptConfig {
  [key: string]: {
    [key in TemplateType]: string
  }
}

export const templatePrompts: TemplatePromptConfig = {
  minimal: {
    single: `เอารูปนี้มาทำคอลลาจโฆษณารีสอร์ต/โรงแรม
สไตล์ Canva photo collage แบบ scrapbook เหมือนรูปโพลารอยด์ติดเทปกาว
ใช้พื้นหลังสีครีมกับฟ้าอ่อน เนื้อกระดาษนิด ๆ
ให้รูปทั้งสามใบเหมือนรูปโพลารอยด์ มีขอบขาว และหมุนเอียงคนละมุม
เพิ่มลูกเล่นพวกเทปกาว กระดาษแปะ รูปทรงกระดาษเหลี่ยม ๆ และจุดฮาล์ฟโทนเล็กน้อย
(ถ้าอยากได้ดอกไม้เล็ก ๆ มุมนิดหน่อยก็ได้)
ให้เห็นทั้งสามรูปชัดเจน ใช้รูปแต่ละใบแค่ 1 ครั้ง
ห้ามใส่ตัวหนังสือ โลโก้ หรือไอคอนสไตล์ scrapbook กระดาษฉีก มีพื้นผิวผ้าลินินและลายเส้น doodle เบา ๆ ดูอบอุ่นเป็นกันเอง`,

    dual: `เอารูป 2 รูปนี้มาทำคอลลาจโฆษณารีสอร์ต/โรงแรม
สไตล์ Canva photo collage แบบ scrapbook เหมือนรูปโพลารอยด์ติดเทปกาว
ใช้พื้นหลังสีครีมกับฟ้าอ่อน เนื้อกระดาษนิด ๆ
ให้รูปทั้งสามใบเหมือนรูปโพลารอยด์ มีขอบขาว และหมุนเอียงคนละมุม
เพิ่มลูกเล่นพวกเทปกาว กระดาษแปะ รูปทรงกระดาษเหลี่ยม ๆ และจุดฮาล์ฟโทนเล็กน้อย
(ถ้าอยากได้ดอกไม้เล็ก ๆ มุมนิดหน่อยก็ได้)
ให้เห็นทั้งสามรูปชัดเจน ใช้รูปแต่ละใบแค่ 1 ครั้ง
ห้ามใส่ตัวหนังสือ โลโก้ หรือไอคอนสไตล์ scrapbook กระดาษฉีก มีพื้นผิวผ้าลินินและลายเส้น doodle เบา ๆ ดูอบอุ่นเป็นกันเอง`,

    triple: `เอารูป 3 รูปนี้มาทำคอลลาจโฆษณารีสอร์ต/โรงแรม
สไตล์ Canva photo collage แบบ scrapbook เหมือนรูปโพลารอยด์ติดเทปกาว
ใช้พื้นหลังสีครีมกับฟ้าอ่อน เนื้อกระดาษนิด ๆ
ให้รูปทั้งสามใบเหมือนรูปโพลารอยด์ มีขอบขาว และหมุนเอียงคนละมุม
เพิ่มลูกเล่นพวกเทปกาว กระดาษแปะ รูปทรงกระดาษเหลี่ยม ๆ และจุดฮาล์ฟโทนเล็กน้อย
(ถ้าอยากได้ดอกไม้เล็ก ๆ มุมนิดหน่อยก็ได้)
ให้เห็นทั้งสามรูปชัดเจน ใช้รูปแต่ละใบแค่ 1 ครั้ง
ห้ามใส่ตัวหนังสือ โลโก้ หรือไอคอนสไตล์ scrapbook กระดาษฉีก มีพื้นผิวผ้าลินินและลายเส้น doodle เบา ๆ ดูอบอุ่นเป็นกันเอง`,

    quad: `เอารูป 4 รูปนี้มาทำคอลลาจโฆษณารีสอร์ต/โรงแรม
สไตล์ Canva photo collage แบบ scrapbook เหมือนรูปโพลารอยด์ติดเทปกาว
ใช้พื้นหลังสีครีมกับฟ้าอ่อน เนื้อกระดาษนิด ๆ
ให้รูปทั้งสามใบเหมือนรูปโพลารอยด์ มีขอบขาว และหมุนเอียงคนละมุม
เพิ่มลูกเล่นพวกเทปกาว กระดาษแปะ รูปทรงกระดาษเหลี่ยม ๆ และจุดฮาล์ฟโทนเล็กน้อย
(ถ้าอยากได้ดอกไม้เล็ก ๆ มุมนิดหน่อยก็ได้)
ให้เห็นทั้งสามรูปชัดเจน ใช้รูปแต่ละใบแค่ 1 ครั้ง
ห้ามใส่ตัวหนังสือ โลโก้ หรือไอคอนสไตล์ scrapbook กระดาษฉีก มีพื้นผิวผ้าลินินและลายเส้น doodle เบา ๆ ดูอบอุ่นเป็นกันเอง`,
  },

  classic: {
    single: `Create a luxury hotel advertisement template with 1 photo:

Layout:
- 1 large photo centered with elegant frame
- Light beige background with subtle marble texture (#f5f1ea)
- Gold thin frame around photo (3px, #d4af37)
- Small decorative gold corner elements (< 5% of area)
- 30px padding on all sides
- NO text, NO words, NO letters
- Classic, elegant, sophisticated style

Requirements:
- Photo must be main focus (> 85% of area)
- Gold accents only at corners
- Maintain photo quality
- Luxury hotel advertisement aesthetic
- NO overlapping elements`,

    dual: `Create a luxury hotel advertisement template with 2 photos:

Layout:
- 2 photos with elegant arrangement (60/40 split)
- Light beige background with subtle marble texture
- Gold thin frames around each photo (3px, #d4af37)
- Decorative gold line separating photos
- Small gold corner accents
- 30px padding
- NO text, NO words, NO letters
- Classic, elegant, sophisticated style

Requirements:
- Photos must NOT overlap
- Gold accents < 10% of total area
- Maintain photo quality
- Luxury hotel advertisement aesthetic`,

    triple: `Create a luxury hotel advertisement template with 3 photos:

Layout:
- 3 photos in elegant arrangement (1 large, 2 smaller)
- Light beige background with subtle marble texture (#f5f1ea)
- Gold thin frames around each photo (3px, #d4af37)
- Decorative corner elements with gold accents
- Elegant dividing lines between photos
- 30px outer padding, 15px between photos
- NO text, NO words, NO letters
- Classic, elegant, sophisticated style

Requirements:
- Photos must NOT overlap
- Gold decorative elements < 15% of area
- Keep photos as main focus (> 75%)
- Maintain photo quality
- Luxury hotel advertisement aesthetic
- Symmetrical and balanced composition`,

    quad: `Create a luxury hotel advertisement template with 4 photos:

Layout:
- 4 photos in elegant grid with ornamental border
- Light beige background with marble texture
- Gold frames around each photo (3px, #d4af37)
- Ornamental gold border on outer edge
- Small decorative gold elements at intersections
- 30px padding, 15px gaps
- NO text, NO words, NO letters
- Classic, elegant, sophisticated style

Requirements:
- Perfect symmetrical grid
- Photos must NOT overlap
- Gold decorations < 15% of area
- Luxury hotel advertisement aesthetic`,
  },

  graphic: {
    single: `Create a creative hotel advertisement template with 1 photo:

Layout:
- 1 large photo with artistic framing
- Soft pastel background with abstract geometric shapes (circles, triangles)
- Botanical elements (tropical leaves) at one or two corners
- Modern creative border with subtle color accents
- 25px padding
- NO text, NO words, NO letters
- Modern, creative, artistic style suitable for social media

Requirements:
- Photo must be main focus (> 80% of area)
- Decorative elements < 20% of total area
- Botanical elements only at corners (not covering photo)
- Keep photo sharp and clear
- Creative but professional look
- Hotel advertisement suitable for Instagram/Facebook`,

    dual: `Create a creative hotel advertisement template with 2 photos:

Layout:
- 2 photos in dynamic arrangement
- Soft pastel background (#f8f6f3) with geometric shapes (circles, abstract forms)
- Botanical elements (leaves) decorating corners and edges
- Creative borders with color accents (soft blue, green, gold)
- 25px padding, 15px gap between photos
- NO text, NO words, NO letters
- Modern, creative, artistic style

Requirements:
- Photos must NOT overlap
- Decorative elements < 25% of total area
- Botanical elements should complement, not cover photos
- Keep photos as main focus (> 70%)
- Creative but professional look
- Suitable for social media advertisement`,

    triple: `Create a creative hotel advertisement template with 3 photos:

Layout:
- 3 photos in dynamic artistic arrangement
- Soft pastel background with geometric shapes (circles, triangles, abstract forms)
- Botanical elements (tropical leaves, minimal florals) at corners
- Creative borders with soft color accents (pastel blue, sage green, gold)
- Organic flowing lines connecting elements
- 25px outer padding, 15px between photos
- NO text, NO words, NO letters
- Modern, creative, artistic style suitable for social media

Requirements:
- Photos must NOT overlap with each other
- Decorative elements < 30% of total area
- Botanical elements only at corners and edges
- Keep photos as main focus (> 65%)
- Creative composition but still professional
- Hotel advertisement suitable for Instagram/Facebook
- Natural, organic aesthetic`,

    quad: `Create a creative hotel advertisement template with 4 photos:

Layout:
- 4 photos in creative grid arrangement
- Soft pastel background with abstract shapes and patterns
- Botanical elements (leaves, organic forms) decorating
- Creative borders with color gradients
- Geometric accents (circles, lines) between photos
- 25px padding, 15px gaps
- NO text, NO words, NO letters
- Modern, creative, artistic style

Requirements:
- Photos arranged in interesting composition
- Photos must NOT overlap
- Decorative elements < 30% of area
- Photos remain main focus (> 65%)
- Creative but professional for hotel advertisement
- Suitable for social media platforms`,
  },
}

// Helper function to get prompt
export function getTemplatePrompt(
  style: TemplateStyle,
  type: TemplateType,
  imageUrls: string[]
): string {
  const basePrompt = templatePrompts[style][type]
  
  // Add image-specific instructions
  const imageInstructions = `

Images to arrange:
${imageUrls.map((url, i) => `- Image ${i + 1}: ${url}`).join('\n')}

CRITICAL REQUIREMENTS:
- Arrange exactly ${imageUrls.length} ${imageUrls.length === 1 ? 'image' : 'images'} from above
- Each photo must be clearly visible and sharp
- NO text overlays, NO words, NO letters anywhere
- Maintain professional hotel/resort aesthetic
- Photos must NOT overlap or cover each other
- Keep original photo quality and colors
- Decorative elements must NOT obscure photos`

  return basePrompt + imageInstructions
}

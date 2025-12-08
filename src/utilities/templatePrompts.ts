export type TemplateType = 'single' | 'dual' | 'triple' | 'quad'

export const templatePrompts: Record<TemplateType, string> = {
  single: `เอารูปนี้มาทำคอลลาจโฆษณารีสอร์ต/โรงแรม
สไตล์ Canva photo collage แบบ scrapbook เหมือนรูปโพลารอยด์ติดเทปกาว
ใช้พื้นหลังสีครีมกับฟ้าอ่อน เนื้อกระดาษนิด ๆ
ให้รูปเหมือนรูปโพลารอยด์ มีขอบขาว และหมุนเอียงตามสไตล์
เพิ่มลูกเล่นพวกเทปกาว กระดาษแปะ รูปทรงกระดาษเหลี่ยม ๆ และจุดฮาล์ฟโทนเล็กน้อย
(ถ้าอยากได้ดอกไม้เล็ก ๆ มุมนิดหน่อยก็ได้)
ให้เห็นรูปชัดเจน ใช้รูปแต่ละใบแค่ 1 ครั้ง
ห้ามใส่ตัวหนังสือ โลโก้ หรือไอคอน
สไตล์ scrapbook กระดาษฉีก มีพื้นผิวผ้าลินินและลายเส้น doodle เบา ๆ ดูอบอุ่นเป็นกันเอง`,

  dual: `เอารูป 2 รูปนี้มาทำคอลลาจโฆษณารีสอร์ต/โรงแรม
สไตล์ Canva photo collage แบบ scrapbook เหมือนรูปโพลารอยด์ติดเทปกาว
ใช้พื้นหลังสีครีมกับฟ้าอ่อน เนื้อกระดาษนิด ๆ
ให้รูปทั้งสองใบเหมือนรูปโพลารอยด์ มีขอบขาว และหมุนเอียงคนละมุม
เพิ่มลูกเล่นพวกเทปกาว กระดาษแปะ รูปทรงกระดาษเหลี่ยม ๆ และจุดฮาล์ฟโทนเล็กน้อย
(ถ้าอยากได้ดอกไม้เล็ก ๆ มุมนิดหน่อยก็ได้)
ให้เห็นทั้งสองรูปชัดเจน ใช้รูปแต่ละใบแค่ 1 ครั้ง
ห้ามใส่ตัวหนังสือ โลโก้ หรือไอคอน
สไตล์ scrapbook กระดาษฉีก มีพื้นผิวผ้าลินินและลายเส้น doodle เบา ๆ ดูอบอุ่นเป็นกันเอง`,

  triple: `เอารูป 3 รูปนี้มาทำคอลลาจโฆษณารีสอร์ต/โรงแรม
สไตล์ Canva photo collage แบบ scrapbook เหมือนรูปโพลารอยด์ติดเทปกาว
ใช้พื้นหลังสีครีมกับฟ้าอ่อน เนื้อกระดาษนิด ๆ
ให้รูปทั้งสามใบเหมือนรูปโพลารอยด์ มีขอบขาว และหมุนเอียงคนละมุม
เพิ่มลูกเล่นพวกเทปกาว กระดาษแปะ รูปทรงกระดาษเหลี่ยม ๆ และจุดฮาล์ฟโทนเล็กน้อย
(ถ้าอยากได้ดอกไม้เล็ก ๆ มุมนิดหน่อยก็ได้)
ให้เห็นทั้งสามรูปชัดเจน ใช้รูปแต่ละใบแค่ 1 ครั้ง
ห้ามใส่ตัวหนังสือ โลโก้ หรือไอคอน
สไตล์ scrapbook กระดาษฉีก มีพื้นผิวผ้าลินินและลายเส้น doodle เบา ๆ ดูอบอุ่นเป็นกันเอง`,

  quad: `เอารูป 4 รูปนี้มาทำคอลลาจโฆษณารีสอร์ต/โรงแรม
สไตล์ Canva photo collage แบบ scrapbook เหมือนรูปโพลารอยด์ติดเทปกาว
ใช้พื้นหลังสีครีมกับฟ้าอ่อน เนื้อกระดาษนิด ๆ
ให้รูปทั้งสี่ใบเหมือนรูปโพลารอยด์ มีขอบขาว และหมุนเอียงคนละมุม
เพิ่มลูกเล่นพวกเทปกาว กระดาษแปะ รูปทรงกระดาษเหลี่ยม ๆ และจุดฮาล์ฟโทนเล็กน้อย
(ถ้าอยากได้ดอกไม้เล็ก ๆ มุมนิดหน่อยก็ได้)
ให้เห็นทั้งสี่รูปชัดเจน ใช้รูปแต่ละใบแค่ 1 ครั้ง
ห้ามใส่ตัวหนังสือ โลโก้ หรือไอคอน
สไตล์ scrapbook กระดาษฉีก มีพื้นผิวผ้าลินินและลายเส้น doodle เบา ๆ ดูอบอุ่นเป็นกันเอง`,
}

// Helper function to get prompt
export function getTemplatePrompt(
  type: TemplateType,
  imageUrls: string[]
): string {
  const basePrompt = templatePrompts[type]
  
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

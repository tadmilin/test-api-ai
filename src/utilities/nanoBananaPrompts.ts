/**
 * Nano-Banana Simple Template Prompts
 * Based on successful test: "เหมือนต้นฉบับแต่ดีกว่ามาก"
 */

export type PhotoType = 
  | 'buffet'
  | 'food_closeup'
  | 'bedroom'
  | 'bathroom'
  | 'lobby'
  | 'entrance'
  | 'building_exterior'
  | 'dining_room'
  | 'pool'
  | 'gym'
  | 'spa'
  | 'meeting_room'
  | 'corridor'
  | 'balcony'
  | 'nature_garden'
  | 'beach_resort'
  | 'mountain_resort'
  | 'jungle_resort'
  | 'generic'

/**
 * Array of all valid photo types - use this for validation
 */
export const VALID_PHOTO_TYPES: readonly PhotoType[] = [
  'buffet',
  'food_closeup',
  'bedroom',
  'bathroom',
  'lobby',
  'entrance',
  'building_exterior',
  'dining_room',
  'pool',
  'gym',
  'spa',
  'meeting_room',
  'corridor',
  'balcony',
  'nature_garden',
  'beach_resort',
  'mountain_resort',
  'jungle_resort',
  'generic'
] as const

/**
 * Simple template prompts optimized for Nano-Banana
 * คำสั่งแบบสนทนาธรรมชาติ ไม่ใช่ technical diffusion prompts
 */
export const NANO_BANANA_PROMPTS: Record<PhotoType, string> = {
  buffet: `ตกแต่งให้ภาพบุฟเฟ่ต์นี้ดูดีขึ้น ไม่เปลี่ยนอาหารแต่ปรับแต่งให้ดูน่ากินมากขึ้น ไม่ใส่ของอย่างอื่นในภาพ ยึดองค์ประกอบเดิมทั้งหมดไม่กลับด้านไม่เปลี่ยนแปลงภาพจนมากเกินไป เน้นความสะอาด เพิ่มความสว่างแบบสมจริงธรรมชาติแต่ไม่ปรับสีแสงเดิมในภาพ`,

  food_closeup: `ปรับแต่งภาพอาหารนี้ให้ดูดีขึ้นน่ารับประทานมากขึ้น เพิ่มความสดใหม่และสีสันที่สดใส แต่เป็นธรรมชาติ ปรับปรุงอาหารเดิมให้ดูดีน่ากิน ชัดเจน เน้นความสมจริง ยึดจานและการจัดวางเดิมไม่ใส่วัตถุอื่นในภาพ เน้นให้ดูเป็นอาหารไทยคุณภาพสูงคุณภาพโรงแรมระดับ3-4ดาว`,

  dining_room: `แต่งภาพห้องอาหารนี้ให้ดูดีขึ้น ดูน่าใช้บริการ เพิ่มความสว่างแบบสมจริงธรรมชาติแต่ไม่ปรับสีแสงเดิมในภาพและบรรยากาศที่น่าประทับใจ ไม่ใส่ของอย่างอื่นในภาพ ยึดองค์ประกอบเดิมทั้งหมดไม่กลับด้าน ไม่เปลี่ยนแปลงภาพจนเกินไป ให้ดูสมจริงและเป็นธรรมชาติ`,

  bedroom: `ช่วยปรับภาพนี้ให้ดูสว่าง คมชัด และเรียบร้อยในสไตล์ห้องพักโรงแรมระดับ 3–4 ดาว โดยสามารถปรับรายละเอียดเล็กน้อยของวัตถุที่ดูไม่เรียบร้อยได้รวมถึงการเก็บรายละเอียดของพื้นผิวผ้าให้ดูเนียน เรียบ และเป็นธรรมชาติแบบห้องพักโรงแรม เพื่อให้ภาพโดยรวมดูเป็นธรรมชาติ สมจริง และพร้อมใช้งาน โดยยังคงโครงสร้างห้อง โทนสีเดิม และตำแหน่งหลักของเฟอร์นิเจอร์ไว้เช่นเดิม`,

  bathroom: `ปรับปรุงภาพห้องน้ำนี้ให้ดูสะอาด สดใส และทันสมัย แบบโรงแรมโมเดิร์น 3-4 ดาวราคาสูง เพิ่มความเงางามของกระจกและเซรามิก ไม่ใส่วัตถุอื่นในภาพ แต่เก็บตำแหน่งสุขภัณฑ์และอุปกรณ์เดิม ไม่เปลี่ยนโครงสร้าง ไม่เปลี่ยนแปลงต้นฉบับจนเวอร์เกินไป ให้ดูสะอาดและน่าใช้งานเป็นห้องน้ำเท่านั้น`,

  lobby: `แต่งภาพล็อบบี้นี้ให้ดูโปร่ง สว่าง สะอาด และเป็นมิตร แบบล็อบบี้โรงแรมโมเดิร์น 3-4 ดาวราคาสูง เพิ่มบรรยากาศต้อนรับ แต่ยึดตำแหน่งเฟอร์นิเจอร์และของตกแต่งเดิม ไม่เปลี่ยนโครงสร้าง ไม่เติมอาหารหรือของกินลงไป ให้ดูเป็นธรรมชาติเป็นล็อบบี้เท่านั้น`,

  entrance: `ปรับภาพทางเข้านี้ให้ดูน่าประทับใจ สะอาด และเชิญชวน แบบทางเข้าโรงแรมโมเดิร์น 3-4 ดาวราคาสูง เพิ่มความสว่างและบรรยากาศต้อนรับ แต่เก็บโครงสร้างและการออกแบบเดิมทั้งหมด ให้ดูเป็นธรรมชาติ`,

  building_exterior: `ตกแต่งภาพภายนอกอาคารรีสอร์ท/โรงแรมนี้ให้บรรยากาศดูดีขึ้นจนน่าประทับใจ ดูสะอาด และหรูหรา ปรับให้คมชัดและเพิ่มความสว่างแบบสมจริงธรรมชาติ แต่ยึดสถาปัตยกรรมและโครงสร้างเดิมทั้งหมด ให้ดูเป็นธรรมชาติสมจริง ไม่เติมวัตถุสิ่งของอื่นในภาพ`,

  pool: `ปรับปรุงภาพสระว่ายน้ำนี้ให้ดูใส สะอาด เย็นสบาย และเชิญชวน แบบสระว่ายน้ำรีสอร์ทไทยดี เพิ่มความสดใสของน้ำและบรรยากาศพักผ่อน แต่เก็บรูปทรงสระและของตกแต่งเดิม ให้ดูเป็นธรรมชาติ`,

  gym: `แต่งภาพฟิตเนสนี้ให้ดูสะอาด ทันสมัย และพร้อมใช้งาน แบบฟิตเนสโรงแรมไทยโมเดิร์น 3-4 ดาวราคาสูง เพิ่มความสว่างและบรรยากาศกระปรี้กระเปร่า แต่เก็บตำแหน่งเครื่องออกกำลังกายและอุปกรณ์เดิม ไม่เปลี่ยนโครงสร้าง`,

  spa: `ปรับแต่งภาพสปานี้ให้ดูผ่อนคลาย สงบ และหรูหรา แบบสปาโรงแรมไทยโมเดิร์น 3-4 ดาวราคาสูง เพิ่มบรรยากาศสบายและอบอุ่น แต่ยึดตำแหน่งเฟอร์นิเจอร์และของตกแต่งเดิม ให้ดูเป็นธรรมชาติและเชิญชวน`,

  meeting_room: `แต่งภาพห้องประชุมนี้ให้ดูทันสมัย เป็นมืออาชีพ และพร้อมใช้งาน แบบห้องประชุมโรงแรมไทยโมเดิร์น 3-4 ดาวราคาสูง เพิ่มความสว่างและบรรยากาศมั่นใจ แต่เก็บตำแหน่งโต๊ะ เก้าอี้ และอุปกรณ์เดิม ไม่เปลี่ยนโครงสร้าง`,

  corridor: `ปรับปรุงภาพทางเดินนี้ให้ดูสะอาด สว่าง และเป็นระเบียบ แบบทางเดินโรงแรมไทยโมเดิร์น 3-4 ดาวราคาสูง เพิ่มความสว่างธรรมชาติและบรรยากาศอบอุ่น แต่เก็บโครงสร้างและของตกแต่งเดิมทั้งหมด ให้ดูเป็นธรรมชาติ`,

  balcony: `แต่งภาพระเบียงนี้ให้ดูน่าพักผ่อน สบาย และมีวิวสวยงาม แบบระเบียงโรงแรมหรือรีสอร์ทไทยดี เพิ่มบรรยากาศผ่อนคลาย แต่ยึดตำแหน่งเฟอร์นิเจอร์และมุมมองเดิม ไม่เปลี่ยนโครงสร้าง`,

  nature_garden: `ปรับแต่งภาพสวนหรือธรรมชาตินี้ให้ดูสดชื่น เขียวขจี และเชิญชวน แบบสวนรีสอร์ทไทยคุณภาพดี เพิ่มความสดใสของต้นไม้และบรรยากาศธรรมชาติ แต่เก็บการจัดสวนและโครงสร้างเดิม ให้ดูเป็นธรรมชาติ`,

  beach_resort: `แต่งภาพชายหาดหรือรีสอร์ทริมทะเลนี้ให้ดูสดใส เย็นสบาย และเชิญชวน แบบรีสอร์ทชายหาดไทยคุณภาพดี เพิ่มความสวยงามของท้องฟ้าและทะเล แต่เก็บโครงสร้างและมุมมองเดิม ให้ดูเป็นธรรมชาติ`,

  mountain_resort: `ปรับปรุงภาพรีสอร์ทภูเขานี้ให้ดูสดชื่น เย็นสบาย และน่าพักผ่อน แบบรีสอร์ทภูเขาไทยคุณภาพดี เพิ่มบรรยากาศธรรมชาติและความสงบ แต่ยึดโครงสร้างและมุมมองเดิม ให้ดูเป็นธรรมชาติ`,

  jungle_resort: `แต่งภาพรีสอร์ทในป่าหรือธรรมชาตินี้ให้ดูเขียวขจี สงบ และน่าพักผ่อน แบบรีสอร์ทในป่าไทยคุณภาพดี เพิ่มความสดชื่นของธรรมชาติและบรรยากาศผ่อนคลาย แต่เก็บโครงสร้างและมุมมองเดิม ให้ดูเป็นธรรมชาติ`,

  generic: `ปรับปรุงภาพนี้ให้ดูดีขึ้น หรูหราขึ้นแบบโรงแรมหรือรีสอร์ทไทยคุณภาพดี เพิ่มความสว่างและสีสันที่สวยงาม แต่สมจริง ยึดองค์ประกอบเดิมทั้งหมด ไม่เปลี่ยนโครงสร้าง ให้ดูเป็นธรรมชาติและน่าประทับใจ`,
}

/**
 * Get Nano-Banana prompt template for photo type
 */
export function getNanoBananaPrompt(photoType: string): string {
  const normalizedType = photoType.toLowerCase().trim() as PhotoType
  return NANO_BANANA_PROMPTS[normalizedType] || NANO_BANANA_PROMPTS.generic
}

/**
 * Detect photo type from simple text analysis (fallback if no Sheet data)
 */
export function detectPhotoTypeSimple(filename: string = '', description: string = ''): PhotoType {
  const text = (filename + ' ' + description).toLowerCase()
  
  if (text.includes('buffet') || text.includes('บุฟเฟ่') || text.includes('บุฟเฟต์')) return 'buffet'
  if (text.includes('food') || text.includes('อาหาร') || text.includes('เมนู')) return 'food_closeup'
  if (text.includes('dining') || text.includes('ห้องอาหาร') || text.includes('ร้านอาหาร')) return 'dining_room'
  // Check bedroom/ห้องพัก BEFORE bathroom to avoid false matches
  if (text.includes('bedroom') || text.includes('ห้องนอน') || text.includes('ห้องพัก')) return 'bedroom'
  if (text.includes('bathroom') || text.includes('ห้องน้ำ')) return 'bathroom'
  if (text.includes('lobby') || text.includes('ล็อบบี้') || text.includes('ล็อบบี')) return 'lobby'
  if (text.includes('entrance') || text.includes('ทางเข้า')) return 'entrance'
  if (text.includes('exterior') || text.includes('ภายนอก') || text.includes('อาคาร')) return 'building_exterior'
  if (text.includes('pool') || text.includes('สระ')) return 'pool'
  if (text.includes('gym') || text.includes('ฟิตเนส')) return 'gym'
  if (text.includes('spa') || text.includes('สปา')) return 'spa'
  if (text.includes('meeting') || text.includes('ห้องประชุม')) return 'meeting_room'
  if (text.includes('corridor') || text.includes('ทางเดิน')) return 'corridor'
  if (text.includes('balcony') || text.includes('ระเบียง')) return 'balcony'
  if (text.includes('garden') || text.includes('สวน')) return 'nature_garden'
  if (text.includes('beach') || text.includes('ชายหาด') || text.includes('ทะเล')) return 'beach_resort'
  if (text.includes('mountain') || text.includes('ภูเขา')) return 'mountain_resort'
  if (text.includes('jungle') || text.includes('ป่า')) return 'jungle_resort'
  
  return 'generic'
}

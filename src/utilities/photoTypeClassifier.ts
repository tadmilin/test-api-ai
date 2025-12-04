export type PhotoType = 'bedroom' | 'dining' | 'lobby' | 'pool' | 'bathroom' | 'generic'

export type JobRow = {
  contentTopic?: string
  contentDescription?: string
  postTitleHeadline?: string
  hashtags?: string
  notes?: string
}

/**
 * Classify photo type from sheet content using keyword matching
 */
export function classifyPhotoTypeFromSheet(row: JobRow): PhotoType {
  const text = (
    (row.contentTopic || '') +
    ' ' +
    (row.contentDescription || '') +
    ' ' +
    (row.postTitleHeadline || '') +
    ' ' +
    (row.hashtags || '') +
    ' ' +
    (row.notes || '')
  ).toLowerCase()

  const includes = (kw: string | string[]) => {
    if (Array.isArray(kw)) return kw.some((k) => text.includes(k.toLowerCase()))
    return text.includes(kw.toLowerCase())
  }

  // ห้องอาหาร / บุฟเฟ่ต์ / คาเฟ่
  if (
    includes([
      'อาหารเช้า',
      'บุฟเฟ่ต์',
      'บุฟเฟต์',
      'ห้องอาหาร',
      'restaurant',
      'breakfast',
      'dining',
      'buffet',
      'coffee',
      'cafe',
      'café',
    ])
  ) {
    return 'dining'
  }

  // ห้องพัก / เตียง
  if (
    includes([
      'ห้องพัก',
      'ห้องนอน',
      'room',
      'bedroom',
      'เตียง',
      'suite',
      'ห้อง',
      'bed',
    ])
  ) {
    return 'bedroom'
  }

  // ล็อบบี้
  if (
    includes([
      'ล็อบบี้',
      'ล็อบบี',
      'lobby',
      'reception',
      'front desk',
      'เช็คอิน',
      'check-in',
      'check in',
    ])
  ) {
    return 'lobby'
  }

  // สระว่ายน้ำ
  if (includes(['สระว่ายน้ำ', 'สระ', 'pool', 'infinity pool', 'swimming pool'])) {
    return 'pool'
  }

  // ห้องน้ำ
  if (includes(['ห้องน้ำ', 'bathroom', 'shower', 'bathtub', 'toilet'])) {
    return 'bathroom'
  }

  return 'generic'
}

/**
 * Resolve final photo type using hybrid approach (sheet + GPT Vision)
 */
export function resolvePhotoType(
  sheetType?: PhotoType | null,
  detectedType?: PhotoType | 'other' | null,
): PhotoType {
  // 1) ไม่มีอะไรเลย → generic
  if (!sheetType && !detectedType) return 'generic'

  // 2) ไม่มี sheetType แต่มี detectedType
  if (!sheetType && detectedType && detectedType !== 'other') {
    return detectedType as PhotoType
  }

  // 3) มี sheetType อย่างเดียว
  if (sheetType && !detectedType) return sheetType

  // 4) มีทั้งคู่
  if (sheetType && detectedType) {
    if (detectedType === 'other') {
      return sheetType
    }

    // grouping แบบหยาบ ๆ
    const bedroomGroup: PhotoType[] = ['bedroom', 'generic']
    const diningGroup: PhotoType[] = ['dining', 'generic']

    const sameBedroom =
      bedroomGroup.includes(sheetType) && bedroomGroup.includes(detectedType as PhotoType)
    const sameDining =
      diningGroup.includes(sheetType) && diningGroup.includes(detectedType as PhotoType)

    if (sameBedroom || sameDining) {
      // ถ้าเข้ากลุ่มเดียวกัน → เชื่อ sheetType (คือความตั้งใจคน)
      return sheetType
    }

    // ถ้าขัดกันชัด เช่น sheetType='bedroom', detectedType='dining'
    // ให้เชื่อภาพจริงมากกว่า
    return detectedType as PhotoType
  }

  // default
  return 'generic'
}

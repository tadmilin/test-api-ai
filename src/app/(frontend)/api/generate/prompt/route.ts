import { NextRequest, NextResponse } from 'next/server'
import { getNanoBananaPrompt, type PhotoType } from '@/utilities/nanoBananaPrompts'

/**
 * SIMPLIFIED Prompt API - use photoType from Sheet only
 * No Vision AI, no complex detection - clean and fast
 */
export async function POST(request: NextRequest) {
  try {
    const { 
      photoTypeFromSheet, // photoType from Google Sheet (required)
    } = await request.json()

    console.log('📝 Prompt API called with photoType:', photoTypeFromSheet)

    // Use photoType from Sheet - main room types only
    let photoType: PhotoType = 'generic'
    
    if (photoTypeFromSheet && typeof photoTypeFromSheet === 'string') {
      const validTypes: PhotoType[] = [
        'bedroom',     // ห้องนอน
        'pool',        // สระว่ายน้ำ
        'buffet',      // บุฟเฟ่
        'bathroom',    // ห้องน้ำ
        'lobby',       // ล็อบบี้
        'dining_room',  // ร้านอาหาร
        'generic'      // ทั่วไป
      ]
      
      if (validTypes.includes(photoTypeFromSheet as PhotoType)) {
        photoType = photoTypeFromSheet as PhotoType
        console.log('✅ Using photoType from Sheet:', photoType)
      } else {
        console.warn('⚠️ Invalid photoType:', photoTypeFromSheet, '- using generic')
      }
    } else {
      console.warn('⚠️ No photoType provided - using generic')
    }

    // Get prompt for this photo type
    const prompt = getNanoBananaPrompt(photoType)
    
    console.log('✨ Generated prompt for', photoType)
    console.log('📄 Prompt length:', prompt.length, 'characters')

    return NextResponse.json({
      photoType,
      prompt,
    })

  } catch (error: any) {
    console.error('❌ Prompt generation error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate prompt' },
      { status: 500 }
    )
  }
}

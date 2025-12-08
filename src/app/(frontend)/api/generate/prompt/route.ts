import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { google } from 'googleapis'
import { getNanoBananaPrompt, detectPhotoTypeSimple, type PhotoType } from '@/utilities/nanoBananaPrompts'

export async function POST(request: NextRequest) {
  try {
    const { 
      productName, 
      contentTopic,
      contentDescription,
      referenceImageUrls,
      photoTypeFromSheet, // Optional: photoType from Google Sheet
    } = await request.json()

    if (!productName) {
      return NextResponse.json(
        { error: 'productName is required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Google AI API key not configured' },
        { status: 500 }
      )
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

    let detectedPhotoType: PhotoType = 'generic'
    
    // Priority 1: Use photoType from Google Sheet if provided
    if (photoTypeFromSheet) {
      detectedPhotoType = photoTypeFromSheet as PhotoType
      console.log('📋 Using photoType from Sheet:', detectedPhotoType)
    }
    // Priority 2: Analyze image with Gemini Vision if available (skip if quota exceeded)
    else if (referenceImageUrls && referenceImageUrls.length > 0) {
      try {
        console.log('🔍 Analyzing image with Gemini Vision to detect photoType...')
        
        // Download first image from Google Drive
        const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
        const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

        if (!serviceAccountEmail || !privateKey) {
          return NextResponse.json(
            { error: 'Google Service Account credentials not configured' },
            { status: 500 }
          )
        }

        const auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: serviceAccountEmail,
            private_key: privateKey.replace(/\\n/gm, '\n').replace(/^"|"$/g, ''),
          },
          scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        })

        const drive = google.drive({ version: 'v3', auth })

        // Extract file ID from first URL
        const firstUrl = referenceImageUrls[0]
        let fileId = null
        
        if (firstUrl.includes('id=')) {
          const match = firstUrl.match(/[?&]id=([^&]+)/)
          fileId = match ? match[1] : null
        } else if (firstUrl.includes('/file/d/')) {
          const match = firstUrl.match(/\/file\/d\/([^/]+)/)
          fileId = match ? match[1] : null
        }
        
        if (!fileId) {
          throw new Error('Could not extract file ID from Google Drive URL')
        }

        // Get file metadata
        const metadata = await drive.files.get({
          fileId,
          fields: 'mimeType',
          supportsAllDrives: true,
        })

        const mimeType = metadata.data.mimeType || 'image/jpeg'

        // Download file
        const response = await drive.files.get(
          { fileId, alt: 'media', supportsAllDrives: true },
          { responseType: 'arraybuffer' }
        )

        const buffer = Buffer.from(response.data as ArrayBuffer)
        const base64 = buffer.toString('base64')

        // Analyze with Gemini Vision
        const analysisPrompt = `You are an expert at analyzing hotel and resort photos. 

Analyze this image and classify it into ONE of these specific categories:

**Room Types:**
- bedroom: Hotel/resort bedrooms, sleeping areas
- bathroom: Bathrooms, toilets, shower areas
- lobby: Hotel lobbies, reception areas
- meeting_room: Conference rooms, meeting spaces

**Dining & Food:**
- buffet: Buffet lines, food stations with multiple dishes displayed
- food_closeup: Close-up photos of individual dishes or plated food
- dining_room: Restaurant dining areas, eating spaces (but NOT buffet lines)

**Facilities:**
- pool: Swimming pools, pool areas
- gym: Fitness centers, exercise areas
- spa: Spa facilities, massage rooms

**Exterior & Common:**
- entrance: Building entrances, doorways
- building_exterior: Outside views of buildings
- corridor: Hallways, walkways
- balcony: Balconies, terraces

**Nature & Scenery:**
- nature_garden: Gardens, landscaping
- beach_resort: Beach and seaside settings
- mountain_resort: Mountain and hillside settings
- jungle_resort: Forest and jungle settings

**Fallback:**
- generic: If none of the above fit clearly

IMPORTANT RULES:
1. Focus on the PRIMARY subject/setting of the photo
2. Ignore decorative elements (e.g., fruit on a table in a bedroom is still a "bedroom")
3. If there's food SERVING/DISPLAY (buffet line), it's "buffet"
4. If there's a SINGLE DISH close-up, it's "food_closeup"
5. If there's a DINING SPACE (tables, chairs) but no buffet line and no food closeup, it's "dining_room"

Return ONLY the category name in lowercase, nothing else.`

        const result = await model.generateContent([
          { text: analysisPrompt },
          {
            inlineData: {
              mimeType: mimeType as string,
              data: base64
            }
          }
        ])

        const responseText = result.response.text().trim().toLowerCase()
        
        // Validate response is a valid category
        const validCategories: PhotoType[] = [
          'buffet', 'food_closeup', 'dining_room', 'bedroom', 'bathroom', 'lobby', 
          'entrance', 'building_exterior', 'pool', 'gym', 'spa', 'meeting_room', 
          'corridor', 'balcony', 'nature_garden', 'beach_resort', 'mountain_resort', 
          'jungle_resort', 'generic'
        ]
        
        if (validCategories.includes(responseText as PhotoType)) {
          detectedPhotoType = responseText as PhotoType
          console.log('✅ Gemini detected photoType:', detectedPhotoType)
        } else {
          console.warn('⚠️ Invalid category from Gemini:', responseText)
          detectedPhotoType = 'generic'
        }
        
      } catch (error) {
        // Check if it's a quota error
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('quota') || errorMessage.includes('429')) {
          console.warn('⚠️ Gemini API quota exceeded, using simple detection')
        } else {
          console.error('⚠️ Gemini Vision analysis failed:', error)
        }
        
        // Fallback to simple text detection
        detectedPhotoType = detectPhotoTypeSimple(
          referenceImageUrls[0] || '',
          contentDescription || contentTopic || ''
        )
        console.log('📝 Fallback to simple detection:', detectedPhotoType)
      }
    }
    // Priority 3: Fallback to simple text-based detection
    else {
      detectedPhotoType = detectPhotoTypeSimple('', contentDescription || contentTopic || '')
      console.log('📝 Using simple text detection:', detectedPhotoType)
    }

    // Get template prompt for this photo type
    const prompt = getNanoBananaPrompt(detectedPhotoType)
    
    console.log('=' .repeat(80))
    console.log('📊 PHOTO TYPE DETECTION SUMMARY')
    console.log('=' .repeat(80))
    console.log('Input:', {
      productName,
      photoTypeFromSheet: photoTypeFromSheet || 'not provided',
      hasImage: !!(referenceImageUrls && referenceImageUrls.length > 0),
      contentTopic: contentTopic || 'none',
      contentDescription: contentDescription ? contentDescription.substring(0, 50) + '...' : 'none'
    })
    console.log('Detected Type:', detectedPhotoType)
    console.log('Prompt Preview:', prompt.substring(0, 150) + '...')
    console.log('=' .repeat(80))

    return NextResponse.json({ 
      prompt,
      photoType: detectedPhotoType
    })
  } catch (error) {
    console.error('Error generating prompt:', error)
    
    // Fallback to generic template
    return NextResponse.json({
      prompt: getNanoBananaPrompt('generic'),
      photoType: 'generic'
    })
  }
}

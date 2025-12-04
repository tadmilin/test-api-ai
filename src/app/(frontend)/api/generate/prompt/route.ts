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
    // Priority 2: Analyze image with Gemini Vision if available
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
        const analysisPrompt = `Analyze this hotel/resort photo and classify it into ONE of these categories:
buffet, food_closeup, dining_room, bedroom, bathroom, lobby, entrance, building_exterior, pool, gym, spa, meeting_room, corridor, balcony, nature_garden, beach_resort, mountain_resort, jungle_resort, generic

Return ONLY the category name, nothing else.`

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
        detectedPhotoType = responseText as PhotoType
        console.log('✅ Gemini detected photoType:', detectedPhotoType)
        
      } catch (error) {
        console.error('⚠️ Gemini Vision analysis failed:', error)
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
    console.log('✅ Selected template prompt for:', detectedPhotoType)
    console.log('📝 Prompt:', prompt.substring(0, 100) + '...')

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

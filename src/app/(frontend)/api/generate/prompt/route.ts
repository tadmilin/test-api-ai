import { NextRequest, NextResponse } from 'next/server'
import { getNanoBananaPrompt, detectPhotoTypeSimple, type PhotoType } from '@/utilities/nanoBananaPrompts'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { google } from 'googleapis'

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

    let detectedPhotoType: PhotoType = 'generic'
    
    // Priority 1: Use photoType from Google Sheet if provided
    if (photoTypeFromSheet) {
      detectedPhotoType = photoTypeFromSheet as PhotoType
      console.log('📋 Using photoType from Sheet:', detectedPhotoType)
    }
    // Priority 2: Use Gemini Vision to analyze the image
    else if (referenceImageUrls && referenceImageUrls.length > 0) {
      try {
        console.log('🔍 Analyzing image with Gemini Vision to detect photoType...')
        
        const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
        if (!apiKey) {
          throw new Error('GOOGLE_AI_API_KEY or GOOGLE_GEMINI_API_KEY not configured')
        }

        const genAI = new GoogleGenerativeAI(apiKey)
        // Use Gemini 1.5 Flash - stable model for vision (official SDK model name)
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

        // Download image and convert to base64
        const imageUrl = referenceImageUrls[0]
        let imageBuffer: Buffer

        // Check if it's a Google Drive URL
        if (imageUrl.includes('drive.google.com')) {
          console.log('🔄 Detected Google Drive URL in Prompt API, downloading via API...')
          
          // Extract file ID
          let fileId = null
          if (imageUrl.includes('id=')) {
            const match = imageUrl.match(/[?&]id=([^&]+)/)
            fileId = match ? match[1] : null
          } else if (imageUrl.includes('/file/d/')) {
            const match = imageUrl.match(/\/file\/d\/([^/]+)/)
            fileId = match ? match[1] : null
          }
          
          if (!fileId) {
            throw new Error('Could not extract file ID from Google Drive URL')
          }

          // Setup Google Drive API
          const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
          const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

          if (serviceAccountEmail && privateKey) {
            const auth = new google.auth.GoogleAuth({
              credentials: {
                client_email: serviceAccountEmail,
                private_key: privateKey.replace(/\\n/gm, '\n').replace(/^"|"$/g, ''),
              },
              scopes: ['https://www.googleapis.com/auth/drive.readonly'],
            })

            const drive = google.drive({ version: 'v3', auth })

            // Download image from Google Drive
            const response = await drive.files.get(
              { fileId, alt: 'media', supportsAllDrives: true },
              { responseType: 'arraybuffer' }
            )
            
            imageBuffer = Buffer.from(response.data as ArrayBuffer)
            console.log(`✅ Downloaded from Drive for Prompt: ${(imageBuffer.byteLength / 1024).toFixed(2)} KB`)
          } else {
            console.warn('⚠️ Google Service Account not configured, trying fetch fallback...')
            const imageResponse = await fetch(imageUrl)
            if (!imageResponse.ok) throw new Error('Failed to fetch image from Drive URL')
            const arrayBuffer = await imageResponse.arrayBuffer()
            imageBuffer = Buffer.from(arrayBuffer)
          }
        } else {
          // Normal URL
          const imageResponse = await fetch(imageUrl)
          if (!imageResponse.ok) {
            throw new Error('Failed to fetch image')
          }
          const arrayBuffer = await imageResponse.arrayBuffer()
          imageBuffer = Buffer.from(arrayBuffer)
        }

        const base64Image = imageBuffer.toString('base64')
        
        // Detect actual mime type from buffer
        let mimeType = 'image/jpeg' // default
        const header = imageBuffer.toString('hex', 0, 4)
        if (header.startsWith('89504e47')) mimeType = 'image/png'
        else if (header.startsWith('47494638')) mimeType = 'image/gif'
        else if (header.startsWith('52494646')) mimeType = 'image/webp'
        else if (header.startsWith('ffd8ff')) mimeType = 'image/jpeg'
        
        console.log(`📸 Detected image type: ${mimeType}`)

        const result = await model.generateContent([
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image, // Already clean base64 without data URI prefix
            },
          },
          {
            text: `Analyze this hotel/resort image and classify it into ONE of these categories:
- bedroom (ห้องนอน/ห้องพัก)
- bathroom (ห้องน้ำ)
- dining_room (ห้องอาหาร)
- buffet (บุฟเฟต์)
- food_closeup (อาหาร close-up)
- lobby (ล็อบบี้)
- pool (สระว่ายน้ำ)
- gym (ฟิตเนส)
- spa (สปา)
- meeting_room (ห้องประชุม)
- corridor (ทางเดิน)
- balcony (ระเบียง)
- entrance (ทางเข้า)
- building_exterior (ภายนอกอาคาร)
- nature_garden (สวน/ธรรมชาติ)
- beach_resort (รีสอร์ทชายหาด)
- mountain_resort (รีสอร์ทภูเขา)
- jungle_resort (รีสอร์ทป่า)
- generic (อื่นๆ)

Reply with ONLY the category name, nothing else.`,
          },
        ])

        const responseText = result.response.text().trim().toLowerCase().replace(/[^a-z_]/g, '')
        
        const validCategories: PhotoType[] = [
          'bedroom', 'bathroom', 'dining_room', 'buffet', 'food_closeup',
          'lobby', 'pool', 'gym', 'spa', 'meeting_room', 'corridor',
          'balcony', 'entrance', 'building_exterior', 'nature_garden',
          'beach_resort', 'mountain_resort', 'jungle_resort', 'generic'
        ]
        
        if (validCategories.includes(responseText as PhotoType)) {
          detectedPhotoType = responseText as PhotoType
          console.log('✅ Gemini detected photoType:', detectedPhotoType)
        } else {
          console.warn('⚠️ Invalid category from Gemini:', responseText)
          detectedPhotoType = detectPhotoTypeSimple('', contentDescription || contentTopic || '')
          console.log('📝 Fallback to simple detection:', detectedPhotoType)
        }
        
      } catch (error) {
        console.error('⚠️ Gemini Vision analysis failed:', error)
        
        // Fallback to simple text detection
        detectedPhotoType = detectPhotoTypeSimple('', contentDescription || contentTopic || '')
        console.log('📝 Fallback to simple detection:', detectedPhotoType)
      }
    }
    // Priority 3: Use simple text-based detection from content description
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

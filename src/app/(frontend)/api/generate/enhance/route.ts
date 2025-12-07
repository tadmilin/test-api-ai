import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import { put } from '@vercel/blob'
import { google } from 'googleapis'

export async function POST(request: NextRequest) {
  try {
    const { imageUrl, prompt, jobId, photoType } = await request.json()

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 })
    }

    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    console.log('✨ Enhancing image with Nano-Banana...')
    console.log('[ENHANCE] imageUrl =', imageUrl)
    console.log('📝 Prompt:', prompt.substring(0, 120) + '...')
    console.log('📸 PhotoType:', photoType || 'not specified')
    
    // 🔍 CRITICAL: ยืนยันว่ารูปที่ยิงเข้าโมเดลคือรูปใน Drive จริง
    console.log('⚠️ VERIFY THIS URL IN BROWSER - Should show original Drive image!')
    console.log('👉 Open this URL:', imageUrl)

    const apiToken = process.env.REPLICATE_API_TOKEN

    if (!apiToken) {
      return NextResponse.json({ error: 'Replicate API token not configured' }, { status: 500 })
    }

    const replicate = new Replicate({ auth: apiToken })

    // ตรวจสอบว่าเป็น Google Drive URL หรือไม่
    let processedImageUrl = imageUrl
    
    if (imageUrl.includes('drive.google.com')) {
      console.log('🔄 Detected Google Drive URL, downloading and uploading to Blob...')
      
      // Extract file ID from various Google Drive URL formats
      let fileId = null
      
      // Format 1: /uc?export=view&id=FILE_ID
      // Format 2: /open?id=FILE_ID
      // Format 3: /file/d/FILE_ID/view
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
      
      console.log('📎 Extracted file ID:', fileId)
      
      // Setup Google Drive API
      const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
      const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

      if (!serviceAccountEmail || !privateKey) {
        throw new Error('Google Service Account credentials not configured')
      }

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

      const imageBuffer = Buffer.from(response.data as ArrayBuffer)
      console.log(`Downloaded from Drive: ${(imageBuffer.byteLength / 1024).toFixed(2)} KB`)

      // Resize if too large for GPU (max ~1.2M pixels for safety)
      const sharp = (await import('sharp')).default
      const metadata = await sharp(imageBuffer).metadata()
      console.log(`Original dimensions: ${metadata.width}x${metadata.height}`)
      
      const maxPixels = 1200000 // 1.2M pixels safe limit
      const currentPixels = (metadata.width || 0) * (metadata.height || 0)
      
      let processedBuffer = imageBuffer
      if (currentPixels > maxPixels) {
        const scale = Math.sqrt(maxPixels / currentPixels)
        const newWidth = Math.floor((metadata.width || 0) * scale)
        const newHeight = Math.floor((metadata.height || 0) * scale)
        console.log(`📐 Resizing to ${newWidth}x${newHeight} (${(newWidth * newHeight / 1000000).toFixed(2)}M pixels)`)
        
        processedBuffer = await sharp(imageBuffer)
          .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer()
      }

      // Upload to Vercel Blob as source image
      const timestamp = Date.now()
      const sourceBlob = await put(`jobs/${jobId}/source-${timestamp}.png`, processedBuffer, {
        access: 'public',
        contentType: 'image/png',
      })
      
      processedImageUrl = sourceBlob.url
      console.log('✅ Uploaded to Blob:', processedImageUrl)
      console.log('🔍 VERIFY Blob URL - Should contain Drive image content!')
      console.log('👉 Open this Blob URL:', processedImageUrl)
    } else {
      // ถ้าเป็น URL ปกติ (เช่น Blob URL) ดาวน์โหลดและตรวจสอบขนาด
      console.log('📥 Downloading image from URL...')
      const checkImageResponse = await fetch(imageUrl)
      if (!checkImageResponse.ok) {
        console.error('❌ FAILED to fetch image from:', imageUrl)
        throw new Error('Failed to fetch image')
      }
      
      const checkImageBuffer = await checkImageResponse.arrayBuffer()
      const imageSizeKB = checkImageBuffer.byteLength / 1024
      console.log(`Image size: ${imageSizeKB.toFixed(2)} KB`)
      console.log('✅ Image downloaded successfully')
    }

    // Nano-Banana enhancement - conversational image editing
    console.log('✨ Sending to Nano-Banana Pro (Gemini 3 Pro Image)...')
    console.log('📸 Final image URL sent to model:', processedImageUrl)
    console.log('📝 Prompt:', prompt)
    
    const nanoBananaPrediction = await replicate.predictions.create({
      model: 'google/nano-banana-pro',
      input: {
        image_input: [processedImageUrl],  // Must be an array!
        prompt: prompt,
        // Nano-Banana Pro: Up to 4K resolution, 14 reference images, Google Search grounding, Thinking mode
        // No strength, negative_prompt, steps, or guidance parameters
      },
    })

    // Wait for completion
    const nanoBananaResult = await replicate.wait(nanoBananaPrediction)
    const enhancedImageUrl = Array.isArray(nanoBananaResult.output)
      ? nanoBananaResult.output[0]
      : nanoBananaResult.output as string

    console.log('✅ Nano-Banana enhancement complete:', enhancedImageUrl)

    // ✨ ESRGAN Post-Enhance - เพิ่มความคมชัดและ upscale
    // Only apply ESRGAN for food photos to avoid oversharpening rooms/buildings
    console.log('🔍 Step 3: Checking if ESRGAN upscaling needed...')
    
    let finalEnhancedUrl = enhancedImageUrl
    
    // Check photoType or prompt for food indicators
    const promptLower = prompt.toLowerCase()
    const isFoodPhoto = photoType === 'food_closeup' || photoType === 'buffet' ||
                        promptLower.includes('food') || promptLower.includes('อาหาร') ||
                        promptLower.includes('buffet') || promptLower.includes('บุฟเฟ่')
    
    if (isFoodPhoto) {
      console.log('🍴 Food photo detected - applying ESRGAN for sharpness...')
      try {
        const esrganPrediction = await replicate.predictions.create({
          version: 'f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
          input: {
            image: enhancedImageUrl,
            scale: 2, // upscale 2x
            face_enhance: false,
          },
        })
        
        const esrganResult = await replicate.wait(esrganPrediction)
        finalEnhancedUrl = Array.isArray(esrganResult.output)
          ? esrganResult.output[0]
          : esrganResult.output as string
        
        console.log('✅ ESRGAN post-enhance complete:', finalEnhancedUrl)
      } catch (esrganError) {
        console.error('⚠️ ESRGAN failed, using SDXL output:', esrganError)
        // ถ้า ESRGAN fail ใช้ SDXL output ตรงๆ
      }
    } else {
      console.log('🏨 Non-food photo - skipping ESRGAN to avoid oversharpening rooms/buildings')
      console.log('✅ Using SDXL output directly')
    }

    // ดาวน์โหลดรูปสุดท้าย
    const finalImageResponse = await fetch(finalEnhancedUrl)
    if (!finalImageResponse.ok) {
      throw new Error('Failed to download final enhanced image')
    }

    const finalImageBuffer = await finalImageResponse.arrayBuffer()

    // Upload รูปสุดท้ายไป Vercel Blob
    const timestamp = Date.now()
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const filename = `enhanced-${timestamp}-${randomSuffix}.png`
    
    const blob = await put(`jobs/${jobId}/${filename}`, finalImageBuffer, {
      access: 'public',
      contentType: 'image/png',
    })

    return NextResponse.json({
      imageUrl: blob.url,
      prompt: prompt,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to enhance image'
    console.error('Error enhancing image:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import { put } from '@vercel/blob'
import { google } from 'googleapis'

export async function POST(request: NextRequest) {
  try {
    const { collageUrl, prompt, strength, jobId } = await request.json()

    if (!collageUrl) {
      return NextResponse.json(
        { error: 'collageUrl is required' },
        { status: 400 }
      )
    }

    if (!prompt) {
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      )
    }

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      )
    }

    const apiToken = process.env.REPLICATE_API_TOKEN

    if (!apiToken) {
      return NextResponse.json(
        { error: 'Replicate API token not configured' },
        { status: 500 }
      )
    }

    const replicate = new Replicate({ auth: apiToken })

    console.log('Enhancing image with Replicate SDXL...')
    console.log('Input URL:', collageUrl)
    console.log('Prompt:', prompt.substring(0, 100) + '...')
    console.log('Strength:', strength || 0.10)

    // ตรวจสอบว่าเป็น Google Drive URL หรือไม่
    let processedImageUrl = collageUrl
    
    if (collageUrl.includes('drive.google.com')) {
      console.log('🔄 Detected Google Drive URL, downloading and uploading to Blob...')
      
      // Extract file ID from various Google Drive URL formats
      let fileId = null
      
      // Format 1: /uc?export=view&id=FILE_ID
      // Format 2: /open?id=FILE_ID
      // Format 3: /file/d/FILE_ID/view
      if (collageUrl.includes('id=')) {
        const match = collageUrl.match(/[?&]id=([^&]+)/)
        fileId = match ? match[1] : null
      } else if (collageUrl.includes('/file/d/')) {
        const match = collageUrl.match(/\/file\/d\/([^/]+)/)
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
    } else {
      // ถ้าเป็น URL ปกติ (เช่น Blob URL) ดาวน์โหลดและตรวจสอบขนาด
      console.log('📥 Downloading image from URL...')
      const checkImageResponse = await fetch(collageUrl)
      if (!checkImageResponse.ok) {
        throw new Error('Failed to fetch image')
      }
      
      const checkImageBuffer = await checkImageResponse.arrayBuffer()
      const imageSizeKB = checkImageBuffer.byteLength / 1024
      console.log(`Image size: ${imageSizeKB.toFixed(2)} KB`)
    }

    // ขั้นตอนที่ 1: ESRGAN Pre-Enhance (ทำให้รูปคมก่อน)
    console.log('🔍 Step 1: ESRGAN pre-enhance for clarity...')
    
    const preEnhancePrediction = await replicate.predictions.create({
      version: 'f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
      input: {
        image: processedImageUrl,
        scale: 1,
        face_enhance: false,
      },
    })
    
    // Wait for completion
    const preEnhanceResult = await replicate.wait(preEnhancePrediction)
    const preEnhanceOutput = Array.isArray(preEnhanceResult.output) 
      ? preEnhanceResult.output[0] 
      : preEnhanceResult.output as string

    console.log('✅ Pre-enhance complete:', preEnhanceOutput)

    // ขั้นตอนที่ 2: SDXL img2img retouching (ปรับแสง สี ตามรูปแบบ)
    console.log('🎨 Step 2: SDXL img2img retouching...')
    
    const sdxlPrediction = await replicate.predictions.create({
      version: '39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
      input: {
        image: preEnhanceOutput,
        prompt: prompt || 'Professional photo enhancement: improve lighting, colors, and clarity. Natural and realistic style. Keep all subjects and layout unchanged.',
        negative_prompt: 'blurry, low quality, distorted, warped, unrealistic, artificial, overprocessed, oversharpened, luxury hotel, five-star, fake-looking, cartoon, anime, painting, sketch, illustration, CG, 3D render, added objects, removed objects, changed layout',
        num_inference_steps: 25,
        guidance_scale: 7.5,
        strength: Math.min(Math.max(strength || 0.3, 0.25), 0.35),
        scheduler: 'DPMSolverMultistep',
      },
    })

    // Wait for completion
    const sdxlResult = await replicate.wait(sdxlPrediction)
    const sdxlImageUrl = Array.isArray(sdxlResult.output)
      ? sdxlResult.output[0]
      : sdxlResult.output as string

    console.log('✅ SDXL retouching complete:', sdxlImageUrl)

    // ขั้นตอนที่ 3: ESRGAN Post-Enhance (ขยายและเพิ่มความคม)
    console.log('✨ Step 3: ESRGAN post-enhance for final quality...')
    
    const postEnhancePrediction = await replicate.predictions.create({
      version: 'f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
      input: {
        image: sdxlImageUrl,
        scale: 2,
        face_enhance: false,
      },
    })
    
    // Wait for completion
    const postEnhanceResult = await replicate.wait(postEnhancePrediction)
    const finalEnhancedUrl = Array.isArray(postEnhanceResult.output)
      ? postEnhanceResult.output[0]
      : postEnhanceResult.output as string

    console.log('✅ Post-enhance complete:', finalEnhancedUrl)

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
      originalPrompt: prompt,
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

import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import { put } from '@vercel/blob'
import { google } from 'googleapis'
import { getPayload } from 'payload'
import config from '@payload-config'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

// POST: Start image enhancement (returns predictionId immediately)
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

    console.log('✨ Starting image enhancement...')
    console.log('[ENHANCE] imageUrl =', imageUrl)
    console.log('📝 Prompt:', prompt.substring(0, 120) + '...')
    console.log('📸 PhotoType:', photoType || 'not specified')

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

      // Resize if too large for GPU (max 1M pixels for stability)
      const sharp = (await import('sharp')).default
      const metadata = await sharp(imageBuffer).metadata()
      console.log(`Original dimensions: ${metadata.width}x${metadata.height}`)
      
      const maxPixels = 1000000 // 1M pixels (1024x1024) - safer limit
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
    console.log('✨ Creating Nano-Banana prediction...')
    console.log('📸 Final image URL:', processedImageUrl)
    
    const nanoBananaPrediction = await replicate.predictions.create({
      model: 'google/nano-banana-pro',
      input: {
        image_input: [processedImageUrl],
        prompt: prompt,
        resolution: '1K',
        aspect_ratio: 'match_input_image',
        output_format: 'png',
        safety_filter_level: 'block_only_high',
      },
    })

    console.log(`✅ Prediction created: ${nanoBananaPrediction.id}`)
    console.log(`🔗 https://replicate.com/p/${nanoBananaPrediction.id}`)

    // Store prediction ID in metadata for polling
    const payload = await getPayload({ config })
    await payload.create({
      collection: 'job-logs',
      data: {
        jobId,
        level: 'info',
        message: `Enhancement started: ${nanoBananaPrediction.id}`,
        timestamp: new Date().toISOString(),
      },
    })

    // Return immediately - don't wait!
    return NextResponse.json({
      success: true,
      predictionId: nanoBananaPrediction.id,
      status: nanoBananaPrediction.status,
      message: 'Enhancement started',
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to start enhancement'
    console.error('Error starting enhancement:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

// GET: Check enhancement status and finalize when ready
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const predictionId = searchParams.get('predictionId')
    const jobId = searchParams.get('jobId')

    if (!predictionId) {
      return NextResponse.json({ error: 'predictionId required' }, { status: 400 })
    }

    console.log(`🔍 Checking enhancement: ${predictionId}`)

    const prediction = await replicate.predictions.get(predictionId)
    console.log(`Status: ${prediction.status}`)

    if (prediction.status === 'succeeded' && prediction.output) {
      const enhancedImageUrl = Array.isArray(prediction.output)
        ? prediction.output[0]
        : (prediction.output as string)

      console.log(`✅ Enhancement complete: ${enhancedImageUrl}`)

      // Download and upload to Vercel Blob for permanence
      const finalImageResponse = await fetch(enhancedImageUrl)
      if (!finalImageResponse.ok) {
        throw new Error('Failed to download enhanced image')
      }

      const finalImageBuffer = await finalImageResponse.arrayBuffer()
      const timestamp = Date.now()
      const randomSuffix = Math.random().toString(36).substring(2, 8)
      const filename = `enhanced-${timestamp}-${randomSuffix}.png`

      // Use jobId if provided, otherwise use 'temp' folder
      const blobPath = jobId ? `jobs/${jobId}/${filename}` : `temp/${filename}`
      
      const blob = await put(blobPath, finalImageBuffer, {
        access: 'public',
        contentType: 'image/png',
      })

      console.log(`📦 Uploaded to Blob: ${blob.url}`)

      if (jobId) {
        const payload = await getPayload({ config })
        await payload.create({
          collection: 'job-logs',
          data: {
            jobId,
            level: 'info',
            message: 'Image enhancement completed',
            timestamp: new Date().toISOString(),
          },
        })
      }

      return NextResponse.json({
        success: true,
        status: 'succeeded',
        imageUrl: blob.url,
        originalUrl: enhancedImageUrl,
        predictionId,
      })
    }

    if (prediction.status === 'failed') {
      console.error(`❌ Prediction failed:`, prediction.error)

      if (jobId) {
        const payload = await getPayload({ config })
        await payload.create({
          collection: 'job-logs',
          data: {
            jobId,
            level: 'error',
            message: `Enhancement failed: ${prediction.error || 'Unknown error'}`,
            timestamp: new Date().toISOString(),
          },
        })
      }

      return NextResponse.json({
        success: false,
        status: 'failed',
        error: prediction.error || 'Unknown error',
        predictionId,
      })
    }

    // Still processing
    return NextResponse.json({
      success: true,
      status: prediction.status,
      predictionId,
      message: 'Still processing...',
    })
  } catch (error: unknown) {
    console.error('❌ Error checking prediction:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check status' },
      { status: 500 }
    )
  }
}

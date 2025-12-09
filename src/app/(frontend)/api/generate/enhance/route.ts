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

    // Get payload instance early for logging
    const payload = await getPayload({ config })

    // ตรวจสอบว่าเป็น Google Drive URL หรือไม่
    let processedImageUrl = imageUrl
    
    // SKIP IMAGE PROCESSING IF NOT GOOGLE DRIVE
    // ถ้าไม่ใช่ Google Drive URL ให้ใช้ URL เดิมส่งไป Replicate เลย (เพื่อความเร็ว)
    // ยกเว้นว่า URL นั้น Replicate เข้าถึงไม่ได้ (เช่น localhost)
    const isGoogleDrive = imageUrl.includes('drive.google.com')
    const isLocalhost = imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1')
    
    if (isGoogleDrive) {
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
    } else if (isLocalhost) {
      // ถ้าเป็น Localhost ต้อง Upload ขึ้น Blob ก่อน เพราะ Replicate เข้าถึงไม่ได้
      console.log('🏠 Detected Localhost URL, uploading to Blob for Replicate access...')
      
      const checkImageResponse = await fetch(imageUrl)
      if (!checkImageResponse.ok) throw new Error('Failed to fetch local image')
      
      const imageBuffer = await checkImageResponse.arrayBuffer()
      
      // Upload to Vercel Blob
      const timestamp = Date.now()
      const sourceBlob = await put(`jobs/${jobId}/source-local-${timestamp}.png`, imageBuffer, {
        access: 'public',
        contentType: 'image/png',
      })
      
      processedImageUrl = sourceBlob.url
      console.log('✅ Uploaded Localhost image to Blob:', processedImageUrl)
      
    } else {
      // ถ้าเป็น Public URL ปกติ (เช่น AWS S3, Cloudinary, หรือ Blob ที่มีอยู่แล้ว)
      // ให้ข้ามขั้นตอน Download/Resize/Upload ไปเลย เพื่อความเร็วสูงสุด!
      console.log('🚀 Public URL detected! Skipping image processing step for speed.')
      console.log('⏩ Using original URL directly:', imageUrl)
      
      // Optional: Check if accessible (Head request) but skipping for speed
    }

    // Nano-Banana enhancement - conversational image editing
    console.log('✨ Creating Nano-Banana prediction...')
    console.log('📸 Final image URL:', processedImageUrl)
    console.log('📝 Prompt length:', prompt.length, 'chars')
    console.log('🎨 Photo type:', photoType)
    
    // Validate URL is accessible before sending to Replicate
    try {
      const headCheck = await fetch(processedImageUrl, { method: 'HEAD' })
      console.log(`🔍 Image URL check: ${headCheck.status} ${headCheck.statusText}`)
      if (!headCheck.ok) {
        throw new Error(`Image URL not accessible: ${headCheck.status}`)
      }
    } catch (checkError) {
      console.error('❌ Image URL validation failed:', checkError)
      throw checkError
    }
    
    // Retry logic for E6716 timeout errors
    const MAX_RETRIES = 2 // Reduced from 3 to 2 for faster failure
    const RETRY_DELAYS = [2000, 5000] // 2s, 5s (was 3s, 8s, 15s - too slow)
    
    let nanoBananaPrediction
    let lastError
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🎯 Creating prediction (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`)
        
        nanoBananaPrediction = await replicate.predictions.create({
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
        break // Success! Exit retry loop
        
      } catch (error: any) {
        lastError = error
        const errorMsg = error?.message || String(error)
        
        // Check if it's E6716 timeout or E9243 director error
        const isRetryableError = errorMsg.includes('E6716') || errorMsg.includes('E9243')
        
        if (isRetryableError && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt]
          const errorCode = errorMsg.includes('E9243') ? 'E9243 (Director error)' : 'E6716 (timeout)'
          console.log(`⏳ ${errorCode} detected, retrying in ${delay/1000}s... (attempt ${attempt + 1}/${MAX_RETRIES + 1})`)
          
          await payload.create({
            collection: 'job-logs',
            data: {
              jobId,
              level: 'warning',
              message: `${errorCode} on attempt ${attempt + 1}, retrying in ${delay/1000}s...`,
              timestamp: new Date().toISOString(),
            },
          })
          
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        
        // Not retryable error or max retries reached - throw error
        console.error(`❌ Failed to create prediction:`, error)
        throw error
      }
    }
    
    if (!nanoBananaPrediction) {
      throw new Error(`Failed after ${MAX_RETRIES + 1} attempts: ${lastError}`)
    }

    // Store prediction ID in metadata for polling
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

    let prediction
    try {
      prediction = await replicate.predictions.get(predictionId)
      console.log(`Status: ${prediction.status}`)
    } catch (replicateError) {
      console.error('❌ Replicate API error:', replicateError)
      // Return a special status so client can retry
      return NextResponse.json({
        success: false,
        status: 'error',
        error: replicateError instanceof Error ? replicateError.message : 'Failed to check prediction status',
        predictionId,
      }, { status: 500 })
    }

    if (prediction.status === 'succeeded' && prediction.output) {
      const enhancedImageUrl = Array.isArray(prediction.output)
        ? prediction.output[0]
        : (prediction.output as string)

      console.log(`✅ Enhancement complete: ${enhancedImageUrl}`)

      // ⚡ OPTIMIZATION: Check if already uploaded to Blob (cached result)
      if (jobId) {
        console.log('🔍 Checking cache for predictionId:', predictionId)
        try {
          const payload = await getPayload({ config })
          const job = await payload.findByID({ collection: 'jobs', id: jobId })
          
          console.log(`📊 Job has ${job.enhancedImageUrls?.length || 0} images`)
          
          // Check if this prediction already has a Blob URL cached
          // Must check: 1) same predictionId, 2) has url, 3) url is Blob storage, 4) status is 'pending' (processed)
          const cachedImage = job.enhancedImageUrls?.find(
            (img: any) => 
              img.predictionId === predictionId && 
              img.url && 
              img.url.includes('blob.vercel-storage.com') &&
              img.status === 'pending'  // Must be processed, not 'processing'
          )
          
          if (cachedImage?.url) {
            console.log(`💾 Cache HIT! Using cached Blob URL: ${cachedImage.url}`)
            return NextResponse.json({
              success: true,
              status: 'succeeded',
              imageUrl: cachedImage.url,
              originalUrl: enhancedImageUrl,
              predictionId,
              cached: true,
            })
          }
          
          console.log('❌ Cache MISS - No matching cached image found')
          console.log('   Looking for:', { predictionId, mustHaveUrl: true, mustBeBlob: true, mustBePending: true })
        } catch (cacheError) {
          console.log('⚠️ Cache check failed, proceeding with download...', cacheError)
        }
      }

      // Download and upload to Vercel Blob for permanence (only once)
      console.log('📥 Downloading from Replicate...')
      try {
        const finalImageResponse = await fetch(enhancedImageUrl)
        if (!finalImageResponse.ok) {
          throw new Error(`Failed to download enhanced image: ${finalImageResponse.statusText}`)
        }

        const finalImageBuffer = await finalImageResponse.arrayBuffer()
        
        // Detect correct content type and extension
        const contentType = finalImageResponse.headers.get('content-type') || 'image/png'
        let extension = 'png'
        if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = 'jpg'
        if (contentType.includes('webp')) extension = 'webp'
        
        const timestamp = Date.now()
        const randomSuffix = Math.random().toString(36).substring(2, 8)
        const filename = `enhanced-${timestamp}-${randomSuffix}.${extension}`

        // Use jobId if provided, otherwise use 'temp' folder
        const blobPath = jobId ? `jobs/${jobId}/${filename}` : `temp/${filename}`
        
        console.log(`📤 Uploading to Blob (${contentType})...`)
        const blob = await put(blobPath, finalImageBuffer, {
          access: 'public',
          contentType: contentType, // Use actual content type from Replicate
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
          cached: false,
        })
      } catch (downloadError) {
        console.error('❌ CRITICAL: Failed to download/upload enhanced image:', downloadError)
        // DON'T fallback to Replicate URL - it expires quickly!
        // Throw error so client can retry
        throw new Error(`Failed to cache image: ${downloadError instanceof Error ? downloadError.message : 'Unknown error'}`)
      }
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

import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import { uploadBufferToCloudinary } from '@/utilities/cloudinaryUpload'
import { getPayload } from 'payload'
import config from '@payload-config'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

// Helper: Round dimension to nearest multiple of 64 (required for Flux models)
function roundTo64(value: number): number {
  return Math.floor(value / 64) * 64
}

// ✅ Force Node.js runtime (required for googleapis, sharp, Buffer, @vercel/blob)
export const runtime = 'nodejs'

// POST: Start image enhancement (returns predictionId immediately)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { imageUrl, prompt, jobId, photoType, outputSize } = body

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
    console.log('📐 Output Size:', outputSize || '1:1-2K (default)')

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
      
      // Use utility function for downloading
      const { downloadDriveFile } = await import('@/utilities/downloadDriveFile')
      const imageBuffer = await downloadDriveFile(fileId)
      console.log(`Downloaded from Drive: ${(imageBuffer.byteLength / 1024).toFixed(2)} KB`)

      // 🔥 CRITICAL FIX: Resize + Compress if needed
      const sharp = (await import('sharp')).default
      const metadata = await sharp(imageBuffer).metadata()
      console.log(`📐 Original: ${metadata.width}x${metadata.height}, ${(imageBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`)
      
      const MAX_DIMENSION = 1024 // Safe limit for Nano-Banana
      const MAX_FILE_SIZE_MB = 8 // Max 8MB to avoid E9243
      const width = metadata.width || 0
      const height = metadata.height || 0
      
      let pipeline = sharp(imageBuffer)
      let quality = 92 // High quality by default
      
      // Check file size first
      const fileSizeMB = imageBuffer.byteLength / 1024 / 1024
      if (fileSizeMB > MAX_FILE_SIZE_MB) {
        console.log(`⚠️ File too large (${fileSizeMB.toFixed(2)}MB > ${MAX_FILE_SIZE_MB}MB), will compress`)
        quality = 75 // Lower quality for large files
      }
      
      // Calculate new dimensions if resizing needed
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
        const newWidth = roundTo64(width * scale)
        const newHeight = roundTo64(height * scale)
        
        console.log(`📐 Resizing to ${newWidth}x${newHeight} (divisible by 64)`)
        
        pipeline = pipeline.resize(newWidth, newHeight, {
          fit: 'fill',
          position: 'centre',
        })
      } else {
        // Ensure dimensions are divisible by 64
        const newWidth = roundTo64(width)
        const newHeight = roundTo64(height)
        
        if (newWidth !== width || newHeight !== height) {
          console.log(`📐 Adjusting to ${newWidth}x${newHeight} (divisible by 64)`)
          pipeline = pipeline.resize(newWidth, newHeight, { fit: 'fill' })
        }
      }
      
      // 🔥 Convert to JPEG with dynamic quality
      console.log(`🗜️ Compressing with quality=${quality}`)
      const processedBuffer = await pipeline
        .jpeg({ quality: quality, chromaSubsampling: '4:4:4' })
        .toBuffer()
      
      const finalSizeMB = processedBuffer.byteLength / 1024 / 1024
      console.log(`✅ Final size: ${finalSizeMB.toFixed(2)} MB`)

      // Upload to Cloudinary as source image
      const timestamp = Date.now()
      const cloudinaryUrl = await uploadBufferToCloudinary(
        processedBuffer,
        `jobs/${jobId}`,
        `source-${timestamp}`
      )
      
      processedImageUrl = cloudinaryUrl
      console.log('✅ Uploaded to Cloudinary:', processedImageUrl)
      console.log('🔍 Image optimized: JPEG format with dimensions divisible by 64')
      
    } else if (isLocalhost) {
      // ถ้าเป็น Localhost ต้อง Upload ขึ้น Blob ก่อน เพราะ Replicate เข้าถึงไม่ได้
      console.log('🏠 Detected Localhost URL, uploading to Blob for Replicate access...')
      
      const checkImageResponse = await fetch(imageUrl)
      if (!checkImageResponse.ok) throw new Error('Failed to fetch local image')
      
      const imageBuffer = Buffer.from(await checkImageResponse.arrayBuffer())
      
      // Apply same optimization as Google Drive
      const sharp = (await import('sharp')).default
      const metadata = await sharp(imageBuffer).metadata()
      const width = metadata.width || 0
      const height = metadata.height || 0
      
      let pipeline = sharp(imageBuffer)
      const MAX_DIMENSION = 1024
      
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
        const newWidth = roundTo64(width * scale)
        const newHeight = roundTo64(height * scale)
        console.log(`📐 Resizing localhost image to ${newWidth}x${newHeight}`)
        pipeline = pipeline.resize(newWidth, newHeight, { fit: 'fill' })
      } else {
        const newWidth = roundTo64(width)
        const newHeight = roundTo64(height)
        if (newWidth !== width || newHeight !== height) {
          pipeline = pipeline.resize(newWidth, newHeight, { fit: 'fill' })
        }
      }
      
      const processedBuffer = await pipeline
        .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
        .toBuffer()
      
      // Upload to Cloudinary
      const timestamp = Date.now()
      const cloudinaryUrl = await uploadBufferToCloudinary(
        processedBuffer,
        `jobs/${jobId}`,
        `source-local-${timestamp}`
      )
      
      processedImageUrl = cloudinaryUrl
      console.log('✅ Uploaded Localhost image to Cloudinary:', processedImageUrl)
      
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
    
    // ✅ Validate URL is accessible (warning only - some CDNs reject HEAD)
    try {
      const headCheck = await fetch(processedImageUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
      console.log(`🔍 Image URL check: ${headCheck.status} ${headCheck.statusText}`)
      if (!headCheck.ok) {
        console.warn(`⚠️ Image URL returned ${headCheck.status}, but will try anyway (some CDNs reject HEAD)`)
      }
    } catch (checkError) {
      console.warn('⚠️ Image URL HEAD check failed (may still work):', checkError)
      // Don't throw - let Replicate try anyway
    }
    
    // ✅ Create prediction once - no retry (fail fast for better UX)
    console.log('🎯 Creating prediction...')
    
    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    const webhookUrl = `${baseUrl}/api/webhooks/replicate`
    
    console.log(`📡 Webhook URL: ${webhookUrl}`)
    
    // ✅ Output size configuration
    const OUTPUT_SIZE_CONFIG: Record<string, { aspect_ratio: string; resolution: string }> = {
      '1:1-2K': { aspect_ratio: '1:1', resolution: '2K' },
      '3:4-2K': { aspect_ratio: '3:4', resolution: '2K' }, // ✅ Custom-prompt uses this
      '4:5-2K': { aspect_ratio: '3:4', resolution: '2K' }, // ✅ ส่ง 3:4 ไป nano-banana-pro แล้ว webhook จะ resize เป็น 1080×1350 (4:5)
      '9:16-2K': { aspect_ratio: '9:16', resolution: '2K' },
    }
    
    const sizeConfig = OUTPUT_SIZE_CONFIG[body.outputSize || '1:1-2K']
    console.log(`📐 Output size: ${body.outputSize || '1:1-2K'} → ${sizeConfig.aspect_ratio} @ ${sizeConfig.resolution}`)
    
    const nanoBananaPrediction = await replicate.predictions.create({
      model: 'google/nano-banana-pro',
      input: {
        image_input: [processedImageUrl],
        prompt: prompt,
        aspect_ratio: sizeConfig.aspect_ratio,
        resolution: sizeConfig.resolution,
        output_format: 'jpg',
        safety_filter_level: 'block_only_high',
      },
      webhook: webhookUrl,
      webhook_events_filter: ['start', 'completed'],
    })
    
    console.log(`✅ Prediction created: ${nanoBananaPrediction.id}`)
    console.log(`🔗 https://replicate.com/p/${nanoBananaPrediction.id}`)

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
    console.error('Error starting enhancement:', error)
    
    // Check if it's a Replicate API error with status code
    let statusCode = 500
    let errorMessage = 'Failed to start enhancement'
    
    if (error && typeof error === 'object' && 'response' in error) {
      const replicateError = error as { response?: { status?: number }; message?: string }
      statusCode = replicateError.response?.status || 500
      errorMessage = replicateError.message || errorMessage
      
      // Add context for payment errors
      if (statusCode === 402) {
        errorMessage = `402 Payment Required: ${errorMessage}`
      }
    } else if (error instanceof Error) {
      errorMessage = error.message
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
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
    } catch (replicateError: unknown) {
      console.error('❌ Replicate API error:', replicateError)
      
      // Handle 429 during status check
      const is429 = (replicateError as { response?: { status?: number }; message?: string })?.response?.status === 429 || 
                    (replicateError as { message?: string })?.message?.includes('429')
      if (is429) {
        return NextResponse.json({
          success: true,
          status: 'processing',
          message: 'Rate limited, retrying...',
          predictionId,
        })
      }
      
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
          
          // ✅ Cache hit: มี storage URL แล้ว → return ทันที (read-only fast path)
          const cachedImage = job.enhancedImageUrls?.find(
            (img: { predictionId?: string | null; url?: string | null; status?: string | null }) => 
              img.predictionId === predictionId && 
              img.url && 
              (img.url.includes('cloudinary.com') || img.url.includes('blob.vercel-storage.com'))
          )
          
          if (cachedImage?.url) {
            console.log(`💾 Cache HIT! Using cached storage URL: ${cachedImage.url}`)
            return NextResponse.json({
              success: true,
              status: 'succeeded',
              imageUrl: cachedImage.url,
              originalUrl: enhancedImageUrl,
              predictionId,
              cached: true,
            })
          }
          
          // ⚠️ Check webhook status
          const pendingImage = job.enhancedImageUrls?.find(
            (img: unknown) => (img as { predictionId?: string }).predictionId === predictionId
          ) as { webhookFailed?: boolean; tempOutputUrl?: string } | undefined
          
          // If webhook is uploading (no webhookFailed flag) → tell client to wait
          if (pendingImage && !pendingImage.webhookFailed && pendingImage.tempOutputUrl) {
            console.log('⏳ Webhook is uploading, client should wait...')
            return NextResponse.json({
              success: true,
              status: 'persisting', // New status: webhook is handling upload
              message: 'กำลังบันทึกผลลัพธ์...',
              predictionId,
            })
          }
          
          console.log('❌ Cache MISS - proceeding with upload...')
          console.log('   Webhook failed flag:', pendingImage?.webhookFailed || false)
        } catch (cacheError) {
          console.log('⚠️ Cache check failed, proceeding with download...', cacheError)
        }
      }

      // ⚠️ Fallback: Webhook failed or no jobId → polling uploads Blob
      console.log('📥 Downloading from Replicate (fallback path)...')
      try {
        const finalImageResponse = await fetch(enhancedImageUrl)
        if (!finalImageResponse.ok) {
          throw new Error(`Failed to download enhanced image: ${finalImageResponse.statusText}`)
        }

        const finalImageBuffer = await finalImageResponse.arrayBuffer()
        const finalImageBufferNode = Buffer.from(finalImageBuffer)
        
        // Detect correct content type and extension
        const contentType = finalImageResponse.headers.get('content-type') || 'image/png'
        let extension = 'png'
        if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = 'jpg'
        if (contentType.includes('webp')) extension = 'webp'
        
        const timestamp = Date.now()
        const randomSuffix = Math.random().toString(36).substring(2, 8)
        const filename = `enhanced-${timestamp}-${randomSuffix}.${extension}`

        // Use jobId if provided, otherwise use 'temp' folder
        const folder = jobId ? `jobs/${jobId}` : `temp`
        const filenameWithoutExt = `enhanced-${timestamp}-${randomSuffix}`
        
        console.log(`📤 Uploading to Cloudinary (${contentType})...`)
        const cloudinaryUrl = await uploadBufferToCloudinary(
          finalImageBufferNode,
          folder,
          filenameWithoutExt
        )

        console.log(`📦 Uploaded to Cloudinary: ${cloudinaryUrl}`)

        // ✅ CRITICAL: Update DB with Blob URL (idempotent)
        if (jobId) {
          const payload = await getPayload({ config })
          
          try {
            const job = await payload.findByID({ collection: 'jobs', id: jobId })
            
            const updatedImages = (job.enhancedImageUrls || []).map((img: { 
              originalUrl?: string | null; 
              tempOutputUrl?: string | null; 
              url?: string | null; 
              webhookFailed?: boolean | null; 
              status?: ('pending' | 'completed' | 'failed' | 'approved' | 'regenerating') | null;
              predictionId?: string | null;
              upscalePredictionId?: string | null;
              photoType?: string | null;
            }) => {
              if (img.predictionId === predictionId) {
                // ✅ Guard: ถ้ามี URL แล้วไม่ต้องทับ (idempotent)
                if (img.url && (String(img.url).includes('cloudinary.com') || String(img.url).includes('blob.vercel-storage.com'))) {
                  console.log(`   ℹ️ Already has URL, skipping update`)
                  return img
                }
                console.log(`   ✅ Updating image with Cloudinary URL`)
                return { 
                  ...img, 
                  url: cloudinaryUrl, // ✅ Permanent Cloudinary URL
                  tempOutputUrl: enhancedImageUrl, // Keep temp URL for debugging
                  status: 'completed' as const,
                  webhookFailed: null, // Clear flag
                }
              }
              return img
            })
            
            await payload.update({
              collection: 'jobs',
              id: jobId,
              data: { enhancedImageUrls: updatedImages },
            })
            
            console.log(`💾 DB updated with Blob URL`)
          } catch (updateError) {
            console.error('⚠️ Failed to update DB:', updateError)
            // Don't fail the request if DB update fails
          }
          
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
          imageUrl: cloudinaryUrl,
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

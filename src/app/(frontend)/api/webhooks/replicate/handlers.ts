/**
 * Webhook Handlers - แยก logic ตาม jobType
 * Production-ready with comprehensive error handling
 */

import sharp from 'sharp'
import { uploadBufferToCloudinary } from '@/utilities/cloudinaryUpload'

type Job = any // TODO: Import proper type

/**
 * Retry helper for MongoDB WriteConflict errors
 */
async function retryOnWriteConflict<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 100
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      const isWriteConflict = error?.code === 112 || error?.codeName === 'WriteConflict'
      const isLastAttempt = attempt === maxRetries
      
      if (!isWriteConflict || isLastAttempt) {
        throw error // Not a write conflict or out of retries
      }
      
      // Exponential backoff with jitter
      const delay = delayMs * Math.pow(2, attempt - 1) + Math.random() * 50
      console.log(`[Webhook] ⚠️ WriteConflict (attempt ${attempt}/${maxRetries}), retrying in ${Math.round(delay)}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw new Error('Retry logic failed') // Should never reach here
}

/**
 * Validate output URL from Replicate
 */
function validateReplicateUrl(output: any): string | null {
  if (!output) return null
  
  const url = Array.isArray(output) ? output[0] : output
  
  if (typeof url !== 'string' || url.length < 10) return null
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null
  
  return url
}

/**
 * 1. Text to Image Handler
 * - Imagen 4 Ultra output
 * - 1:1 → upscale 2x
 * - 3:4, 9:16 → resize
 */
export async function handleTextToImage(job: Job, predictionId: string, status: string, output: any, body: any) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('[Webhook] 🎨 TEXT TO IMAGE Handler')
  console.log('[Webhook] 📋 Job ID:', job.id)
  console.log('[Webhook] 🔑 Prediction ID:', predictionId)
  console.log('[Webhook] 📊 Status:', status)
  console.log('[Webhook] 📐 Output Size:', job.outputSize)
  
  try {
    const updatedUrls = job.enhancedImageUrls || []
    console.log('[Webhook] 🖼️  Total images in job:', updatedUrls.length)
    
    // Find image by predictionId or upscalePredictionId
    const currentImg = updatedUrls.find((img: any) => 
      img.predictionId === predictionId || img.upscalePredictionId === predictionId
    )
    
    if (!currentImg) {
      console.log('[Webhook] ⚠️ Image not found for predictionId:', predictionId)
      console.log('[Webhook] 📋 Available prediction IDs:', updatedUrls.map((img: any) => ({
        index: img.index,
        predictionId: img.predictionId,
        upscalePredictionId: img.upscalePredictionId,
      })))
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      return { updatedUrls, newJobStatus: job.status }
    }
    
    const isMainPrediction = currentImg.predictionId === predictionId
    const isUpscalePrediction = currentImg.upscalePredictionId === predictionId
    
    console.log('[Webhook] 🔍 Processing image #' + (currentImg.index + 1))
    console.log('[Webhook]    Type:', isMainPrediction ? 'MAIN' : 'UPSCALE')
    console.log('[Webhook]    Current status:', currentImg.status)
    console.log('[Webhook]    Has URL:', !!currentImg.url)
    
    // Handle failure
    if (status === 'failed') {
      const errorMsg = body.error || body.logs || 'Unknown error'
      console.error('[Webhook] ❌ FAILED')
      console.error('[Webhook]    Error:', errorMsg)
      console.error('[Webhook]    Job ID:', job.id)
      console.error('[Webhook]    Image index:', currentImg.index)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      
      const updated = updatedUrls.map((img: any) =>
        img.index === currentImg.index
          ? { ...img, status: 'failed', error: errorMsg }
          : img
      )
      
      return { updatedUrls: updated, newJobStatus: 'failed' }
    }
    
    // Handle success
    if (status === 'succeeded' && output) {
      console.log('[Webhook] ✅ SUCCEEDED')
      console.log('[Webhook]    Output type:', typeof output)
      console.log('[Webhook]    Output size:', Array.isArray(output) ? output.length : 'single')
      
      // Extract URL
      const replicateUrl = Array.isArray(output) ? output[0] : output
      
      // Validate URL
      if (!replicateUrl || typeof replicateUrl !== 'string' || !replicateUrl.startsWith('http')) {
        console.error('[Webhook] ❌ Invalid URL from Replicate')
        console.error('[Webhook]    Output:', output)
        console.error('[Webhook]    Type:', typeof output)
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        const updated = updatedUrls.map((img: any) =>
          img.index === currentImg.index
            ? { ...img, status: 'failed', error: 'Invalid URL from Replicate' }
            : img
        )
        return { updatedUrls: updated, newJobStatus: 'failed' }
      }
      
      console.log('[Webhook] ✅ Valid URL:', replicateUrl.substring(0, 60) + '...')
      console.log('[Webhook] 📊 Image type:', isMainPrediction ? 'MAIN' : 'UPSCALE')
      console.log('[Webhook] 📐 Output size:', job.outputSize)
      
      // Check if 1:1 → need upscale
      const shouldUpscale = isMainPrediction && job.outputSize?.includes('1:1')
      
      if (shouldUpscale) {
        console.log('[Webhook] 📐 1:1 detected → Starting upscale...')
        
        try {
          const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
          const upscaleRes = await fetch(`${baseUrl}/api/generate/upscale`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl: replicateUrl,
              scale: 2,
            }),
          })
          
          const upscaleData = await upscaleRes.json()
          console.log('[Webhook] ✅ Upscale started:', upscaleData.predictionId)
          console.log('[Webhook] 🔍 Current image predictionId:', currentImg.predictionId)
          console.log('[Webhook] 🔍 Saving upscalePredictionId to DB...')
          
          const updated = updatedUrls.map((img: any) =>
            img.predictionId === predictionId  // ✅ ใช้ predictionId แทน index
              ? {
                  ...img,
                  tempOutputUrl: replicateUrl,
                  upscalePredictionId: upscaleData.predictionId,
                  predictionId: null,  // ✅ ลบ predictionId เดิม
                  status: 'pending',
                }
              : img
          )
          
          console.log('[Webhook] 🔍 Updated image:', updated.find((img: any) => img.upscalePredictionId === upscaleData.predictionId))
          
          return { updatedUrls: updated, newJobStatus: 'enhancing' }
        } catch (error) {
          console.error('[Webhook] ❌ Upscale failed:', error)
          const updated = updatedUrls.map((img: any) =>
            img.index === currentImg.index
              ? { ...img, status: 'failed', error: 'Failed to start upscale' }
              : img
          )
          return { updatedUrls: updated, newJobStatus: 'failed' }
        }
      }
    
      // Resize for 3:4 or 9:16
      try {
        console.log('[Webhook] 📤 Downloading and uploading to Cloudinary...')
        
        const imageResponse = await fetch(replicateUrl, { 
          signal: AbortSignal.timeout(5000),
        })
        
        const imageBuffer = await imageResponse.arrayBuffer()
        
        // Resize if needed
        const OUTPUT_SIZE_MAP: Record<string, { width: number; height: number } | null> = {
          '1:1-2K': null,
          '3:4-2K': { width: 1080, height: 1350 },
          '4:5-2K': { width: 1080, height: 1350 },
          '9:16-2K': { width: 1080, height: 1920 },
        }
        
        const targetSize = OUTPUT_SIZE_MAP[job.outputSize || '1:1-2K']
        let optimizedBuffer: Buffer
        
        if (targetSize && !isUpscalePrediction) {
          console.log(`[Webhook] 🔧 Resizing to ${targetSize.width}×${targetSize.height}...`)
          optimizedBuffer = await sharp(Buffer.from(imageBuffer))
            .resize(targetSize.width, targetSize.height, { fit: 'cover' })
            .jpeg({ quality: 90 })
            .toBuffer()
        } else {
          optimizedBuffer = Buffer.from(imageBuffer)
        }
        
        const filename = isUpscalePrediction 
          ? `enhanced-${currentImg.predictionId}-upscaled`
          : `enhanced-${predictionId}`
        
        const cloudinaryUrl = await uploadBufferToCloudinary(
          optimizedBuffer,
          `jobs/${job.id}`,
          filename
        )
        
        console.log('[Webhook] ✅ Uploaded:', cloudinaryUrl)
        
        const updated = updatedUrls.map((img: any) =>
          img.index === currentImg.index
            ? {
                ...img,
                url: cloudinaryUrl,
                originalUrl: replicateUrl,
                status: 'completed',
                upscalePredictionId: isUpscalePrediction ? null : img.upscalePredictionId,
                predictionId: isMainPrediction ? null : img.predictionId,
              }
            : img
        )
        
        // Check if all done
        const allDone = updated.every((img: any) => img.status === 'completed' || img.status === 'failed')
        const hasFailed = updated.some((img: any) => img.status === 'failed')
        
        return {
          updatedUrls: updated,
          newJobStatus: allDone ? (hasFailed ? 'failed' : 'completed') : 'enhancing',
        }
        
      } catch (error) {
        console.error('[Webhook] ❌ Upload failed:', error)
        const updated = updatedUrls.map((img: any) =>
          img.index === currentImg.index
            ? { ...img, status: 'failed', error: 'Upload failed', webhookFailed: true }
            : img
        )
        return { updatedUrls: updated, newJobStatus: 'failed' }
      }
    }
    
    return { updatedUrls, newJobStatus: job.status }
    
  } catch (error) {
    console.error('[Webhook] ❌ TEXT TO IMAGE Handler error:', error)
    return { updatedUrls: job.enhancedImageUrls || [], newJobStatus: 'failed' }
  }
}

/**
 * 2. Custom Prompt Handler
 * - Nano Banana Pro output (แต่งภาพ)
 * - 1:1 → upscale 2x
 * - 3:4, 9:16 → resize
 */
export async function handleCustomPrompt(job: Job, predictionId: string, status: string, output: any, body: any) {
  console.log('[Webhook] ✏️ CUSTOM PROMPT Handler')
  
  // ใช้ logic เดียวกับ Text to Image
  return handleTextToImage(job, predictionId, status, output, body)
}

/**
 * 3. Template Merge Handler
 * - Step 1: แต่งภาพ (Nano Banana Pro) → ไม่ upscale/resize
 * - Step 2: ใส่ template (Nano Banana Pro) → upscale/resize ที่ template
 */
export async function handleTemplateMerge(job: Job, predictionId: string, status: string, output: any, body: any) {
  console.log('[Webhook] 🎨 TEMPLATE MERGE Handler')
  
  // Check if this is template generation
  const templateGen = job.templateGeneration || {}
  const isTemplateGeneration = templateGen.predictionId === predictionId
  const isTemplateUpscale = templateGen.upscalePredictionId === predictionId
  
  if (isTemplateGeneration || isTemplateUpscale) {
    console.log('[Webhook] 🎨 Processing template (Step 2)')
    return handleTemplateGeneration(job, predictionId, status, output, body, isTemplateUpscale)
  }
  
  // Otherwise, this is enhanced image (Step 1)
  console.log('[Webhook] 📸 Processing enhanced images (Step 1)')
  return handleEnhancedImages(job, predictionId, status, output, body)
}

/**
 * Helper: Handle enhanced images (Step 1 of template merge)
 * ไม่ upscale/resize - เก็บไว้ใส่ template
 */
async function handleEnhancedImages(job: Job, predictionId: string, status: string, output: any, body: any) {
  console.log('[Webhook] 📸 handleEnhancedImages called')
  console.log('[Webhook]    Job ID:', job.id)
  console.log('[Webhook]    Status:', status)
  console.log('[Webhook]    Prediction ID:', predictionId)
  
  let updatedUrls = job.enhancedImageUrls || []
  
  // ✅ CRITICAL: Add index if missing (for old jobs created before fix)
  const hasIndex = updatedUrls.length > 0 && updatedUrls[0].index !== undefined
  if (!hasIndex && updatedUrls.length > 0) {
    console.log('[Webhook] ⚠️ Old job without index field - adding indices now')
    updatedUrls = updatedUrls.map((img: any, i: number) => ({
      ...img,
      index: i,
    }))
    // Save the indices immediately for old jobs
    const { getPayload } = await import('payload')
    const configPromise = await import('@payload-config')
    const payload = await getPayload({ config: configPromise.default })
    await retryOnWriteConflict(async () => {
      await payload.update({
        collection: 'jobs',
        id: job.id,
        data: { enhancedImageUrls: updatedUrls as any },
      })
    })
    console.log('[Webhook] ✅ Indices saved for old job')
  }
  
  console.log('[Webhook]    Total images:', updatedUrls.length)
  
  const currentImg = updatedUrls.find((img: any) => img.predictionId === predictionId)
  
  if (!currentImg) {
    console.log('[Webhook] ⚠️ Image not found')
    return { updatedUrls: null, newJobStatus: job.status }
  }
  
  // ✅ ATOMIC UPDATE: Use MongoDB to update only this specific image
  const { getPayload } = await import('payload')
  const configPromise = await import('@payload-config')
  const payload = await getPayload({ config: configPromise.default })
  
  if (status === 'failed') {
    console.log(`[Webhook] ❌ Image ${currentImg.index} failed`)
    // Atomic update: find array element by predictionId and update it
    const jobId = job.id
    await retryOnWriteConflict(async () => {
      const latestJob = await payload.findByID({ collection: 'jobs', id: jobId })
      const urls = (latestJob.enhancedImageUrls || []) as any[]
      const idx = urls.findIndex((img: any) => img.predictionId === predictionId)
      if (idx !== -1) {
        urls[idx] = { ...urls[idx], status: 'failed', error: body.error || 'Failed' }
        await payload.update({
          collection: 'jobs',
          id: jobId,
          data: { enhancedImageUrls: urls, status: 'failed' },
        })
      }
    })
    
    // Return updated for checking
    return { updatedUrls: null, newJobStatus: 'failed' }
  }
  
  if (status === 'succeeded' && output) {
    const replicateUrl = Array.isArray(output) ? output[0] : output
    
    try {
      console.log('[Webhook] 📤 Uploading enhanced image (no resize)...')
      
      const imageResponse = await fetch(replicateUrl, { 
        signal: AbortSignal.timeout(5000),
      })
      
      const imageBuffer = await imageResponse.arrayBuffer()
      // ✅ Include index in filename to prevent cache collisions
      const filename = `enhanced-idx${currentImg.index}-${predictionId}`
      
      const jobId = job.id
      const cloudinaryUrl = await uploadBufferToCloudinary(
        Buffer.from(imageBuffer),
        `jobs/${jobId}`,
        filename
      )
      
      console.log('[Webhook] ✅ Enhanced image uploaded:', cloudinaryUrl)
      
      // ✅ ATOMIC UPDATE: Update only this specific image in DB
      console.log(`[Webhook] 💾 Atomically updating image ${currentImg.index} in database...`)
      let latestJob: any
      await retryOnWriteConflict(async () => {
        // Re-fetch latest state
        const freshJob = await payload.findByID({ collection: 'jobs', id: jobId })
        const urls = (freshJob.enhancedImageUrls || []) as any[]
        const idx = urls.findIndex((img: any) => img.predictionId === predictionId)
        
        if (idx !== -1) {
          urls[idx] = {
            ...urls[idx],
            url: cloudinaryUrl,
            originalUrl: replicateUrl,
            status: 'completed',
            predictionId: null,
          }
          
          await payload.update({
            collection: 'jobs',
            id: jobId,
            data: { enhancedImageUrls: urls },
          })
          
          latestJob = { ...freshJob, enhancedImageUrls: urls }
        }
      })
      
      console.log('[Webhook] ✅ Database updated atomically')
      
      // Re-fetch to get absolute latest state for checking if all done
      const finalJob = await payload.findByID({ collection: 'jobs', id: jobId })
      const updated = (finalJob.enhancedImageUrls || []) as any[]
      
      // Check if all images done → start template generation
      const allDone = updated.every((img: any) => img.status === 'completed' || img.status === 'failed')
      const hasFailed = updated.some((img: any) => img.status === 'failed')
      
      console.log('[Webhook] 📊 Checking if should start template:')
      console.log('[Webhook]    allDone:', allDone)
      console.log('[Webhook]    hasFailed:', hasFailed)
      console.log('[Webhook]    selectedTemplateUrl:', finalJob.selectedTemplateUrl ? 'exists' : 'MISSING')
      console.log('[Webhook]    Image statuses:', updated.map((img: any) => `#${img.index}: ${img.status}`))
      
      if (allDone && !hasFailed && finalJob.selectedTemplateUrl) {
        // ✅ CRITICAL: Check if template already started BEFORE waiting
        const templateGen = finalJob.templateGeneration || {}
        if (templateGen.predictionId || templateGen.url || templateGen.lockMarker) {
          console.log('[Webhook] ⏭️ Template already started by another webhook - skipping')
          return {
            updatedUrls: null,
            newJobStatus: 'generating_template',
          }
        }
        console.log('[Webhook] 🎨 All images done → Starting template generation...')
        
        // ✅ Log full URLs with index
        const completedImages = updated.filter((img: any) => img.status === 'completed')
        console.log('[Webhook]    Enhanced URLs count:', completedImages.length)
        completedImages.forEach((img: any) => {
          console.log(`[Webhook]       [Index ${img.index}] ${img.url}`)
        })
        
        // Wait 2-5s random to prevent race condition
        const randomDelay = 2000 + Math.floor(Math.random() * 3000)
        console.log(`[Webhook] ⏱️  Waiting ${randomDelay}ms (random) to prevent race condition...`)
        await new Promise(resolve => setTimeout(resolve, randomDelay))
        
        // ✅ Atomic check + lock: Set marker first, then verify we're the winner
        const lockMarker = `lock-${Date.now()}-${Math.random().toString(36).substring(7)}`
        console.log(`[Webhook] 🔒 Attempting to lock with marker: ${lockMarker}`)
        
        // Try to set lock atomically
        const latestJob = await payload.findByID({
          collection: 'jobs',
          id: finalJob.id,
        })
        
        const latestTemplateGen = latestJob.templateGeneration || {}
        
        // Check if already started OR if someone else locked it
        if (latestTemplateGen.predictionId || latestTemplateGen.url || latestTemplateGen.lockMarker) {
          console.log('[Webhook] ⏭️ Template already started/locked by another webhook')
          console.log('[Webhook]    predictionId:', latestTemplateGen.predictionId)
          console.log('[Webhook]    url:', latestTemplateGen.url)
          console.log('[Webhook]    lockMarker:', latestTemplateGen.lockMarker)
        } else {
          // Set lock marker first (with retry for write conflicts)
          await retryOnWriteConflict(async () => {
            await payload.update({
              collection: 'jobs',
              id: finalJob.id,
              data: {
                templateGeneration: {
                  lockMarker: lockMarker,
                  status: 'locking',
                },
              },
            })
          })
          
          // Wait a bit for DB to propagate
          await new Promise(resolve => setTimeout(resolve, 100))
          
          // Verify we're the winner (refetch and check if our marker survived)
          const verifyJob = await payload.findByID({
            collection: 'jobs',
            id: finalJob.id,
          })
          
          const verifyGen = verifyJob.templateGeneration || {}
          if (verifyGen.lockMarker !== lockMarker) {
            console.log('[Webhook] 🚫 Lost race condition - another webhook won')
            console.log('[Webhook]    Our marker:', lockMarker)
            console.log('[Webhook]    Winner marker:', verifyGen.lockMarker)
          } else {
            console.log('[Webhook] ✅ Won race condition - proceeding with template generation')
          
            // ✅ Debug: Log ALL images before filtering
            console.log('[Webhook] 🔍 DEBUG: All images in updated array:')
            updated.forEach((img: any, i: number) => {
              console.log(`[Webhook]       [${i}] Index=${img.index}, Status=${img.status}, URL=${img.url ? img.url.substring(0, 80) : 'null'}`)
            })
            
            // ✅ Sort by index to ensure correct order
            const enhancedImageUrls = updated
              .filter((img: any) => img.status === 'completed' && img.url)
              .sort((a: any, b: any) => a.index - b.index)
              .map((img: any) => img.url)
            
            console.log('[Webhook] 🚀 Starting template with:', {
              enhancedImageCount: enhancedImageUrls.length,
              templateUrl: finalJob.selectedTemplateUrl,
              jobId: finalJob.id,
              outputSize: finalJob.outputSize,
            })
            
            // ✅ Log each URL with order for debugging
            console.log('[Webhook] 📸 Sending URLs in order:')
            enhancedImageUrls.forEach((url: string, i: number) => {
              console.log(`[Webhook]    Position ${i}: ${url}`)
            })
            
            const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
            const templateUrl = `${baseUrl}/api/generate/create-template`
            
            try {
              const response = await fetch(templateUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  enhancedImageUrls,
                  templateUrl: finalJob.selectedTemplateUrl,
                  jobId: finalJob.id,
                  outputSize: finalJob.outputSize,
                }),
              })
              
              if (!response.ok) {
                const errorText = await response.text()
                console.error('[Webhook] ❌ Template generation API failed:', response.status, errorText)
                throw new Error(`API returned ${response.status}: ${errorText}`)
              }
              
              const result = await response.json()
              console.log('[Webhook] ✅ Template generation started:', result.predictionId)
            } catch (error) {
              console.error('[Webhook] ❌ Failed to start template generation:', error)
            }
          }
        }
      }
      
      return {
        updatedUrls: null, // ✅ Don't return - already updated atomically
        newJobStatus: allDone ? (hasFailed ? 'failed' : 'generating_template') : 'enhancing',
      }
      
    } catch (error) {
      console.error('[Webhook] ❌ Upload failed:', error)
      // For failed case, we can still use atomic update
      const jobId = job.id
      const currentIndex = currentImg.index
      await retryOnWriteConflict(async () => {
        const { getPayload } = await import('payload')
        const configPromise = await import('@payload-config')
        const payload = await getPayload({ config: configPromise.default })
        const latestJob = await payload.findByID({ collection: 'jobs', id: jobId })
        const urls = (latestJob.enhancedImageUrls || []) as any[]
        const idx = urls.findIndex((img: any) => img.index === currentIndex)
        if (idx !== -1) {
          urls[idx] = { ...urls[idx], status: 'failed', error: 'Upload failed', webhookFailed: true }
          await payload.update({
            collection: 'jobs',
            id: jobId,
            data: { enhancedImageUrls: urls, status: 'failed' },
          })
        }
      })
      return { updatedUrls: null, newJobStatus: 'failed' }
    }
  }
  
  // Status still enhancing - no update needed
  return { updatedUrls: null, newJobStatus: null }
}

/**
 * Helper: Handle template generation (Step 2)
 */
async function handleTemplateGeneration(job: Job, predictionId: string, status: string, output: any, body: any, isUpscale: boolean) {
  if (status === 'failed') {
    return {
      updatedUrls: job.enhancedImageUrls,
      newJobStatus: 'failed',
      templateUpdate: {
        status: 'failed',
        error: body.error || 'Template generation failed',
      },
    }
  }
  
  if (status === 'succeeded' && output) {
    const replicateUrl = Array.isArray(output) ? output[0] : output
    
    if (isUpscale) {
      // Template upscale completed → upload
      try {
        console.log('[Webhook] 📤 Uploading template...')
        
        const imageResponse = await fetch(replicateUrl, { 
          signal: AbortSignal.timeout(5000),
        })
        
        const imageBuffer = await imageResponse.arrayBuffer()
        
        // Resize if needed
        const OUTPUT_SIZE_MAP: Record<string, { width: number; height: number } | null> = {
          '1:1-2K': null,
          '3:4-2K': { width: 1080, height: 1350 },
          '4:5-2K': { width: 1080, height: 1350 },
          '9:16-2K': { width: 1080, height: 1920 },
        }
        
        const targetSize = OUTPUT_SIZE_MAP[job.outputSize || '1:1-2K']
        let optimizedBuffer: Buffer
        let dimensions = ''
        
        if (targetSize) {
          console.log(`[Webhook] 🔧 Resizing template to ${targetSize.width}×${targetSize.height}...`)
          optimizedBuffer = await sharp(Buffer.from(imageBuffer))
            .resize(targetSize.width, targetSize.height, { fit: 'cover' })
            .jpeg({ quality: 90 })
            .toBuffer()
          dimensions = `${targetSize.width}x${targetSize.height}`
        } else {
          optimizedBuffer = Buffer.from(imageBuffer)
          const metadata = await sharp(Buffer.from(imageBuffer)).metadata()
          dimensions = `${metadata.width}x${metadata.height}`
        }
        
        const filename = `template-${dimensions}`
        
        const cloudinaryUrl = await uploadBufferToCloudinary(
          optimizedBuffer,
          `jobs/${job.id}`,
          filename
        )
        
        console.log('[Webhook] ✅ Template uploaded:', cloudinaryUrl)
        
        return {
          updatedUrls: job.enhancedImageUrls,
          newJobStatus: 'completed',
          templateUpdate: {
            url: cloudinaryUrl,
            status: 'succeeded',
            upscalePredictionId: null,
          },
          templateUrl: cloudinaryUrl,
        }
        
      } catch (error) {
        console.error('[Webhook] ❌ Template upload failed:', error)
        return {
          updatedUrls: job.enhancedImageUrls,
          newJobStatus: 'failed',
          templateUpdate: {
            status: 'failed',
            error: 'Template upload failed',
          },
        }
      }
    } else {
      // Template generated → start upscale if 1:1
      const shouldUpscale = job.outputSize?.includes('1:1')
      
      if (shouldUpscale) {
        console.log('[Webhook] 📐 Template 1:1 → Starting upscale...')
        
        try {
          const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
          const upscaleRes = await fetch(`${baseUrl}/api/generate/upscale`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl: replicateUrl,
              scale: 2,
            }),
          })
          
          const upscaleData = await upscaleRes.json()
          console.log('[Webhook] ✅ Template upscale started:', upscaleData.predictionId)
          
          return {
            updatedUrls: job.enhancedImageUrls,
            newJobStatus: 'enhancing',  // ✅ Fixed: ต้องเป็น enhancing เพื่อให้ webhook หาเจอ
            templateUpdate: {
              upscalePredictionId: upscaleData.predictionId,
              predictionId: null,
              status: 'processing',
            },
          }
          
        } catch (error) {
          console.error('[Webhook] ❌ Template upscale failed:', error)
          return {
            updatedUrls: job.enhancedImageUrls,
            newJobStatus: 'failed',
            templateUpdate: {
              status: 'failed',
              error: 'Template upscale failed',
            },
          }
        }
      } else {
        // No upscale needed → upload directly
        console.log('[Webhook] 📐 No upscale needed → Uploading directly...')
        return handleTemplateGeneration(job, predictionId, status, output, body, true)
      }
    }
  }
  
  return {
    updatedUrls: job.enhancedImageUrls,
    newJobStatus: job.status,
  }
}

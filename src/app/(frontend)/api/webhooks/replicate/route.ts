import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { put, del } from '@vercel/blob'
import sharp from 'sharp'

// ✅ Force Node.js runtime
export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    // ⚠️ TODO: Enable webhook secret verification for production
    // const webhookSecret = req.headers.get('webhook-secret') || req.headers.get('x-webhook-secret')
    // const expectedSecret = process.env.REPLICATE_WEBHOOK_SECRET
    // 
    // if (expectedSecret && webhookSecret !== expectedSecret) {
    //   console.error('[Webhook] ❌ Invalid webhook secret')
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // }
    
    const body = await req.json()
    const payload = await getPayload({ config: configPromise })

    const { id: predictionId, status, output, error: replicateError, logs } = body

    console.log('[Webhook] ========== Replicate Webhook ==========')
    console.log('[Webhook] Prediction ID:', predictionId)
    console.log('[Webhook] Status:', status)
    console.log('[Webhook] Output:', output)
    if (replicateError) {
      console.error('[Webhook] ❌ Replicate Error:', replicateError)
    }
    if (logs) {
      console.log('[Webhook] 📝 Replicate Logs:', logs)
    }
    console.log('[Webhook] Full body:', JSON.stringify(body, null, 2))
    console.log('[Webhook] ===========================================')

    // ✅ ค้นหา Job ที่มี predictionId หรือ upscalePredictionId หรือ templateGeneration
    const jobs = await payload.find({
      collection: 'jobs',
      where: {
        or: [
          {
            'enhancedImageUrls.predictionId': {
              equals: predictionId,
            },
          },
          {
            'enhancedImageUrls.upscalePredictionId': {
              equals: predictionId,
            },
          },
          {
            'templateGeneration.predictionId': {
              equals: predictionId,
            },
          },
          {
            'templateGeneration.upscalePredictionId': {
              equals: predictionId,
            },
          },
          {
            'templatePredictionId': {
              equals: predictionId,
            },
          },
          {
            'templateUpscalePredictionId': {
              equals: predictionId,
            },
          },
        ],
      },
    })

    if (jobs.docs.length === 0) {
      console.log('[Webhook] ❌ No job found for predictionId:', predictionId)
      return NextResponse.json({ received: true, message: 'No job found' })
    }

    const job = jobs.docs[0]
    console.log('[Webhook] ✅ Found job:', job.id)

    // ✅ เช็คว่าเป็น template generation หรือไม่ (support both new and legacy)
    const templateGen = job.templateGeneration || {}
    const isTemplateGeneration = templateGen.predictionId === predictionId || job.templatePredictionId === predictionId
    
    if (isTemplateGeneration) {
      console.log('[Webhook] 🎨 Processing template generation')
      
      if (status === 'succeeded' && output) {
        const replicateUrl = Array.isArray(output) ? output[0] : output
        
        try {
          // Download template
          console.log('[Webhook] 📥 Downloading template from Replicate...')
          const imageResponse = await fetch(replicateUrl)
          const imageBuffer = await imageResponse.arrayBuffer()
          
          // ✅ ถ้า 1:1 → upscale, ถ้าอื่น → resize
          if (job.outputSize === '1:1-2K') {
            console.log('[Webhook] 🔍 Starting upscale to 2048x2048...')
            
            // Upload temp blob for upscale
            const tempBlob = await put(`jobs/${job.id}/template-temp-${Date.now()}.png`, Buffer.from(imageBuffer), {
              access: 'public',
              contentType: 'image/png',
            })
            
            // Start upscale
            const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
            const upscaleRes = await fetch(`${baseUrl}/api/generate/upscale`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageUrl: tempBlob.url,
                scale: 2,
              }),
            })
            
            if (!upscaleRes.ok) {
              throw new Error('Failed to start upscale')
            }
            
            const upscaleData = await upscaleRes.json()
            console.log('[Webhook] ✅ Upscale started:', upscaleData.predictionId)
            
            // Update job: set upscalePredictionId
            await payload.update({
              collection: 'jobs',
              id: job.id,
              data: {
                templateGeneration: {
                  predictionId: null,
                  upscalePredictionId: upscaleData.predictionId,
                  status: 'processing',
                  url: null,
                },
              },
            })
            
            console.log('[Webhook] ✅ Template generation completed, upscale in progress')
            return NextResponse.json({ received: true, jobId: job.id })
            
          } else {
            // ✅ 4:5 หรือ 9:16 → resize
            const OUTPUT_SIZE_MAP: Record<string, { width: number; height: number }> = {
              '1:1': { width: 2048, height: 2048 },
              '1:1-2K': { width: 2048, height: 2048 },
              '4:5': { width: 1080, height: 1350 },
              '4:5-2K': { width: 1080, height: 1350 },
              '4:3': { width: 1080, height: 1350 },
              '3:4': { width: 1080, height: 1350 },
              '9:16': { width: 1080, height: 1920 },
              '9:16-2K': { width: 1080, height: 1920 },
            }
            
            const targetSize = OUTPUT_SIZE_MAP[job.outputSize || ''] || { width: 1080, height: 1350 }
            console.log(`[Webhook] 📐 Resizing template to ${targetSize.width}×${targetSize.height}`)
            
            const resizedBuffer = await sharp(Buffer.from(imageBuffer))
              .resize(targetSize.width, targetSize.height, { fit: 'cover' })
              .jpeg({ quality: 90, mozjpeg: true })
              .toBuffer()
            
            const blobResult = await put(`jobs/${job.id}/template-${targetSize.width}x${targetSize.height}.jpg`, resizedBuffer, {
              access: 'public',
              contentType: 'image/jpeg',
              addRandomSuffix: true,
            })
            
            console.log('[Webhook] ✅ Template uploaded:', blobResult.url)
            
            // Update job with template URL
            await payload.update({
              collection: 'jobs',
              id: job.id,
              data: {
                templateGeneration: {
                  predictionId: null,
                  upscalePredictionId: null,
                  status: 'succeeded',
                  url: blobResult.url,
                },
                templateUrl: blobResult.url,
              },
            })
            
            console.log('[Webhook] ✅ Template completed')
            return NextResponse.json({ received: true, jobId: job.id })
          }
          
        } catch (error) {
          console.error('[Webhook] ❌ Template processing failed:', error)
          
          // Clear templateGeneration.predictionId on error
          await payload.update({
            collection: 'jobs',
            id: job.id,
            data: {
              templateGeneration: {
                predictionId: null,
                upscalePredictionId: null,
                status: 'failed',
                url: null,
              },
            },
          })
          
          return NextResponse.json({ received: true, error: 'Template processing failed' })
        }
      } else if (status === 'failed') {
        console.error('[Webhook] ❌ Template generation failed')
        await payload.update({
          collection: 'jobs',
          id: job.id,
          data: {
            templateGeneration: {
              predictionId: null,
              upscalePredictionId: null,
              status: 'failed',
              url: null,
            },
          },
        })
        return NextResponse.json({ received: true, error: 'Template generation failed' })
      }
      
      // Processing/starting - no action
      return NextResponse.json({ received: true })
    }

    // ✅ เช็คว่าเป็น template upscale หรือไม่
    const isTemplateUpscale = templateGen.upscalePredictionId === predictionId || job.templateUpscalePredictionId === predictionId
    
    if (isTemplateUpscale) {
      console.log('[Webhook] 🎨 Processing template upscale')
      
      if (status === 'succeeded' && output) {
        const replicateUrl = Array.isArray(output) ? output[0] : output
        
        try {
          // Download and upload to Blob
          const imageResponse = await fetch(replicateUrl)
          const imageBuffer = await imageResponse.arrayBuffer()
          
          // Compress to JPG quality 90
          const optimizedBuffer = await sharp(Buffer.from(imageBuffer))
            .jpeg({ quality: 90, mozjpeg: true })
            .toBuffer()
          
          const blobResult = await put(`jobs/${job.id}/template-2048x2048.jpg`, optimizedBuffer, {
            access: 'public',
            contentType: 'image/jpeg',
            addRandomSuffix: true,
          })
          
          console.log('[Webhook] ✅ Template uploaded:', blobResult.url)
          
          // Update job with template URL
          await payload.update({
            collection: 'jobs',
            id: job.id,
            data: {
              templateGeneration: {
                predictionId: null,
                upscalePredictionId: null,
                status: 'succeeded',
                url: blobResult.url,
              },
              templateUrl: blobResult.url,
            },
          })
          
          console.log('[Webhook] ✅ Template upscale completed')
          return NextResponse.json({ received: true, jobId: job.id })
          
        } catch (error) {
          console.error('[Webhook] ❌ Template upload failed:', error)
          return NextResponse.json({ received: true, error: 'Upload failed' })
        }
      } else if (status === 'failed') {
        console.error('[Webhook] ❌ Template upscale failed')
        await payload.update({
          collection: 'jobs',
          id: job.id,
          data: {
            templateGeneration: {
              predictionId: null,
              upscalePredictionId: null,
              status: 'failed',
              url: null,
            },
          },
        })
        return NextResponse.json({ received: true, error: 'Template upscale failed' })
      }
      
      // Processing/starting - no action
      return NextResponse.json({ received: true })
    }

    // ✅ อัปเดตสถานะรูปภาพที่ตรงกับ predictionId หรือ upscalePredictionId
    const updatedUrls = await Promise.all(job.enhancedImageUrls?.map(async (img, index) => {
      const isMainPrediction = img.predictionId === predictionId
      const isUpscalePrediction = img.upscalePredictionId === predictionId
      
      if (isMainPrediction || isUpscalePrediction) {
        console.log(`[Webhook] 🎯 Processing image ${index + 1}:`, {
          isMainPrediction,
          isUpscalePrediction,
          currentStatus: img.status,
          hasUrl: !!img.url,
        })
        
        // ✅ Guard: ถ้ารูปนี้ completed และมี Blob URL แล้ว → skip (ยกเว้น upscale ที่กำลังแทนที่)
        if (!isUpscalePrediction && img.status === 'completed' && img.url && String(img.url).includes('blob.vercel-storage.com')) {
          console.log('[Webhook] ⏭️  Image already has Blob URL - skipping')
          return img
        }

        // กรณี failed - update status ทันที
        if (status === 'failed') {
          const errorMsg = replicateError || body.error || logs || 'Unknown error - check Replicate dashboard'
          console.error('[Webhook] ❌ Enhancement failed:', errorMsg)
          
          return {
            ...img,
            status: 'failed' as const,
            error: errorMsg,
          }
        }
        
        // กรณี succeeded - เช็คว่าต้อง upscale หรือ resize
        if (status === 'succeeded') {
          if (!output) {
            console.error('[Webhook] No output received despite succeeded status')
            return {
              ...img,
              status: 'failed' as const,
              error: 'No output URL received from Replicate',
            }
          }
          
          const replicateUrl = Array.isArray(output) ? output[0] : output
          
          // Validate Replicate URL
          const isValidUrl = typeof replicateUrl === 'string' && replicateUrl.length > 10 && 
                            (replicateUrl.startsWith('http://') || replicateUrl.startsWith('https://'))
          
          if (!isValidUrl) {
            console.error('[Webhook] Invalid URL from Replicate:', replicateUrl)
            console.error('[Webhook] Full output:', output)
            return {
              ...img,
              status: 'failed' as const,
              error: 'Invalid URL received from Replicate',
            }
          }
          
          // ✅ Upscale logic:
          // Custom-Prompt: รูปแต่ละรูป → ไม่ upscale (เก็บไว้สร้าง template)
          // Text-to-Image: 1:1 → upscale เป็น 2048×2048, อื่นๆ → resize
          const isImagenModel = body.model?.includes('imagen') || false
          // ✅ เช็คจาก contentTopic แทน customPrompt เพราะ text-to-image ก็ใช้ customPrompt field
          const isCustomPrompt = job.contentTopic && !job.contentTopic.includes('Text-to-Image')
          
          // ✅ Upscale เฉพาะ text-to-image (ไม่ใช่ custom-prompt) + outputSize มี 1:1
          const shouldUpscale = isMainPrediction && !isCustomPrompt && job.outputSize && (job.outputSize.includes('1:1') || job.outputSize.startsWith('1:1'))
          
          console.log(`[Webhook] Model: ${body.model || 'unknown'}, isImagen: ${isImagenModel}, isCustomPrompt: ${isCustomPrompt}, outputSize: ${job.outputSize}, shouldUpscale: ${shouldUpscale}`)
          
          if (shouldUpscale) {
            console.log('[Webhook] 📐 Output size is 1:1-2K, starting upscale to 2048x2048...')
            
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
              
              if (!upscaleRes.ok) {
                throw new Error('Failed to start upscale')
              }
              
              const upscaleData = await upscaleRes.json()
              console.log('[Webhook] ✅ Upscale started:', upscaleData.predictionId)
              
              return {
                ...img,
                tempOutputUrl: replicateUrl,
                upscalePredictionId: upscaleData.predictionId,
                status: 'pending' as const,
              }
            } catch (upscaleError) {
              console.error('[Webhook] ❌ Failed to start upscale:', upscaleError)
              return {
                ...img,
                status: 'failed' as const,
                error: 'Failed to start upscale process',
              }
            }
          }
          
          // ✅ ไม่ต้อง upscale (4:5 หรือ 9:16) หรือเป็น upscale prediction → upload/resize ทันที
          try {
            console.log('[Webhook] 🚀 Attempting to upload to Blob (fast path)...')
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout (safe for Vercel free tier)
            
            const imageResponse = await fetch(replicateUrl, { 
              signal: controller.signal,
              headers: { 'User-Agent': 'Mozilla/5.0' }
            })
            clearTimeout(timeoutId)
            
            if (!imageResponse.ok) {
              throw new Error(`HTTP ${imageResponse.status}`)
            }
            
            // ✅ ใช้ arrayBuffer + detect contentType
            const imageBuffer = await imageResponse.arrayBuffer()
            const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'
            
            // ✅ Resize ตาม outputSize (สำหรับ 4:5 และ 9:16)
            let optimizedBuffer: Buffer
            let finalContentType = 'image/jpeg'
            const ext = 'jpg'
            
            // ตรวจสอบว่าต้อง resize หรือไม่
            const OUTPUT_SIZE_MAP: Record<string, { width: number; height: number } | null> = {
              '1:1': null, // จะไปทาง upscale แทน (ไม่ resize)
              '1:1-2K': null, // จะไปทาง upscale แทน (ไม่ resize)
              '4:5': { width: 1080, height: 1350 },
              '4:5-2K': { width: 1080, height: 1350 },
              '4:3': { width: 1080, height: 1350 },
              '3:4': { width: 1080, height: 1350 },
              '9:16': { width: 1080, height: 1920 },
              '9:16-2K': { width: 1080, height: 1920 },
            }
            
            // ถ้า shouldUpscale = true จะไม่มาถึงตรงนี้ เพราะรอ upscale
            // ถ้าไม่เจอใน map ให้ใช้ค่า default สำหรับ 4:5
            const targetSize = OUTPUT_SIZE_MAP[job.outputSize || ''] !== undefined 
              ? OUTPUT_SIZE_MAP[job.outputSize || ''] 
              : { width: 1080, height: 1350 }
            
            console.log(`[Webhook] 🔍 Debug resize: jobId=${job.id}, outputSize=${job.outputSize}, targetSize=${JSON.stringify(targetSize)}, isMainPrediction=${isMainPrediction}, shouldUpscale=${shouldUpscale}, isCustomPrompt=${isCustomPrompt}`)
            
            if (targetSize) {
              // Resize to target dimensions (ทำทั้ง main และ upscale prediction)
              console.log(`[Webhook] 📐 RESIZING to ${targetSize.width}×${targetSize.height}...`)
              optimizedBuffer = await sharp(Buffer.from(imageBuffer))
                .resize(targetSize.width, targetSize.height, { fit: 'cover' })
                .jpeg({ quality: 90, mozjpeg: true })
                .toBuffer()
              console.log(`[Webhook] ✅ RESIZE COMPLETED to ${targetSize.width}×${targetSize.height}`)
            } else if (contentType.includes('png')) {
              // Convert PNG → JPG
              optimizedBuffer = await sharp(Buffer.from(imageBuffer))
                .jpeg({ quality: 85, mozjpeg: true })
                .toBuffer()
            } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
              // Compress JPG
              optimizedBuffer = await sharp(Buffer.from(imageBuffer))
                .jpeg({ quality: 85, mozjpeg: true })
                .toBuffer()
            } else if (contentType.includes('webp')) {
              // Convert WebP → JPG
              optimizedBuffer = await sharp(Buffer.from(imageBuffer))
                .jpeg({ quality: 85, mozjpeg: true })
                .toBuffer()
            } else {
              // Unknown format → keep original
              optimizedBuffer = Buffer.from(imageBuffer)
              finalContentType = contentType
            }
            
            const imageName = `jobs/${job.id}/enhanced-${img.predictionId}.${ext}`
            
            const blobResult = await put(imageName, optimizedBuffer, {
              access: 'public',
              contentType: finalContentType,
              addRandomSuffix: true,
            })
            
            console.log('[Webhook] ✅ Blob uploaded successfully:', blobResult.url)
            
            // ✅ ลบไฟล์ temp/preupscale หลังอัพสเกลสำเร็จ
            if (isUpscalePrediction && img.url && String(img.url).includes('blob.vercel-storage.com')) {
              try {
                // ลบไฟล์ preupscale เก่า
                await del(img.url)
                console.log('[Webhook] 🗑️  Deleted old preupscale image:', img.url)
              } catch (delError) {
                console.warn('[Webhook] ⚠️ Failed to delete old image:', delError)
              }
            }
            
            // ✅ Set completed และ clear prediction IDs ตามประเภท
            return {
              ...img,
              url: blobResult.url,
              originalUrl: replicateUrl,
              tempOutputUrl: replicateUrl,
              status: 'completed' as const,
              error: undefined,
              // Clear ตาม prediction type
              upscalePredictionId: isUpscalePrediction ? null : img.upscalePredictionId,
              predictionId: isMainPrediction ? null : img.predictionId,
            }
          } catch (uploadError) {
            // ⚠️ Upload ล้ม → ให้ polling ทำต่อ (fallback path)
            const errMsg = uploadError instanceof Error ? uploadError.message : 'Unknown'
            console.warn('[Webhook] ⚠️ Upload failed, fallback to polling:', errMsg)
            
            return {
              ...img,
              tempOutputUrl: replicateUrl, // เก็บ Replicate URL ชั่วคราว
              webhookFailed: true, // Flag ให้ polling รู้ว่าต้องทำต่อ
              status: 'pending' as const, // ยังไม่เสร็จ รอ polling
              error: undefined,
              // ✅ เก็บ prediction IDs ไว้สำหรับ polling
              upscalePredictionId: isUpscalePrediction ? predictionId : img.upscalePredictionId,
              predictionId: isMainPrediction ? predictionId : img.predictionId,
            }
          }
        }
        
        // กรณีอื่นๆ (processing, starting, canceled) - ไม่ต้องทำอะไร
        console.log('[Webhook] Status:', status, '- No action needed')
        return img
      }
      return img
    }) || [])

    // ตรวจสอบว่ารูปทั้งหมดเสร็จหรือยัง
    const allDone = updatedUrls?.every(
      (img) => img.status === 'completed' || img.status === 'failed',
    )
    
    // ตรวจสอบว่ามีรูปที่ failed หรือไม่
    const hasFailed = updatedUrls?.some(
      (img) => img.status === 'failed'
    )
    
    // ✅ ตรวจสอบว่ามีรูปที่กำลัง persist อยู่หรือไม่
    const hasPending = updatedUrls?.some(
      (img) => img.status === 'pending'
    )
    
    // ✅ ตัดสินใจ job status อย่างชัดเจน
    let newJobStatus = job.status
    if (allDone) {
      // ถ้ามีรูป failed แม้แค่รูปเดียว → job failed
      newJobStatus = hasFailed ? 'failed' : 'completed'
    } else if (hasPending) {
      // มีรูปยัง pending (รออัปโหลด/กำลัง persist)
      newJobStatus = 'enhancing' // หรือ 'persisting' ถ้ามี status นี้
    }

    // อัปเดต Job ใน Database (with exponential backoff for production)
    let retries = 5 // เพิ่มเป็น 5 ครั้งสำหรับ concurrent users
    let updateSuccess = false
    let attempt = 0
    
    while (retries > 0 && !updateSuccess) {
      try {
        await payload.update({
          collection: 'jobs',
          id: job.id,
          data: {
            enhancedImageUrls: updatedUrls as typeof job.enhancedImageUrls,
            status: newJobStatus,
          },
        })
        updateSuccess = true
        console.log('[Webhook] ✅ Job updated successfully')
      } catch (updateError: any) {
        retries--
        attempt++
        if (updateError.code === 112 || updateError.codeName === 'WriteConflict') {
          // Exponential backoff: 200ms, 400ms, 800ms, 1600ms, 2000ms (max)
          const baseDelay = Math.pow(2, attempt) * 100
          const jitter = Math.random() * 100 // Random 0-100ms
          const delay = Math.min(baseDelay + jitter, 2000)
          console.log(`[Webhook] ⚠️ WriteConflict (attempt ${attempt}), retry in ${delay.toFixed(0)}ms... (${retries} left)`)
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          // Other error, throw
          throw updateError
        }
      }
    }
    
    if (!updateSuccess) {
      console.error('[Webhook] ❌ Failed to update job after retries')
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
    }

    console.log('[Webhook] Updated job:', job.id, 'Status:', newJobStatus)

    return NextResponse.json({ received: true, jobId: job.id })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { put } from '@vercel/blob'

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

    // ค้นหา Job ที่มี predictionId นี้
    const jobs = await payload.find({
      collection: 'jobs',
      where: {
        'enhancedImageUrls.predictionId': {
          equals: predictionId,
        },
      },
    })

    if (jobs.docs.length === 0) {
      console.log('[Webhook] No job found for predictionId:', predictionId)
      return NextResponse.json({ received: true, message: 'No job found' })
    }

    const job = jobs.docs[0]
    console.log('[Webhook] Found job:', job.id)

    // อัปเดตสถานะรูปภาพที่ตรงกับ predictionId
    const updatedUrls = await Promise.all(job.enhancedImageUrls?.map(async (img) => {
      if (img.predictionId === predictionId) {
        // ✅ Guard: ถ้ารูปนี้มี Blob URL แล้ว → skip (ป้องกัน overwrite)
        if (img.status === 'completed' && img.url && String(img.url).includes('blob.vercel-storage.com')) {
          console.log('[Webhook] ⏭️  Image already has Blob URL - skipping')
          return img
        }

        // กรณี failed - update status ทันที
        if (status === 'failed') {
          const errorMsg = replicateError || body.error || logs || 'Unknown error - check Replicate dashboard'
          console.error('[Webhook] ❌ Enhancement failed:', errorMsg)
          
          // ✅ Safe logging
          try {
            const { logToJob } = await import('@/utilities/jobLogger')
            await logToJob(job.id, 'error', `❌ Image failed: ${errorMsg.substring(0, 100)}...`)
          } catch (logError) {
            // Ignore
          }
          
          return {
            ...img,
            status: 'failed' as const,
            error: errorMsg,
          }
        }
        
        // กรณี succeeded - พยายาม upload Blob (hybrid: fast path)
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
          
          // ✅ Hybrid: ลอง upload ทันที (fast path)
          try {
            console.log('[Webhook] 🚀 Attempting to upload to Blob (fast path)...')
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 8000) // 8s timeout
            
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
            
            // ✅ Extension from content type
            let ext = 'jpg'
            if (contentType.includes('png')) ext = 'png'
            else if (contentType.includes('webp')) ext = 'webp'
            
            const imageName = `jobs/${job.id}/enhanced-${img.predictionId}.${ext}`
            
            const blobResult = await put(imageName, imageBuffer, {
              access: 'public',
              contentType: contentType, // ✅ ระบุ content type
              addRandomSuffix: true, // ✅ กันชื่อชน
            })
            
            console.log('[Webhook] ✅ Blob uploaded successfully:', blobResult.url)
            
            // ✅ Safe logging
            try {
              const { logToJob } = await import('@/utilities/jobLogger')
              await logToJob(job.id, 'info', `✅ Image completed: ${predictionId.substring(0, 8)}...`)
            } catch (logError) {
              // Ignore
            }
            
            return {
              ...img,
              url: blobResult.url, // ✅ Permanent Blob URL
              tempOutputUrl: replicateUrl, // เก็บ temp URL ไว้ debug
              status: 'completed' as const,
              error: undefined,
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
    const allCompleted = updatedUrls?.every(
      (img) => img.status === 'completed' || img.status === 'failed',
    )
    
    // ✅ ตรวจสอบว่ามีรูปที่กำลัง persist อยู่หรือไม่
    const hasPending = updatedUrls?.some(
      (img) => img.status === 'pending'
    )
    
    // ✅ ตัดสินใจ job status อย่างชัดเจน
    let newJobStatus = job.status
    if (allCompleted) {
      newJobStatus = 'completed'
    } else if (hasPending) {
      // มีรูปยัง pending (รออัปโหลด/กำลัง persist)
      newJobStatus = 'enhancing' // หรือ 'persisting' ถ้ามี status นี้
    }

    // อัปเดต Job ใน Database
    await payload.update({
      collection: 'jobs',
      id: job.id,
      data: {
        enhancedImageUrls: updatedUrls as any,
        status: newJobStatus,
      },
    })

    console.log('[Webhook] Updated job:', job.id, 'Status:', newJobStatus)

    return NextResponse.json({ received: true, jobId: job.id })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { put } from '@vercel/blob'

export async function POST(req: Request) {
  try {
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
        
        // กรณี succeeded - เก็บ Replicate URL ไว้ชั่วคราว
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
          
          // ✅ เก็บ Replicate URL ชั่วคราว - ให้ Polling ทำ upload
          console.log('[Webhook] ✅ Replicate completed, storing URL for polling to upload')
          return {
            ...img,
            status: 'pending' as const, // Still pending until uploaded to Blob
            originalUrl: replicateUrl, // Replicate URL (ชั่วคราว)
            error: undefined,
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

    // อัปเดต Job ใน Database
    await payload.update({
      collection: 'jobs',
      id: job.id,
      data: {
        enhancedImageUrls: updatedUrls,
        status: allCompleted ? 'completed' : job.status,
      },
    })

    console.log('[Webhook] Updated job:', job.id, 'Status:', allCompleted ? 'completed' : job.status)

    return NextResponse.json({ received: true, jobId: job.id })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

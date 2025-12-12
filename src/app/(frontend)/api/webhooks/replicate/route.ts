import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { put } from '@vercel/blob'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const payload = await getPayload({ config: configPromise })

    const { id: predictionId, status, output } = body

    console.log('[Webhook] Received from Replicate:', { predictionId, status, output })

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
        const replicateUrl = status === 'succeeded' && output ? (Array.isArray(output) ? output[0] : output) : img.url
        
        // Validate Replicate URL
        const isValidUrl = typeof replicateUrl === 'string' && replicateUrl.length > 10 && 
                          (replicateUrl.startsWith('http://') || replicateUrl.startsWith('https://'))
        
        if (status === 'succeeded' && !isValidUrl) {
          console.error('[Webhook] Invalid URL from Replicate:', replicateUrl)
          console.error('[Webhook] Full output:', output)
          return {
            ...img,
            status: 'failed' as const,
            error: 'Invalid URL received from Replicate',
          }
        }
        
        // ถ้าสำเร็จ ให้ download และ upload ไป Blob Storage
        if (status === 'succeeded' && replicateUrl) {
          try {
            console.log('[Webhook] Downloading image from Replicate...')
            const imageResponse = await fetch(replicateUrl)
            
            if (!imageResponse.ok) {
              throw new Error(`Failed to download: ${imageResponse.statusText}`)
            }
            
            const imageBuffer = await imageResponse.arrayBuffer()
            const contentType = imageResponse.headers.get('content-type') || 'image/png'
            
            // Detect extension
            let extension = 'png'
            if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = 'jpg'
            if (contentType.includes('webp')) extension = 'webp'
            
            const timestamp = Date.now()
            const randomSuffix = Math.random().toString(36).substring(2, 8)
            const filename = `enhanced-${timestamp}-${randomSuffix}.${extension}`
            const blobPath = `jobs/${job.id}/${filename}`
            
            console.log('[Webhook] Uploading to Blob Storage...')
            const blob = await put(blobPath, imageBuffer, {
              access: 'public',
              contentType: contentType,
            })
            
            console.log('[Webhook] ✅ Uploaded to Blob:', blob.url)
            
            // เก็บ Blob URL ใน url, เก็บ Replicate URL ใน originalUrl
            return {
              ...img,
              status: 'completed' as const,
              url: blob.url, // Blob URL (ถาวร)
              originalUrl: replicateUrl, // Replicate URL (สำรอง)
              error: undefined,
            }
          } catch (uploadError) {
            console.error('[Webhook] ❌ Failed to upload to Blob:', uploadError)
            // ถ้า upload ล้มเหลว ให้เก็บ Replicate URL ไว้ชั่วคราว และ mark ว่ายัง pending
            // Polling จะมาจัดการต่อ
            return {
              ...img,
              status: 'pending' as const, // ยังไม่เสร็จสมบูรณ์
              originalUrl: replicateUrl, // เก็บไว้ให้ polling ลองใหม่
              error: `Upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`,
            }
          }
        }
        
        // กรณี failed
        if (status === 'failed') {
          const errorMsg = body.error || 'Unknown error'
          console.log('[Webhook] Enhancement failed:', errorMsg)
          return {
            ...img,
            status: 'failed' as const,
            error: errorMsg,
          }
        }
        
        // กรณีอื่นๆ (processing, starting)
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

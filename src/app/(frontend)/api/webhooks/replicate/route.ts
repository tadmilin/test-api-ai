import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

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
    const updatedUrls = job.enhancedImageUrls?.map((img) => {
      if (img.predictionId === predictionId) {
        const finalUrl = status === 'succeeded' && output ? (Array.isArray(output) ? output[0] : output) : img.url
        
        // Validate URL before assigning
        const isValidUrl = typeof finalUrl === 'string' && finalUrl.length > 10 && 
                          (finalUrl.startsWith('http://') || finalUrl.startsWith('https://'))
        
        if (status === 'succeeded' && !isValidUrl) {
          console.error('[Webhook] Invalid URL from Replicate:', finalUrl)
          console.error('[Webhook] Full output:', output)
          // Don't update URL with invalid value
          return img
        }
        
        const errorMsg = body.error || (status === 'failed' ? 'Unknown error' : undefined)
        console.log('[Webhook] Updating image:', { predictionId, status, finalUrl, error: errorMsg })
        return {
          ...img,
          status: (status === 'succeeded' ? 'completed' : status === 'failed' ? 'failed' : img.status) as 'pending' | 'completed' | 'failed',
          url: finalUrl,
          error: errorMsg,
        }
      }
      return img
    })

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

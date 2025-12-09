import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * Retry failed image enhancement
 */
export async function POST(request: NextRequest) {
  try {
    const { jobId, imageIndex } = await request.json()

    if (!jobId || imageIndex === undefined) {
      return NextResponse.json({ error: 'jobId and imageIndex required' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const job = await payload.findByID({
      collection: 'jobs',
      id: jobId,
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const enhancedImages = job.enhancedImageUrls || []
    
    if (imageIndex >= enhancedImages.length) {
      return NextResponse.json({ error: 'Invalid image index' }, { status: 400 })
    }

    const targetImage = enhancedImages[imageIndex]
    
    if (!targetImage.originalUrl) {
      return NextResponse.json({ error: 'No original URL found' }, { status: 400 })
    }

    console.log(`🔄 Retrying image ${imageIndex + 1} for job ${jobId}`)

    // Get prompt
    const baseUrl = request.nextUrl.origin || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    const photoTypeFromSheet = job.photoTypeFromSheet || null

    const promptRes = await fetch(`${baseUrl}/api/generate/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoTypeFromSheet }),
    })

    if (!promptRes.ok) {
      throw new Error('Failed to get prompt')
    }

    const { prompt, photoType } = await promptRes.json()

    // Start new enhancement
    const enhanceRes = await fetch(`${baseUrl}/api/generate/enhance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: targetImage.originalUrl,
        prompt,
        photoType,
        jobId,
      }),
    })

    if (!enhanceRes.ok) {
      throw new Error('Failed to start enhancement')
    }

    const { predictionId } = await enhanceRes.json()

    // Update the specific image
    enhancedImages[imageIndex] = {
      ...targetImage,
      predictionId,
      url: '',
      status: 'pending',
    }

    await payload.update({
      collection: 'jobs',
      id: jobId,
      data: {
        enhancedImageUrls: enhancedImages,
      },
    })

    await payload.create({
      collection: 'job-logs',
      data: {
        jobId,
        level: 'info',
        message: `Retrying image ${imageIndex + 1}: ${predictionId}`,
        timestamp: new Date().toISOString(),
      },
    })

    return NextResponse.json({
      success: true,
      predictionId,
      imageIndex,
    })

  } catch (error: any) {
    console.error('❌ Retry error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to retry' },
      { status: 500 }
    )
  }
}

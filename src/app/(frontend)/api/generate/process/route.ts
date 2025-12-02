import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json()

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      )
    }

    const payload = await getPayload({ config })

    // Get the job
    const job = await payload.findByID({
      collection: 'jobs',
      id: jobId,
    })

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    // Update job status to processing
    await payload.update({
      collection: 'jobs',
      id: jobId,
      data: {
        status: 'processing',
      },
    })

    // Log start
    await payload.create({
      collection: 'job-logs',
      data: {
        jobId: jobId,
        level: 'info',
        message: 'Started processing job',
        timestamp: new Date().toISOString(),
      },
    })

    try {
      // Step 1: Generate prompt with Claude
      const promptResponse = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/generate/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: job.productName,
          productDescription: job.productDescription,
          mood: job.mood,
          referenceImageUrls: job.referenceImageUrls?.map((img) => img.url).filter(Boolean) || [],
        }),
      })

      if (!promptResponse.ok) {
        throw new Error('Failed to generate prompt')
      }

      const { prompt } = await promptResponse.json()

      // Update job with generated prompt
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          generatedPrompt: prompt,
          promptGeneratedAt: new Date().toISOString(),
        },
      })

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'info',
          message: 'Generated prompt successfully',
          timestamp: new Date().toISOString(),
        },
      })

      // Step 2: Generate image with DALL-E
      const imageResponse = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/generate/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          jobId,
        }),
      })

      if (!imageResponse.ok) {
        throw new Error('Failed to generate image')
      }

      const { imageUrl } = await imageResponse.json()

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'info',
          message: 'Generated image successfully',
          timestamp: new Date().toISOString(),
        },
      })

      // Step 3: Resize image for different platforms
      const resizeResponse = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/generate/resize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: imageUrl,
          platforms: job.targetPlatforms || ['facebook', 'instagram_feed', 'instagram_story'],
          jobId,
        }),
      })

      if (!resizeResponse.ok) {
        throw new Error('Failed to resize images')
      }

      const resizedImages = await resizeResponse.json()

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'info',
          message: 'Resized images successfully',
          timestamp: new Date().toISOString(),
        },
      })

      // Step 4: Update job status to completed
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          status: 'completed',
          // TODO: Store actual media IDs after uploading resized images
        },
      })

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'info',
          message: 'Job completed successfully',
          timestamp: new Date().toISOString(),
        },
      })

      return NextResponse.json({
        success: true,
        jobId,
        prompt,
        imageUrl,
        resizedImages,
      })

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Image generation failed'
      // Log error
      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'error',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      })

      // Update job status to failed
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          status: 'failed',
          errorMessage: errorMessage,
          retryCount: (job.retryCount || 0) + 1,
        },
      })

      throw error
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to process job'
    console.error('Error processing job:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

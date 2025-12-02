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
      // Get base URL for internal API calls
      const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
      
      // Step 1: Generate prompt with GPT-4
      console.log('Generating prompt...')
      const promptResponse = await fetch(`${baseUrl}/api/generate/prompt`, {
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
        const errorText = await promptResponse.text()
        console.error('Prompt generation failed:', errorText)
        throw new Error(`Failed to generate prompt: ${errorText}`)
      }

      const { prompt } = await promptResponse.json()
      console.log('Prompt generated:', prompt.substring(0, 100) + '...')

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
      console.log('Generating image with DALL-E...')
      const imageResponse = await fetch(`${baseUrl}/api/generate/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          jobId,
        }),
      })

      if (!imageResponse.ok) {
        const errorText = await imageResponse.text()
        console.error('Image generation failed:', errorText)
        throw new Error(`Failed to generate image: ${errorText}`)
      }

      const { imageUrl } = await imageResponse.json()
      console.log('Image generated:', imageUrl)

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
      console.log('Resizing images...')
      const resizeResponse = await fetch(`${baseUrl}/api/generate/resize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: imageUrl,
          platforms: job.targetPlatforms || ['facebook', 'instagram_feed', 'instagram_story'],
          jobId,
        }),
      })

      if (!resizeResponse.ok) {
        const errorText = await resizeResponse.text()
        console.error('Resize failed:', errorText)
        throw new Error(`Failed to resize images: ${errorText}`)
      }

      const resizedImages = await resizeResponse.json()
      console.log('Images resized:', Object.keys(resizedImages))

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'info',
          message: 'Resized images successfully',
          timestamp: new Date().toISOString(),
        },
      })

      // Step 4: Update job with generated images from Vercel Blob
      const generatedImages: Record<string, { url: string; id: string }> = {}

      for (const [platform, data] of Object.entries(resizedImages) as [string, { url: string; width: number; height: number }][]) {
        generatedImages[platform] = {
          url: data.url,
          id: '', // Vercel Blob doesn't use IDs, only URLs
        }
      }

      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          status: 'completed',
          generatedImages,
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

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

export async function POST(request: NextRequest) {
  try {
    const { jobId, imageIndex, action } = await request.json()

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    if (typeof imageIndex !== 'number') {
      return NextResponse.json({ error: 'imageIndex is required' }, { status: 400 })
    }

    if (!action || !['approve', 'regenerate'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve" or "regenerate"' },
        { status: 400 }
      )
    }

    const payload = await getPayload({ config })

    // Get current job
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

    console.log(`📸 Image review - Job: ${jobId}, Index: ${imageIndex}, Action: ${action}`)

    if (action === 'approve') {
      // Mark image as approved
      enhancedImages[imageIndex].status = 'approved'

      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          enhancedImageUrls: enhancedImages,
        },
      })

      // Check if all images are approved
      const allApproved = enhancedImages.every((img: { status?: string | null }) => img.status === 'approved')

      if (allApproved) {
        await payload.update({
          collection: 'jobs',
          id: jobId,
          data: {
            reviewCompleted: true,
            status: 'style_selection',
          },
        })

        console.log('✅ All images approved - moving to style selection')
      }

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'info',
          message: `Image ${imageIndex + 1} approved`,
          timestamp: new Date().toISOString(),
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Image approved',
        allApproved,
      })

    } else if (action === 'regenerate') {
      // Mark as regenerating
      enhancedImages[imageIndex].status = 'regenerating'

      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          enhancedImageUrls: enhancedImages,
          status: 'enhancing',
        },
      })

      console.log(`🔄 Regenerating image ${imageIndex + 1}...`)

      // Call enhance API for single image
      const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
      const originalImage = enhancedImages[imageIndex].originalUrl

      if (!originalImage) {
        throw new Error('Original image URL not found')
      }

      // First, get the prompt (which includes photoType detection)
      const promptResponse = await fetch(`${baseUrl}/api/generate/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceImageUrls: [originalImage],
          productName: job.productName || 'Untitled',
          contentTopic: job.contentTopic || '',
          contentDescription: job.contentDescription || '',
        }),
      })

      if (!promptResponse.ok) {
        throw new Error('Failed to generate prompt')
      }

      const promptData = await promptResponse.json()
      const prompt = promptData.prompt
      const photoType = promptData.photoType

      console.log('📝 Generated prompt for regeneration:', prompt.substring(0, 100) + '...')
      console.log('📸 Detected photo type:', photoType)

      // Now call enhance with the proper prompt
      const enhanceResponse = await fetch(`${baseUrl}/api/generate/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: jobId,
          imageUrl: originalImage,
          prompt: prompt,
          photoType: photoType,
        }),
      })

      if (!enhanceResponse.ok) {
        throw new Error('Failed to regenerate image')
      }

      const enhanceData = await enhanceResponse.json()
      const newEnhancedUrl = enhanceData.imageUrl // Fixed: enhance API returns "imageUrl" not "enhancedImageUrl"

      // Update with new URL and mark as pending
      enhancedImages[imageIndex].url = newEnhancedUrl
      enhancedImages[imageIndex].status = 'pending'

      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          enhancedImageUrls: enhancedImages,
          status: 'review_pending',
        },
      })

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'info',
          message: `Image ${imageIndex + 1} regenerated`,
          timestamp: new Date().toISOString(),
        },
      })

      console.log(`✅ Image ${imageIndex + 1} regenerated: ${newEnhancedUrl}`)

      return NextResponse.json({
        success: true,
        message: 'Image regenerated',
        newUrl: newEnhancedUrl,
      })
    }

  } catch (error: unknown) {
    console.error('❌ Review error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to process review' },
      { status: 500 }
    )
  }
}

// GET endpoint to check review status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
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
    const allApproved = enhancedImages.every((img: { status?: string | null }) => img.status === 'approved')
    const anyRegenerating = enhancedImages.some((img: { status?: string | null }) => img.status === 'regenerating')

    return NextResponse.json({
      success: true,
      enhancedImages,
      allApproved,
      anyRegenerating,
      reviewCompleted: job.reviewCompleted || false,
    })

  } catch (error: unknown) {
    console.error('❌ Get review status error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

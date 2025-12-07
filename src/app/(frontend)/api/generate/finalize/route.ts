import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

// This endpoint is called AFTER user reviews and approves all images
// It generates the final template using AI (Nano-Banana Pro)
export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json()

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

    // Check if review is completed
    if (!job.reviewCompleted) {
      return NextResponse.json(
        { error: 'Please review and approve all images first' },
        { status: 400 }
      )
    }

    // Get approved images
    const enhancedImages = job.enhancedImageUrls || []
    const approvedImages = enhancedImages
      .filter((img: { status?: string | null }) => img.status === 'approved')
      .map((img: { url?: string | null }) => img.url)

    if (approvedImages.length === 0) {
      return NextResponse.json(
        { error: 'No approved images found' },
        { status: 400 }
      )
    }

    const templateType = job.templateType || 'triple'
    const templateStyle = job.templateStyle || 'minimal'

    console.log(`🎨 Generating AI template:`)
    console.log(`  - Type: ${templateType}`)
    console.log(`  - Style: ${templateStyle}`)
    console.log(`  - Images: ${approvedImages.length}`)

    // Update status
    await payload.update({
      collection: 'jobs',
      id: jobId,
      data: {
        status: 'generating_template',
      },
    })

    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

    // AI MODE: Use Nano-Banana Pro
    console.log('🤖 Calling AI template generation...')

    const aiResponse = await fetch(`${baseUrl}/api/generate/ai-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrls: approvedImages,
        templateStyle: templateStyle,
        templateType: templateType,
        jobId: jobId,
      }),
    })

    if (!aiResponse.ok) {
      throw new Error('AI template generation failed')
    }

    const aiData = await aiResponse.json()
    const finalImageUrl = aiData.templateUrl

    await payload.create({
      collection: 'job-logs',
      data: {
        jobId: jobId,
        level: 'info',
        message: `AI template generated (${templateStyle} style, ${templateType} layout)`,
        timestamp: new Date().toISOString(),
      },
    })

    if (!finalImageUrl) {
      throw new Error('Failed to generate template')
    }

    // Update job as completed
    await payload.update({
      collection: 'jobs',
      id: jobId,
      data: {
        finalImageUrl: finalImageUrl,
        status: 'completed',
        generatedPrompt: `AI template generated: ${templateStyle} style, ${templateType} layout`,
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

    console.log('✅ Template generation complete:', finalImageUrl)

    return NextResponse.json({
      success: true,
      message: 'Template generated successfully',
      finalImageUrl: finalImageUrl,
      templateStyle: templateStyle,
      templateType: templateType,
    })

  } catch (error: unknown) {
    console.error('❌ Template generation error:', error)

    const payload = await getPayload({ config })
    const { jobId } = await request.json()
    const errorMessage = error instanceof Error ? error.message : 'Template generation failed'

    if (jobId) {
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          status: 'failed',
        },
      })

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'error',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      })
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

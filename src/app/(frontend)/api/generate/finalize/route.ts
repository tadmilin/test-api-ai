import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

// This endpoint is called AFTER user reviews and approves all images
// It generates the final template using AI (Nano-Banana Pro)
export async function POST(request: NextRequest) {
  let jobId: string | null = null
  
  try {
    const body = await request.json()
    jobId = body.jobId

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

    // Get enhanced images
    const enhancedImages = job.enhancedImageUrls || []
    const approvedImages = enhancedImages
      .filter((img: { status?: string | null }) => img.status === 'approved')
      .map((img: { url?: string | null }) => img.url)

    if (approvedImages.length === 0) {
      return NextResponse.json(
        { error: 'No approved images found. Please approve at least one image.' },
        { status: 400 }
      )
    }

    // Check if all images are approved
    const allApproved = enhancedImages.every((img: { status?: string | null }) => img.status === 'approved')
    
    if (!allApproved) {
      return NextResponse.json(
        { error: 'Please approve all images before finalizing' },
        { status: 400 }
      )
    }

    // Auto-set reviewCompleted if all approved but not yet marked
    if (!job.reviewCompleted && allApproved) {
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          reviewCompleted: true,
        },
      })
      console.log('✅ Auto-set reviewCompleted to true')
    }

    const templateType = job.templateType || 'triple'

    console.log(`🎨 Template generation requested:`)
    console.log(`  - Type: ${templateType}`)
    console.log(`  - Images: ${approvedImages.length}`)
    console.log(`⚠️ Template generation is currently disabled`)

    // FEATURE DISABLED: Template generation
    // Client requested to disable template generation feature
    // Code is preserved for future re-enablement
    
    // Update status to completed (skip template generation)
    await payload.update({
      collection: 'jobs',
      id: jobId,
      data: {
        status: 'completed',
        reviewCompleted: true,
      },
    })
    
    console.log('✅ Job marked as completed (template generation skipped)')

    return NextResponse.json({
      success: true,
      message: 'Job completed successfully (template generation disabled)',
      jobId: jobId,
      templateDisabled: true,
    })

    /* TEMPLATE GENERATION CODE - DISABLED
    // Update status
    await payload.update({
      collection: 'jobs',
      id: jobId,
      data: {
        status: 'generating_template',
      },
    })

    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

    // AI MODE: Start template generation (async)
    console.log('🤖 Starting AI template generation...')

    const aiResponse = await fetch(`${baseUrl}/api/generate/ai-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrls: approvedImages,
        templateType: templateType,
        jobId: jobId,
      }),
    })

    if (!aiResponse.ok) {
      throw new Error('Failed to start template generation')
    }

    const aiData = await aiResponse.json()
    
    // Return prediction ID for frontend to poll
    return NextResponse.json({
      success: true,
      message: 'Template generation started',
      predictionId: aiData.predictionId,
      jobId: jobId,
    })
    */

  } catch (error: unknown) {
    console.error('❌ Template generation error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Template generation failed'

    // Use jobId captured at the start, don't read body again
    if (jobId) {
      try {
        const payload = await getPayload({ config })
        
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
      } catch (updateError) {
        console.error('Failed to update job status:', updateError)
      }
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

// This endpoint is called AFTER user reviews and approves all images
// It generates the final template based on templateMode (satori or ai)
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

    const templateMode = job.templateMode || 'satori'
    const templateType = job.templateType || 'triple'
    const templateStyle = job.templateStyle || 'minimal'

    console.log(`🎨 Generating final template:`)
    console.log(`  - Mode: ${templateMode}`)
    console.log(`  - Type: ${templateType}`)
    console.log(`  - Images: ${approvedImages.length}`)
    if (templateMode === 'ai') {
      console.log(`  - Style: ${templateStyle}`)
    }

    // Update status
    await payload.update({
      collection: 'jobs',
      id: jobId,
      data: {
        status: 'generating_template',
      },
    })

    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    let finalImageUrl: string | null = null

    if (templateMode === 'ai') {
      // AI MODE: Use Nano-Banana Pro
      console.log('🤖 Using AI mode (Nano-Banana Pro)...')

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
      finalImageUrl = aiData.templateUrl

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'info',
          message: `AI template generated (${templateStyle} style)`,
          timestamp: new Date().toISOString(),
        },
      })

    } else {
      // SATORI MODE: Use existing overlay/graphic APIs
      console.log('🎯 Using Satori mode (Consistent)...')

      const useOverlayDesign = job.useOverlayDesign === true && approvedImages.length > 1
      const overlayAspectRatio = job.overlayAspectRatio || '3:1'
      const heroImageIndex = job.heroImageIndex || 0
      const overlayTheme = job.overlayTheme || 'modern'
      const graphicTheme = job.graphicTheme || 'modern'
      const socialMediaFormat = job.socialMediaFormat || 'facebook_post'

      if (useOverlayDesign) {
        // Use overlay API
        const params = new URLSearchParams()
        approvedImages.filter((url): url is string => url != null).forEach((url) => params.append('image', url))
        params.append('aspectRatio', overlayAspectRatio)
        params.append('heroIndex', heroImageIndex.toString())
        params.append('style', overlayTheme)

        const overlayUrl = `${baseUrl}/api/generate-overlay?${params.toString()}`
        const overlayResponse = await fetch(overlayUrl)

        if (overlayResponse.ok) {
          const imageBuffer = await overlayResponse.arrayBuffer()
          const imageBlob = new Blob([imageBuffer], { type: 'image/png' })

          const formData = new FormData()
          formData.append('file', imageBlob, `overlay-${jobId}.png`)

          const uploadResponse = await fetch(`${baseUrl}/api/media`, {
            method: 'POST',
            body: formData,
          })

          if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json()
            finalImageUrl = uploadData.doc.url
          }
        }

      } else {
        // Use graphic API
        const params = new URLSearchParams()
        approvedImages.filter((url): url is string => typeof url === 'string').forEach((url) => params.append('image', url))
        params.append('format', socialMediaFormat)
        params.append('style', graphicTheme)

        const graphicUrl = `${baseUrl}/api/generate-graphic?${params.toString()}`
        const graphicResponse = await fetch(graphicUrl)

        if (graphicResponse.ok) {
          const imageBuffer = await graphicResponse.arrayBuffer()
          const timestamp = Date.now()

          const { put } = await import('@vercel/blob')
          const blob = await put(`graphics/graphic-${timestamp}.png`, imageBuffer, {
            access: 'public',
            contentType: 'image/png',
          })

          finalImageUrl = blob.url
        }
      }

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'info',
          message: `Satori template generated (${useOverlayDesign ? 'overlay' : 'graphic'})`,
          timestamp: new Date().toISOString(),
        },
      })
    }

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
        generatedPrompt: `Template generated via ${templateMode} mode`,
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
      mode: templateMode,
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

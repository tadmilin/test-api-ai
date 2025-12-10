import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * SIMPLIFIED Process API - enhance images with Nano-Banana Pro
 * Clean, fast, no complex logic
 */
export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json()

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    const payload = await getPayload({ config })

    // Get the job
    const job = await payload.findByID({
      collection: 'jobs',
      id: jobId,
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    console.log(`🚀 Starting job ${jobId}`)

    // Update job status
    await payload.update({
      collection: 'jobs',
      id: jobId,
      data: { status: 'processing' },
    })

    // Log start
    await payload.create({
      collection: 'job-logs',
      data: {
        jobId: jobId,
        level: 'info',
        message: 'Started enhancing images with Nano-Banana Pro',
        timestamp: new Date().toISOString(),
      },
    })

    try {
      const baseUrl = request.nextUrl.origin || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
      const referenceUrls = job.enhancedImageUrls?.map((img: { originalUrl?: string | null }) => img.originalUrl).filter(Boolean) || []
      
      console.log(`📊 Processing ${referenceUrls.length} images`)
      
      if (referenceUrls.length === 0) {
        throw new Error('No reference images found')
      }

      // Get sheetRows data for per-image metadata
      const sheetRows = (job as { sheetRows?: Array<{ productName?: string; photoType?: string; contentTopic?: string; postTitleHeadline?: string; contentDescription?: string }> }).sheetRows || []
      console.log(`📋 Sheet rows data:`, sheetRows.length > 0 ? `${sheetRows.length} rows` : 'none (fallback to job photoType)')

      // Process images with stagger delay (2s between each)
      const STAGGER_DELAY_MS = 2000
      const predictionIds: string[] = []
      const imageMetadata: Array<{
        photoType: string
        contentTopic?: string
        postTitleHeadline?: string
        contentDescription?: string
      }> = []

      for (let i = 0; i < referenceUrls.length; i++) {
        const imageUrl = referenceUrls[i] as string
        
        // Get per-image metadata from sheetRows or fallback to job-level data
        const sheetRow = sheetRows[i] || {}
        const photoTypeFromSheet = sheetRow.photoType || job.photoTypeFromSheet || null
        
        console.log(`\n🖼️ Processing image ${i + 1}/${referenceUrls.length}`)
        console.log(`📋 Sheet row:`, sheetRow.productName || 'N/A')
        console.log(`📷 PhotoType:`, photoTypeFromSheet || 'generic')
        
        // Stagger requests
        if (i > 0) {
          console.log(`⏱️ Image ${i + 1}: Waiting ${STAGGER_DELAY_MS/1000}s...`)
          await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY_MS))
        }

        try {
          // Get prompt for this specific image
          console.log(`📝 Getting prompt for ${photoTypeFromSheet || 'generic'}...`)
          const promptRes = await fetch(`${baseUrl}/api/generate/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ photoTypeFromSheet }),
          })

          if (!promptRes.ok) {
            throw new Error(`Prompt API failed: ${promptRes.status}`)
          }

          const { prompt, photoType } = await promptRes.json()
          console.log(`✅ Using prompt for: ${photoType}`)
          
          // Store metadata for this image
          imageMetadata.push({
            photoType,
            contentTopic: sheetRow.contentTopic || '',
            postTitleHeadline: sheetRow.postTitleHeadline || '',
            contentDescription: sheetRow.contentDescription || '',
          })

          // Start enhancement
          const enhanceRes = await fetch(`${baseUrl}/api/generate/enhance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl,
              prompt,
              photoType,
              jobId,
            }),
          })

          if (!enhanceRes.ok) {
            throw new Error(`Enhance API failed: ${enhanceRes.status}`)
          }

          const { predictionId } = await enhanceRes.json()
          predictionIds.push(predictionId)
          
          console.log(`✅ Image ${i + 1} started: ${predictionId}`)

        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          console.error(`❌ Image ${i + 1} failed:`, message)
          predictionIds.push('') // Empty = failed
          
          // Still store metadata even for failed images
          imageMetadata.push({
            photoType: photoTypeFromSheet || 'generic',
            contentTopic: sheetRow.contentTopic || '',
            postTitleHeadline: sheetRow.postTitleHeadline || '',
            contentDescription: sheetRow.contentDescription || '',
          })
        }
      }

      // Update job with prediction IDs and metadata
      const initialImages = predictionIds.map((id, index) => ({
        url: '', // Will be filled by polling
        predictionId: id || null,
        originalUrl: referenceUrls[index] as string,
        status: 'pending' as const, // All start as pending, will update via polling
        photoType: imageMetadata[index]?.photoType || '',
        contentTopic: imageMetadata[index]?.contentTopic || '',
        postTitleHeadline: imageMetadata[index]?.postTitleHeadline || '',
        contentDescription: imageMetadata[index]?.contentDescription || '',
      }))
      
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          status: 'enhancing',
          enhancedImageUrls: initialImages,
        },
      })

      console.log(`✅ All ${referenceUrls.length} images queued`)

      return NextResponse.json({
        status: 'enhancing',
        predictions: predictionIds,
        total: referenceUrls.length,
      })

    } catch (error: unknown) {
      console.error('❌ Processing error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: { status: 'failed' },
      })

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId,
          level: 'error',
          message: `Processing failed: ${errorMessage}`,
          timestamp: new Date().toISOString(),
        },
      })

      throw error
    }

  } catch (error: unknown) {
    console.error('❌ Process API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to process job'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

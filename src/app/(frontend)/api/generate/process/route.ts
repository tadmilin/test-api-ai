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
      const referenceUrls = job.referenceImageUrls?.map((img: { url?: string | null }) => img.url).filter(Boolean) || []
      
      console.log(`📊 Processing ${referenceUrls.length} images`)
      
      if (referenceUrls.length === 0) {
        throw new Error('No reference images found')
      }

      // Get photoType from job (from Sheet)
      const photoTypeFromSheet = job.photoTypeFromSheet || null
      console.log(`📋 PhotoType from Sheet: ${photoTypeFromSheet || 'none'}`)

      // Get prompt once (same for all images)
      console.log('📝 Getting prompt...')
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

      // Process images with stagger delay (2s between each)
      const STAGGER_DELAY_MS = 2000
      const predictionIds: string[] = []

      for (let i = 0; i < referenceUrls.length; i++) {
        const imageUrl = referenceUrls[i] as string
        
        // Stagger requests
        if (i > 0) {
          console.log(`⏱️ Image ${i + 1}: Waiting ${STAGGER_DELAY_MS/1000}s...`)
          await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY_MS))
        }

        console.log(`\n🖼️ Processing image ${i + 1}/${referenceUrls.length}`)

        try {
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

        } catch (error: any) {
          console.error(`❌ Image ${i + 1} failed:`, error.message)
          predictionIds.push('') // Empty = failed
        }
      }

      // Update job with prediction IDs
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          enhancedImageUrls: predictionIds.map((id, index) => ({
            url: '', // Will be filled by polling
            predictionId: id,
            originalUrl: referenceUrls[index] as string,
          })),
        },
      })

      console.log(`✅ All ${referenceUrls.length} images queued`)

      return NextResponse.json({
        status: 'enhancing',
        predictions: predictionIds,
        total: referenceUrls.length,
      })

    } catch (error: any) {
      console.error('❌ Processing error:', error)
      
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
          message: `Processing failed: ${error.message}`,
          timestamp: new Date().toISOString(),
        },
      })

      throw error
    }

  } catch (error: any) {
    console.error('❌ Process API error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process job' },
      { status: 500 }
    )
  }
}

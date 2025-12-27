import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

export const runtime = 'nodejs'

// Image interface matching Payload schema
interface EnhancedImage {
  index?: number
  status?: 'pending' | 'completed' | 'failed' | 'approved' | 'regenerating' | null
  url?: string | null
  originalUrl?: string | null
  tempOutputUrl?: string | null
  predictionId?: string | null
  upscalePredictionId?: string | null
  error?: string | null
  webhookFailed?: boolean | null
  id?: string | null
  [key: string]: unknown
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params
    const payload = await getPayload({ config })

    // Get job
    const job = await payload.findByID({
      collection: 'jobs',
      id: jobId,
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Get logs
    const logsResult = await payload.find({
      collection: 'job-logs',
      where: {
        jobId: {
          equals: jobId,
        },
      },
      sort: 'timestamp',
      limit: 100,
    })

    // Calculate progress
    let images = job.enhancedImageUrls || []
    
    // ✅ CRITICAL: Add index if missing (for old jobs) + sort by index
    const hasIndex = images.length > 0 && (images[0] as EnhancedImage).index !== undefined
    if (!hasIndex && images.length > 0) {
      images = images.map((img: EnhancedImage, i: number) => ({
        ...img,
        index: i,
      }))
    }
    
    // ✅ Sort by index to ensure correct order
    images = (images as EnhancedImage[]).sort((a: EnhancedImage, b: EnhancedImage) => (a.index || 0) - (b.index || 0))
    
    const total = images.length
    const completed = images.filter(img => img.status === 'completed').length
    const failed = images.filter(img => img.status === 'failed').length
    const processing = images.filter(img => img.status === 'pending' || img.status === 'regenerating').length

    // Map image status (preserve original index from data)
    const imageStatus = images.map((img: EnhancedImage) => ({
      index: img.index !== undefined ? img.index : 0,
      status: img.status || 'pending',
      url: img.url || null,
      predictionId: img.predictionId || null,
      error: img.error || null,
      canRetry: img.status === 'failed' && !img.predictionId, // Can retry if failed without prediction
    }))

    // Determine overall job status
    let overallStatus = 'processing'
    if (completed === total) overallStatus = 'completed'
    else if (failed === total) overallStatus = 'failed'
    else if (completed + failed === total) overallStatus = 'partial'

    return NextResponse.json({
      jobId,
      status: overallStatus,
      images: imageStatus,
      logs: logsResult.docs.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        level: log.level,
        message: log.message,
      })),
      progress: {
        total,
        completed,
        failed,
        processing,
      },
    })
  } catch (error) {
    console.error('❌ Status API error:', error)
    return NextResponse.json(
      { error: 'Failed to get job status' },
      { status: 500 }
    )
  }
}

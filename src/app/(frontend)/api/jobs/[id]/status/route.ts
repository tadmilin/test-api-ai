import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

export const runtime = 'nodejs'

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
    const images = job.enhancedImageUrls || []
    const total = images.length
    const completed = images.filter(img => img.status === 'completed').length
    const failed = images.filter(img => img.status === 'failed').length
    const processing = images.filter(img => img.status === 'pending' || img.status === 'regenerating').length

    // Map image status
    const imageStatus = images.map((img, index) => ({
      index: index + 1,
      status: img.status || 'pending',
      url: img.url || null,
      predictionId: img.predictionId || null,
      error: (img as { error?: string }).error || null,
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

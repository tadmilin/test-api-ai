import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

// GET: Check status of all image enhancements for a job
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 })
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
    
    // Check how many are still processing
    const processing = enhancedImages.filter((img: any) => 
      img.status === 'processing' && img.predictionId
    ).length
    
    const completed = enhancedImages.filter((img: any) => 
      img.status === 'pending' && img.url
    ).length

    const allComplete = processing === 0 && completed === enhancedImages.length

    return NextResponse.json({
      success: true,
      jobId,
      status: job.status,
      total: enhancedImages.length,
      processing,
      completed,
      allComplete,
      images: enhancedImages,
    })

  } catch (error: unknown) {
    console.error('❌ Error checking process status:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check status' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

// ✅ Force Node.js runtime (Payload CMS)
export const runtime = 'nodejs'

/**
 * GET /api/generate/process/status?jobId=xxx
 * Simple status check - webhook handles all updates
 * Just fetch and return job from DB
 */
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
    
    console.log(`📊 Status check: Job ${jobId}`)
    console.log(`   Status: ${job.status}`)
    console.log(`   Type: ${job.jobType || 'legacy'}`)
    console.log(`   Images: ${enhancedImages.length}`)
    
    // Count image states
    const completed = enhancedImages.filter((img: any) => img.status === 'completed').length
    const pending = enhancedImages.filter((img: any) => img.status === 'pending').length
    const failed = enhancedImages.filter((img: any) => img.status === 'failed').length
    
    console.log(`   Completed: ${completed}, Pending: ${pending}, Failed: ${failed}`)

    // Template status (for template-merge workflow)
    const templateGeneration = job.templateGeneration || {}
    const hasTemplate = !!job.templateUrl || !!templateGeneration.url

    // Determine overall status
    const allComplete = enhancedImages.length > 0 && 
      enhancedImages.every((img: any) => img.status === 'completed' || img.status === 'failed')
    
    const needsTemplate = job.jobType === 'template-merge' && !hasTemplate
    
    let overallStatus = job.status
    if (allComplete && !needsTemplate) {
      overallStatus = failed > 0 ? 'failed' : 'completed'
    } else if (pending > 0 || needsTemplate) {
      overallStatus = 'enhancing'
    }

    return NextResponse.json({
      status: overallStatus,
      images: enhancedImages,
      templateUrl: job.templateUrl || templateGeneration.url || null,
      templateGeneration,
      summary: {
        total: enhancedImages.length,
        completed,
        pending,
        failed,
        needsTemplate,
        hasTemplate,
      },
    })

  } catch (error) {
    console.error('❌ Status check failed:', error)
    return NextResponse.json(
      { error: 'Status check failed' },
      { status: 500 }
    )
  }
}

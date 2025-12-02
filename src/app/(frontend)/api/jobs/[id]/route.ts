import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { del } from '@vercel/blob'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const body = await request.json()
    const { action, userId, reason } = body

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be either "approve" or "reject"' },
        { status: 400 }
      )
    }

    const payload = await getPayload({ config })

    // Get the job
    const job = await payload.findByID({
      collection: 'jobs',
      id,
    })

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    // Prepare update data
    const updateData: {
      status: 'approved' | 'rejected'
      approvedBy?: string
      approvedAt?: string
      rejectedBy?: string
      rejectedAt?: string
      rejectionReason?: string
    } = {
      status: action === 'approve' ? 'approved' : 'rejected',
    }

    if (action === 'approve') {
      updateData.approvedBy = userId
      updateData.approvedAt = new Date().toISOString()
    } else {
      updateData.rejectedBy = userId
      updateData.rejectedAt = new Date().toISOString()
      if (reason) {
        updateData.rejectionReason = reason
      }
    }

    // Update job
    const updatedJob = await payload.update({
      collection: 'jobs',
      id,
      data: updateData,
    })

    // Log the action
    await payload.create({
      collection: 'job-logs',
      data: {
        jobId: id,
        level: 'info',
        message: `Job ${action}ed by user ${userId}`,
        timestamp: new Date().toISOString(),
      },
    })

    return NextResponse.json({
      success: true,
      job: updatedJob,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update job'
    console.error('Error updating job:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const payload = await getPayload({ config })

    // Get job first to find Blob URLs
    const job = await payload.findByID({
      collection: 'jobs',
      id,
    })

    // Delete associated Blob files
    if (job.generatedImages) {
      const blobUrls: string[] = []
      
      if (job.generatedImages.facebook?.url) {
        blobUrls.push(job.generatedImages.facebook.url)
      }
      
      if (job.generatedImages.instagram_feed?.url) {
        blobUrls.push(job.generatedImages.instagram_feed.url)
      }
      
      if (job.generatedImages.instagram_story?.url) {
        blobUrls.push(job.generatedImages.instagram_story.url)
      }

      // Delete each Blob file
      for (const url of blobUrls) {
        try {
          await del(url)
        } catch (err) {
          console.error(`Failed to delete blob ${url}:`, err)
        }
      }
    }

    // Delete the job
    await payload.delete({
      collection: 'jobs',
      id,
    })

    return NextResponse.json({
      success: true,
      message: 'Job and associated images deleted successfully',
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete job'
    console.error('Error deleting job:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

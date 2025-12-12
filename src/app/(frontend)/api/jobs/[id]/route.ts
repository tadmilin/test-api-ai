import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { del } from '@vercel/blob'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

/**
 * PATCH /api/jobs/:id - Update image review status (approve/reject per image)
 * ✅ Uses PATCH (not GET) to properly handle request body
 * ✅ Uses auth from session (not client-provided userId)
 * ✅ Updates per-image status in enhancedImageUrls[]
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    // ✅ Get authenticated user from session
    const cookieStore = await cookies()
    const token = cookieStore.get('payload-token')?.value
    
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized - no token' },
        { status: 401 }
      )
    }

    const payload = await getPayload({ config })

    // Verify token and get user
    const meUserReq = await fetch(`${request.headers.get('origin') || 'http://localhost:3000'}/api/users/me`, {
      headers: {
        Authorization: `JWT ${token}`,
      },
    })

    if (!meUserReq.ok) {
      return NextResponse.json(
        { error: 'Unauthorized - invalid token' },
        { status: 401 }
      )
    }

    const { user } = await meUserReq.json()
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - no user' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { action, imageIndex, reason } = body

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be either "approve" or "reject"' },
        { status: 400 }
      )
    }

    if (typeof imageIndex !== 'number' || imageIndex < 0) {
      return NextResponse.json(
        { error: 'imageIndex is required and must be >= 0' },
        { status: 400 }
      )
    }

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

    // ✅ Update per-image status in enhancedImageUrls
    const enhancedImages = (job.enhancedImageUrls || []) as Array<{
      url?: string | null
      status?: string | null
      [key: string]: unknown
    }>

    if (imageIndex >= enhancedImages.length) {
      return NextResponse.json(
        { error: `Image index ${imageIndex} out of bounds` },
        { status: 400 }
      )
    }

    // Update the specific image status
    enhancedImages[imageIndex].status = action === 'approve' ? 'approved' : 'rejected'
    
    if (action === 'reject' && reason) {
      enhancedImages[imageIndex].rejectionReason = reason
    }

    if (action === 'approve') {
      enhancedImages[imageIndex].approvedBy = user.id
      enhancedImages[imageIndex].approvedAt = new Date().toISOString()
    } else {
      enhancedImages[imageIndex].rejectedBy = user.id
      enhancedImages[imageIndex].rejectedAt = new Date().toISOString()
    }

    // Update job with modified images
    const updatedJob = await payload.update({
      collection: 'jobs',
      id,
      data: {
        enhancedImageUrls: enhancedImages as any, // Type assertion for new fields
      },
    })

    // Log the action with real user ID
    await payload.create({
      collection: 'job-logs',
      data: {
        jobId: id,
        level: 'info',
        message: `Image ${imageIndex} ${action}ed by user ${user.email || user.id}`,
        timestamp: new Date().toISOString(),
      },
    })

    // Check if all images are approved
    const allApproved = enhancedImages.every(img => img.status === 'approved')

    return NextResponse.json({
      success: true,
      job: updatedJob,
      imageIndex,
      action,
      allApproved,
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

/**
 * DELETE /api/jobs/:id - Delete job and all associated Blob files
 * ✅ Deletes enhancedImageUrls[] Blob URLs
 * ✅ Deletes referenceImageUrls source Blob URLs
 * ✅ Deletes generatedImages Blob URLs
 * ✅ Only attempts to delete blob.vercel-storage.com URLs
 * ✅ Idempotent - returns 200 if job doesn't exist
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const payload = await getPayload({ config })

    // Get job first to find Blob URLs
    let job
    try {
      job = await payload.findByID({
        collection: 'jobs',
        id,
      })
    } catch (err) {
      // ✅ Idempotent - job already deleted or never existed
      console.log(`Job ${id} not found, may already be deleted`)
      return NextResponse.json({
        success: true,
        message: 'Job already deleted or does not exist',
        alreadyDeleted: true,
      })
    }

    // Collect all Blob URLs to delete
    const blobUrls: string[] = []
    
    // ✅ 1. Enhanced image URLs (the main output)
    if (job.enhancedImageUrls && Array.isArray(job.enhancedImageUrls)) {
      for (const img of job.enhancedImageUrls) {
        if (img.url && typeof img.url === 'string' && img.url.includes('blob.vercel-storage.com')) {
          blobUrls.push(img.url)
        }
      }
    }

    // ✅ 2. Reference/source image URLs (uploaded originals)
    if (job.referenceImageUrls && Array.isArray(job.referenceImageUrls)) {
      for (const item of job.referenceImageUrls) {
        // Handle both string array and object array formats
        const url = typeof item === 'string' ? item : (item as any)?.url
        if (url && typeof url === 'string' && url.includes('blob.vercel-storage.com')) {
          blobUrls.push(url)
        }
      }
    }

    // ✅ 3. Generated images (facebook/instagram formats)
    if (job.generatedImages) {
      const generatedUrls = [
        job.generatedImages.facebook?.url,
        job.generatedImages.instagram_feed?.url,
        job.generatedImages.instagram_story?.url,
      ]
      
      for (const url of generatedUrls) {
        if (url && typeof url === 'string' && url.includes('blob.vercel-storage.com')) {
          blobUrls.push(url)
        }
      }
    }

    // ✅ Delete each Blob file (only blob.vercel-storage.com URLs)
    const deleteResults = []
    for (const url of blobUrls) {
      try {
        await del(url)
        deleteResults.push({ url, success: true })
        console.log(`✅ Deleted blob: ${url}`)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        deleteResults.push({ url, success: false, error: errorMsg })
        console.error(`❌ Failed to delete blob ${url}:`, err)
      }
    }

    // Delete the job record
    await payload.delete({
      collection: 'jobs',
      id,
    })

    console.log(`✅ Job ${id} deleted with ${blobUrls.length} blob files`)

    return NextResponse.json({
      success: true,
      message: 'Job and associated images deleted successfully',
      deletedBlobCount: blobUrls.length,
      deleteResults,
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

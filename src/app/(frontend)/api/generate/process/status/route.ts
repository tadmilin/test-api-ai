import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

// ✅ Force Node.js runtime (Payload CMS)
export const runtime = 'nodejs'

// GET: Check status of all image enhancements for a job and poll Replicate if needed
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
    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    
    console.log(`\n🔍 ===== STATUS CHECK: Job ${jobId} =====`)
    console.log(`📊 Job status: ${job.status}`)
    console.log(`🖼️ Total images: ${enhancedImages.length}`)
    console.log(`📋 Image states:`, enhancedImages.map((img, i) => ({
      index: i + 1,
      hasUrl: !!img.url,
      hasPredictionId: !!img.predictionId,
      status: img.status,
      urlType: img.url?.includes('blob.vercel-storage.com') ? 'Blob' : 
               img.url?.includes('replicate.delivery') ? 'Replicate' : 
               img.url ? 'Other' : 'None'
    })))
    
    // Check each image that's still processing
    const updatedImages = await Promise.all(
      enhancedImages.map(async (img: {
        url?: string | null
        status?: 'pending' | 'completed' | 'failed' | 'approved' | 'regenerating' | null
        predictionId?: string | null
        originalUrl?: string | null
        error?: string | null
        photoType?: string | null
        contentTopic?: string | null
        postTitleHeadline?: string | null
        contentDescription?: string | null
      }, index: number) => {
        // Check if image needs processing:
        // 1. Has predictionId AND
        // 2. Either no URL at all OR has Replicate URL but no Blob URL
        const hasBlobUrl = img.url && img.url.includes('blob.vercel-storage.com')
        const hasReplicateUrl = img.originalUrl && img.originalUrl.includes('replicate.delivery')
        
        // Process if: has predictionId AND (no url OR no blob url yet)
        const isProcessing = img.predictionId && !hasBlobUrl
        
        if (isProcessing) {
          console.log(`📡 Polling prediction ${index + 1}: ${img.predictionId}`)
          console.log(`   Current state: url=${img.url ? 'exists' : 'empty'}, hasBlobUrl=${hasBlobUrl}, hasReplicateUrl=${hasReplicateUrl}`)
          
          // Poll the enhance status endpoint
          try {
            const statusRes = await fetch(
              `${baseUrl}/api/generate/enhance?predictionId=${img.predictionId}&jobId=${jobId}`
            )
            
            if (statusRes.ok) {
              const data = await statusRes.json()
              console.log(`   Status: ${data.status}`)
              
              if (data.status === 'succeeded' && data.imageUrl) {
                // enhance API returns imageUrl = Blob URL (already uploaded)
                const blobUrl = data.imageUrl
                
                // Validate it's actually a Blob URL
                const isBlobUrl = blobUrl && typeof blobUrl === 'string' && 
                                 blobUrl.includes('blob.vercel-storage.com')
                
                if (!isBlobUrl) {
                  console.error(`   ❌ Expected Blob URL but got:`, blobUrl)
                  return img // Don't update with non-Blob URL
                }
                
                console.log(`   ✅ Image ${index + 1} completed: ${blobUrl}`)
                // Update image with Blob URL while preserving all metadata
                return {
                  ...img, // Keep ALL existing fields (photoType, contentTopic, etc.)
                  url: blobUrl, // Blob URL (ถาวร)
                  originalUrl: data.originalUrl || img.originalUrl, // Keep Replicate URL as backup
                  status: 'pending' as const, // Ready for review
                }
              }
              
              if (data.status === 'failed' || data.status === 'canceled' || data.status === 'error') {
                console.error(`   ❌ Image ${index + 1} ${data.status}:`, data.error || 'Unknown error')
                // Mark as failed
                return {
                  ...img,
                  status: 'pending' as const,
                  error: data.error || 'Enhancement failed',
                }
              }
              
              console.log(`   ⏳ Image ${index + 1} still ${data.status}`)
            } else {
              console.error(`   ❌ Failed to poll: ${statusRes.status}`)
              // If API error, try to parse error message
              try {
                const errorData = await statusRes.json()
                console.error(`   Error details:`, errorData)
              } catch (_e) {
                // Ignore parse error
              }
            }
          } catch (pollError) {
            console.error(`   💥 Poll error:`, pollError)
          }
        }
        
        return img // No change
      })
    )
    
    // Update job if any images changed
    const anyChanged = updatedImages.some((img, i) => {
      const oldUrl = enhancedImages[i]?.url || ''
      const newUrl = img.url || ''
      const changed = oldUrl !== newUrl
      if (changed) {
        console.log(`🔄 Image ${i + 1} changed: "${oldUrl}" -> "${newUrl}"`)
      }
      return changed
    })
    
    if (anyChanged) {
      console.log(`💾 Updating job ${jobId} with ${updatedImages.length} images`)
      console.log('📋 Updated images:', JSON.stringify(updatedImages.map((img, i) => ({
        index: i + 1,
        url: img.url?.substring(0, 50) + '...',
        status: img.status,
        hasPredictionId: !!img.predictionId
      })), null, 2))
      
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          enhancedImageUrls: updatedImages,
        },
      })
      console.log(`✅ Job updated successfully`)
    } else {
      console.log(`⏭️ No changes detected, skipping job update`)
      console.log('📋 Current state:', JSON.stringify(updatedImages.map((img, i) => ({
        index: i + 1,
        url: img.url?.substring(0, 50) + '...',
        hasUrl: !!img.url,
        hasPredictionId: !!img.predictionId
      })), null, 2))
    }
    
    // Count statuses
    const processing = updatedImages.filter((img: {
      predictionId?: string | null
      url?: string | null
    }) => 
      img.predictionId && (!img.url || img.url === '')
    ).length
    
    const completed = updatedImages.filter((img: {
      url?: string | null
    }) => 
      img.url && img.url.length > 0
    ).length

    const failed = updatedImages.filter((img: {
      url?: string | null
      predictionId?: string | null
    }) => 
      (!img.url || img.url.length === 0) && !img.predictionId
    ).length

    // We are done if nothing is processing (either completed or failed)
    const allComplete = processing === 0
    
    console.log(`\n📊 Final counts for job ${jobId}:`)
    console.log(`   ✅ Completed: ${completed}/${updatedImages.length}`)
    console.log(`   🔄 Processing: ${processing}/${updatedImages.length}`)
    console.log(`   ❌ Failed: ${failed}/${updatedImages.length}`)
    console.log(`   🎯 All complete: ${allComplete}`)
    
    // Get current job to check status
    const currentJob = await payload.findByID({
      collection: 'jobs',
      id: jobId,
    })
    
    console.log(`📌 Current job status: ${currentJob.status}`)
    
    // Update job status if all complete
    if (allComplete && (job.status === 'enhancing' || job.status === 'processing')) {
      console.log(`🎉 All images complete! Updating job to completed`)
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          status: 'completed',
        },
      })
      
      await payload.create({
        collection: 'job-logs',
        data: {
          jobId,
          level: 'info',
          message: `Job completed: ${completed} succeeded, ${failed} failed`,
          timestamp: new Date().toISOString(),
        },
      })
    }

    console.log(`===== END STATUS CHECK =====\n`)

    return NextResponse.json({
      success: true,
      jobId,
      jobStatus: allComplete ? 'completed' : currentJob.status, // Return actual job status
      status: allComplete ? 'completed' : 'enhancing',
      total: updatedImages.length,
      processing,
      completed,
      failed,
      allComplete,
      images: updatedImages,
    })

  } catch (error: unknown) {
    console.error('❌ Error checking process status:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check status' },
      { status: 500 }
    )
  }
}

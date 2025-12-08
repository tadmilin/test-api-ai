import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

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
    
    console.log(`🔍 Checking ${enhancedImages.length} images for job ${jobId}`)
    
    // Check each image that's still processing
    const updatedImages = await Promise.all(
      enhancedImages.map(async (img: any, index: number) => {
        // Check if image is processing (has predictionId but no URL yet)
        // Note: status might be 'pending' or 'processing' or 'regenerating'
        const isProcessing = (img.status === 'pending' || img.status === 'processing' || img.status === 'regenerating') && img.predictionId && !img.url
        
        if (isProcessing) {
          console.log(`📡 Polling prediction ${index + 1}: ${img.predictionId}`)
          // Poll the enhance status endpoint
          try {
            const statusRes = await fetch(
              `${baseUrl}/api/generate/enhance?predictionId=${img.predictionId}&jobId=${jobId}`
            )
            
            if (statusRes.ok) {
              const data = await statusRes.json()
              console.log(`   Status: ${data.status}`)
              
              if (data.status === 'succeeded' && (data.imageUrl || data.output)) {
                const finalUrl = data.imageUrl || (Array.isArray(data.output) ? data.output[0] : data.output)
                console.log(`   ✅ Image ${index + 1} completed: ${finalUrl}`)
                // Update image with completed URL
                return {
                  ...img,
                  url: finalUrl,
                  status: 'pending', // Ready for review (keep as pending until approved)
                }
              }
              
              if (data.status === 'failed' || data.status === 'canceled') {
                console.error(`   ❌ Image ${index + 1} failed`)
                // Mark as failed, use original
                return {
                  ...img,
                  url: img.originalUrl,
                  status: 'pending', // Fallback to original
                  predictionId: null, // Clear prediction ID
                }
              }
              
              console.log(`   ⏳ Image ${index + 1} still ${data.status}`)
            } else {
              console.error(`   ❌ Failed to poll: ${statusRes.status}`)
            }
          } catch (pollError) {
            console.error(`   💥 Poll error:`, pollError)
          }
        }
        
        return img // No change
      })
    )
    
    // Update job if any images changed
    const anyChanged = updatedImages.some((img, i) => img.url !== enhancedImages[i]?.url)
    if (anyChanged) {
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          enhancedImageUrls: updatedImages,
        },
      })
    }
    
    // Count statuses
    const processing = updatedImages.filter((img: any) => 
      (img.status === 'pending' || img.status === 'processing' || img.status === 'regenerating') && img.predictionId && !img.url
    ).length
    
    const completed = updatedImages.filter((img: any) => 
      img.url && img.url.length > 0
    ).length

    const failed = updatedImages.filter((img: any) => 
      (!img.url || img.url.length === 0) && !img.predictionId
    ).length

    // We are done if nothing is processing (either completed or failed)
    const allComplete = processing === 0
    
    // Update job status if all complete
    if (allComplete && job.status === 'enhancing') {
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          status: 'review_pending',
        },
      })
    }

    return NextResponse.json({
      success: true,
      jobId,
      status: allComplete ? 'review_pending' : 'enhancing',
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

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { retryWithExponentialBackoff } from '@/utilities/retryWithExponentialBackoff'

// ✅ Force Node.js runtime (Payload CMS)
export const runtime = 'nodejs'

// Extend type to include upscalePredictionId
type EnhancedImageUrl = {
  url?: string | null
  status?: 'pending' | 'completed' | 'failed' | 'approved' | 'regenerating' | null
  predictionId?: string | null
  originalUrl?: string | null
  error?: string | null
  photoType?: string | null
  contentTopic?: string | null
  postTitleHeadline?: string | null
  contentDescription?: string | null
  tempOutputUrl?: string | null
  webhookFailed?: boolean | null
  id?: string | null
  upscalePredictionId?: string | null // ⭐ Add this for upscaling
}

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
    
    // ⭐ Check if this is a text-to-image job (needs upscaling)
    // ✅ เฉพาะ Text-to-Image เท่านั้นที่จะ upscale ทันที (ประหยัดเงิน)
    // ❌ Custom Prompt จะ upscale เฉพาะ template (ทำที่ create-template API)
    const hasTemplate = !!job.templateUrl
    const isTextToImageJob = job.contentTopic?.includes('Text-to-Image') && !hasTemplate
    // ✅ เช็คว่าต้อง upscale หรือไม่ (เฉพาะ 1:1 เท่านั้น)
    const needsUpscale = isTextToImageJob && job.outputSize && (job.outputSize.includes('1:1') || job.outputSize.startsWith('1:1'))
    
    console.log(`\n🔍 ===== STATUS CHECK: Job ${jobId} =====`)
    console.log(`📊 Job status: ${job.status}`)
    console.log(`� Product Name: ${job.productName}`)
    console.log(`🔥 contentTopic: "${job.contentTopic || 'NONE'}"`)
    console.log(`🔥 customPrompt: ${job.customPrompt ? `"${String(job.customPrompt).substring(0, 50)}..."` : 'NULL'}`)
    console.log(`🔥 outputSize: ${job.outputSize || 'NONE'}`)
    console.log(`🎨 templateUrl: ${job.templateUrl ? 'EXISTS (will upscale template instead)' : 'NONE'}`)
    console.log(`🎯 Is Text-to-Image Job: ${isTextToImageJob}`)
    console.log(`🎯 Needs Upscale (1:1 only): ${needsUpscale}`)
    console.log(`🖼️ Total images: ${enhancedImages.length}`)
    console.log(`📋 Image states:`, enhancedImages.map((img, i) => ({
      index: i + 1,
      hasUrl: !!img.url,
      hasPredictionId: !!img.predictionId,
      status: img.status,
      urlType: img.url?.includes('cloudinary.com') ? 'Cloudinary' :
               img.url?.includes('blob.vercel-storage.com') ? 'Blob' : 
               img.url?.includes('replicate.delivery') ? 'Replicate' : 
               img.url ? 'Other' : 'None'
    })))
    
    // Check each image that's still processing
    const updatedImages = await Promise.all(
      enhancedImages.map(async (img: EnhancedImageUrl, index: number) => {
        // Check if image has upscale prediction (text-to-image)
        if (img.upscalePredictionId && img.status === 'pending') {
          console.log(`🔍 Polling upscale ${index + 1}: ${img.upscalePredictionId}`)
          
          try {
            const upscaleRes = await fetch(
              `${baseUrl}/api/generate/upscale?predictionId=${img.upscalePredictionId}`
            )
            
            if (upscaleRes.ok) {
              const upscaleData = await upscaleRes.json()
              console.log(`   Upscale status: ${upscaleData.status}`)
              
              if (upscaleData.status === 'succeeded' && upscaleData.imageUrl) {
                console.log(`   ✅ Upscaled to 2048x2048: ${upscaleData.imageUrl}`)
                return {
                  ...img,
                  url: upscaleData.imageUrl,
                  originalUrl: img.originalUrl || img.url, // Keep original
                  status: 'completed' as const,
                  upscalePredictionId: null,
                  predictionId: null,
                }
              }
              
              if (upscaleData.status === 'failed') {
                console.error(`   ❌ Upscale failed: ${upscaleData.error}`)
                // Fallback to non-upscaled version
                return {
                  ...img,
                  status: 'completed' as const,
                  upscalePredictionId: null, // ✅ Clear to mark as done
                  predictionId: null, // ✅ Clear main prediction too
                }
              }
            }
          } catch (error) {
            console.error('   ❌ Upscale poll error:', error)
          }
          
          // Still processing
          return img
        }
        
        // Check if image needs processing (has predictionId AND no storage URL yet)
        const hasBlobUrl = img.url && (img.url.includes('cloudinary.com') || img.url.includes('blob.vercel-storage.com'))
        const needsMainProcessing = img.predictionId && !hasBlobUrl
        
        if (needsMainProcessing) {
          console.log(`📡 Polling prediction ${index + 1}: ${img.predictionId}`)
          console.log(`   Current state: url=${img.url ? 'exists' : 'empty'}, hasBlobUrl=${hasBlobUrl}`)
          
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
                
                // ✅ CRITICAL: รอ 500ms ให้ webhook ทัน update ก่อน (prevent race condition)
                console.log(`   ⏱️  Waiting 500ms for webhook to complete...`)
                await new Promise(resolve => setTimeout(resolve, 500))
                
                // ✅ Re-fetch job เพื่อเช็คว่า webhook update ไปแล้วหรือยัง
                console.log(`   🔍 Re-checking job to prevent duplicate upload...`)
                const { getPayload } = await import('payload')
                const configPromise = await import('@payload-config')
                const payload = await getPayload({ config: configPromise.default })
                
                const latestJob = await payload.findByID({
                  collection: 'jobs',
                  id: jobId,
                })
                
                const latestImg = latestJob.enhancedImageUrls?.[index]
                const alreadyHasBlobUrl = latestImg?.url && (String(latestImg.url).includes('cloudinary.com') || String(latestImg.url).includes('blob.vercel-storage.com'))
                
                if (alreadyHasBlobUrl) {
                  console.log(`   ✅ Webhook already uploaded - URL: ${String(latestImg.url).substring(0, 60)}...`)
                  console.log(`   ⏭️  Skipping duplicate upload`)
                  return {
                    ...img,
                    url: latestImg.url,
                    status: 'completed' as const,
                    predictionId: null,
                  }
                }
                
                console.log(`   📦 Webhook not yet completed, proceeding with upload...`)
                
                // Validate it's actually a storage URL (Cloudinary or Blob)
                const isValidUrl = blobUrl && typeof blobUrl === 'string' && 
                                  (blobUrl.includes('cloudinary.com') || blobUrl.includes('blob.vercel-storage.com'))
                
                if (!isValidUrl) {
                  console.error(`   ❌ Expected storage URL but got:`, blobUrl)
                  return img // Don't update with invalid URL
                }
                
                console.log(`   ✅ Image ${index + 1} completed: ${blobUrl}`)
                
                // ⭐ ถ้าเป็น text-to-image 1:1 → เริ่ม upscale ทันที
                if (needsUpscale && !img.upscalePredictionId) {
                  console.log(`   🔍 Starting upscale for text-to-image 1:1 ${index + 1}/${enhancedImages.length}...`)
                  console.log(`      Job: ${job.productName}`)
                  console.log(`      Image URL: ${blobUrl.substring(0, 60)}...`)
                  try {
                    const upscaleRes = await fetch(`${baseUrl}/api/generate/upscale`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        imageUrl: blobUrl,
                        scale: 2,
                      }),
                    })
                    
                    if (upscaleRes.ok) {
                      const upscaleData = await upscaleRes.json()
                      console.log(`   ✅ Upscale prediction created: ${upscaleData.predictionId}`)
                      
                      // Return with upscalePredictionId, CLEAR predictionId
                      return {
                        ...img,
                        url: blobUrl,
                        originalUrl: data.originalUrl || img.originalUrl,
                        predictionId: null,
                        status: 'pending' as const,
                        upscalePredictionId: upscaleData.predictionId,
                      }
                    }
                  } catch (error) {
                    console.error('   ❌ Failed to start upscale:', error)
                  }
                }
                
                // ถ้าไม่ใช่ text-to-image หรือ upscale ล้มเหลว → completed
                return {
                  ...img,
                  url: blobUrl,
                  originalUrl: data.originalUrl || img.originalUrl,
                  status: 'completed' as const,
                }
              }
              
              if (data.status === 'failed' || data.status === 'canceled' || data.status === 'error') {
                console.error(`   ❌ Image ${index + 1} ${data.status}:`, data.error || 'Unknown error')
                // Mark as failed (not pending!)
                return {
                  ...img,
                  status: 'failed' as const,
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
    
    // Update job if any images changed (check URL, status, and upscalePredictionId)
    console.log('🔍 Checking for changes...')
    const anyChanged = updatedImages.some((img, i) => {
      const original = enhancedImages[i] as EnhancedImageUrl
      console.log(`   Image ${i + 1}:`, {
        originalUrl: original?.url?.substring(0, 40),
        newUrl: img.url?.substring(0, 40),
        originalUpscale: original?.upscalePredictionId,
        newUpscale: img.upscalePredictionId,
        originalStatus: original?.status,
        newStatus: img.status,
      })
      const changed = 
        img.url !== original?.url ||
        img.status !== original?.status ||
        img.upscalePredictionId !== original?.upscalePredictionId
      if (changed) {
        console.log(`🔄 Image ${i + 1} changed:`, {
          url: original?.url !== img.url,
          status: original?.status !== img.status,
          upscalePredictionId: original?.upscalePredictionId !== img.upscalePredictionId,
        })
      }
      return changed
    })
    
    if (anyChanged) {
      console.log(`💾 Updating job ${jobId} with ${updatedImages.length} images`)
      console.log('📋 Updated images:', JSON.stringify(updatedImages.map((img, i) => ({
        index: i + 1,
        url: img.url?.substring(0, 50) + '...',
        status: img.status,
        hasPredictionId: !!img.predictionId,
        upscalePredictionId: img.upscalePredictionId ? img.upscalePredictionId.substring(0, 15) + '...' : null
      })), null, 2))
      
      // Update with exponential backoff retry logic
      await retryWithExponentialBackoff(
        async () => {
          await payload.update({
            collection: 'jobs',
            id: jobId,
            data: {
              enhancedImageUrls: updatedImages,
            },
          })
          console.log(`✅ Job updated successfully`)
        },
        {
          maxRetries: 5,
          context: 'Status Route (update images)',
        }
      )
    } else {
      console.log(`⏭️ No changes detected, skipping job update`)
      console.log('📋 Current state:', JSON.stringify(updatedImages.map((img, i) => ({
        index: i + 1,
        url: img.url?.substring(0, 50) + '...',
        hasUrl: !!img.url,
        hasPredictionId: !!img.predictionId
      })), null, 2))
    }
    
    // Count statuses (include upscaling in processing count)
    // ✅ Processing: มี predictionId/upscalePredictionId และยังไม่มี URL หรือ status ไม่ใช่ completed
    const processing = updatedImages.filter((img: EnhancedImageUrl) => {
      // กำลัง upscaling (มี upscalePredictionId และยัง pending)
      if (img.upscalePredictionId && img.status === 'pending') {
        return true
      }
      // กำลังประมวลผลรูปแรก (มี predictionId แต่ยังไม่มี URL)
      if (img.predictionId && (!img.url || img.url === '')) {
        return true
      }
      return false
    }).length
    
    // ✅ Completed: มี URL, status เป็น completed, และไม่มี upscalePredictionId (หมายถึง upscale เสร็จแล้วหรือไม่ต้อง upscale)
    const completed = updatedImages.filter((img: EnhancedImageUrl) => 
      img.url && 
      img.url.length > 0 && 
      img.status === 'completed' && 
      !img.upscalePredictionId  // ไม่มี upscale pending อยู่
    ).length

    // ✅ Failed: ไม่มี URL, ไม่มี prediction ทั้งสองแบบ, หรือ status เป็น failed
    const failed = updatedImages.filter((img: EnhancedImageUrl) => 
      img.status === 'failed' ||
      ((!img.url || img.url.length === 0) && !img.predictionId && !img.upscalePredictionId)
    ).length

    // We are done if nothing is processing (either completed or failed)
    const allComplete = processing === 0
    
    console.log(`\n📊 Final counts for job ${jobId}:`)
    console.log(`   ✅ Completed: ${completed}/${updatedImages.length}`)
    console.log(`   🔄 Processing: ${processing}/${updatedImages.length}`)
    console.log(`   ❌ Failed: ${failed}/${updatedImages.length}`)
    console.log(`   🎯 All complete: ${allComplete}`)
    
    // Use existing job object (already fetched at line 36)
    console.log(`📌 Current job status: ${job.status}`)
    
    // Update job status if all complete
    if (allComplete && (job.status === 'enhancing' || job.status === 'processing')) {
      console.log(`🎉 All images complete! Updating job to completed`)
      
      // Update with exponential backoff retry logic
      await retryWithExponentialBackoff(
        async () => {
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
        },
        {
          maxRetries: 5,
          context: 'Status Route (update status)',
          throwOnFailure: false, // Don't fail entire request
        }
      )
    }

    console.log(`===== END STATUS CHECK =====\n`)

    return NextResponse.json({
      success: true,
      jobId,
      jobStatus: allComplete ? 'completed' : job.status, // Use existing job object
      status: allComplete ? 'completed' : 'enhancing',
      total: updatedImages.length,
      processing,
      completed,
      failed,
      allComplete,
      images: updatedImages,
      templateGeneration: job.templateGeneration || null, // ✅ Add for polling to check template upscale status
    })

  } catch (error: unknown) {
    console.error('❌ Error checking process status:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check status' },
      { status: 500 }
    )
  }
}

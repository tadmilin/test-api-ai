import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import Replicate from 'replicate'
import sharp from 'sharp'

// ✅ Force Node.js runtime
export const runtime = 'nodejs'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

/**
 * GET /api/generate/process/status-text-to-image
 * 
 * Status checker สำหรับ Text-to-Image เท่านั้น
 * ไม่แตะ Custom Prompt + Template เลย
 * 
 * Features:
 * - ตรวจสอบสถานะ prediction
 * - Fallback: ถ้า webhook ไม่ upscale → ทำเอง
 * - รองรับ 1:1 upscale เป็น 2048×2048
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

    // 🔒 GUARD: ถ้าเป็น Custom Prompt + Template → ไม่ใช้ API นี้
    const hasCustomPrompt = !!job.customPrompt
    const hasTemplate = !!job.selectedTemplateUrl // ✅ ใช้ selectedTemplateUrl (input) แทน templateUrl (output)
    const isCustomPromptWithTemplate = hasCustomPrompt && hasTemplate
    
    // 🔒 GUARD: Only reject Custom Prompt + Template (they use /status API)
    if (isCustomPromptWithTemplate) {
      return NextResponse.json(
        { error: 'Custom Prompt with Template should use /status API instead.' },
        { status: 400 }
      )
    }

    console.log(`\n🎯 [Text-to-Image Status] Job ${jobId}`)
    console.log(`📊 Product: ${job.productName}`)
    console.log(`📐 Output Size: ${job.outputSize}`)
    console.log(`🖼️ Images: ${job.enhancedImageUrls?.length || 0}`)

    const enhancedImages = job.enhancedImageUrls || []
    const outputSize = (job.outputSize || '1:1-2K') as '1:1-2K' | '4:5-2K' | '9:16-2K'
    const needs1to1Upscale = outputSize.includes('1:1') || outputSize.startsWith('1:1')
    
    console.log(`🎯 Needs 1:1 Upscale: ${needs1to1Upscale}`)

    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    let hasChanges = false
    
    // ตรวจสอบแต่ละรูป
    const updatedImages = await Promise.all(
      enhancedImages.map(async (img, index) => {
        // ถ้ามี upscalePredictionId → ตรวจสอบสถานะ upscale
        if (img.upscalePredictionId) {
          console.log(`\n🔍 Image ${index + 1}: Checking upscale ${img.upscalePredictionId}`)
          
          try {
            const prediction = await replicate.predictions.get(img.upscalePredictionId)
            console.log(`   Status: ${prediction.status}`)
            
            if (prediction.status === 'succeeded' && prediction.output) {
              const upscaledUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output
              console.log(`   ✅ Upscale completed: ${String(upscaledUrl).substring(0, 60)}...`)
              
              hasChanges = true
              return {
                ...img,
                url: upscaledUrl,
                status: 'completed' as const,
                upscalePredictionId: null,
                predictionId: null,
              }
            } else if (prediction.status === 'failed') {
              console.error(`   ❌ Upscale failed:`, prediction.error)
              hasChanges = true
              return {
                ...img,
                status: 'failed' as const,
                error: String(prediction.error || 'Upscale failed'),
              }
            }
            
            console.log(`   ⏳ Still ${prediction.status}...`)
            return img
            
          } catch (error) {
            console.error(`   ❌ Failed to check upscale:`, error)
            return img
          }
        }
        
        // ถ้ามี predictionId → ตรวจสอบสถานะหลัก
        if (img.predictionId && img.status === 'pending') {
          console.log(`\n🔍 Image ${index + 1}: Checking main prediction ${img.predictionId}`)
          
          try {
            const prediction = await replicate.predictions.get(img.predictionId)
            console.log(`   Status: ${prediction.status}`)
            
            if (prediction.status === 'succeeded' && prediction.output) {
              const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output
              console.log(`   ✅ Main prediction completed`)
              
              // 🔥 FALLBACK: ถ้า webhook ไม่ได้ยิง upscale → ยิงเอง
              if (needs1to1Upscale) {
                console.log(`   🚀 Starting upscale fallback (webhook didn't trigger)...`)
                
                try {
                  const upscaleRes = await fetch(`${baseUrl}/api/generate/upscale`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      imageUrl: imageUrl,
                      scale: 2,
                    }),
                  })
                  
                  if (upscaleRes.ok) {
                    const upscaleData = await upscaleRes.json()
                    console.log(`   ✅ Upscale started: ${upscaleData.predictionId}`)
                    
                    hasChanges = true
                    return {
                      ...img,
                      tempOutputUrl: imageUrl,
                      upscalePredictionId: upscaleData.predictionId,
                      predictionId: null,
                      status: 'pending' as const,
                    }
                  } else {
                    console.error(`   ❌ Upscale API failed:`, await upscaleRes.text())
                  }
                } catch (upscaleError) {
                  console.error(`   ❌ Failed to start upscale:`, upscaleError)
                }
              }
              
              // 🔥 FALLBACK: ถ้าขนาด 4:5 หรือ 9:16 → ต้อง resize
              const needsResize = outputSize === '4:5-2K' || outputSize === '9:16-2K'
              if (needsResize) {
                console.log(`   🖼️ Starting resize for ${outputSize}...`)
                
                try {
                  const response = await fetch(imageUrl)
                  const buffer = await response.arrayBuffer()
                  
                  let resizeOptions
                  if (outputSize === '4:5-2K') {
                    // Imagen gen 3:4 → resize to 4:5 (1080x1350)
                    resizeOptions = { width: 1080, height: 1350 }
                  } else if (outputSize === '9:16-2K') {
                    // Imagen gen 9:16 → resize to 1080x1920
                    resizeOptions = { width: 1080, height: 1920 }
                  }
                  
                  const resizedBuffer = await sharp(Buffer.from(buffer))
                    .resize(resizeOptions)
                    .jpeg({ quality: 90 })
                    .toBuffer()
                  
                  const cloudinaryModule = await import('@/utilities/cloudinaryUpload')
                  const finalUrl = await cloudinaryModule.uploadBufferToCloudinary(
                    resizedBuffer,
                    `text-to-image-${outputSize}`,
                    `resized-${Date.now()}`
                  )
                  
                  console.log(`   ✅ Resized to ${resizeOptions?.width}x${resizeOptions?.height}`)
                  hasChanges = true
                  return {
                    ...img,
                    url: finalUrl,
                    status: 'completed' as const,
                    predictionId: null,
                  }
                } catch (resizeError) {
                  console.error(`   ❌ Failed to resize:`, resizeError)
                  // ถ้า resize ล้มเหลว ให้ใช้รูปต้นฉบับ
                }
              }
              
              // ถ้าไม่ต้อง upscale/resize หรือล้มเหลว → ใช้รูปตรงๆ
              hasChanges = true
              return {
                ...img,
                url: imageUrl,
                status: 'completed' as const,
                predictionId: null,
              }
              
            } else if (prediction.status === 'failed') {
              console.error(`   ❌ Main prediction failed:`, prediction.error)
              hasChanges = true
              return {
                ...img,
                status: 'failed' as const,
                error: String(prediction.error || 'Image generation failed'),
              }
            }
            
            console.log(`   ⏳ Still ${prediction.status}...`)
            return img
            
          } catch (error) {
            console.error(`   ❌ Failed to check prediction:`, error)
            return img
          }
        }
        
        // รูปเสร็จแล้วหรือไม่มี prediction → return ตามเดิม
        return img
      })
    )

    // อัพเดท DB ถ้ามีการเปลี่ยนแปลง
    if (hasChanges) {
      console.log(`\n💾 Updating job with changes...`)
      
      // Check if all images are complete
      const allImagesComplete = updatedImages.every(
        img => img.status === 'completed' || img.status === 'failed'
      )
      
      const updateData: any = {
        enhancedImageUrls: updatedImages as typeof job.enhancedImageUrls,
      }
      
      // Update job status if all complete
      if (allImagesComplete && job.status !== 'completed') {
        updateData.status = 'completed'
        console.log(`   🎉 All images complete - updating job status to 'completed'`)
      }
      
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: updateData,
      })
    }

    // นับสถานะ
    const completed = updatedImages.filter(img => img.status === 'completed').length
    const failed = updatedImages.filter(img => img.status === 'failed').length
    const processing = updatedImages.length - completed - failed
    const allComplete = processing === 0

    console.log(`\n📊 Summary:`)
    console.log(`   ✅ Completed: ${completed}/${updatedImages.length}`)
    console.log(`   🔄 Processing: ${processing}/${updatedImages.length}`)
    console.log(`   ❌ Failed: ${failed}/${updatedImages.length}`)
    console.log(`   🎯 All Complete: ${allComplete}`)

    // Refetch job to get latest status
    const latestJob = await payload.findByID({
      collection: 'jobs',
      id: jobId,
    })

    return NextResponse.json({
      success: true,
      jobId: job.id,
      jobStatus: allComplete ? 'completed' : latestJob.status,
      status: allComplete ? 'completed' : 'enhancing',
      total: updatedImages.length,
      processing,
      completed,
      failed,
      allComplete,
      images: updatedImages,
      templateGeneration: latestJob.templateGeneration || null,
    })

  } catch (error) {
    console.error('❌ Status check failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Status check failed' },
      { status: 500 }
    )
  }
}

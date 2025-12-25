import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import sharp from 'sharp'
import { downloadDriveFile, extractDriveFileId } from '@/utilities/downloadDriveFile'
import { uploadBufferToCloudinary } from '@/utilities/cloudinaryUpload'

// ✅ Force Node.js runtime
export const runtime = 'nodejs'

// ✅ Increase timeout for Nano Banana Pro (30-60 seconds generation)
export const maxDuration = 120

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

/**
 * Convert any URL to a stable direct image URL
 * - Google Drive URLs → Download and upload to Cloudinary
 * - Cloudinary URLs → Use as-is
 * - Other URLs → Use as-is (assume direct)
 */
async function ensureDirectImageUrl(url: string, label: string): Promise<string> {
  const driveFileId = extractDriveFileId(url)
  
  if (driveFileId) {
    console.log(`   📂 ${label} is Google Drive → Converting to Cloudinary...`)
    
    // Download from Drive
    const buffer = await downloadDriveFile(driveFileId)
    console.log(`      Downloaded ${Math.round(buffer.length / 1024)}KB`)
    
    // Upload to Cloudinary (permanent, public access)
    const cloudinaryUrl = await uploadBufferToCloudinary(
      buffer,
      'template-sources',
      `temp-${label.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`
    )
    
    console.log(`      ✅ Converted to Cloudinary: ${cloudinaryUrl.substring(0, 60)}...`)
    return cloudinaryUrl
  }
  
  // Already a direct URL (Cloudinary, Replicate, etc.)
  console.log(`   ✅ ${label} is already direct URL`)
  return url
}

/**
 * POST /api/generate/create-template
 * Start template generation (returns predictionId immediately)
 * 
 * GET /api/generate/create-template?predictionId=xxx
 * Poll for template generation status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { enhancedImageUrls, templateUrl, jobId } = body

    // Validate
    if (!enhancedImageUrls || !Array.isArray(enhancedImageUrls) || enhancedImageUrls.length === 0) {
      return NextResponse.json(
        { error: 'enhancedImageUrls is required and must be a non-empty array' },
        { status: 400 }
      )
    }

    if (!templateUrl) {
      return NextResponse.json(
        { error: 'templateUrl is required' },
        { status: 400 }
      )
    }

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      )
    }

    console.log(`🎨 Starting Nano Banana Pro template generation`)
    console.log(`📋 Template URL: ${templateUrl}`)
    console.log(`📸 Enhanced images: ${enhancedImageUrls.length}`)

    // ✅ Fetch job to get outputSize
    const { getPayload } = await import('payload')
    const configPromise = await import('@payload-config')
    const payload = await getPayload({ config: configPromise.default })
    
    const job = await payload.findByID({
      collection: 'jobs',
      id: jobId,
    })
    
    const outputSize = job.outputSize || '1:1-2K'
    console.log(`📐 Output size from job: ${outputSize}`)

    // Step 1: Convert all URLs to direct image URLs (Google Drive → Blob)
    console.log(`\n🔄 Step 1: Ensuring all URLs are direct images...`)
    
    const directTemplateUrl = await ensureDirectImageUrl(templateUrl, 'Template')
    
    const directEnhancedUrls = await Promise.all(
      enhancedImageUrls.map((url: string, i: number) => 
        ensureDirectImageUrl(url, `Enhanced Image ${i + 1}`)
      )
    )
    
    console.log(`✅ All URLs converted to direct image URLs`)

    // Step 2: Prepare image_input (template first, then enhanced images)
    const imageInputs = [directTemplateUrl, ...directEnhancedUrls]
    console.log(`\n📦 Step 2: Image inputs order:`)
    console.log(`   [0] Template: ${directTemplateUrl.substring(0, 60)}...`)
    directEnhancedUrls.forEach((url: string, i: number) => {
      console.log(`   [${i + 1}] Enhanced image ${i + 1}: ${url.substring(0, 60)}...`)
    })

    // Step 3: Start Nano Banana Pro (async, return predictionId)
    console.log(`\n🚀 Step 3: Starting Nano Banana Pro (async with webhook)...`)
    
    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    const webhookUrl = `${baseUrl}/api/webhooks/replicate`
    
    console.log(`📡 Webhook URL: ${webhookUrl}`)
    
    // ✅ Map outputSize to aspect_ratio
    const OUTPUT_SIZE_MAP: Record<string, { aspect_ratio: string; resolution: string }> = {
      '1:1-2K': { aspect_ratio: '1:1', resolution: '2K' },
      '4:5-2K': { aspect_ratio: '3:4', resolution: '2K' },
      '3:4-2K': { aspect_ratio: '3:4', resolution: '2K' },
      '9:16-2K': { aspect_ratio: '9:16', resolution: '2K' },
    }
    
    const sizeConfig = OUTPUT_SIZE_MAP[outputSize] || { aspect_ratio: '1:1', resolution: '1K' }
    console.log(`🎯 Using aspect_ratio: ${sizeConfig.aspect_ratio}, resolution: ${sizeConfig.resolution}`)
    
    const input = {
      prompt: "ใช้ภาพต้นฉบับนี้เป็น Template อ้างอิง โดยต้องรักษาตำแหน่งเลเยอร์ กราฟิคและกรอบดีไซน์ทั้งหมดไว้เหมือนเดิมห้ามแก้ไข คำสั่ง: ให้เปลี่ยนเฉพาะส่วนที่เป็น 'ภาพถ่ายสถานที่' ใน Template นี้ทั้งหมด (รวมถึงภาพพื้นหลังและรูปเล็ก) ให้เป็นไฟล์ภาพใหม่ที่แนบมานี้ โดยให้ภาพแรกเป็นภาพหลัก แทนที่ลงไปตามตำแหน่งที่เหมาะสม โดยให้ภาพใหม่อยู่ในเลเยอร์ด้านหลังข้อความและกรอบอย่างสมบูรณ์",
      image_input: imageInputs,
      resolution: sizeConfig.resolution,  // ✅ ส่งตรงตาม outputSize (1K หรือ 2K)
      aspect_ratio: sizeConfig.aspect_ratio,  // ✅ ใช้จาก job.outputSize
      output_format: "png",
      safety_filter_level: "block_only_high",
      webhook: webhookUrl, // ✅ ใช้ webhook แทน polling
      webhook_events_filter: ["completed"], // ✅ เฉพาะเมื่อเสร็จ
    }

    const prediction = await replicate.predictions.create({
      model: "google/nano-banana-pro",
      input,
    })

    console.log(`✅ Template generation started: ${prediction.id}`)
    console.log(`   Status: ${prediction.status}`)

    // ✅ บันทึก templateGeneration object ลง MongoDB (เหมือน enhancedImageUrls)
    // ⚠️ Save ทั้ง nested และ top-level เพื่อให้ webhook หาเจอแน่นอน
    try {
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          templateGeneration: {
            predictionId: prediction.id,
            status: 'processing',
            url: null,
            upscalePredictionId: null,
          },
          templatePredictionId: prediction.id, // ✅ Top-level สำรอง
        },
      })
      console.log(`✅ Saved templateGeneration to job ${jobId}`)
    } catch (dbError) {
      console.warn('⚠️ Failed to save templateGeneration:', dbError)
      // Don't fail - webhook can still handle
    }

    return NextResponse.json({
      predictionId: prediction.id,
      status: prediction.status,
    })

  } catch (error) {
    console.error('❌ Template generation start failed:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Template generation failed',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/generate/create-template?predictionId=xxx&jobId=yyy
 * Poll for template generation status + handle upscale
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const predictionId = searchParams.get('predictionId')
    const jobId = searchParams.get('jobId')

    if (!predictionId) {
      return NextResponse.json({ error: 'predictionId required' }, { status: 400 })
    }

    // Get prediction status
    const prediction = await replicate.predictions.get(predictionId)
    
    console.log(`📊 Template prediction ${predictionId}: ${prediction.status}`)

    // ✅ FALLBACK: Polling path handles resize/upscale if webhook fails
    if (prediction.status === 'succeeded' && prediction.output) {
      console.log('📦 Polling detected completion - processing template...')
      
      const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output
      
      if (!imageUrl) {
        throw new Error('No output from prediction')
      }

      // Fetch job to get outputSize
      const { getPayload } = await import('payload')
      const configPromise = await import('@payload-config')
      const payload = await getPayload({ config: configPromise.default })
      
      const job = await payload.findByID({
        collection: 'jobs',
        id: jobId || '',
      })
      
      const outputSize = job.outputSize || '1:1-2K'
      console.log(`📐 Template outputSize: ${outputSize}`)
      
      // Download template
      console.log(`📥 Downloading template from Replicate...`)
      const imageResponse = await fetch(imageUrl as string)
      const imageBuffer = await imageResponse.arrayBuffer()
      
      // ✅ Check outputSize - upscale if 1:1, resize otherwise
      if (outputSize === '1:1-2K') {
        // ⚠️ Guard: Refetch job ก่อนเช็ค (ป้องกัน race condition)
        if (!jobId) throw new Error('jobId is required')
        
        const latestJob = await payload.findByID({
          collection: 'jobs',
          id: jobId,
        })
        const templateGen = latestJob.templateGeneration || {}
        
        // ✅ CRITICAL: ถ้า webhook ทำงานเสร็จแล้ว (มี templateUrl + completed) → return ทันที
        if (latestJob.templateUrl && latestJob.status === 'completed') {
          console.log('[Polling] ✅ Template already completed by webhook - skipping')
          return NextResponse.json({
            status: 'succeeded',
            message: 'Template already completed',
            templateUrl: latestJob.templateUrl,
          })
        }
        
        // ✅ เช็ค templateGeneration.status ถ้าเป็น succeeded แปลว่า webhook กำลังจัดการอยู่
        if (templateGen.status === 'succeeded' && templateGen.url) {
          console.log('[Polling] ✅ Template generation succeeded (webhook) - returning URL')
          return NextResponse.json({
            status: 'succeeded',
            message: 'Template completed',
            templateUrl: templateGen.url,
          })
        }
        
        if (templateGen.upscalePredictionId) {
          console.log('[Polling] ⏭️ Upscale already in progress - skipping duplicate')
          return NextResponse.json({
            status: 'processing',
            message: 'Upscale already in progress',
            upscalePredictionId: templateGen.upscalePredictionId,
          })
        }
        
        console.log('[Polling] 🔍 1:1-2K detected - starting upscale...')
        
        // ✅ ATOMIC LOCK: บันทึก placeholder ก่อนเรียก API
        const placeholderPredictionId = `pending-${Date.now()}`
        await payload.update({
          collection: 'jobs',
          id: jobId,
          data: {
            templateGeneration: {
              ...templateGen,
              upscalePredictionId: placeholderPredictionId,
            },
          },
        })
        console.log(`[Polling] 🔒 Locked with placeholder: ${placeholderPredictionId}`)
        
        // ✅ DOUBLE-CHECK: Refetch เพื่อยืนยันว่าเรา win the race
        await new Promise(resolve => setTimeout(resolve, 50)) // รอ 50ms ให้ duplicate write ก่อน
        const verifyJob = await payload.findByID({
          collection: 'jobs',
          id: jobId,
        })
        const currentPredictionId = verifyJob.templateGeneration?.upscalePredictionId
        
        if (currentPredictionId !== placeholderPredictionId) {
          console.log(`[Polling] ⏭️ Lost race - another thread won (${currentPredictionId}). Skipping.`)
          return NextResponse.json({
            status: 'processing',
            message: 'Lost race, duplicate prevented',
            upscalePredictionId: currentPredictionId,
          })
        }
        
        console.log('[Polling] ✅ Won race - proceeding with upscale')
        
        const tempUrl = await uploadBufferToCloudinary(
          Buffer.from(imageBuffer),
          `jobs/${jobId}`,
          `template-temp-${Date.now()}`
        )
        
        const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
        const upscaleRes = await fetch(`${baseUrl}/api/generate/upscale`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: tempUrl,
            scale: 2,
          }),
        })
        
        if (!upscaleRes.ok) {
          throw new Error('Failed to start upscale')
        }
        
        const upscaleData = await upscaleRes.json()
        console.log('[Polling] ✅ Upscale started:', upscaleData.predictionId)
        
        // ✅ Update: replace placeholder with real predictionId
        await payload.update({
          collection: 'jobs',
          id: jobId,
          data: {
            templateGeneration: {
              predictionId: null,
              upscalePredictionId: upscaleData.predictionId, // แทนที่ placeholder
              status: 'processing',
              url: null,
            },
          },
        })
        
        return NextResponse.json({
          status: 'processing',
          message: 'Upscale started',
          upscalePredictionId: upscaleData.predictionId,
        })
        
      } else {
        // ✅ Resize for 3:4 or 9:16
        const OUTPUT_SIZE_MAP: Record<string, { width: number; height: number }> = {
          '3:4': { width: 1080, height: 1350 },
          '3:4-2K': { width: 1080, height: 1350 },
          '9:16': { width: 1080, height: 1920 },
          '9:16-2K': { width: 1080, height: 1920 },
        }
        
        const targetSize = OUTPUT_SIZE_MAP[outputSize] || { width: 1080, height: 1350 }
        console.log(`[Polling] 📐 Resizing to ${targetSize.width}×${targetSize.height}`)
        
        const resizedBuffer = await sharp(Buffer.from(imageBuffer))
          .resize(targetSize.width, targetSize.height, { fit: 'cover' })
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer()
        
        const cloudinaryUrl = await uploadBufferToCloudinary(
          resizedBuffer,
          `jobs/${job.id}`,
          `template-${targetSize.width}x${targetSize.height}`
        )
        
        console.log('[Polling] ✅ Template uploaded:', cloudinaryUrl)
        
        await payload.update({
          collection: 'jobs',
          id: job.id,
          data: {
            templateGeneration: {
              predictionId: null,
              upscalePredictionId: null,
              status: 'succeeded',
              url: cloudinaryUrl,
            },
            templateUrl: cloudinaryUrl,
            status: 'completed', // ✅ Mark job as completed
          },
        })
        
        console.log('[Polling] ✅ Template completed')
        return NextResponse.json({
          status: 'succeeded',
          imageUrl: cloudinaryUrl,
        })
      }
      
      /* OLD CODE REMOVED:
      const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output
      
      if (!imageUrl) {
        throw new Error('No output from prediction')
      }

      console.log(`📥 Downloading template...`)
      const response = await fetch(imageUrl as string)
      
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`)
      }

      const buffer = await response.arrayBuffer()
      console.log(`   Downloaded ${Math.round(buffer.byteLength / 1024)}KB`)

      // Upload to Cloudinary
      const cloudinaryUrl = await uploadBufferToCloudinary(
        Buffer.from(buffer),
        'template-temp',
        `template-temp-${Date.now()}`
      )

      console.log(`📤 Starting upscale...`)

      */
    }

    // Return current status
    return NextResponse.json({
      status: prediction.status,
      error: prediction.error || null,
    })

  } catch (error) {
    console.error('❌ Template polling failed:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Polling failed',
      },
      { status: 500 }
    )
  }
}

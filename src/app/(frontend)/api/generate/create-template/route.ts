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
    enhancedImageUrls.forEach((url: string, i: number) => {
      console.log(`   [${i}] ${url.substring(0, 80)}...`)
    })

    // ✅ Fetch job to get outputSize
    const { getPayload } = await import('payload')
    const configPromise = await import('@payload-config')
    const payload = await getPayload({ config: configPromise.default })
    
    const job = await payload.findByID({
      collection: 'jobs',
      id: jobId,
    })
    
    // ✅ CRITICAL GUARD: ตรวจสอบว่าเคยสร้าง template prediction แล้วหรือยัง (Idempotency)
    const templateGen = job.templateGeneration || {}
    if (templateGen.predictionId || templateGen.upscalePredictionId) {
      console.log(`⏭️ Template generation already in progress (predictionId: ${templateGen.predictionId || templateGen.upscalePredictionId})`)
      return NextResponse.json({
        predictionId: templateGen.predictionId || templateGen.upscalePredictionId,
        status: templateGen.status || 'processing',
        message: 'Template generation already started (idempotent)',
      })
    }
    
    if (templateGen.url && templateGen.status === 'succeeded') {
      console.log(`✅ Template already completed: ${templateGen.url}`)
      return NextResponse.json({
        predictionId: null,
        status: 'succeeded',
        templateUrl: templateGen.url,
        message: 'Template already completed',
      })
    }
    
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
      webhook: webhookUrl,
      webhook_events_filter: ["start", "completed"], // ✅ รับทั้ง start และ completed
    }

    const prediction = await replicate.predictions.create({
      model: "google/nano-banana-pro",
      input,
    })

    console.log(`✅ Template generation started: ${prediction.id}`)
    console.log(`   Status: ${prediction.status}`)

    // ✅ บันทึก real predictionId ทันที
    // ⚠️ Save ทั้ง nested และ top-level เพื่อให้ webhook หาเจอแน่นอน
    try {
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          status: 'generating_template', // ✅ เปลี่ยน status
          templateGeneration: {
            predictionId: prediction.id,
            status: 'processing',
            url: null,
            upscalePredictionId: null,
          },
          templatePredictionId: prediction.id, // ✅ Top-level สำรอง
        },
      })
      console.log(`✅ Saved predictionId to job: ${prediction.id}`)
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
 * GET /api/generate/create-template?predictionId=xxx
 * Simple status check - webhook handles all processing
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const predictionId = searchParams.get('predictionId')

    if (!predictionId) {
      return NextResponse.json({ error: 'predictionId required' }, { status: 400 })
    }

    // Just return prediction status - webhook handles everything else
    const prediction = await replicate.predictions.get(predictionId)
    
    console.log(`📊 Template status: ${predictionId} → ${prediction.status}`)

    return NextResponse.json({
      status: prediction.status,
      error: prediction.error || null,
    })

  } catch (error) {
    console.error('❌ Template status check failed:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Status check failed',
      },
      { status: 500 }
    )
  }
}

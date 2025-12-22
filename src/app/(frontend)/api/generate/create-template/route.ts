import { NextRequest, NextResponse } from 'next/server'
import { put, del } from '@vercel/blob'
import Replicate from 'replicate'
import { downloadDriveFile, extractDriveFileId } from '@/utilities/downloadDriveFile'

// ✅ Force Node.js runtime
export const runtime = 'nodejs'

// ✅ Increase timeout for Nano Banana Pro (30-60 seconds generation)
export const maxDuration = 120

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

/**
 * Convert any URL to a stable direct image URL
 * - Google Drive URLs → Download and upload to Blob
 * - Vercel Blob URLs → Use as-is
 * - Other URLs → Use as-is (assume direct)
 */
async function ensureDirectImageUrl(url: string, label: string): Promise<string> {
  const driveFileId = extractDriveFileId(url)
  
  if (driveFileId) {
    console.log(`   📂 ${label} is Google Drive → Converting to Blob...`)
    
    // Download from Drive
    const buffer = await downloadDriveFile(driveFileId)
    console.log(`      Downloaded ${Math.round(buffer.length / 1024)}KB`)
    
    // Upload to Vercel Blob (temporary, public access)
    const blob = await put(
      `temp-${label.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`,
      buffer,
      {
        access: 'public',
        contentType: 'image/png',
      }
    )
    
    console.log(`      ✅ Converted to Blob: ${blob.url.substring(0, 60)}...`)
    return blob.url
  }
  
  // Already a direct URL (Vercel Blob, Replicate, etc.)
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
    
    const input = {
      prompt: "ใช้ภาพต้นฉบับนี้เป็น Template อ้างอิง โดยต้องรักษาตำแหน่งเลเยอร์ กราฟิคและกรอบดีไซน์ทั้งหมดไว้เหมือนเดิมห้ามแก้ไข คำสั่ง: ให้เปลี่ยนเฉพาะส่วนที่เป็น 'ภาพถ่ายสถานที่' ใน Template นี้ทั้งหมด (รวมถึงภาพพื้นหลังและรูปเล็ก) ให้เป็นไฟล์ภาพใหม่ที่แนบมานี้ โดยให้ภาพแรกเป็นภาพหลัก แทนที่ลงไปตามตำแหน่งที่เหมาะสม โดยให้ภาพใหม่อยู่ในเลเยอร์ด้านหลังข้อความและกรอบอย่างสมบูรณ์",
      image_input: imageInputs,
      resolution: "1K",
      aspect_ratio: "1:1",
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

    // ✅ บันทึก templatePredictionId ลง MongoDB
    try {
      const { getPayload } = await import('payload')
      const configPromise = await import('@payload-config')
      const payload = await getPayload({ config: configPromise.default })
      
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          templatePredictionId: prediction.id,
        },
      })
      console.log(`✅ Saved templatePredictionId to job ${jobId}`)
    } catch (dbError) {
      console.warn('⚠️ Failed to save templatePredictionId:', dbError)
      // Don't fail - GET handler can still use cache
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

    // If succeeded, download + upscale
    if (prediction.status === 'succeeded' && prediction.output) {
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

      // Upload temp blob
      const tempBlob = await put(`template-temp-${Date.now()}.png`, buffer, {
        access: 'public',
        contentType: 'image/png',
      })

      console.log(`📤 Starting upscale...`)

      // Start upscale
      const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
      const upscaleRes = await fetch(`${baseUrl}/api/generate/upscale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: tempBlob.url,
          scale: 2,
        }),
      })

      if (!upscaleRes.ok) {
        console.error('❌ Upscale failed, using original')
        return NextResponse.json({
          status: 'succeeded',
          imageUrl: tempBlob.url,
        })
      }

      const upscaleData = await upscaleRes.json()
      const upscalePredictionId = upscaleData.predictionId
      console.log(`✅ Upscale started: ${upscalePredictionId}`)

      // Save upscale prediction ID
      if (jobId) {
        try {
          const { getPayload } = await import('payload')
          const configPromise = await import('@payload-config')
          const payload = await getPayload({ config: configPromise.default })
          
          await payload.update({
            collection: 'jobs',
            id: jobId,
            data: {
              templatePredictionId: null,
              templateUpscalePredictionId: upscalePredictionId,
            },
          })
          console.log(`✅ Saved upscale prediction ID`)
        } catch (dbError) {
          console.warn('⚠️ Failed to save:', dbError)
        }
      }

      // Poll upscale
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        const upscalePollRes = await fetch(`${baseUrl}/api/generate/upscale?predictionId=${upscalePredictionId}`)
        
        if (upscalePollRes.ok) {
          const upscalePollData = await upscalePollRes.json()
          console.log(`📊 Upscale poll ${i + 1}: ${upscalePollData.status}`)
          
          if (upscalePollData.status === 'succeeded' && upscalePollData.imageUrl) {
            console.log(`✅ Template complete: ${upscalePollData.imageUrl}`)
            
            // Save final URL
            if (jobId) {
              try {
                const { getPayload } = await import('payload')
                const configPromise = await import('@payload-config')
                const payload = await getPayload({ config: configPromise.default })
                
                await payload.update({
                  collection: 'jobs',
                  id: jobId,
                  data: {
                    templateUrl: upscalePollData.imageUrl,
                    templateUpscalePredictionId: null,
                  },
                })
                console.log(`✅ Saved final template URL`)
              } catch (dbError) {
                console.warn('⚠️ Failed to save:', dbError)
              }
            }
            
            // Delete temp
            try {
              await del(tempBlob.url)
            } catch (delError) {
              console.warn(`⚠️ Failed to delete temp:`, delError)
            }
            
            return NextResponse.json({
              status: 'succeeded',
              imageUrl: upscalePollData.imageUrl,
            })
          }
          
          if (upscalePollData.status === 'failed') {
            console.error('❌ Upscale failed')
            return NextResponse.json({
              status: 'succeeded',
              imageUrl: tempBlob.url,
            })
          }
        }
      }

      // Timeout
      console.warn('⚠️ Upscale timeout')
      return NextResponse.json({
        status: 'succeeded',
        imageUrl: tempBlob.url,
      })
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

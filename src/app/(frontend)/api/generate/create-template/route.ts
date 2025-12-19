import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import Replicate from 'replicate'

// ✅ Force Node.js runtime
export const runtime = 'nodejs'

// ✅ Increase timeout for Nano Banana Pro (30-60 seconds generation)
export const maxDuration = 120

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

/**
 * POST /api/generate/create-template
 * 
 * Generate a composite template using Nano Banana Pro:
 * 1. Prepare template + enhanced images as inputs
 * 2. Call Nano Banana Pro with custom prompt
 * 3. Wait for generation (30-60 seconds)
 * 4. Upload result to Vercel Blob
 * 
 * WAITING FOR: Custom prompt from user
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { enhancedImageUrls, templateUrl } = body

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

    console.log(`🎨 Starting Nano Banana Pro template generation`)
    console.log(`📋 Template URL: ${templateUrl}`)
    console.log(`📸 Enhanced images: ${enhancedImageUrls.length}`)

    // Step 1: Prepare image_input (template first, then enhanced images)
    const imageInputs = [templateUrl, ...enhancedImageUrls]
    console.log(`📦 Image inputs order:`)
    console.log(`   [0] Template: ${templateUrl.substring(0, 60)}...`)
    enhancedImageUrls.forEach((url: string, i: number) => {
      console.log(`   [${i + 1}] Enhanced image ${i + 1}: ${url.substring(0, 60)}...`)
    })

    // Step 2: Call Nano Banana Pro
    console.log(`🚀 Calling Nano Banana Pro...`)
    const input = {
      prompt: "ใช้ภาพต้นฉบับนี้เป็น Template อ้างอิง โดยต้องรักษาตำแหน่งเลเยอร์ กราฟิคและกรอบดีไซน์ทั้งหมดไว้เหมือนเดิมห้ามแก้ไข คำสั่ง: ให้เปลี่ยนเฉพาะส่วนที่เป็น 'ภาพถ่ายสถานที่' ใน Template นี้ทั้งหมด (รวมถึงภาพพื้นหลังและรูปเล็ก) ให้เป็นไฟล์ภาพใหม่ที่แนบมานี้ โดยให้ภาพแรกเป็นภาพหลัก แทนที่ลงไปตามตำแหน่งที่เหมาะสม โดยให้ภาพใหม่อยู่ในเลเยอร์ด้านหลังข้อความและกรอบอย่างสมบูรณ์",
      image_input: imageInputs,
      resolution: "1K",
      aspect_ratio: "1:1",
      output_format: "png",
      safety_filter_level: "block_only_high",
    }

    console.log(`⚙️ Input parameters:`)
    console.log(`   - Resolution: ${input.resolution}`)
    console.log(`   - Aspect ratio: ${input.aspect_ratio}`)
    console.log(`   - Format: ${input.output_format}`)
    console.log(`   - Images: ${imageInputs.length}`)

    const output = await replicate.run("google/nano-banana-pro", { input })
    console.log(`✅ Nano Banana Pro generation complete`)

    // Step 3: Download result
    console.log(`📥 Downloading generated image...`)
    const imageUrl = typeof output === 'string' ? output : (output as any).url?.() || (output as any)[0]
    
    if (!imageUrl) {
      throw new Error('No output URL from Nano Banana Pro')
    }

    console.log(`   URL: ${imageUrl}`)
    const response = await fetch(imageUrl)
    
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    console.log(`   ✅ Downloaded ${Math.round(buffer.byteLength / 1024)}KB`)

    // Step 4: Upload to Vercel Blob
    console.log(`☁️ Uploading to Vercel Blob...`)
    const blob = await put(
      `template-${new Date().toISOString()}.png`,
      buffer,
      {
        access: 'public',
        contentType: 'image/png',
      }
    )

    console.log(`✅ Template generation complete: ${blob.url}`)

    return NextResponse.json({
      success: true,
      resultImageUrl: blob.url,
      templateUrl: blob.url, // Alias for backward compatibility
      metadata: {
        imagesUsed: imageInputs.length,
        generatedWith: 'nano-banana-pro',
      },
    })

  } catch (error) {
    console.error('❌ Template generation failed:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Template generation failed',
      },
      { status: 500 }
    )
  }
}

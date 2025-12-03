import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import { put } from '@vercel/blob'

export async function POST(request: NextRequest) {
  try {
    const { collageUrl, prompt, strength, jobId } = await request.json()

    if (!collageUrl) {
      return NextResponse.json(
        { error: 'collageUrl is required' },
        { status: 400 }
      )
    }

    if (!prompt) {
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      )
    }

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      )
    }

    const apiToken = process.env.REPLICATE_API_TOKEN

    if (!apiToken) {
      return NextResponse.json(
        { error: 'Replicate API token not configured' },
        { status: 500 }
      )
    }

    const replicate = new Replicate({ auth: apiToken })

    console.log('Enhancing image with Replicate SDXL...')
    console.log('Collage URL:', collageUrl)
    console.log('Prompt:', prompt.substring(0, 100) + '...')
    console.log('Strength:', strength || 0.15)

    // ดาวน์โหลดรูปและตรวจสอบขนาด
    const checkImageResponse = await fetch(collageUrl)
    if (!checkImageResponse.ok) {
      throw new Error('Failed to fetch collage image')
    }
    
    const checkImageBuffer = await checkImageResponse.arrayBuffer()
    const imageSizeKB = checkImageBuffer.byteLength / 1024
    console.log(`Original image size: ${imageSizeKB.toFixed(2)} KB`)
    
    // ถ้ารูปใหญ่เกิน 2MB ให้ลดขนาดก่อน
    const processedImageUrl = collageUrl
    if (imageSizeKB > 2048) {
      console.log('Image too large, resizing before enhancement...')
      // ใช้ sharp หรือ resize service (ถ้ามี) หรือส่ง URL ตรงไป
      // ตอนนี้ส่งไปตรงๆ แต่ลด inference steps
    }

    // ใช้ SDXL img2img เพื่อ RETOUCH รูป (ไม่ใช่สร้างใหม่)
    // เพิ่ม strength และ guidance เพื่อให้รักษารูปเดิมไว้ดีขึ้น
    const output = await replicate.run(
      'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
      {
        input: {
          image: processedImageUrl,
          prompt: `Professional photo retouching: ${prompt}. CRITICAL: Preserve exact original composition, layout, and all elements in their current positions. Only enhance lighting quality, color balance, and sharpness. No repositioning, no new elements, no layout changes.`,
          negative_prompt: 'deformed, distorted, disfigured, bad anatomy, wrong anatomy, extra limbs, mutation, ugly, fat, missing limb, floating limbs, disconnected limbs, out of frame, long body, disgusting, poorly drawn, mutilated, mangled, old, blurry, duplicate, watermark, signature, text, logo, new objects, added elements, different layout, moved items, rearranged composition, altered structure, changed perspective, reimagined scene, synthetic, artificial, fake, unrealistic',
          num_inference_steps: 20, // เพิ่มเป็น 20 เพื่อคุณภาพดีขึ้น
          guidance_scale: 7.5, // เพิ่มเป็น 7.5 เพื่อทำตาม prompt มากขึ้น
          strength: Math.min(Math.max(strength || 0.3, 0.25), 0.35), // ใช้ 0.25-0.35 (sweet spot สำหรับ retouching)
          scheduler: 'DPMSolverMultistep',
          num_outputs: 1,
          width: 1024,
          height: 576,
        },
      }
    ) as string[]

    if (!output || output.length === 0) {
      throw new Error('No image returned from Replicate')
    }

    const enhancedImageUrl = output[0]

    // ดาวน์โหลดรูปที่ตกแต่งแล้ว
    const imageResponse = await fetch(enhancedImageUrl)
    if (!imageResponse.ok) {
      throw new Error('Failed to download enhanced image')
    }

    const imageBuffer = await imageResponse.arrayBuffer()

    // Upload ไป Vercel Blob
    const blob = await put(`jobs/${jobId}/enhanced.png`, imageBuffer, {
      access: 'public',
      contentType: 'image/png',
    })

    return NextResponse.json({
      imageUrl: blob.url,
      originalPrompt: prompt,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to enhance image'
    console.error('Error enhancing image:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

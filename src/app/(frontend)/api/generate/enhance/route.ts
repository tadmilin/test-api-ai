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
    let processedImageUrl = collageUrl
    if (imageSizeKB > 2048) {
      console.log('Image too large, resizing before enhancement...')
      // ใช้ sharp หรือ resize service (ถ้ามี) หรือส่ง URL ตรงไป
      // ตอนนี้ส่งไปตรงๆ แต่ลด inference steps
    }

    // ใช้ SDXL img2img เพื่อ RETOUCH รูป (ไม่ใช่สร้างใหม่)
    // ลด parameters เพื่อลด memory usage
    const output = await replicate.run(
      'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
      {
        input: {
          image: processedImageUrl,
          prompt: `${prompt}\n\nCRITICAL: Keep EXACT same layout, composition, and positions. Only enhance quality, lighting, and colors. Do NOT move, resize, or rearrange any elements.`,
          negative_prompt: 'low quality, blurry, distorted, ugly, bad anatomy, watermark, text, signature, duplicate, clone, overlapping, messy, chaotic, glitch, deformed, mutation, changed composition, different layout, moved objects, resized elements, new arrangement, altered structure',
          num_inference_steps: 15, // ลดจาก 20 เป็น 15 เพื่อลด memory
          guidance_scale: 5.0, // ลดจาก 5.5 เป็น 5.0
          strength: Math.min(strength || 0.1, 0.2), // ใช้ 0.1-0.2 เท่านั้น (retouching เบามาก)
          scheduler: 'DPMSolverMultistep',
          num_outputs: 1,
          width: 1024, // SDXL รองรับ 1024 พอดี
          height: 576, // 1024/576 = 1.78:1 ใกล้เคียง aspect ratio ของ collage (1024x585)
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

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
    // Parameters ปรับให้เหมาะกับโรงแรม/รีสอร์ทราคาถูก-กลาง
    const output = await replicate.run(
      'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
      {
        input: {
          image: processedImageUrl,
          prompt: prompt || `Professional photo retouch: enhance lighting, improve color balance, increase sharpness. Preserve all original elements exactly as they are.`,
          negative_prompt: 'overprocessed, oversharpened, distorted, warped, unrealistic lighting, plastic texture, artificial colors, oversaturated, luxury decoration, five-star hotel, surreal, cartoonish, painting style, fake, synthetic, excessive editing, HDR artifacts, halos, glowing edges',
          num_inference_steps: 20, // ลดลงเพื่อไม่ให้ AI "คิดมาก"
          guidance_scale: 3.5, // ลดลงเพื่อให้รูปเดิมมีน้ำหนักมากกว่า prompt
          strength: Math.min(Math.max(strength || 0.10, 0.08), 0.12), // 0.08-0.12 (เปลี่ยนแปลงเพียง 8-12% เท่านั้น!)
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

    // Upload ไป Vercel Blob with unique filename
    const timestamp = Date.now()
    const randomSuffix = Math.random().toString(36).substring(2, 8)
    const filename = `enhanced-${timestamp}-${randomSuffix}.png`
    
    const blob = await put(`jobs/${jobId}/${filename}`, imageBuffer, {
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

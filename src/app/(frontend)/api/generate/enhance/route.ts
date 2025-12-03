import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import { put } from '@vercel/blob'
import { google } from 'googleapis'

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
    console.log('Input URL:', collageUrl)
    console.log('Prompt:', prompt.substring(0, 100) + '...')
    console.log('Strength:', strength || 0.10)

    // ตรวจสอบว่าเป็น Google Drive URL หรือไม่
    let processedImageUrl = collageUrl
    
    if (collageUrl.includes('drive.google.com') || collageUrl.includes('id=')) {
      console.log('🔄 Detected Google Drive URL, downloading and uploading to Blob...')
      
      // Extract file ID from Google Drive URL
      const fileIdMatch = collageUrl.match(/id=([^&]+)/)
      if (!fileIdMatch) {
        throw new Error('Invalid Google Drive URL format')
      }
      
      const fileId = fileIdMatch[1]
      
      // Setup Google Drive API
      const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
      const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

      if (!serviceAccountEmail || !privateKey) {
        throw new Error('Google Service Account credentials not configured')
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: serviceAccountEmail,
          private_key: privateKey.replace(/\\n/gm, '\n').replace(/^"|"$/g, ''),
        },
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      })

      const drive = google.drive({ version: 'v3', auth })

      // Download image from Google Drive
      const response = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' }
      )

      const imageBuffer = Buffer.from(response.data as ArrayBuffer)
      console.log(`Downloaded from Drive: ${(imageBuffer.byteLength / 1024).toFixed(2)} KB`)

      // Upload to Vercel Blob as source image
      const timestamp = Date.now()
      const sourceBlob = await put(`jobs/${jobId}/source-${timestamp}.png`, imageBuffer, {
        access: 'public',
        contentType: 'image/png',
      })
      
      processedImageUrl = sourceBlob.url
      console.log('✅ Uploaded to Blob:', processedImageUrl)
    } else {
      // ถ้าเป็น URL ปกติ (เช่น Blob URL) ดาวน์โหลดและตรวจสอบขนาด
      console.log('📥 Downloading image from URL...')
      const checkImageResponse = await fetch(collageUrl)
      if (!checkImageResponse.ok) {
        throw new Error('Failed to fetch image')
      }
      
      const checkImageBuffer = await checkImageResponse.arrayBuffer()
      const imageSizeKB = checkImageBuffer.byteLength / 1024
      console.log(`Image size: ${imageSizeKB.toFixed(2)} KB`)
    }

    // ใช้ Instruct-Pix2Pix สำหรับ photo editing โดยเฉพาะ
    // Model นี้ออกแบบมาเพื่อแก้ไขรูปตาม instruction โดยไม่สร้างใหม่
    console.log('🎨 Using Instruct-Pix2Pix for photo editing...')
    
    const output = await replicate.run(
      'timbrooks/instruct-pix2pix:30c1d0b916a6f8efce20493f5d61ee27491ab2a60437c13c588468b9810ec23f',
      {
        input: {
          image: processedImageUrl,
          prompt: prompt || 'Improve lighting and colors, make it look professional',
          negative_prompt: 'cartoon, anime, painting, drawing, illustration, sketch, 3d render, unrealistic',
          num_inference_steps: 20,
          guidance_scale: 7.5, // image guidance
          image_guidance_scale: 1.5, // ควบคุมว่าจะเปลี่ยนแปลงรูปต้นฉบับมากน้อยแค่ไหน (1.0-2.0 = น้อย)
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

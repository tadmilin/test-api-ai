import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

interface CollageRequest {
  imageUrls: string[]
  template?: string
  socialMediaFormat?: string  // "facebook_post", "instagram_feed", "instagram_story", etc.
  // Legacy support:
  aspectRatio?: string
  size?: string
}

export async function POST(request: NextRequest) {
  try {
    const { imageUrls, template, socialMediaFormat, aspectRatio, size } = await request.json() as CollageRequest

    if (!imageUrls || imageUrls.length === 0) {
      return NextResponse.json(
        { error: 'imageUrls is required' },
        { status: 400 }
      )
    }

    if (imageUrls.length > 6) {
      return NextResponse.json(
        { error: 'Maximum 6 images allowed' },
        { status: 400 }
      )
    }

    // Validate each image URL before processing
    console.log(`🔍 Validating ${imageUrls.length} image URLs...`)
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i]
      try {
        console.log(`Checking image ${i + 1}: ${url}`)
        const response = await fetch(url, { method: 'HEAD' })
        if (!response.ok) {
          throw new Error(`Image ${i + 1} is not reachable (status ${response.status})`)
        }
        console.log(`✅ Image ${i + 1} validated`)
      } catch (validateError) {
        const errorMsg = validateError instanceof Error ? validateError.message : 'Unknown error'
        console.error(`❌ Image ${i + 1} validation failed:`, errorMsg)
        return NextResponse.json(
          { error: `Invalid image URL at index ${i}: ${errorMsg}` },
          { status: 400 }
        )
      }
    }
    console.log('✅ All images validated successfully')

    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'

    // เรียก Python service
    console.log('🐍 Calling Python collage service...')
    console.log(`📐 Template: ${template || 'auto'}, Format: ${socialMediaFormat || aspectRatio || 'default'}, Size: ${size || 'default'}`)
    const collageResponse = await fetch(`${pythonServiceUrl}/collage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_urls: imageUrls,
        template: template || null,
        social_media_format: socialMediaFormat || null,
        aspect_ratio: aspectRatio || null,  // Legacy fallback
        size: size || 'MD',  // Legacy fallback
      }),
    })

    if (!collageResponse.ok) {
      const status = collageResponse.status
      const errorText = await collageResponse.text()
      console.error(`❌ Python service failed (${status}):`, errorText)
      
      // Fallback: return first image if Python service fails
      console.log('⚠️ Falling back to first image...')
      return NextResponse.json({
        url: imageUrls[0],
        template: 'fallback_single_image',
        dimensions: { width: 0, height: 0 },
        warning: 'Collage service unavailable, using first image',
      })
    }

    const collageData = await collageResponse.json()
    console.log('✅ Python service response received')

    // แปลง base64 เป็น Buffer (with safety)
    const cleanBase64 = collageData.image_base64.replace(/^data:image\/\w+;base64,/, '')
    const imageBuffer = Buffer.from(cleanBase64, 'base64')
    console.log(`📦 Buffer size: ${(imageBuffer.byteLength / 1024).toFixed(2)} KB`)

    // Get MIME type from Python response or default to PNG
    const mimeType = collageData.mime || 'image/png'
    console.log(`📄 MIME type: ${mimeType}`)

    // Upload ไป Vercel Blob
    const timestamp = Date.now()
    const extension = mimeType.split('/')[1] || 'png'
    const blob = await put(`collages/collage-${timestamp}.${extension}`, imageBuffer, {
      access: 'public',
      contentType: mimeType,
    })

    console.log('✅ Collage uploaded to Blob:', blob.url)

    return NextResponse.json({
      url: blob.url,
      template: collageData.template_used,
      dimensions: collageData.dimensions,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create collage'
    console.error('Error creating collage:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

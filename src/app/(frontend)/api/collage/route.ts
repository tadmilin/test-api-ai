import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

interface CollageRequest {
  imageUrls: string[]
  template?: string
}

export async function POST(request: NextRequest) {
  try {
    const { imageUrls, template } = await request.json() as CollageRequest

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

    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000'

    // เรียก Python service
    const collageResponse = await fetch(`${pythonServiceUrl}/collage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_urls: imageUrls,
        template: template || null,
        canvas_size: [1792, 1024],
      }),
    })

    if (!collageResponse.ok) {
      const errorText = await collageResponse.text()
      throw new Error(`Python service error: ${errorText}`)
    }

    const collageData = await collageResponse.json()

    // แปลง base64 เป็น Buffer
    const imageBuffer = Buffer.from(collageData.image_base64, 'base64')

    // Upload ไป Vercel Blob
    const timestamp = Date.now()
    const blob = await put(`collages/collage-${timestamp}.png`, imageBuffer, {
      access: 'public',
      contentType: 'image/png',
    })

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

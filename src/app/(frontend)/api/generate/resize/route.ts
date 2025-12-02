import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { put } from '@vercel/blob'

const IMAGE_SIZES = {
  facebook: {
    width: 1200,
    height: 630,
  },
  instagram_feed: {
    width: 1080,
    height: 1080,
  },
  instagram_story: {
    width: 1080,
    height: 1920,
  },
}

export async function POST(request: NextRequest) {
  try {
    const { sourceUrl, platforms, jobId } = await request.json()

    if (!sourceUrl || !platforms || !Array.isArray(platforms)) {
      return NextResponse.json(
        { error: 'sourceUrl and platforms array are required' },
        { status: 400 }
      )
    }

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      )
    }

    // Fetch the source image
    const imageResponse = await fetch(sourceUrl)
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch source image')
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())

    // Resize for each platform and upload to Vercel Blob
    const results: Record<string, { url: string; width: number; height: number }> = {}

    for (const platform of platforms) {
      const config = IMAGE_SIZES[platform as keyof typeof IMAGE_SIZES]
      if (!config) {
        console.warn(`Unknown platform: ${platform}`)
        continue
      }

      const resizedBuffer = await sharp(imageBuffer)
        .resize(config.width, config.height, {
          fit: 'cover',
          position: 'center',
        })
        .png({ 
          quality: 100,
          compressionLevel: 6,
        })
        .toBuffer()

      // Upload to Vercel Blob
      const blob = await put(`jobs/${jobId}/${platform}.png`, resizedBuffer, {
        access: 'public',
        contentType: 'image/png',
      })

      results[platform] = {
        url: blob.url,
        width: config.width,
        height: config.height,
      }
    }

    return NextResponse.json(results)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to resize images'
    console.error('Error resizing images:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

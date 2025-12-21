import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import Replicate from 'replicate'
import sharp from 'sharp'

// ✅ Force Node.js runtime
export const runtime = 'nodejs'

// ✅ Increase timeout for upscaling
export const maxDuration = 60

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

/**
 * POST /api/generate/upscale
 * Upscale image to 2048x2048 using Real-ESRGAN
 * 
 * GET /api/generate/upscale?predictionId=xxx
 * Poll upscale status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { imageUrl, scale = 2 } = body

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 })
    }

    console.log(`🔍 Starting upscale for: ${imageUrl.substring(0, 80)}...`)
    console.log(`   Scale factor: ${scale}x`)

    // ⭐ Normalize to 1024x1024 first (ensures 2048x2048 output)
    console.log(`   📐 Normalizing to 1024x1024...`)
    const res = await fetch(imageUrl)
    const inputBuf = Buffer.from(await res.arrayBuffer())

    // Resize to 1024x1024 (cover = crop to fill frame)
    const normalizedBuf = await sharp(inputBuf)
      .resize(1024, 1024, { fit: 'cover' })
      .png()
      .toBuffer()

    // Upload normalized image to Blob
    const normalizedBlob = await put(`preupscale-${Date.now()}.png`, normalizedBuf, {
      access: 'public',
      contentType: 'image/png',
    })

    console.log(`   ✅ Normalized: ${normalizedBlob.url}`)

    // Start Real-ESRGAN upscaling with normalized image
    const prediction = await replicate.predictions.create({
      model: 'nightmareai/real-esrgan',
      input: {
        image: normalizedBlob.url,
        scale: scale, // 2x upscale (1024 → 2048)
        face_enhance: false,
      },
    })

    console.log(`✅ Upscale prediction started: ${prediction.id}`)

    return NextResponse.json({
      predictionId: prediction.id,
      status: prediction.status,
    })

  } catch (error) {
    console.error('❌ Upscale start failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upscale failed' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/generate/upscale?predictionId=xxx
 * Poll upscale status and upload to Blob when done
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const predictionId = searchParams.get('predictionId')

    if (!predictionId) {
      return NextResponse.json({ error: 'predictionId required' }, { status: 400 })
    }

    // Get prediction status
    const prediction = await replicate.predictions.get(predictionId)
    
    console.log(`📊 Upscale prediction ${predictionId}: ${prediction.status}`)

    // If succeeded, upload to Blob
    if (prediction.status === 'succeeded' && prediction.output) {
      const imageUrl = Array.isArray(prediction.output) 
        ? prediction.output[0] 
        : prediction.output

      if (!imageUrl) {
        throw new Error('No output from upscaler')
      }

      console.log(`📥 Downloading upscaled image...`)
      const response = await fetch(imageUrl as string)
      
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`)
      }

      const buffer = await response.arrayBuffer()
      const sizeKB = Math.round(buffer.byteLength / 1024)
      console.log(`   Downloaded ${sizeKB}KB`)

      // Upload to Vercel Blob (permanent)
      const blob = await put(
        `upscaled-${Date.now()}.png`,
        buffer,
        {
          access: 'public',
          contentType: 'image/png',
        }
      )

      console.log(`✅ Upscaled image saved: ${blob.url}`)

      return NextResponse.json({
        status: 'succeeded',
        imageUrl: blob.url,
        originalSize: `${sizeKB}KB`,
      })
    }

    // Return current status
    return NextResponse.json({
      status: prediction.status,
      error: prediction.error || null,
    })

  } catch (error) {
    console.error('❌ Upscale polling failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Polling failed' },
      { status: 500 }
    )
  }
}

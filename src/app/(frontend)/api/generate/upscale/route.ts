import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import Replicate from 'replicate'
import sharp from 'sharp'

// ✅ Force Node.js runtime
export const runtime = 'nodejs'

// ✅ Prevent Next.js caching (critical for polling)
export const dynamic = 'force-dynamic'

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

    // ✅ Cast scale to number to prevent string/NaN issues
    const scaleNum = Number(scale)
    const finalScale = Number.isFinite(scaleNum) ? scaleNum : 2
    console.log(`🔍 Starting upscale for: ${imageUrl.substring(0, 80)}...`)
    console.log(`   Scale factor: ${finalScale}x`)

    // ⭐ Normalize to 1024x1024 first (ensures 2048x2048 output)
    const res = await fetch(imageUrl)
    if (!res.ok) throw new Error(`Failed to fetch input image: ${res.status}`)
    const inputBuf = Buffer.from(await res.arrayBuffer())

    // Log input metadata
    const metaIn = await sharp(inputBuf).metadata()
    console.log(`🧩 INPUT size: ${metaIn.width}x${metaIn.height}`)

    // Resize to 1024x1024 (cover = crop to fill frame)
    const normalizedBuf = await sharp(inputBuf)
      .resize(1024, 1024, { fit: 'cover' })
      .png()
      .toBuffer()

    // Verify normalized size
    const metaNorm = await sharp(normalizedBuf).metadata()
    console.log(`📐 NORMALIZED size: ${metaNorm.width}x${metaNorm.height}`) // Must be 1024x1024

    // Upload normalized image to Blob
    const normalizedBlob = await put(`preupscale-${Date.now()}.png`, normalizedBuf, {
      access: 'public',
      contentType: 'image/png',
    })

    console.log(`   ✅ Normalized: ${normalizedBlob.url}`)

    // Start Real-ESRGAN upscaling with normalized image
    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    const webhookUrl = `${baseUrl}/api/webhooks/replicate`
    
    console.log(`📡 Webhook URL: ${webhookUrl}`)
    
    const prediction = await replicate.predictions.create({
      model: 'nightmareai/real-esrgan',
      input: {
        image: normalizedBlob.url,
        scale: finalScale, // 2x upscale (1024 → 2048)
        face_enhance: false,
      },
      webhook: webhookUrl,
      webhook_events_filter: ['completed'],
    })

    console.log(`✅ Upscale prediction started: ${prediction.id}`)
    console.log(`🔔 Webhook URL: ${webhookUrl || 'NONE (will use polling)'}`)

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
      const res = await fetch(imageUrl as string)
      
      if (!res.ok) {
        throw new Error(`Failed to download: ${res.status}`)
      }

      const outBuf = Buffer.from(await res.arrayBuffer())

      // Log model output size
      const metaOut = await sharp(outBuf).metadata()
      console.log(`🖼️ MODEL OUTPUT size: ${metaOut.width}x${metaOut.height}`)

      // ✅ Force final output to be 2048x2048 + Convert to JPG (ลด 60%)
      let finalBuf = outBuf
      if (metaOut.width !== 2048 || metaOut.height !== 2048) {
        console.log(`⚠️ Size mismatch! Forcing to 2048x2048...`)
        finalBuf = await sharp(outBuf)
          .resize(2048, 2048, { fit: 'cover' })
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer()

        const metaFixed = await sharp(finalBuf).metadata()
        console.log(`✅ FIXED size: ${metaFixed.width}x${metaFixed.height}`)
      } else {
        // Convert to JPG even if size is correct
        finalBuf = await sharp(outBuf)
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer()
      }

      // Upload to Vercel Blob (permanent)
      const blob = await put(
        `upscaled-2048-${Date.now()}.jpg`,
        finalBuf,
        {
          access: 'public',
          contentType: 'image/jpeg',
        }
      )

      console.log(`✅ Upscaled image saved: ${blob.url}`)

      return NextResponse.json({
        status: 'succeeded',
        imageUrl: blob.url,
        size: '2048x2048',
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

/**
 * Helper function: Resize and upload image (for non-upscale sizes)
 * Used for 4:5 and 9:16 aspect ratios
 */
export async function resizeAndUpload(imageUrl: string, outputSize: string): Promise<string> {
  const SIZE_MAP: Record<string, { width: number; height: number }> = {
    '4:5-2K': { width: 1080, height: 1350 },
    '9:16-2K': { width: 1080, height: 1920 },
  }

  const targetSize = SIZE_MAP[outputSize]
  if (!targetSize) {
    throw new Error(`Unknown output size: ${outputSize}`)
  }

  console.log(`📐 Resizing to ${targetSize.width}x${targetSize.height}...`)

  // Download image
  const res = await fetch(imageUrl)
  if (!res.ok) {
    throw new Error(`Failed to download image: ${res.status}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())

  // Resize and compress
  const resized = await sharp(buffer)
    .resize(targetSize.width, targetSize.height, { fit: 'cover' })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer()

  // Upload to Blob
  const blob = await put(
    `resized-${outputSize}-${Date.now()}.jpg`,
    resized,
    {
      access: 'public',
      contentType: 'image/jpeg',
    }
  )

  console.log(`✅ Resized image saved: ${blob.url}`)
  return blob.url
}

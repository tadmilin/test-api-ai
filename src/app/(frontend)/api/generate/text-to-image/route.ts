import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import Replicate from 'replicate'

// ✅ Force Node.js runtime
export const runtime = 'nodejs'

// ✅ Increase timeout for Imagen 4 Ultra
export const maxDuration = 120

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

/**
 * POST /api/generate/text-to-image
 * Generate images from text prompt using Google Imagen 4 Ultra
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config })
    
    // Get current user from cookie
    const { user } = await payload.auth({ headers: request.headers })
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      prompt, 
      outputFormat = 'png',
      numImages = 1,
      outputSize = '1:1-2K', // Default output size
    } = body

    // ✅ Map outputSize to aspectRatio for Imagen 4 Ultra
    // Imagen supports: 1:1, 16:9, 9:16, 3:4, 4:3 ONLY
    const OUTPUT_SIZE_TO_ASPECT_RATIO: Record<string, string> = {
      '1:1-2K': '1:1',
      '4:5-2K': '3:4',   // ✅ Portrait (0.75) → resize เป็น 1440×1920 หรือ 1080×1350
      '9:16-2K': '9:16',
    }
    const aspectRatio = OUTPUT_SIZE_TO_ASPECT_RATIO[outputSize] || '1:1'

    // Validate
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: 'Prompt is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    if (prompt.length < 10) {
      return NextResponse.json(
        { error: 'Prompt must be at least 10 characters long' },
        { status: 400 }
      )
    }

    if (numImages < 1 || numImages > 4) {
      return NextResponse.json(
        { error: 'Number of images must be between 1 and 4' },
        { status: 400 }
      )
    }

    const validFormats = ['jpg', 'png', 'webp']
    if (!validFormats.includes(outputFormat)) {
      return NextResponse.json(
        { error: `Invalid output format. Must be one of: ${validFormats.join(', ')}` },
        { status: 400 }
      )
    }

    console.log(`🎨 Text to Image request:`)
    console.log(`   User: ${user.email}`)
    console.log(`   Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`)
    console.log(`   Output Size: ${outputSize} → Aspect Ratio: ${aspectRatio}`)
    console.log(`   Format: ${outputFormat}`)
    console.log(`   Num Images: ${numImages}`)

    // Create job in database
    const job = await payload.create({
      collection: 'jobs',
      draft: false,
      data: {
        productName: `Text to Image: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`,
        status: 'processing',
        createdBy: user.id,
        // ✅ ไม่ใช้ customPrompt field เพื่อไม่ให้สับสนกับ custom-prompt feature
        contentTopic: `Text-to-Image (${aspectRatio})`,
        postTitleHeadline: `Generated from: "${prompt.substring(0, 100)}"`,
        contentDescription: `Aspect Ratio: ${aspectRatio} | Format: ${outputFormat} | Images: ${numImages} | Prompt: ${prompt.substring(0, 200)}`,
        outputSize: outputSize,
      },
    })

    console.log(`✅ Job created: ${job.id}`)

    // Create image placeholders
    const imageUrls: Array<{
      status: 'pending' | 'completed' | 'failed' | 'approved' | 'regenerating' | null
      photoType?: string | null
      contentTopic?: string | null
      predictionId?: string | null
      url?: string | null
      error?: string | null
    }> = []
    
    for (let i = 0; i < numImages; i++) {
      imageUrls.push({
        status: 'pending',
        photoType: 'text-to-image',
        contentTopic: prompt.substring(0, 100),
        predictionId: null,
        url: null,
      })
    }

    // Update job with image placeholders
    await payload.update({
      collection: 'jobs',
      id: job.id,
      data: {
        enhancedImageUrls: imageUrls,
      },
    })

    // Start async generation for each image
    const predictions = []
    for (let i = 0; i < numImages; i++) {
      console.log(`🚀 Starting Imagen 4 Ultra for image ${i + 1}/${numImages}...`)
      
      try {
        const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
        const webhookUrl = `${baseUrl}/api/webhooks/replicate`
        
        const prediction = await replicate.predictions.create({
          model: 'google/imagen-4-ultra',
          input: {
            prompt: prompt,
            aspect_ratio: aspectRatio,
            output_format: outputFormat,
            output_quality: 90,
            safety_tolerance: 2,
            negative_prompt: 'blurry, low quality, distorted, watermark, text, logo',
          },
          webhook: webhookUrl,
          webhook_events_filter: ['completed'],
        })

        predictions.push({
          index: i,
          predictionId: prediction.id,
          status: prediction.status,
        })

        console.log(`   ✅ Prediction ${i + 1} created: ${prediction.id}`)

        // Update job with prediction ID
        imageUrls[i].predictionId = prediction.id
        await payload.update({
          collection: 'jobs',
          id: job.id,
          data: {
            enhancedImageUrls: imageUrls,
          },
        })

      } catch (error) {
        console.error(`   ❌ Failed to create prediction ${i + 1}:`, error)
        imageUrls[i].status = 'failed'
        imageUrls[i].error = error instanceof Error ? error.message : 'Unknown error'
        
        await payload.update({
          collection: 'jobs',
          id: job.id,
          data: {
            enhancedImageUrls: imageUrls,
          },
        })
      }
    }

    console.log(`✅ All predictions created (${predictions.length}/${numImages})`)

    // ✅ Enforce job limit (FIFO cleanup) - async, don't wait
    fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'}/api/cleanup/enforce-limit`, {
      method: 'POST',
    }).catch(err => console.warn('⚠️ Cleanup failed:', err))

    return NextResponse.json({
      jobId: job.id,
      predictions: predictions,
      message: `Started generation of ${numImages} images`,
    })

  } catch (error) {
    console.error('❌ Text to Image generation failed:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Generation failed',
      },
      { status: 500 }
    )
  }
}

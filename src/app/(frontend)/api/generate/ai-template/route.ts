import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import { getTemplatePrompt, type TemplateType } from '@/utilities/templatePrompts'
import { getTemplateReference } from '@/utilities/getTemplateReference'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ensurePublicImage } from '@/utilities/imageProcessing'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

// POST: Start template generation (returns immediately with prediction ID)
export async function POST(request: NextRequest) {
  try {
    const { imageUrls, templateType, jobId } = await request.json()

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json({ error: 'imageUrls array is required' }, { status: 400 })
    }

    if (!templateType) {
      return NextResponse.json({ error: 'templateType is required' }, { status: 400 })
    }

    console.log(`🎨 Starting AI template generation:`)
    console.log(`  - Type: ${templateType} (${imageUrls.length} images)`)
    console.log(`  - Job ID: ${jobId}`)

    const templateRef = await getTemplateReference(templateType as TemplateType)
    
    // 🚀 OPTIMIZATION: Limit to max 3 images total for faster processing
    let finalImageUrls: string[]
    if (templateRef) {
      // Template + first 2 user images = 3 total
      finalImageUrls = [templateRef, ...imageUrls.slice(0, 2)]
      console.log(`📐 Using template reference + ${imageUrls.slice(0, 2).length} images`)
    } else {
      // Max 3 user images
      finalImageUrls = imageUrls.slice(0, 3)
      console.log(`📸 Using ${finalImageUrls.length} images (no template ref)`)
    }

    // Ensure all images are public (especially the template from Media)
    const baseUrl = request.nextUrl.origin || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    console.log('🚀 Ensuring all template images are public...')
    
    finalImageUrls = await Promise.all(
      finalImageUrls.map(url => ensurePublicImage(url, jobId, baseUrl))
    )
    console.log('✅ All template images are public')

    const prompt = getTemplatePrompt(templateType as TemplateType)
    if (!prompt) {
      throw new Error(`No prompt found for template type: ${templateType}`)
    }

    console.log(`📝 Creating Replicate prediction...`)
    
    const prediction = await replicate.predictions.create({
      model: 'google/nano-banana-pro',
      input: {
        image_input: finalImageUrls,
        prompt: prompt,
        resolution: '1K', // Valid: 1K, 2K, or 4K only
        aspect_ratio: 'match_input_image',
        output_format: 'png',
        safety_filter_level: 'block_only_high',
      },
    })

    console.log(`✅ Prediction created: ${prediction.id}`)
    console.log(`🔗 https://replicate.com/p/${prediction.id}`)
    
    // Store prediction ID in job
    const payload = await getPayload({ config })
    await payload.update({
      collection: 'jobs',
      id: jobId,
      data: {
        status: 'generating_template',
        generatedPrompt: `replicate:${prediction.id}`, // Store prediction ID
      },
    })

    // Return immediately - don't wait!
    return NextResponse.json({
      success: true,
      predictionId: prediction.id,
      status: prediction.status,
      message: 'Template generation started',
    })

  } catch (error: unknown) {
    console.error('❌ Failed to start template generation:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start generation' },
      { status: 500 }
    )
  }
}

// GET: Check prediction status and finalize when ready
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const predictionId = searchParams.get('predictionId')
    const jobId = searchParams.get('jobId')

    if (!predictionId) {
      return NextResponse.json({ error: 'predictionId required' }, { status: 400 })
    }

    console.log(`🔍 Checking prediction: ${predictionId}`)

    const prediction = await replicate.predictions.get(predictionId)
    
    console.log(`Status: ${prediction.status}`)

    if (prediction.status === 'succeeded' && prediction.output) {
      const templateUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output as string
      
      console.log(`✅ Template ready: ${templateUrl}`)

      // If jobId provided, update the job
      if (jobId) {
        const payload = await getPayload({ config })
        await payload.update({
          collection: 'jobs',
          id: jobId,
          data: {
            finalImageUrl: templateUrl,
            status: 'completed',
          },
        })
        
        await payload.create({
          collection: 'job-logs',
          data: {
            jobId,
            level: 'info',
            message: 'Template generation completed',
            timestamp: new Date().toISOString(),
          },
        })
      }

      return NextResponse.json({
        success: true,
        status: 'succeeded',
        templateUrl,
        predictionId,
      })
    }

    if (prediction.status === 'failed') {
      console.error(`❌ Prediction failed:`, prediction.error)
      
      if (jobId) {
        const payload = await getPayload({ config })
        await payload.update({
          collection: 'jobs',
          id: jobId,
          data: { status: 'failed' },
        })
      }

      return NextResponse.json({
        success: false,
        status: 'failed',
        error: prediction.error || 'Unknown error',
        predictionId,
      })
    }

    // Still processing
    return NextResponse.json({
      success: true,
      status: prediction.status,
      predictionId,
      message: 'Still processing...',
    })

  } catch (error: unknown) {
    console.error('❌ Error checking prediction:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check status' },
      { status: 500 }
    )
  }
}

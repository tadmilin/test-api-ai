import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import { put } from '@vercel/blob'
import { getTemplatePrompt, type TemplateStyle, type TemplateType } from '@/utilities/templatePrompts'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

export async function POST(request: NextRequest) {
  try {
    const { imageUrls, templateStyle, templateType, jobId } = await request.json()

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json(
        { error: 'imageUrls array is required' },
        { status: 400 }
      )
    }

    if (!templateStyle) {
      return NextResponse.json(
        { error: 'templateStyle is required (minimal, classic, or graphic)' },
        { status: 400 }
      )
    }

    if (!templateType) {
      return NextResponse.json(
        { error: 'templateType is required (single, dual, triple, or quad)' },
        { status: 400 }
      )
    }

    console.log(`🎨 Generating AI template:`)
    console.log(`  - Type: ${templateType} (${imageUrls.length} images)`)
    console.log(`  - Style: ${templateStyle}`)
    console.log(`  - Job ID: ${jobId}`)

    // Get the appropriate prompt
    const prompt = getTemplatePrompt(
      templateStyle as TemplateStyle,
      templateType as TemplateType,
      imageUrls
    )

    console.log(`📝 Prompt length: ${prompt.length} characters`)

    // Call Nano-Banana Pro for creative template generation
    console.log('🚀 Calling Nano-Banana Pro...')
    
    const prediction = await replicate.predictions.create({
      model: 'google/nano-banana-pro',
      input: {
        image_input: imageUrls, // Multiple reference images
        prompt: prompt,
        aspect_ratio: '1:1', // Default, adjust based on templateType
        megapixels: '1', // 1K resolution (approximately 1024x1024)
        output_format: 'png',
        output_quality: 95,
        num_outputs: 1,
      },
    })

    // Wait for completion
    console.log('⏳ Waiting for Nano-Banana Pro...')
    const result = await replicate.wait(prediction)
    
    if (!result.output) {
      throw new Error('No output from Nano-Banana Pro')
    }

    const templateUrl = Array.isArray(result.output) ? result.output[0] : result.output as string
    console.log('✅ Template generated:', templateUrl)

    // Download and upload to Vercel Blob for permanence
    console.log('📦 Uploading to Vercel Blob...')
    const imageResponse = await fetch(templateUrl)
    if (!imageResponse.ok) {
      throw new Error('Failed to download template from Replicate')
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const timestamp = Date.now()
    
    const blob = await put(
      `templates/ai-${templateStyle}-${templateType}-${timestamp}.png`,
      imageBuffer,
      {
        access: 'public',
        contentType: 'image/png',
      }
    )

    console.log('✅ Uploaded to Blob:', blob.url)

    return NextResponse.json({
      success: true,
      templateUrl: blob.url,
      originalUrl: templateUrl,
      style: templateStyle,
      type: templateType,
      predictionId: result.id,
    })

  } catch (error: unknown) {
    console.error('❌ AI Template generation error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate AI template'
      },
      { status: 500 }
    )
  }
}

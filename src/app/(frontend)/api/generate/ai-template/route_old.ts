import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import { put } from '@vercel/blob'
import { getTemplatePrompt, type TemplateType } from '@/utilities/templatePrompts'
import { getTemplateReference } from '@/utilities/getTemplateReference'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

export async function POST(request: NextRequest) {
  try {
    const { imageUrls, templateType, jobId } = await request.json()

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json(
        { error: 'imageUrls array is required' },
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
    console.log(`  - Job ID: ${jobId}`)

    // Get random template reference for this type
    const templateRef = await getTemplateReference(templateType as TemplateType)
    
    // Prepare image array - template reference first if available
    const finalImageUrls = templateRef ? [templateRef, ...imageUrls] : imageUrls
    
    if (templateRef) {
      console.log(`📐 Using template reference: ${templateRef}`)
    } else {
      console.log(`⚠️ No template reference found for type "${templateType}", using images only`)
    }

    // Get the appropriate prompt
    const prompt = getTemplatePrompt(templateType as TemplateType)
    
    if (!prompt) {
      throw new Error(`No prompt found for template type: ${templateType}`)
    }

    console.log(`📝 Prompt preview: ${prompt.substring(0, 150)}...`)
    console.log(`📸 Total images to process: ${finalImageUrls.length}`)

    // Call Nano-Banana Pro for creative template generation
    console.log('🚀 Calling Nano-Banana Pro with parameters:')
    console.log({
      model: 'google/nano-banana-pro',
      imageCount: finalImageUrls.length,
      resolution: '1K',
      aspect_ratio: 'match_input_image',
      safety_filter_level: 'block_only_high',
    })
    
    const prediction = await replicate.predictions.create({
      model: 'google/nano-banana-pro',
      input: {
        image_input: finalImageUrls, // Template reference + user images
        prompt: prompt,
        resolution: '1K', // 1K resolution
        aspect_ratio: 'match_input_image', // Match first image aspect ratio
        output_format: 'png',
        safety_filter_level: 'block_only_high',
      },
    })

    console.log(`✅ Prediction created: ${prediction.id}`)
    console.log(`🔗 Status URL: https://replicate.com/p/${prediction.id}`)

    // Wait for completion
    console.log('⏳ Waiting for Nano-Banana Pro (this may take 30-90 seconds)...')
    const result = await replicate.wait(prediction)
    
    console.log('✅ Prediction completed!')
    console.log('Result status:', result.status)
    console.log('Has output:', !!result.output)
    
    if (!result.output) {
      console.error('❌ No output from prediction:', {
        id: result.id,
        status: result.status,
        error: result.error,
        logs: result.logs,
      })
      throw new Error(`No output from Nano-Banana Pro. Status: ${result.status}${result.error ? `, Error: ${result.error}` : ''}`)
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
      `templates/ai-${templateType}-${timestamp}.png`,
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
      type: templateType,
      usedTemplateRef: !!templateRef,
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

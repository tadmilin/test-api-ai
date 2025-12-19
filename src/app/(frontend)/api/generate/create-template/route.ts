import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import Replicate from 'replicate'

// ✅ Force Node.js runtime
export const runtime = 'nodejs'

// ✅ Increase timeout for Nano Banana Pro (30-60 seconds generation)
export const maxDuration = 120

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

/**
 * POST /api/generate/create-template
 * 
 * Generate a composite template using Nano Banana Pro:
 * 1. Prepare template + enhanced images as inputs
 * 2. Call Nano Banana Pro with custom prompt
 * 3. Wait for generation (30-60 seconds)
 * 4. Upload result to Vercel Blob
 * 
 * WAITING FOR: Custom prompt from user
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { enhancedImageUrls, templateUrl } = body

    // Validate
    if (!enhancedImageUrls || !Array.isArray(enhancedImageUrls) || enhancedImageUrls.length === 0) {
      return NextResponse.json(
        { error: 'enhancedImageUrls is required and must be a non-empty array' },
        { status: 400 }
      )
    }

    if (!templateUrl) {
      return NextResponse.json(
        { error: 'templateUrl is required' },
        { status: 400 }
      )
    }

    console.log(`🎨 Starting Nano Banana Pro template generation`)
    console.log(`📋 Template URL: ${templateUrl}`)
    console.log(`📸 Enhanced images: ${enhancedImageUrls.length}`)

    // TODO: Waiting for custom prompt from user
    // This will be replaced with actual Nano Banana Pro API call
    
    return NextResponse.json(
      { 
        error: 'Template generation not implemented yet - waiting for Nano Banana Pro prompt',
        info: 'Ready to integrate once prompt is provided',
      },
      { status: 501 } // Not Implemented
    )

    /*
    // Future implementation example:
    const output = await replicate.run(
      "google/nano-banana-pro",
      {
        input: {
          prompt: "YOUR_CUSTOM_PROMPT_HERE",
          image_input: [templateUrl, ...enhancedImageUrls],
          // Additional parameters based on your requirements
        }
      }
    )
    
    // Upload to Vercel Blob
    const response = await fetch(output[0])
    const buffer = await response.arrayBuffer()
    const blob = await put(
      `template-${new Date().toISOString()}.png`,
      buffer,
      {
        access: 'public',
        contentType: 'image/png',
      }
    )
    
    return NextResponse.json({
      success: true,
      resultImageUrl: blob.url,
    })
    */

  } catch (error) {
    console.error('❌ Template generation failed:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Template generation failed',
      },
      { status: 500 }
    )
  }
}

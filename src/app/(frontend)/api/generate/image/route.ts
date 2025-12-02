import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()

    if (!prompt) {
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    const openai = new OpenAI({ apiKey })

    // Generate image using DALL-E 3
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
    })

    if (!response.data || response.data.length === 0) {
      throw new Error('No image data returned from DALL-E')
    }

    const imageUrl = response.data[0]?.url

    if (!imageUrl) {
      throw new Error('No image URL returned from DALL-E')
    }

    return NextResponse.json({
      imageUrl,
      revisedPrompt: response.data[0]?.revised_prompt,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate image'
    console.error('Error generating image:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

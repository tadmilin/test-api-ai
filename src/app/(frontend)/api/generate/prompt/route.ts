import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: NextRequest) {
  try {
    const { productName, productDescription, mood, referenceImageUrls } = await request.json()

    if (!productName) {
      return NextResponse.json(
        { error: 'productName is required' },
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

    // Build the prompt for GPT-4
    const userMessage = `You are an expert at creating image generation prompts for DALL-E and Stable Diffusion.

Product Information:
- Name: ${productName}
- Description: ${productDescription || 'N/A'}
- Mood/Style: ${mood || 'Professional and modern'}
${referenceImageUrls && referenceImageUrls.length > 0 ? `- Reference Images: ${referenceImageUrls.length} images provided` : ''}

Task: Create a detailed, high-quality English prompt for generating a marketing image for this product. The prompt should:
1. Be descriptive and specific
2. Include artistic style, lighting, composition
3. Be optimized for image generation AI models
4. Be suitable for social media marketing (Facebook, Instagram)
5. Maximum 300 words

Return ONLY the prompt text, nothing else.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      max_tokens: 1024,
    })

    const prompt = completion.choices[0]?.message?.content || ''

    return NextResponse.json({ prompt })
  } catch (error) {
    console.error('Error generating prompt:', error)
    return NextResponse.json(
      { error: 'Failed to generate prompt' },
      { status: 500 }
    )
  }
}

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

    // Build messages with vision if reference images exist
    const messages: any[] = []
    
    if (referenceImageUrls && referenceImageUrls.length > 0) {
      // Use GPT-4 Vision to analyze reference images
      const visionContent = [
        {
          type: 'text',
          text: `You are an expert at creating image generation prompts for DALL-E.

Product Information:
- Name: ${productName}
- Description: ${productDescription || 'N/A'}
- Mood/Style: ${mood || 'Professional and modern'}

I've provided reference images. Analyze these images carefully and create a DALL-E prompt that:
1. Incorporates the visual style, colors, composition, and mood from the reference images
2. Describes the ${productName} product in this visual style
3. Includes specific details about background, lighting, atmosphere from the references
4. Maintains the aesthetic feel of the reference images
5. Be optimized for DALL-E 3 image generation
6. Maximum 300 words

Return ONLY the prompt text, nothing else.`
        },
        ...referenceImageUrls.map((url: string) => ({
          type: 'image_url',
          image_url: { url, detail: 'high' }
        }))
      ]
      
      messages.push({
        role: 'user',
        content: visionContent
      })
    } else {
      // No reference images, use text-only prompt
      messages.push({
        role: 'user',
        content: `You are an expert at creating image generation prompts for DALL-E.

Product Information:
- Name: ${productName}
- Description: ${productDescription || 'N/A'}
- Mood/Style: ${mood || 'Professional and modern'}

Task: Create a detailed, high-quality English prompt for generating a marketing image for this product. The prompt should:
1. Be descriptive and specific
2. Include artistic style, lighting, composition
3. Be optimized for DALL-E 3 image generation
4. Be suitable for social media marketing (Facebook, Instagram)
5. Maximum 300 words

Return ONLY the prompt text, nothing else.`
      })
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
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

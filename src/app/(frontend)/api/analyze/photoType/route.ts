import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

export async function POST(request: NextRequest) {
  try {
    const { imageUrl, sheetType } = await request.json()

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 })
    }

    console.log('🔍 Analyzing photo type with GPT Vision...')
    console.log('Image URL:', imageUrl)
    console.log('Sheet Type:', sheetType || 'none')

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are classifying a hotel/resort photo into one of these types:

- bedroom
- dining
- lobby
- pool
- bathroom
- other

Look at the image and respond in JSON ONLY:

{
  "detectedType": "bedroom|dining|lobby|pool|bathroom|other",
  "confidence": 0.0-1.0
}

Do NOT describe the image. Just classify.`,
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl, detail: 'low' },
          },
        ],
      },
    ]

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 200,
      temperature: 0,
    })

    const content = completion.choices[0]?.message?.content || '{}'
    let detectedType: string | undefined
    let confidence: number | undefined

    try {
      const parsed = JSON.parse(content)
      detectedType = parsed.detectedType
      confidence = parsed.confidence
    } catch (parseError) {
      console.error('Failed to parse GPT Vision response:', content)
      detectedType = undefined
    }

    console.log('✅ GPT Vision result:', { detectedType, confidence })

    return NextResponse.json({
      sheetType: sheetType || null,
      detectedType: detectedType || null,
      confidence: confidence ?? null,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to analyze photo type'
    console.error('Error in /api/analyze/photoType:', error)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

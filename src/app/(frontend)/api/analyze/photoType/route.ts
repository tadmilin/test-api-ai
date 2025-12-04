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
            text: `You are classifying a hotel/resort photo into ONE of these exact categories:

bedroom, bathroom, dining_room, buffet, food_closeup, lobby, entrance, building_exterior, balcony, pool, gym, spa, meeting_room, corridor, garden_nature, beach_resort, mountain_resort, jungle_resort, other

CRITICAL: Respond with ONLY pure JSON. No markdown, no code blocks, no extra text.

{
  "detectedType": "one_of_the_categories_above",
  "confidence": 0.85
}

Return ONLY the JSON object.`,
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl, detail: 'high' },
          },
        ],
      },
    ]

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 200,
      temperature: 0,
    })

    const content = completion.choices[0]?.message?.content || '{}'
    let detectedType: string | undefined
    let confidence: number | undefined

    try {
      // Try direct JSON parse first
      const parsed = JSON.parse(content)
      detectedType = parsed.detectedType
      confidence = parsed.confidence
    } catch (parseError) {
      // Fallback: extract JSON using regex
      console.warn('Direct JSON parse failed, attempting regex extraction...')
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          detectedType = parsed.detectedType
          confidence = parsed.confidence
        } else {
          console.error('No JSON object found in response:', content)
          detectedType = undefined
        }
      } catch (regexError) {
        console.error('Failed to parse GPT Vision response:', content)
        detectedType = undefined
      }
    }

    // Set default confidence if missing
    if (confidence === undefined || confidence === null) {
      confidence = 0.50
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

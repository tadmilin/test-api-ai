import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { google } from 'googleapis'

export async function POST(request: NextRequest) {
  try {
    const { 
      productName, 
      contentTopic,
      contentDescription,
      referenceImageUrls,
      analysisOnly, // true = return JSON analysis, false = return prompt only
    } = await request.json()

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
    type VisionContent = Array<{
      type: 'text'
      text: string
    } | {
      type: 'image_url'
      image_url: { url: string; detail: 'high' | 'low' | 'auto' }
    }>

    type MessageContent = string | VisionContent

    const messages: Array<{ role: 'user'; content: MessageContent }> = []
    
    if (referenceImageUrls && referenceImageUrls.length > 0) {
      // Download images from Google Drive and convert to base64
      const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
      const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

      if (!serviceAccountEmail || !privateKey) {
        return NextResponse.json(
          { error: 'Google Service Account credentials not configured' },
          { status: 500 }
        )
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: serviceAccountEmail,
          private_key: privateKey.replace(/\\n/gm, '\n').replace(/^"|"$/g, ''),
        },
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      })

      const drive = google.drive({ version: 'v3', auth })

      // Download images and convert to base64
      const imageDataUrls = await Promise.all(
        referenceImageUrls.map(async (url: string) => {
          try {
            // Extract file ID from various Google Drive URL formats
            let fileId = null
            
            if (url.includes('id=')) {
              const match = url.match(/[?&]id=([^&]+)/)
              fileId = match ? match[1] : null
            } else if (url.includes('/file/d/')) {
              const match = url.match(/\/file\/d\/([^/]+)/)
              fileId = match ? match[1] : null
            }
            
            if (!fileId) return null

            // Get file metadata to check mime type
            const metadata = await drive.files.get({
              fileId,
              fields: 'mimeType',
              supportsAllDrives: true,
            })

            const mimeType = metadata.data.mimeType

            // Download file
            const response = await drive.files.get(
              { fileId, alt: 'media', supportsAllDrives: true },
              { responseType: 'arraybuffer' }
            )

            const buffer = Buffer.from(response.data as ArrayBuffer)
            const base64 = buffer.toString('base64')
            const dataUrl = `data:${mimeType};base64,${base64}`

            return dataUrl
          } catch (error) {
            console.error('Error downloading image:', error)
            return null
          }
        })
      )

      // Filter out failed downloads
      const validImages = imageDataUrls.filter(img => img !== null)

      if (validImages.length === 0) {
        return NextResponse.json(
          { error: 'Failed to download reference images' },
          { status: 500 }
        )
      }

      // Create vision content based on analysisOnly flag
      const visionContent: VisionContent = analysisOnly ? [
        {
          type: 'text',
          text: `You are analyzing a hotel or resort related photo.

Your job is to analyze the image and prepare a dynamic enhancement plan.

Extract and return ONLY JSON with the following structure:
{
  "photoType": "one of: bedroom, bathroom, lobby, entrance, building_exterior, dining_room, buffet, food_closeup, pool, gym, spa, meeting_room, corridor, balcony, nature_garden, beach_resort, mountain_resort, jungle_resort, other",
  "issues": ["list of visual issues, e.g. flat lighting, washed out colors, empty room, noisy, low contrast"],
  "enhanceIdeas": ["what to improve to make it premium and inviting"],
  "propsToAdd": ["optional subtle props or ambience, e.g. vases, table linens, plants, candles, menu signs"],
  "finalPrompt": "an 80-150 word English prompt describing how to enhance THIS specific photo only, preserving layout and realism"
}

Rules for finalPrompt:
- Preserve the existing composition and camera angle
- Focus on realistic lighting, color grading, clarity, and ambience
- You may suggest subtle additions like table decor, plants, soft lighting, reflections
- Do NOT mention 'create a new image', 'generate new', or 'redesign'
- Keep it natural, suitable for high-end hotel/resort photography.`
        },
        ...validImages.map((dataUrl: string) => ({
          type: 'image_url' as const,
          image_url: { url: dataUrl, detail: 'high' as const }
        }))
      ] : [
        {
          type: 'text',
          text: `You are a professional photo retouching and enhancement specialist for hotels and resorts.

You will receive one or more images of:
- bedrooms, bathrooms, lobby, entrance, building exteriors,
- dining rooms, buffet lines, food close-ups,
- pools, gyms, spas, meeting rooms,
- nature and resort exteriors (beach, mountain, jungle, garden).

Your task:
1. Analyze the image(s)
2. Decide what to improve to make them look premium and inviting
3. Create ONE final English enhancement prompt, 80-150 words, that:
   - PRESERVES the existing layout and camera angles
   - ENHANCES lighting (soft, warm, hotel-style if appropriate)
   - IMPROVES colors, clarity, depth, and texture
   - MAKES food look more appetizing (if food is present)
   - CAN suggest subtle additions like table decor, plants, menu signs, candles, soft reflections, but must remain realistic.

Forbidden:
- Do NOT say 'create a new image', 'generate new', 'redesign', 'replace the scene'
- Do NOT change the fundamental structure of the room.

Content: ${contentTopic || contentDescription || productName}

Return ONLY the final prompt (plain text).`
        },
        ...validImages.map((dataUrl: string) => ({
          type: 'image_url' as const,
          image_url: { url: dataUrl, detail: 'high' as const }
        }))
      ]
      
      messages.push({
        role: 'user',
        content: visionContent
      })
    } else {
      // No reference images - create basic prompt
      const promptText = analysisOnly 
        ? `Analyze a hotel/resort photo and return JSON with: photoType, issues, enhanceIdeas, propsToAdd, finalPrompt (80-150 words).`
        : `Create a professional hotel photo enhancement prompt (80-150 words) for: ${contentTopic || productName}. Focus on realistic lighting, color, clarity improvements. Preserve existing composition.`
      
      messages.push({
        role: 'user',
        content: promptText
      })
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: analysisOnly ? 1024 : 300,
      temperature: 0.7,
      response_format: analysisOnly ? { type: 'json_object' } : undefined,
    })

    const responseText = completion.choices[0]?.message?.content || ''

    if (!responseText) {
      throw new Error('Empty response from GPT-4')
    }

    // If analysisOnly, parse JSON and return structured data
    if (analysisOnly) {
      try {
        const analysis = JSON.parse(responseText)
        return NextResponse.json({
          prompt: analysis.finalPrompt || '',
          photoType: analysis.photoType || 'other',
          issues: analysis.issues || [],
          enhanceIdeas: analysis.enhanceIdeas || [],
          propsToAdd: analysis.propsToAdd || [],
        })
      } catch (parseError) {
        console.error('Failed to parse analysis response:', parseError)
        // Fallback
        return NextResponse.json({
          prompt: 'Enhance this hotel photo with natural, realistic lighting. Improve brightness, color balance, clarity, and fine details.',
          photoType: 'other',
          issues: [],
          enhanceIdeas: [],
          propsToAdd: [],
        })
      }
    }

    // Normal mode - return prompt only
    return NextResponse.json({ prompt: responseText.trim() })
  } catch (error) {
    console.error('Error generating prompt:', error)
    
   
  }
}

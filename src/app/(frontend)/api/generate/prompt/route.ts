import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { google } from 'googleapis'

export async function POST(request: NextRequest) {
  try {
    const { 
      productName, 
      productDescription, 
      mood, 
      referenceImageUrls,
      contentTopic,
      postTitleHeadline,
      contentDescription,
      analysisOnly // NEW: ถ้าเป็น true = แค่วิเคราะห์รูป ไม่ต้อง full prompt
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
            // Extract file ID from URL
            const fileIdMatch = url.match(/id=([^&]+)/)
            if (!fileIdMatch) return null

            const fileId = fileIdMatch[1]

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

      // Use GPT-4 Vision to analyze reference images
      const visionContent: VisionContent = analysisOnly ? [
        {
          type: 'text',
          text: `You are analyzing a hotel/resort photo to determine if it matches the content topic.

Content Topic: "${contentDescription || contentTopic || productName}"

Analyze this photo and answer:
1. What is in this photo? (room type, area, features)
2. Does this photo match the content topic?

If the content is about FOOD/RESTAURANT/BREAKFAST but the photo shows a BEDROOM/ENTRANCE/POOL → NOT relevant
If the content is about ROOMS but the photo shows DINING AREA → NOT relevant
If they match → IS relevant

Response format:
{
  "isRelevant": true/false,
  "photoType": "bedroom/dining/pool/entrance/etc",
  "reasoning": "brief explanation",
  "enhancePrompt": "prompt for enhancement"
}

If relevant → Create content-specific prompt (e.g., "Enhance this breakfast buffet photo, improve food presentation, warm inviting lighting...")
If NOT relevant → Create general hotel enhancement prompt (e.g., "Enhance this hotel photo with natural, realistic lighting...")`
        },
        ...validImages.map((dataUrl: string) => ({
          type: 'image_url' as const,
          image_url: { url: dataUrl, detail: 'high' as const }
        }))
      ] : [
        {
          type: 'text',
          text: `You are a professional photo retouching specialist for luxury hotels and resorts.

CRITICAL: This is PHOTO EDITING ONLY - PRESERVE THE ORIGINAL IMAGES EXACTLY.

The input is a collage/layout of hotel photos. Your job is to create a prompt for subtle enhancement that:

✓ MUST PRESERVE:
- Exact same layout and composition
- All original elements in their positions
- Same camera angles and perspectives
- Original structure of each photo
- The collage arrangement

✓ ENHANCE ONLY:
- Lighting quality (warm, inviting, professional)
- Color grading (rich, luxurious tones)
- Sharpness and clarity
- Remove minor imperfections/noise
- Professional photo finishing

Content: ${contentTopic || productName}
Description: ${contentDescription || productDescription || 'Luxury hotel property'}
Style: ${mood || 'High-end hospitality photography'}

Create a brief prompt (max 150 words) using ONLY these phrases:
- "Enhance the existing photos"
- "Professional photo retouching"
- "Preserve original composition"
- "Improve lighting and colors"
- "High-end hotel photography finish"

FORBIDDEN words: create, generate, new, add, design, reimagine, transform
Return ONLY the enhancement prompt in English.`
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
      // No reference images/collage - create basic enhancement prompt
      messages.push({
        role: 'user',
        content: `You are a professional photo retouching specialist.

Content: ${contentTopic || productName}
Description: ${contentDescription || productDescription || 'Professional photography'}
Style: ${mood || 'High-end professional'}

Create a brief photo enhancement prompt (max 100 words) that:
- Enhances lighting and color balance
- Improves sharpness and clarity
- Maintains natural look
- Professional hospitality/commercial quality

Use only: "enhance", "retouch", "improve", "refine"
Avoid: "create", "generate", "new", "add"

Return ONLY the prompt in English.`
      })
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 1024,
      temperature: 0.7,
      response_format: analysisOnly ? { type: 'json_object' } : undefined,
    })

    const responseText = completion.choices[0]?.message?.content || ''

    if (!responseText) {
      throw new Error('Empty response from GPT-4')
    }

    // If analysisOnly, parse JSON response
    if (analysisOnly) {
      try {
        const analysis = JSON.parse(responseText)
        return NextResponse.json({
          prompt: analysis.enhancePrompt || '',
          isRelevant: analysis.isRelevant || false,
          photoType: analysis.photoType || 'unknown',
          reasoning: analysis.reasoning || '',
        })
      } catch (parseError) {
        console.error('Failed to parse analysis response:', parseError)
        // Fallback to general prompt
        return NextResponse.json({
          prompt: 'Enhance this affordable hotel/resort photo with natural, realistic lighting. Improve brightness, color balance, clarity, and fine details.',
          isRelevant: false,
          photoType: 'unknown',
          reasoning: 'Failed to parse analysis',
        })
      }
    }

    return NextResponse.json({ prompt: responseText })
  } catch (error) {
    console.error('Error generating prompt:', error)
    
   
  }
}

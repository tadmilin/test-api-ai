import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { google } from 'googleapis'

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
        ...validImages.map((dataUrl: string) => ({
          type: 'image_url',
          image_url: { url: dataUrl, detail: 'high' }
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

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
      contentDescription 
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

      // Use GPT-4 Vision to analyze reference images (collage)
      const visionContent = [
        {
          type: 'text',
          text: `You are an expert at creating image enhancement prompts for AI.

IMPORTANT: This is for IMAGE ENHANCEMENT, not creating from scratch. The AI will receive a collage of existing photos and enhance/refine them.

Content Brief:
- Topic: ${contentTopic || productName}
- Title/Headline: ${postTitleHeadline || 'Professional product photography'}
- Content Description: ${contentDescription || productDescription || 'High-quality marketing image'}
- Product: ${productName}
- Style Direction: ${mood || 'Professional and modern'}

I've provided a collage image. Create an enhancement prompt in English that:
1. KEEPS the existing composition and main elements from the collage
2. ENHANCES quality, lighting, colors, and details
3. Incorporates the Content Description theme while maintaining the original photos
4. Adds professional touches: better lighting, refined colors, subtle improvements
5. Uses terms like: "enhance", "refine", "professional lighting", "high-end", "luxury feel"
6. Maximum 250 words, family-friendly language only

The result should look like a professionally enhanced version of the original collage.

Return ONLY the enhancement prompt in English, nothing else.`
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
      // No reference images/collage - create basic enhancement prompt
      messages.push({
        role: 'user',
        content: `You are an expert at creating image enhancement prompts.

Content Brief:
- Topic: ${contentTopic || productName}
- Title/Headline: ${postTitleHeadline || 'Professional product photography'}
- Content Description: ${contentDescription || productDescription || 'High-quality marketing image'}
- Product: ${productName}
- Style Direction: ${mood || 'Professional and modern'}

Task: Create a detailed English prompt for professional product photography that will be used for image enhancement. The prompt should:
1. Focus on the Content Description and Title/Headline concept
2. Include professional lighting, composition, and styling
3. Emphasize quality, clarity, and commercial appeal
4. Be suitable for social media marketing (Facebook, Instagram)
5. Maximum 250 words, family-friendly language only

Return ONLY the enhancement prompt in English, nothing else.`
      })
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    })

    const prompt = completion.choices[0]?.message?.content || ''

    if (!prompt) {
      throw new Error('Empty prompt returned from GPT-4')
    }

    return NextResponse.json({ prompt })
  } catch (error) {
    console.error('Error generating prompt:', error)
    
   
  }
}

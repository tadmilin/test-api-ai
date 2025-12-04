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
      photoType, // bedroom, dining, lobby, pool, bathroom, generic
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

      // Dynamic prompt based on photoType
      let promptInstruction = ''
      
      switch (photoType) {
        case 'bedroom':
          promptInstruction = 'Create a SHORT retouching prompt for a hotel bedroom photo. Focus: warm lighting, cozy ambiance, clean bedding, natural brightness. Max 12 words.'
          break
        case 'dining':
          promptInstruction = 'Create a SHORT retouching prompt for a restaurant/dining photo. Focus: appetizing food colors, warm lighting, inviting atmosphere. Max 12 words.'
          break
        case 'lobby':
          promptInstruction = 'Create a SHORT retouching prompt for a hotel lobby photo. Focus: welcoming lighting, architectural clarity, elegant atmosphere. Max 12 words.'
          break
        case 'pool':
          promptInstruction = 'Create a SHORT retouching prompt for a pool/outdoor photo. Focus: vibrant water, bright natural light, tropical feel. Max 12 words.'
          break
        case 'bathroom':
          promptInstruction = 'Create a SHORT retouching prompt for a bathroom photo. Focus: clean bright lighting, crisp details, spa-like quality. Max 12 words.'
          break
        default:
          promptInstruction = 'Create a SHORT retouching prompt for a hotel photo. Focus: lighting, color balance, clarity. Max 12 words.'
      }
      
      const visionContent: VisionContent = [
        {
          type: 'text',
          text: `${promptInstruction}

Content: ${contentTopic || contentDescription || productName}

Return ONLY the prompt. Use words: enhance, retouch, improve, brighten. NO collage, layout, composition, arrangement, design.`
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
      // No reference images - create dynamic prompt based on photoType
      let promptInstruction = ''
      
      switch (photoType) {
        case 'bedroom':
          promptInstruction = 'Create SHORT retouching prompt for hotel bedroom: warm lighting, cozy feel, clean. Max 12 words.'
          break
        case 'dining':
          promptInstruction = 'Create SHORT retouching prompt for restaurant: appetizing colors, warm light. Max 12 words.'
          break
        case 'lobby':
          promptInstruction = 'Create SHORT retouching prompt for hotel lobby: welcoming light, clarity. Max 12 words.'
          break
        case 'pool':
          promptInstruction = 'Create SHORT retouching prompt for pool area: vibrant water, bright light. Max 12 words.'
          break
        case 'bathroom':
          promptInstruction = 'Create SHORT retouching prompt for bathroom: bright clean lighting. Max 12 words.'
          break
        default:
          promptInstruction = 'Create SHORT retouching prompt: lighting, color, clarity. Max 12 words.'
      }
      
      messages.push({
        role: 'user',
        content: `${promptInstruction}\n\nContent: ${contentTopic || productName}\n\nReturn ONLY the prompt. Use: enhance, retouch, improve, brighten.`
      })
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 150,
      temperature: 0.7,
    })

    const responseText = completion.choices[0]?.message?.content || ''

    if (!responseText) {
      throw new Error('Empty response from GPT-4')
    }

    return NextResponse.json({ enhancePrompt: responseText.trim() })
  } catch (error) {
    console.error('Error generating prompt:', error)
    
   
  }
}

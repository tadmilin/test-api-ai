import { NextResponse } from 'next/server'
import { analyzeTemplateWithAI } from '@/utilities/aiVisionTemplate'
import { downloadImageFromUrl, compositeImages } from '@/utilities/templateHelpers'
import sharp from 'sharp'
import { google } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/drive']

function getGoogleAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}')
  return new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  })
}

async function uploadToGoogleDrive(
  imageBuffer: Buffer,
  fileName: string,
  folderId?: string,
): Promise<string> {
  const auth = getGoogleAuth()
  const drive = google.drive({ version: 'v3', auth })

  const fileMetadata: any = {
    name: fileName,
    mimeType: 'image/png',
  }

  if (folderId) {
    fileMetadata.parents = [folderId]
  }

  const media = {
    mimeType: 'image/png',
    body: require('stream').Readable.from(imageBuffer),
  }

  const file = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, webViewLink, webContentLink',
  })

  // Make file publicly accessible
  await drive.permissions.create({
    fileId: file.data.id!,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  })

  return `https://drive.google.com/uc?export=view&id=${file.data.id}`
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { enhancedImageUrls, templateUrl, outputFolderId } = body

    if (!enhancedImageUrls || !Array.isArray(enhancedImageUrls) || enhancedImageUrls.length === 0) {
      return NextResponse.json(
        { error: 'enhancedImageUrls is required and must be a non-empty array' },
        { status: 400 },
      )
    }

    if (!templateUrl) {
      return NextResponse.json({ error: 'templateUrl is required' }, { status: 400 })
    }

    console.log(`🎨 Starting template generation with ${enhancedImageUrls.length} images`)
    console.log(`📋 Template URL: ${templateUrl}`)

    // Step 1: Analyze template with AI Vision
    console.log('🔍 Step 1: Analyzing template with AI Vision...')
    const analyzedTemplate = await analyzeTemplateWithAI(templateUrl)
    
    if (!analyzedTemplate || analyzedTemplate.positions.length === 0) {
      return NextResponse.json(
        { error: 'Failed to analyze template or no positions detected' },
        { status: 500 },
      )
    }

    console.log(`✅ Detected ${analyzedTemplate.positions.length} photo positions`)
    console.log(`📐 Template size: ${analyzedTemplate.templateSize.width}x${analyzedTemplate.templateSize.height}`)

    // Step 2: Download template image
    console.log('📥 Step 2: Downloading template image...')
    const templateBuffer = await downloadImageFromUrl(templateUrl)

    // Step 3: Match enhanced images to positions
    console.log('🖼️ Step 3: Processing enhanced images...')
    const imagesToComposite = []
    
    for (let i = 0; i < Math.min(enhancedImageUrls.length, analyzedTemplate.positions.length); i++) {
      const imageUrl = enhancedImageUrls[i]
      const position = analyzedTemplate.positions[i]
      
      console.log(`  📍 Image ${i + 1}: Downloading from ${imageUrl.substring(0, 60)}...`)
      const imageBuffer = await downloadImageFromUrl(imageUrl)
      
      // Resize to fit position
      const resizedBuffer = await sharp(imageBuffer)
        .resize(position.width, position.height, {
          fit: 'cover',
          position: 'center',
        })
        .toBuffer()

      imagesToComposite.push({
        buffer: resizedBuffer,
        position: position,
      })
    }

    // Step 4: Composite images onto template
    console.log('🎭 Step 4: Compositing images onto template...')
    const finalImageBuffer = await compositeImages(templateBuffer, imagesToComposite)

    // Step 5: Upload to Google Drive
    console.log('☁️ Step 5: Uploading to Google Drive...')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `template-${timestamp}.png`
    
    const uploadedUrl = await uploadToGoogleDrive(
      finalImageBuffer,
      fileName,
      outputFolderId,
    )

    console.log(`✅ Template generation complete: ${uploadedUrl}`)

    return NextResponse.json({
      success: true,
      templateUrl: uploadedUrl,
      metadata: {
        totalImages: enhancedImageUrls.length,
        positionsUsed: imagesToComposite.length,
        templateSize: analyzedTemplate.templateSize,
        fileName,
      },
    })

  } catch (error) {
    console.error('❌ Template generation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Template generation failed: ${errorMessage}` },
      { status: 500 },
    )
  }
}

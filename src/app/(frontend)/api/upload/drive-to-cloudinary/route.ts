import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { downloadDriveFile, extractDriveFileId } from '@/utilities/downloadDriveFile'
import { uploadBufferToCloudinary } from '@/utilities/cloudinaryUpload'

// ✅ Force Node.js runtime
export const runtime = 'nodejs'

/**
 * POST /api/upload/drive-to-cloudinary
 * Download from Google Drive and upload to Cloudinary
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await getPayload({ config })
    
    // Get current user from cookie
    const { user } = await payload.auth({ headers: request.headers })
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { driveUrl, folder = 'custom-prompt-source' } = body

    if (!driveUrl) {
      return NextResponse.json({ error: 'driveUrl is required' }, { status: 400 })
    }

    console.log(`📥 Downloading from Drive: ${driveUrl.substring(0, 80)}...`)
    
    // Extract Drive file ID
    const fileId = extractDriveFileId(driveUrl)
    if (!fileId) {
      return NextResponse.json({ error: 'Invalid Google Drive URL' }, { status: 400 })
    }

    // Download from Google Drive
    const fileBuffer = await downloadDriveFile(fileId)
    const originalMB = fileBuffer.length / 1024 / 1024
    console.log(`📊 Downloaded: ${originalMB.toFixed(2)} MB`)

    // Resize + Compress with Sharp to optimize
    const sharp = (await import('sharp')).default
    const metadata = await sharp(fileBuffer).metadata()
    const width = metadata.width || 0
    const height = metadata.height || 0
    console.log(`📐 Original dimensions: ${width}x${height}`)

    // Helper: Round to 64
    const roundTo64 = (val: number) => Math.max(64, Math.floor(val / 64) * 64)
    
    const MAX_DIMENSION = 1024
    const TARGET_ASPECT_RATIO = 1.5 // 3:2 ratio for nano-banana-pro
    
    let pipeline = sharp(fileBuffer)
    let newWidth = width
    let newHeight = height
    
    // Calculate target dimensions maintaining 3:2 ratio
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      // Scale down maintaining aspect ratio first
      const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
      newWidth = width * scale
      newHeight = height * scale
    }
    
    // Force 3:2 ratio (1.5:1) for Replicate compatibility
    const currentRatio = newWidth / newHeight
    if (Math.abs(currentRatio - TARGET_ASPECT_RATIO) > 0.01) {
      // Adjust to exact 3:2 ratio
      if (currentRatio > TARGET_ASPECT_RATIO) {
        // Too wide - reduce width
        newWidth = newHeight * TARGET_ASPECT_RATIO
      } else {
        // Too tall - reduce height
        newHeight = newWidth / TARGET_ASPECT_RATIO
      }
      console.log(`📐 Adjusted to 3:2 ratio: ${currentRatio.toFixed(3)} → ${TARGET_ASPECT_RATIO}`)
    }
    
    // Round to 64 (required by Flux models)
    newWidth = roundTo64(newWidth)
    newHeight = roundTo64(newHeight)
    
    console.log(`🔽 Resizing to ${newWidth}x${newHeight} (ratio: ${(newWidth/newHeight).toFixed(2)})`)
    pipeline = pipeline.resize(newWidth, newHeight, { 
      fit: 'inside',  // Don't distort - maintain aspect ratio
      withoutEnlargement: true 
    })
    
    // Compress with dynamic quality
    let quality = 80
    let processedBuffer = await pipeline
      .jpeg({ quality, chromaSubsampling: '4:4:4' })
      .toBuffer()
    
    // If still > 8MB, reduce quality
    const processedMB = processedBuffer.length / 1024 / 1024
    if (processedMB > 8) {
      console.log(`⚠️ Still ${processedMB.toFixed(2)} MB > 8MB, reducing quality to 70`)
      quality = 70
      processedBuffer = await sharp(fileBuffer)
        .resize(newWidth, newHeight, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ quality, chromaSubsampling: '4:4:4' })
        .toBuffer()
    }
    
    const finalMB = processedBuffer.length / 1024 / 1024
    console.log(`✅ Optimized: ${originalMB.toFixed(2)} MB → ${finalMB.toFixed(2)} MB (${newWidth}x${newHeight}, Q${quality})`)

    // Upload to Cloudinary with unique filename
    console.log(`📤 Uploading to Cloudinary (folder: ${folder})...`)
    // ✅ Add timestamp to ensure unique filename (prevent duplicate images)
    const uniqueFilename = `drive-${fileId}-${Date.now()}`
    const cloudinaryUrl = await uploadBufferToCloudinary(
      processedBuffer,
      folder,
      uniqueFilename
    )

    console.log(`✅ Cloudinary URL: ${cloudinaryUrl}`)

    return NextResponse.json({
      cloudinaryUrl,
      metadata: {
        originalSize: originalMB.toFixed(2) + ' MB',
        optimizedSize: finalMB.toFixed(2) + ' MB',
        dimensions: `${newWidth}x${newHeight}`,
        quality,
      }
    })

  } catch (error) {
    console.error('❌ Drive to Cloudinary upload failed:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Upload failed',
      },
      { status: 500 }
    )
  }
}

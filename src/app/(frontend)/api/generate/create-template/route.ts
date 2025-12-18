import { NextResponse } from 'next/server'
import { analyzeTemplateWithAI } from '@/utilities/aiVisionTemplate'
import { downloadImageFromUrl, compositeImages } from '@/utilities/templateHelpers'
import { getCachedTemplate, cacheTemplate } from '@/utilities/templateCache'
import sharp from 'sharp'
import { put } from '@vercel/blob'

export const runtime = 'nodejs'

// Allowlist domains to prevent SSRF
const ALLOWED_DOMAINS = [
  'googleusercontent.com',
  'drive.google.com',
  'blob.vercel-storage.com',
  'replicate.delivery',
]

function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Block private IPs
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return false
    }
    // Check allowlist
    return ALLOWED_DOMAINS.some(domain => parsed.hostname.includes(domain))
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { enhancedImageUrls, templateUrl } = body

    if (!enhancedImageUrls || !Array.isArray(enhancedImageUrls) || enhancedImageUrls.length === 0) {
      return NextResponse.json(
        { error: 'enhancedImageUrls is required and must be a non-empty array' },
        { status: 400 },
      )
    }

    if (!templateUrl) {
      return NextResponse.json({ error: 'templateUrl is required' }, { status: 400 })
    }

    // Validate all URLs
    if (!isValidImageUrl(templateUrl)) {
      return NextResponse.json({ error: 'Invalid template URL domain' }, { status: 400 })
    }
    for (const url of enhancedImageUrls) {
      if (!isValidImageUrl(url)) {
        return NextResponse.json({ error: 'Invalid enhanced image URL domain' }, { status: 400 })
      }
    }

    console.log(`🎨 Starting template generation with ${enhancedImageUrls.length} images`)
    console.log(`📋 Template URL: ${templateUrl}`)

    // Step 1: Download template image first to get actual size
    console.log('📥 Step 1: Downloading template image...')
    const templateBuffer = await downloadImageFromUrl(templateUrl)
    
    // Get actual template size from Sharp metadata
    const templateMetadata = await sharp(templateBuffer).metadata()
    const actualSize = {
      width: templateMetadata.width || 1080,
      height: templateMetadata.height || 1080,
    }
    console.log(`📐 Actual template size: ${actualSize.width}x${actualSize.height}`)

    // Step 2: Analyze template with AI Vision (with caching and actual size for scaling)
    console.log('🔍 Step 2: Analyzing template positions...')
    
    let analyzedTemplate = getCachedTemplate(templateUrl)
    
    if (!analyzedTemplate) {
      console.log('  📡 Calling AI Vision API...')
      analyzedTemplate = await analyzeTemplateWithAI(templateUrl, actualSize)
      
      if (!analyzedTemplate || analyzedTemplate.positions.length === 0) {
        return NextResponse.json(
          { error: 'Failed to analyze template or no positions detected' },
          { status: 500 },
        )
      }
      
      // Cache the result for future use
      cacheTemplate(templateUrl, analyzedTemplate)
    } else {
      // If cached, ensure size matches actual size (in case template was resized)
      if (analyzedTemplate.templateSize.width !== actualSize.width ||
          analyzedTemplate.templateSize.height !== actualSize.height) {
        console.log('  📐 Rescaling cached positions to match actual size...')
        const scaleX = actualSize.width / analyzedTemplate.templateSize.width
        const scaleY = actualSize.height / analyzedTemplate.templateSize.height
        
        analyzedTemplate.positions = analyzedTemplate.positions.map(pos => ({
          x: Math.round(pos.x * scaleX),
          y: Math.round(pos.y * scaleY),
          width: Math.round(pos.width * scaleX),
          height: Math.round(pos.height * scaleY),
        }))
        analyzedTemplate.templateSize = actualSize
      }
    }

    console.log(`✅ Detected ${analyzedTemplate.positions.length} photo positions`)

    // Sort positions by area (largest first) for better matching
    analyzedTemplate.positions.sort((a, b) => {
      const areaA = a.width * a.height
      const areaB = b.width * b.height
      return areaB - areaA // Descending
    })
    console.log('📊 Sorted positions by area (largest first)')

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

    // Step 4: Composite images onto template (PNG format to preserve transparency)
    console.log('🎭 Step 4: Compositing images onto template...')
    const finalImageBuffer = await compositeImages(templateBuffer, imagesToComposite, {
      format: 'png', // PNG preserves transparency, overlays, and rounded corners
      quality: 90,   // Not used for PNG, but good for documentation
    })

    // Step 5: Upload to Vercel Blob (permanent storage)
    console.log('☁️ Step 5: Uploading to Vercel Blob...')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `template-${timestamp}.png` // ✅ Match actual format
    
    const blob = await put(filename, finalImageBuffer, {
      access: 'public',
      contentType: 'image/png',
    })

    console.log(`✅ Template generation complete: ${blob.url}`)

    return NextResponse.json({
      success: true,
      resultImageUrl: blob.url, // ✅ ชื่อชัดเจนว่าเป็นผลลัพธ์
      templateUrl: blob.url, // Keep for backward compatibility
      metadata: {
        totalImages: enhancedImageUrls.length,
        positionsUsed: imagesToComposite.length,
        templateSize: analyzedTemplate.templateSize,
        filename,
        blobUrl: blob.url,
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

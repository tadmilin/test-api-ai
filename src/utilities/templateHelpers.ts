/**
 * Template Helper Utilities
 * Sharp-based image processing for template generation
 */

import sharp from 'sharp'

export interface ImagePosition {
  x: number
  y: number
  width: number
  height: number
}

export interface DownloadOptions {
  timeoutMs?: number
  maxBytes?: number
}

export interface CompositeOptions {
  format?: 'png' | 'jpeg'
  quality?: number
}

/**
 * Download image from URL with timeout and size limits
 * Includes basic SSRF protection and Google Drive URL normalization
 */
export async function downloadImageFromUrl(
  url: string,
  options: DownloadOptions = {}
): Promise<Buffer> {
  const { timeoutMs = 15000, maxBytes = 10 * 1024 * 1024 } = options // 15s, 10MB

  try {
    // Normalize Google Drive URLs to direct download format
    let downloadUrl = url
    if (url.includes('drive.google.com')) {
      // Extract file ID from various Google Drive URL formats
      let fileId: string | null = null
      
      // Format 1: /uc?export=view&id=XXX or /uc?id=XXX
      const ucMatch = url.match(/[?&]id=([^&]+)/)
      if (ucMatch) {
        fileId = ucMatch[1]
      }
      
      // Format 2: /file/d/XXX/view
      const fileMatch = url.match(/\/file\/d\/([^/]+)/)
      if (fileMatch) {
        fileId = fileMatch[1]
      }
      
      // Format 3: /open?id=XXX
      const openMatch = url.match(/\/open\?id=([^&]+)/)
      if (openMatch) {
        fileId = openMatch[1]
      }
      
      if (fileId) {
        // Use direct download URL format
        downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`
        console.log(`  🔄 Normalized Google Drive URL: ${downloadUrl}`)
      }
    }

    // Basic URL validation
    const parsedUrl = new URL(downloadUrl)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only http/https URLs are allowed')
    }

    // Setup timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(downloadUrl, { 
        signal: controller.signal,
        redirect: 'follow', // Follow redirects (important for Google Drive)
      })
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`)
      }

      // Check content-length header
      const contentLength = response.headers.get('content-length')
      if (contentLength && Number(contentLength) > maxBytes) {
        throw new Error(`Image too large: ${contentLength} bytes (max ${maxBytes})`)
      }

      const arrayBuffer = await response.arrayBuffer()
      
      // Double-check actual size
      if (arrayBuffer.byteLength > maxBytes) {
        throw new Error(`Image too large: ${arrayBuffer.byteLength} bytes (max ${maxBytes})`)
      }

      return Buffer.from(arrayBuffer)
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Download timeout after ${timeoutMs}ms`)
    }
    console.error('Error downloading image:', error)
    throw error
  }
}

/**
 * Resize and crop image to fit exact position
 */
export async function resizeImageToFit(
  imageBuffer: Buffer,
  position: ImagePosition
): Promise<Buffer> {
  try {
    return await sharp(imageBuffer)
      .resize(position.width, position.height, {
        fit: 'cover', // Crop to fill exact size
        position: 'center', // Crop from center
      })
      .toBuffer()
  } catch (error) {
    console.error('Error resizing image:', error)
    throw error
  }
}

/**
 * Composite multiple images onto a base template
 * Includes position clamping and format options
 */
export async function compositeImages(
  templateBuffer: Buffer,
  images: { buffer: Buffer; position: ImagePosition }[],
  options: CompositeOptions = {}
): Promise<Buffer> {
  const { format = 'png', quality = 90 } = options

  try {
    // Normalize and clamp positions (ensure integers >= 0)
    const compositeInputs = images.map(({ buffer, position }) => ({
      input: buffer,
      left: Math.max(0, Math.round(position.x)),
      top: Math.max(0, Math.round(position.y)),
    }))

    const sharpInstance = sharp(templateBuffer).composite(compositeInputs)

    // Output in correct format
    if (format === 'jpeg') {
      return await sharpInstance.jpeg({ quality }).toBuffer()
    }
    
    // PNG (preserves transparency, better for templates with overlays)
    return await sharpInstance.png({ compressionLevel: 6 }).toBuffer()
  } catch (error) {
    console.error('Error compositing images:', error)
    throw error
  }
}

/**
 * Download and resize image in one step
 */
export async function downloadAndResize(
  url: string,
  position: ImagePosition,
  downloadOptions?: DownloadOptions
): Promise<Buffer> {
  const imageBuffer = await downloadImageFromUrl(url, downloadOptions)
  return await resizeImageToFit(imageBuffer, position)
}

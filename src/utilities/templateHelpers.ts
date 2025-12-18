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

/**
 * Download image from URL and return as Buffer
 */
export async function downloadImageFromUrl(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
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
 */
export async function compositeImages(
  templateBuffer: Buffer,
  images: { buffer: Buffer; position: ImagePosition }[]
): Promise<Buffer> {
  try {
    const compositeInputs = images.map(({ buffer, position }) => ({
      input: buffer,
      top: position.y,
      left: position.x,
    }))

    return await sharp(templateBuffer)
      .composite(compositeInputs)
      .jpeg({ quality: 90 })
      .toBuffer()
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
  position: ImagePosition
): Promise<Buffer> {
  const imageBuffer = await downloadImageFromUrl(url)
  return await resizeImageToFit(imageBuffer, position)
}

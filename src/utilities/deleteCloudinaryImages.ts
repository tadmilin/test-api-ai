import { v2 as cloudinary } from 'cloudinary'

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * Extract public ID from Cloudinary URL
 * @param url - Cloudinary URL (e.g., https://res.cloudinary.com/xxx/image/upload/v123/folder/filename.jpg)
 * @returns Public ID (e.g., folder/filename)
 */
function extractPublicId(url: string): string | null {
  try {
    if (!url || !url.includes('cloudinary.com')) return null
    
    // Match pattern: /upload/v{version}/{folder}/{filename}.{ext}
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/)
    if (match && match[1]) {
      return match[1]
    }
    
    return null
  } catch (error) {
    console.error('❌ Failed to extract public ID from URL:', url, error)
    return null
  }
}

/**
 * Delete single image from Cloudinary
 * @param imageUrl - Cloudinary URL
 * @returns Success status
 */
export async function deleteCloudinaryImage(imageUrl: string | null | undefined): Promise<boolean> {
  try {
    if (!imageUrl) return false
    
    const publicId = extractPublicId(imageUrl)
    if (!publicId) {
      console.warn('⚠️ Could not extract public ID from URL:', imageUrl)
      return false
    }
    
    const result = await cloudinary.uploader.destroy(publicId)
    
    if (result.result === 'ok') {
      console.log('✅ Deleted from Cloudinary:', publicId)
      return true
    } else if (result.result === 'not found') {
      console.warn('⚠️ Image not found in Cloudinary:', publicId)
      return true // Consider as success (already deleted)
    } else {
      console.error('❌ Failed to delete from Cloudinary:', publicId, result)
      return false
    }
  } catch (error: any) {
    console.error('❌ Cloudinary delete error:', error.message)
    return false
  }
}

/**
 * Delete multiple images from Cloudinary
 * @param imageUrls - Array of Cloudinary URLs
 * @returns Number of successfully deleted images
 */
export async function deleteCloudinaryImages(imageUrls: (string | null | undefined)[]): Promise<number> {
  let deleted = 0
  
  for (const url of imageUrls) {
    if (url) {
      const success = await deleteCloudinaryImage(url)
      if (success) deleted++
    }
  }
  
  return deleted
}

/**
 * Delete images from a job's enhancedImageUrls array
 * @param enhancedImageUrls - Job's image array
 * @returns Number of successfully deleted images
 */
export async function deleteJobImages(
  enhancedImageUrls: Array<{
    imageUrl?: string | null
    templateUrl?: string | null
    [key: string]: any
  }>
): Promise<number> {
  const urls: (string | null | undefined)[] = []
  
  // Collect all URLs
  for (const img of enhancedImageUrls || []) {
    if (img.imageUrl) urls.push(img.imageUrl)
    if (img.templateUrl) urls.push(img.templateUrl)
  }
  
  // Delete all
  const deleted = await deleteCloudinaryImages(urls)
  console.log(`✅ Deleted ${deleted}/${urls.length} images from Cloudinary`)
  
  return deleted
}

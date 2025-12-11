/**
 * Utility functions for handling Google Drive URLs
 */

/**
 * Extracts file ID from various Google Drive URL formats
 */
export function extractGoogleDriveFileId(url: string): string | null {
  if (!url) return null

  // Already a file ID (no slashes or special chars)
  if (!url.includes('/') && !url.includes('http')) {
    return url
  }

  // Format: https://drive.google.com/file/d/{FILE_ID}/view
  const fileMatch = url.match(/\/file\/d\/([^/]+)/)
  if (fileMatch) return fileMatch[1]

  // Format: https://drive.google.com/uc?id={FILE_ID}
  const ucMatch = url.match(/[?&]id=([^&]+)/)
  if (ucMatch) return ucMatch[1]

  // Format: https://drive.google.com/open?id={FILE_ID}
  const openMatch = url.match(/open\?id=([^&]+)/)
  if (openMatch) return openMatch[1]

  // Format: https://lh3.googleusercontent.com/d/{FILE_ID}
  const lhMatch = url.match(/googleusercontent\.com\/d\/([^?=]+)/)
  if (lhMatch) return lhMatch[1]

  return null
}

/**
 * Converts any Google Drive URL to a direct image URL
 * Uses lh3.googleusercontent.com format which works better with Next.js Image
 */
export function getGoogleDriveImageUrl(url: string, size?: 'thumbnail' | 'full'): string {
  if (!url) return ''

  const fileId = extractGoogleDriveFileId(url)
  if (!fileId) {
    console.warn('Could not extract file ID from URL:', url)
    return url // Return original if we can't parse it
  }

  // Use Google'susercontent domain which works better
  if (size === 'thumbnail') {
    return `https://lh3.googleusercontent.com/d/${fileId}=w400`
  }
  
  // Full size image
  return `https://lh3.googleusercontent.com/d/${fileId}`
}

/**
 * Gets a thumbnail URL from a Google Drive image URL
 */
export function getGoogleDriveThumbnail(url: string): string {
  return getGoogleDriveImageUrl(url, 'thumbnail')
}

/**
 * Validates if a URL is a Google Drive URL
 */
export function isGoogleDriveUrl(url: string): boolean {
  if (!url) return false
  return (
    url.includes('drive.google.com') ||
    url.includes('googleusercontent.com') ||
    url.includes('googleapis.com')
  )
}

/**
 * Ensures proper Google Drive URL format for images
 * Falls back to original URL if not a Drive URL
 */
export function normalizeImageUrl(url: string): string {
  if (!url) return ''
  
  if (isGoogleDriveUrl(url)) {
    return getGoogleDriveImageUrl(url, 'full')
  }
  
  return url
}

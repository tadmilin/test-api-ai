import { put } from '@vercel/blob'
import { google } from 'googleapis'

/**
 * Ensures an image URL is publicly accessible (Vercel Blob).
 * If it's a Google Drive URL, it downloads, resizes (if needed), and uploads to Blob.
 * If it's already public, it returns the original URL.
 */
export async function ensurePublicImage(imageUrl: string, jobId: string, baseUrl?: string): Promise<string> {
  // 1. Check if already public (not Google Drive, not Localhost, not Relative)
  const isGoogleDrive = imageUrl.includes('drive.google.com')
  const isLocalhost = imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1')
  const isRelative = imageUrl.startsWith('/')

  if (!isGoogleDrive && !isLocalhost && !isRelative) {
    return imageUrl
  }

  console.log(`🔄 Converting private/local image to Public Blob: ${imageUrl.substring(0, 50)}...`)

  try {
    let imageBuffer: Buffer

    if (isGoogleDrive) {
      // Extract file ID
      let fileId = null
      if (imageUrl.includes('id=')) {
        const match = imageUrl.match(/[?&]id=([^&]+)/)
        fileId = match ? match[1] : null
      } else if (imageUrl.includes('/file/d/')) {
        const match = imageUrl.match(/\/file\/d\/([^/]+)/)
        fileId = match ? match[1] : null
      }

      if (!fileId) throw new Error('Invalid Google Drive URL')

      // Setup Drive API
      const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
      const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

      if (!serviceAccountEmail || !privateKey) {
        throw new Error('Google Service Account not configured')
      }

      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: serviceAccountEmail,
          private_key: privateKey.replace(/\\n/gm, '\n').replace(/^"|"$/g, ''),
        },
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      })

      const drive = google.drive({ version: 'v3', auth })
      const response = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' }
      )
      imageBuffer = Buffer.from(response.data as ArrayBuffer)
    } else {
      // Localhost or Relative URL
      let fetchUrl = imageUrl
      
      // If relative URL, prepend base URL
      if (imageUrl.startsWith('/')) {
        const targetBaseUrl = baseUrl || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
        // Remove trailing slash from base and leading slash from url to avoid double slashes
        const cleanBase = targetBaseUrl.replace(/\/$/, '')
        const cleanPath = imageUrl.replace(/^\//, '')
        fetchUrl = `${cleanBase}/${cleanPath}`
      }
      
      console.log(`📥 Fetching local image: ${fetchUrl}`)
      const response = await fetch(fetchUrl)
      if (!response.ok) throw new Error(`Failed to fetch local image: ${response.statusText}`)
      const arrayBuffer = await response.arrayBuffer()
      imageBuffer = Buffer.from(arrayBuffer)
    }

    // Resize logic (using sharp) - Optimize for AI (max 1M pixels)
    const sharp = (await import('sharp')).default
    const metadata = await sharp(imageBuffer).metadata()
    
    const maxPixels = 1000000 // 1M pixels
    const currentPixels = (metadata.width || 0) * (metadata.height || 0)
    
    let processedBuffer = imageBuffer
    if (currentPixels > maxPixels) {
      const scale = Math.sqrt(maxPixels / currentPixels)
      const newWidth = Math.floor((metadata.width || 0) * scale)
      const newHeight = Math.floor((metadata.height || 0) * scale)
      
      processedBuffer = await sharp(imageBuffer)
        .resize(newWidth, newHeight, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer()
    }

    // Upload to Blob
    const timestamp = Date.now()
    const blob = await put(`jobs/${jobId}/optimized-${timestamp}.png`, processedBuffer, {
      access: 'public',
      contentType: 'image/png',
    })

    console.log(`✅ Converted to Public Blob: ${blob.url}`)
    return blob.url

  } catch (error) {
    console.error('❌ Error converting image to public:', error)
    // Fallback to original URL if failed (let downstream handle it)
    return imageUrl
  }
}

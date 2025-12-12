import { google } from 'googleapis'

/**
 * Download a file from Google Drive using service account
 * @param fileId - Google Drive file ID
 * @returns Buffer containing the file data
 */
export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  // ✅ ใช้ชื่อเดียวกับโค้ดเดิม (ตรงกับ Vercel env)
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Google Service Account credentials not configured')
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: serviceAccountEmail,
      private_key: privateKey.replace(/\\n/gm, '\n').replace(/^"|"$/g, ''),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })

  const drive = google.drive({ version: 'v3', auth })

  // Download image from Google Drive
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  )

  return Buffer.from(response.data as ArrayBuffer)
}

/**
 * Extract file ID from various Google Drive URL formats
 * @param url - Google Drive URL
 * @returns File ID or null if not a valid Drive URL
 */
export function extractDriveFileId(url: string): string | null {
  if (!url.includes('drive.google.com') && !url.includes('googleusercontent.com')) {
    return null
  }

  // Format: https://drive.google.com/file/d/FILE_ID/view
  const match1 = url.match(/\/file\/d\/([^\/]+)/)
  if (match1) return match1[1]

  // Format: https://drive.google.com/open?id=FILE_ID
  const match2 = url.match(/[?&]id=([^&]+)/)
  if (match2) return match2[1]

  // Format: https://drive.google.com/uc?id=FILE_ID
  const match3 = url.match(/\/uc\?id=([^&]+)/)
  if (match3) return match3[1]

  // Already a file ID
  if (url.match(/^[a-zA-Z0-9_-]{20,}$/)) {
    return url
  }

  return null
}

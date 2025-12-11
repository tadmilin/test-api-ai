import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getGoogleDriveThumbnail, getGoogleDriveImageUrl } from '@/utilities/googleDriveUrl'

export async function GET() {
  try {
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

    if (!serviceAccountEmail || !privateKey) {
      return NextResponse.json(
        { error: 'Google Service Account credentials not configured' },
        { status: 500 }
      )
    }

    // Create auth client
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: serviceAccountEmail,
        private_key: privateKey.replace(/\\n/gm, '\n').replace(/^"|"$/g, ''),
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    })

    const drive = google.drive({ version: 'v3', auth })

    // List all images accessible by Service Account
    const response = await drive.files.list({
      q: "mimeType contains 'image/' and trashed=false",
      fields: 'files(id, name, mimeType, thumbnailLink, webContentLink, webViewLink)',
      pageSize: 100,
      orderBy: 'modifiedTime desc',
    })

    const files = response.data.files || []

    const images = files.map(file => {
      const fileId = file.id || ''
      
      return {
        id: fileId,
        name: file.name || '',
        mimeType: file.mimeType || '',
        thumbnailUrl: getGoogleDriveThumbnail(`https://drive.google.com/file/d/${fileId}/view`),
        url: getGoogleDriveImageUrl(`https://drive.google.com/file/d/${fileId}/view`, 'full'),
      }
    })

    return NextResponse.json({ images })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list images'
    console.error('Error listing images:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

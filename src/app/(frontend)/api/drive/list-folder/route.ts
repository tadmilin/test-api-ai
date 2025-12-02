import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function POST(request: NextRequest) {
  try {
    const { folderId } = await request.json()

    if (!folderId) {
      return NextResponse.json(
        { error: 'folderId is required' },
        { status: 400 }
      )
    }

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

    // List images in folder
    const response = await drive.files.list({
      q: `'${folderId}' in parents and (mimeType contains 'image/')`,
      fields: 'files(id, name, mimeType, thumbnailLink, webContentLink, webViewLink)',
      pageSize: 100,
    })

    const files = response.data.files || []

    const images = files.map(file => {
      // Use Drive thumbnail API or convert to direct link
      const fileId = file.id || ''
      const thumbnailUrl = file.thumbnailLink 
        ? file.thumbnailLink.replace('=s220', '=s400') // Larger thumbnail
        : `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`
      
      return {
        id: fileId,
        name: file.name || '',
        mimeType: file.mimeType || '',
        thumbnailUrl: thumbnailUrl,
        url: `https://drive.google.com/uc?export=view&id=${fileId}`,
      }
    })

    return NextResponse.json({ images })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list folder images'
    console.error('Error listing folder images:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

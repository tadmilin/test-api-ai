import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function POST(request: NextRequest) {
  try {
    const { fileIds } = await request.json()

    if (!fileIds || !Array.isArray(fileIds)) {
      return NextResponse.json(
        { error: 'fileIds array is required' },
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

    // Fetch metadata for each file
    const images = await Promise.all(
      fileIds.map(async (fileId: string) => {
        try {
          const response = await drive.files.get({
            fileId: fileId,
            fields: 'id,name,mimeType,thumbnailLink,webContentLink',
          })

          const data = response.data

          return {
            id: data.id,
            name: data.name,
            mimeType: data.mimeType,
            thumbnailUrl: data.thumbnailLink,
            url: data.webContentLink,
          }
        } catch (error) {
          console.error(`Error fetching file ${fileId}:`, error)
          return null
        }
      })
    )

    // Filter out failed requests
    const validImages = images.filter((img) => img !== null)

    return NextResponse.json({ images: validImages })
  } catch (error) {
    console.error('Error getting images:', error)
    return NextResponse.json(
      { error: 'Failed to get images' },
      { status: 500 }
    )
  }
}

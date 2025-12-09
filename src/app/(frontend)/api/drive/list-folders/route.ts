import { NextResponse } from 'next/server'
import { google } from 'googleapis'

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

    // List all folders that are shared with the service account
    // You can also add 'sharedWithMe' or specific parent folder conditions
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name, parents)',
      pageSize: 100,
      orderBy: 'name',
    })

    const files = response.data.files || []

    const folders = files.map(file => ({
      id: file.id || '',
      name: file.name || '',
    }))

    return NextResponse.json({ folders })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list folders'
    console.error('Error listing folders:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

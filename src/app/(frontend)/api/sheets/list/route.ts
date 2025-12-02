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
        private_key: privateKey.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    })

    const drive = google.drive({ version: 'v3', auth })

    // List spreadsheets from Google Drive
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      fields: 'files(id, name, webViewLink)',
      pageSize: 100,
    })

    const files = response.data.files || []

    const spreadsheets = files.map(file => ({
      id: file.id || '',
      name: file.name || '',
      url: file.webViewLink || '',
    }))

    return NextResponse.json({ spreadsheets })
  } catch (error) {
    console.error('Error listing sheets:', error)
    return NextResponse.json(
      { error: 'Failed to list spreadsheets' },
      { status: 500 }
    )
  }
}

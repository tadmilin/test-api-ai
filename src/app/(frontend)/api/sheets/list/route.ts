import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Google Sheets API key not configured' },
        { status: 500 }
      )
    }

    // TODO: Implement Google Sheets listing
    // This is a placeholder - you'll need to implement actual Google Drive API integration
    // to list spreadsheets accessible by the service account or OAuth token

    return NextResponse.json({
      spreadsheets: [
        {
          id: 'example-sheet-id',
          name: 'Example Product Sheet',
          url: 'https://docs.google.com/spreadsheets/d/example-sheet-id',
        },
      ],
    })
  } catch (error) {
    console.error('Error listing sheets:', error)
    return NextResponse.json(
      { error: 'Failed to list spreadsheets' },
      { status: 500 }
    )
  }
}

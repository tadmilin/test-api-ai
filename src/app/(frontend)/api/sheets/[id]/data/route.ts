import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Google Sheets API key not configured' },
        { status: 500 }
      )
    }

    const sheets = google.sheets({ version: 'v4', auth: apiKey })

    // Get sheet data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: 'Sheet1!A1:Z1000', // Adjust range as needed
    })

    const rows = response.data.values || []

    if (rows.length === 0) {
      return NextResponse.json({ data: [] })
    }

    // Convert rows to objects (assuming first row is headers)
    const headers = rows[0]
    const data = rows.slice(1).map((row) => {
      const obj: Record<string, string> = {}
      headers.forEach((header, index) => {
        obj[header] = row[index] || ''
      })
      return obj
    })

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching sheet data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sheet data' },
      { status: 500 }
    )
  }
}

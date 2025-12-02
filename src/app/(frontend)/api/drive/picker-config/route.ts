import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const apiKey = process.env.GOOGLE_DRIVE_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Google Drive API key not configured' },
        { status: 500 }
      )
    }

    // Return config for Google Drive Picker
    return NextResponse.json({
      apiKey,
      clientId: process.env.GOOGLE_CLIENT_ID,
      appId: process.env.GOOGLE_APP_ID,
    })
  } catch (error) {
    console.error('Error getting Drive picker config:', error)
    return NextResponse.json(
      { error: 'Failed to get Drive picker config' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { fileIds } = await request.json()

    if (!fileIds || !Array.isArray(fileIds)) {
      return NextResponse.json(
        { error: 'fileIds array is required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.GOOGLE_DRIVE_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Google Drive API key not configured' },
        { status: 500 }
      )
    }

    // Fetch metadata for each file
    const images = await Promise.all(
      fileIds.map(async (fileId: string) => {
        try {
          const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,thumbnailLink,webContentLink&key=${apiKey}`
          )

          if (!response.ok) {
            throw new Error(`Failed to fetch file ${fileId}`)
          }

          const data = await response.json()

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

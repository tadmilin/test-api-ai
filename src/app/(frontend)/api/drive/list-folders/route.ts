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
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name, parents)',
      pageSize: 1000, // Increased to get all folders
      orderBy: 'name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    const files = response.data.files || []

    // Build folder hierarchy with paths and image counts
    const folderMap = new Map<string, { id: string; name: string; parents?: string[]; path: string; imageCount: number }>()
    
    // First pass: create map of all folders
    files.forEach(file => {
      if (file.id && file.name) {
        folderMap.set(file.id, {
          id: file.id,
          name: file.name,
          parents: file.parents || undefined,
          path: file.name,
          imageCount: 0,
        })
      }
    })

    // Second pass: build paths by traversing parent hierarchy
    const buildPath = (folderId: string, visited = new Set<string>()): string => {
      if (visited.has(folderId)) return '' // Prevent circular reference
      visited.add(folderId)
      
      const folder = folderMap.get(folderId)
      if (!folder) return ''
      
      const parentId = folder.parents?.[0]
      if (parentId && folderMap.has(parentId)) {
        const parentPath = buildPath(parentId, visited)
        return parentPath ? `${parentPath} > ${folder.name}` : folder.name
      }
      
      return folder.name
    }

    // Update paths for all folders
    folderMap.forEach((folder, id) => {
      folder.path = buildPath(id)
    })

    // Third pass: count images in each folder
    for (const [folderId, folder] of folderMap.entries()) {
      try {
        const imagesResponse = await drive.files.list({
          q: `'${folderId}' in parents and (mimeType contains 'image/' or mimeType='image/jpeg' or mimeType='image/png' or mimeType='image/webp') and trashed=false`,
          fields: 'files(id)',
          pageSize: 1000,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        })
        folder.imageCount = imagesResponse.data.files?.length || 0
      } catch (error) {
        console.error(`Error counting images in folder ${folderId}:`, error)
        folder.imageCount = 0
      }
    }

    // Filter folders with images and sort by path
    const foldersWithImages = Array.from(folderMap.values())
      .filter(f => f.imageCount > 0)
      .sort((a, b) => a.path.localeCompare(b.path))

    const folders = foldersWithImages.map(f => ({
      id: f.id,
      name: f.name,
      path: f.path,
      imageCount: f.imageCount,
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

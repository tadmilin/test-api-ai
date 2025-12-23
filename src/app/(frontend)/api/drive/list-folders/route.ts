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

    // Step 1: List all Shared Drives
    const drivesResponse = await drive.drives.list({
      pageSize: 100,
      fields: 'drives(id, name)',
    })

    const sharedDrives = drivesResponse.data.drives || []
    console.log(`Found ${sharedDrives.length} Shared Drives`)

    // Step 2: Get folders from My Drive (shared with service account)
    const myDriveResponse = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name, parents, driveId)',
      pageSize: 1000,
      orderBy: 'name',
    })

    const myDriveFolders = myDriveResponse.data.files || []
    console.log(`Found ${myDriveFolders.length} folders accessible to Service Account`)

    // Step 3: Get folders from each Shared Drive
    const allDriveData: Array<{ driveId: string; driveName: string; folders: Array<{ id: string; name: string; parents?: string[]; path: string; imageCount: number; children: unknown[]; level: number }> }> = []

    // Add My Drive
    if (myDriveFolders.length > 0) {
      allDriveData.push({
        driveId: 'my-drive',
        driveName: 'My Drive',
        folders: myDriveFolders,
      })
    }

    // Add Shared Drives
    for (const sharedDrive of sharedDrives) {
      if (!sharedDrive.id) continue

      try {
        const sharedDriveFolders = await drive.files.list({
          q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
          driveId: sharedDrive.id,
          corpora: 'drive',
          fields: 'files(id, name, parents, driveId)',
          pageSize: 1000,
          orderBy: 'name',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        })

        const folders = sharedDriveFolders.data.files || []
        console.log(`Found ${folders.length} folders in Shared Drive: ${sharedDrive.name}`)

        if (folders.length > 0) {
          allDriveData.push({
            driveId: sharedDrive.id,
            driveName: sharedDrive.name || 'Unnamed Drive',
            folders,
          })
        }
      } catch (error) {
        console.error(`Error listing folders in Shared Drive ${sharedDrive.name}:`, error)
      }
    }

    // Step 4: Process each drive's folders into tree structure
    const drivesWithFolders = []

    for (const driveData of allDriveData) {
      const { driveId, driveName, folders: files } = driveData

      // Build folder hierarchy with paths and image counts
      const folderMap = new Map<string, { 
        id: string
        name: string
        parents?: string[]
        path: string
        imageCount: number
        children: Array<{ id: string; name: string; parents?: string[]; path: string; imageCount: number; children: unknown[]; level: number }>
        level: number
      }>()
      
      // First pass: create map of all folders
      files.forEach(file => {
        if (file.id && file.name) {
          folderMap.set(file.id, {
            id: file.id,
            name: file.name,
            parents: file.parents || undefined,
            path: file.name,
            imageCount: 0,
            children: [],
            level: 0,
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
            ...(driveId !== 'my-drive' && { driveId, corpora: 'drive' }),
          })
          folder.imageCount = imagesResponse.data.files?.length || 0
        } catch (error) {
          console.error(`Error counting images in folder ${folderId}:`, error)
          folder.imageCount = 0
        }
      }

      // Fourth pass: build parent-child relationships
      const rootFolders: Array<{ id: string; name: string; parents?: string[]; path: string; imageCount: number; children: unknown[]; level: number }> = []
      const folderWithChildrenMap = new Map(Array.from(folderMap.entries()))

      folderWithChildrenMap.forEach((folder) => {
        const parentId = folder.parents?.[0]
        if (parentId && folderWithChildrenMap.has(parentId)) {
          // Add to parent's children
          const parent = folderWithChildrenMap.get(parentId)
          parent!.children.push(folder)
          folder.level = (parent!.level || 0) + 1
        } else {
          // No parent or parent not in our list = root folder
          rootFolders.push(folder)
          folder.level = 0
        }
      })

      // Recursive function to sort children
      const sortChildren = (folder: { children: Array<{ name: string; children: unknown[] }> }) => {
        folder.children.sort((a, b) => a.name.localeCompare(b.name))
        folder.children.forEach((child) => sortChildren(child))
      }

      // Sort root folders and their children
      rootFolders.sort((a, b) => a.name.localeCompare(b.name))
      rootFolders.forEach(sortChildren)

      const folders = rootFolders.map(f => ({
        id: f.id,
        name: f.name,
        path: f.path,
        imageCount: f.imageCount,
        children: f.children,
        level: f.level,
      }))

      if (folders.length > 0) {
        drivesWithFolders.push({
          driveId,
          driveName,
          folders,
        })
      }
    }

    console.log(`Total drives with folders: ${drivesWithFolders.length}`)
    
    // If no folders found, return helpful message
    if (drivesWithFolders.length === 0) {
      console.log('⚠️ No folders found. Service Account may not have access to any drives.')
      console.log(`Service Account: ${serviceAccountEmail}`)
      console.log('Please share drives/folders with this email.')
    }

    return NextResponse.json({ drives: drivesWithFolders })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list folders'
    console.error('Error listing folders:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

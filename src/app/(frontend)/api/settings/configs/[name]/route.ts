import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

type ConfigName = 'google_sheets' | 'google_drive' | 'claude' | 'dalle'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params
  try {
    const payload = await getPayload({ config })

    const result = await payload.find({
      collection: 'api-configs',
      where: {
        name: {
          equals: name as ConfigName,
        },
      },
      limit: 1,
    })

    if (result.docs.length === 0) {
      return NextResponse.json(
        { error: 'Config not found' },
        { status: 404 }
      )
    }

    const doc = result.docs[0]
    return NextResponse.json({
      id: doc.id,
      name: doc.name,
      endpoint: doc.endpoint,
      isActive: doc.isActive,
      hasApiKey: !!doc.apiKey,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch config'
    console.error('Error fetching config:', error)
    return NextResponse.json({
      error: errorMessage,
    }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params
    const body = await request.json()
    const { apiKey, endpoint, isActive } = body

    // Validate name is one of the allowed values
    const validNames: ConfigName[] = ['google_sheets', 'google_drive', 'claude', 'dalle']
    if (!validNames.includes(name as ConfigName)) {
      return NextResponse.json(
        { error: `Invalid config name. Must be one of: ${validNames.join(', ')}` },
        { status: 400 }
      )
    }

    const configName = name as ConfigName

    const payload = await getPayload({ config })

    // Find existing config by name
    const existing = await payload.find({
      collection: 'api-configs',
      where: {
        name: {
          equals: configName,
        },
      },
      limit: 1,
    })

    const updateData: { apiKey?: string; endpoint?: string; isActive?: boolean; name?: ConfigName } = {}
    if (apiKey !== undefined) updateData.apiKey = apiKey
    if (endpoint !== undefined) updateData.endpoint = endpoint
    if (isActive !== undefined) updateData.isActive = isActive

    let result

    if (existing.docs.length > 0) {
      // Update existing config
      result = await payload.update({
        collection: 'api-configs',
        id: existing.docs[0].id,
        data: updateData,
      })
    } else {
      // Create new config - name is required for creation
      if (!configName) {
        return NextResponse.json(
          { error: 'Config name is required for creation' },
          { status: 400 }
        )
      }
      
      result = await payload.create({
        collection: 'api-configs',
        data: {
          name: configName,
          apiKey: apiKey || '',
          endpoint: endpoint,
          isActive: isActive !== undefined ? isActive : true,
        },
      })
    }

    return NextResponse.json({
      success: true,
      config: {
        id: result.id,
        name: result.name,
        endpoint: result.endpoint,
        isActive: result.isActive,
        hasApiKey: !!result.apiKey,
      },
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update config'
    console.error('Error updating config:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

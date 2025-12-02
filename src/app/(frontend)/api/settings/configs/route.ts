import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

export async function GET() {
  try {
    const payload = await getPayload({ config })

    // Get all API configs
    const configs = await payload.find({
      collection: 'api-configs',
      limit: 100,
    })

    // Don't expose API keys in response
    const sanitizedConfigs = configs.docs.map(config => ({
      id: config.id,
      name: config.name,
      endpoint: config.endpoint,
      isActive: config.isActive,
      lastUsed: config.lastUsed,
      hasApiKey: !!config.apiKey,
    }))

    return NextResponse.json({ configs: sanitizedConfigs })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch configs'
    console.error('Error fetching configs:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

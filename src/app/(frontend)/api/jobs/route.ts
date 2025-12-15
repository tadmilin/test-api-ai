import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    const payload = await getPayload({ config })
    
    // Get current user
    const cookieStore = await cookies()
    const token = cookieStore.get('payload-token')
    
    let currentUser = null
    if (token) {
      try {
        const headers = new Headers()
        headers.set('Authorization', `JWT ${token.value}`)
        const authResult = await payload.auth({ headers })
        currentUser = authResult.user
      } catch (error) {
        console.error('Auth error:', error)
      }
    }

    // Build where clause with proper typing
    const where: Record<string, { equals: string }> = {}
    if (status) {
      where.status = { equals: status }
    }
    
    // If not admin, filter by current user
    if (currentUser && currentUser.role !== 'admin') {
      where.createdBy = { equals: currentUser.id }
    }

    // Get jobs with filters
    const jobs = await payload.find({
      collection: 'jobs',
      where: Object.keys(where).length > 0 ? where : undefined,
      page,
      limit,
      sort: '-createdAt',
    })

    return NextResponse.json({
      jobs: jobs.docs,
      totalDocs: jobs.totalDocs,
      totalPages: jobs.totalPages,
      page: jobs.page,
      limit: jobs.limit,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch jobs'
    console.error('Error fetching jobs:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      productName,
      productDescription,
      contentTopic,
      postTitleHeadline,
      contentDescription,
      photoTypeFromSheet,
      targetPlatforms,
      referenceImageUrls,
      customPrompt,
      status = 'pending',
    } = body

    console.log('📥 Received photoType:', photoTypeFromSheet)
    if (customPrompt) {
      console.log('📝 Received custom prompt:', customPrompt.substring(0, 50) + '...')
    }

    if (!productName) {
      return NextResponse.json(
        { error: 'productName is required' },
        { status: 400 }
      )
    }

    const payload = await getPayload({ config })
    
    // Get current user
    const cookieStore = await cookies()
    const token = cookieStore.get('payload-token')
    
    let currentUser = null
    if (token) {
      try {
        const headers = new Headers()
        headers.set('Authorization', `JWT ${token.value}`)
        const authResult = await payload.auth({ headers })
        currentUser = authResult.user
      } catch (error) {
        console.error('Auth error:', error)
      }
    }

    // Create new job with all fields
    const job = await payload.create({
      collection: 'jobs',
      draft: false,
      data: {
        productName,
        productDescription: productDescription || '',
        contentTopic: contentTopic || undefined,
        postTitleHeadline: postTitleHeadline || undefined,
        contentDescription: contentDescription || undefined,
        photoTypeFromSheet: photoTypeFromSheet || undefined,
        customPrompt: customPrompt || undefined,
        targetPlatforms: targetPlatforms || ['facebook', 'instagram_feed'],
        referenceImageUrls: referenceImageUrls || [],
        status,
        createdBy: currentUser?.id || undefined,
      } as any,  // Type assertion until types are regenerated
    })

    return NextResponse.json({
      success: true,
      doc: job, // Wrap in doc for consistency with Payload response format
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create job'
    console.error('Error creating job:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

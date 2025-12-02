import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    const payload = await getPayload({ config })

    // Build where clause
    const where: Record<string, { equals: string }> = {}
    if (status) {
      where.status = { equals: status }
    }

    // Get jobs with filters
    const jobs = await payload.find({
      collection: 'jobs',
      where,
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
      mood,
      targetPlatforms,
      referenceImageIds,
      referenceImageUrls,
      status = 'pending',
    } = body

    if (!productName) {
      return NextResponse.json(
        { error: 'productName is required' },
        { status: 400 }
      )
    }

    const payload = await getPayload({ config })

    // Create new job
    const job = await payload.create({
      collection: 'jobs',
      data: {
        productName,
        productDescription: productDescription || '',
        mood: mood || '',
        targetPlatforms: targetPlatforms || ['facebook', 'instagram_feed'],
        referenceImageIds: referenceImageIds || [],
        referenceImageUrls: referenceImageUrls || [],
        status,
        createdBy: 'current-user-id', // TODO: Get from auth session
      },
    })

    return NextResponse.json(job)
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create job'
    console.error('Error creating job:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

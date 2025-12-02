import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const payload = await getPayload({ config })

    // Get logs for this job
    const logs = await payload.find({
      collection: 'job-logs',
      where: {
        jobId: {
          equals: id,
        },
      },
      sort: '-createdAt',
      limit: 100,
    })

    return NextResponse.json({ logs: logs.docs })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch logs'
    console.error('Error fetching logs:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}


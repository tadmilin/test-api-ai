import { NextResponse } from 'next/server'

/**
 * Debug endpoint to check environment variables
 * REMOVE THIS IN PRODUCTION!
 */
export async function GET() {
  const hasSecret = !!process.env.REPLICATE_WEBHOOK_SECRET
  const secretPrefix = process.env.REPLICATE_WEBHOOK_SECRET?.substring(0, 10)
  const secretLength = process.env.REPLICATE_WEBHOOK_SECRET?.length
  
  return NextResponse.json({
    hasSecret,
    secretPrefix: hasSecret ? secretPrefix + '...' : null,
    secretLength,
    allEnvKeys: Object.keys(process.env).filter(key => 
      key.includes('REPLICATE') || key.includes('WEBHOOK')
    ),
  })
}

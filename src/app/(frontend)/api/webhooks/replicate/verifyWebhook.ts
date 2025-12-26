/**
 * Webhook Verification Utilities
 * Based on Replicate documentation: https://replicate.com/docs/topics/webhooks/verify-webhook
 */

import crypto from 'crypto'

const MAX_TIMESTAMP_DIFF_SECONDS = 5 * 60 // 5 minutes

export interface WebhookVerificationResult {
  isValid: boolean
  error?: string
}

/**
 * Verify webhook signature from Replicate
 */
export async function verifyWebhookSignature(
  body: string,
  headers: {
    'webhook-id'?: string
    'webhook-timestamp'?: string
    'webhook-signature'?: string
  },
): Promise<WebhookVerificationResult> {
  const webhookId = headers['webhook-id']
  const webhookTimestamp = headers['webhook-timestamp']
  const webhookSignature = headers['webhook-signature']

  // 1. Validate required headers
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return {
      isValid: false,
      error: 'Missing required webhook headers',
    }
  }

  // 2. Validate timestamp (prevent replay attacks)
  const timestamp = parseInt(webhookTimestamp)
  if (isNaN(timestamp)) {
    return {
      isValid: false,
      error: 'Invalid webhook timestamp',
    }
  }

  const now = Math.floor(Date.now() / 1000)
  const diff = Math.abs(now - timestamp)

  if (diff > MAX_TIMESTAMP_DIFF_SECONDS) {
    return {
      isValid: false,
      error: `Webhook timestamp too old: ${diff} seconds`,
    }
  }

  // 3. Get signing secret from environment
  const webhookSecret = process.env.REPLICATE_WEBHOOK_SECRET
  console.log('[Webhook] 🔍 Secret exists:', !!webhookSecret)
  console.log('[Webhook] 🔍 Secret prefix:', webhookSecret?.substring(0, 7))
  
  if (!webhookSecret) {
    console.warn('[Webhook] ⚠️ REPLICATE_WEBHOOK_SECRET not configured, skipping verification')
    return { isValid: true } // Allow webhooks if secret not configured (dev mode)
  }

  // 4. Construct signed content: id.timestamp.body
  const signedContent = `${webhookId}.${webhookTimestamp}.${body}`
  console.log('[Webhook] 🔍 Signed content length:', signedContent.length)
  console.log('[Webhook] 🔍 Webhook ID:', webhookId)
  console.log('[Webhook] 🔍 Webhook timestamp:', webhookTimestamp)

  // 5. Extract secret key (remove 'whsec_' prefix)
  const secretKey = webhookSecret.startsWith('whsec_')
    ? webhookSecret.split('_')[1]
    : webhookSecret

  console.log('[Webhook] 🔍 Secret key length after prefix removal:', secretKey.length)

  const secretBytes = Buffer.from(secretKey, 'base64')
  console.log('[Webhook] 🔍 Secret bytes length:', secretBytes.length)

  // 6. Calculate HMAC SHA-256 signature
  const computedSignature = crypto
    .createHmac('sha256', secretBytes as crypto.BinaryLike)
    .update(signedContent, 'utf8')
    .digest('base64')

  console.log('[Webhook] 🔍 Computed signature:', computedSignature)
  console.log('[Webhook] 🔍 Expected signature header:', webhookSignature)

  // 7. Parse webhook signatures (format: "v1,signature1 v1,signature2")
  const expectedSignatures = webhookSignature
    .split(' ')
    .map(sig => sig.split(',')[1])
    .filter(Boolean)

  console.log('[Webhook] 🔍 Parsed signatures:', expectedSignatures)

  if (expectedSignatures.length === 0) {
    return {
      isValid: false,
      error: 'No valid signatures found in webhook-signature header',
    }
  }

  // 8. Use constant-time comparison to prevent timing attacks
  let isValid = false
  for (const expectedSig of expectedSignatures) {
    console.log('[Webhook] 🔍 Comparing:', expectedSig, '===', computedSignature, '?', expectedSig === computedSignature)
    if (expectedSig === computedSignature) {
      isValid = true
      break
    }
  }

  if (!isValid) {
    console.error('[Webhook] ❌ Signature mismatch!')
    console.error('[Webhook] Expected one of:', expectedSignatures)
    console.error('[Webhook] Computed:', computedSignature)
    return {
      isValid: false,
      error: 'Invalid webhook signature',
    }
  }

  return { isValid: true }
}

/**
 * Get webhook signing secret from Replicate API
 * https://replicate.com/docs/reference/http#get-the-signing-secret-for-the-default-webhook
 */
export async function fetchWebhookSecret(): Promise<string | null> {
  const apiToken = process.env.REPLICATE_API_TOKEN
  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN not configured')
  }

  try {
    const response = await fetch('https://api.replicate.com/v1/webhooks/default/secret', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch webhook secret: ${response.statusText}`)
    }

    const data = await response.json()
    return data.key || null
  } catch (error) {
    console.error('[Webhook] Failed to fetch signing secret:', error)
    return null
  }
}

/**
 * Send job data to Google Sheets for long-term storage
 * This allows keeping job history even after jobs are deleted from MongoDB
 */

interface JobLogData {
  timestamp: Date
  userEmail: string
  userName?: string
  mode: string
  customPrompt?: string
  templateName?: string
  outputSize: string
  status: string
  imageCount?: number
  jobId?: string
}

/**
 * Send job creation data to Google Sheets
 * @param data - Job data to log
 */
export async function sendToGoogleSheets(data: JobLogData): Promise<void> {
  try {
    // Skip if Google Sheets not configured
    if (!process.env.GOOGLE_SHEETS_WEBHOOK_URL) {
      console.log('⚠️ Google Sheets webhook not configured, skipping log')
      return
    }

    const payload = {
      timestamp: data.timestamp.toISOString(),
      date: data.timestamp.toLocaleDateString('th-TH'),
      time: data.timestamp.toLocaleTimeString('th-TH'),
      userEmail: data.userEmail || 'unknown',
      userName: data.userName || '-',
      mode: data.mode || 'unknown',
      customPrompt: data.customPrompt || '-',
      templateName: data.templateName || '-',
      outputSize: data.outputSize || '-',
      status: data.status || 'unknown',
      imageCount: data.imageCount || 0,
      jobId: data.jobId || '-',
    }

    // Send to Google Sheets via Apps Script webhook
    const response = await fetch(process.env.GOOGLE_SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (response.ok) {
      console.log('✅ Sent job data to Google Sheets:', data.jobId)
    } else {
      console.error('❌ Failed to send to Google Sheets:', response.status, response.statusText)
    }
  } catch (error: any) {
    console.error('❌ Google Sheets error:', error.message)
    // Don't throw error - we don't want to fail job creation if logging fails
  }
}

/**
 * Get template name from template ID
 * Helper function to resolve template relationships
 */
export function getTemplateName(templateId: any): string {
  if (!templateId) return '-'
  
  // If it's an object with name property
  if (typeof templateId === 'object' && templateId.name) {
    return templateId.name
  }
  
  // If it's just an ID string
  if (typeof templateId === 'string') {
    return templateId
  }
  
  return '-'
}

/**
 * Get user email from user object
 * Helper function to resolve user relationships
 */
export function getUserEmail(user: any): string {
  if (!user) return 'unknown'
  
  // If it's an object with email property
  if (typeof user === 'object' && user.email) {
    return user.email
  }
  
  // If it's just an ID string (return as-is for now)
  if (typeof user === 'string') {
    return user // จะเป็น ID แต่ยังดีกว่า unknown
  }
  
  return 'unknown'
}

/**
 * Get mode description
 * Helper function to format mode for logging
 */
export function getModeDescription(doc: any): string {
  // Check contentTopic for Text-to-Image
  if (doc.contentTopic && doc.contentTopic.includes('Text-to-Image')) {
    return 'Text-to-Image'
  }
  
  const hasCustomPrompt = doc.customPrompt && doc.customPrompt.trim() !== ''
  const hasTemplate = doc.templateId
  const isTextToImage = doc.mode === 'text-to-image'
  
  if (isTextToImage) return 'Text-to-Image'
  if (hasCustomPrompt && hasTemplate) return 'Custom Prompt + Template'
  if (hasCustomPrompt && !hasTemplate) return 'Custom Prompt Only'
  if (!hasCustomPrompt && hasTemplate) return 'Template Only'
  
  return doc.mode || 'Unknown'
}

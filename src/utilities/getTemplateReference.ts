import { getPayload } from 'payload'
import config from '@payload-config'
import type { TemplateType } from './templatePrompts'

/**
 * Get a random template reference from Media collection
 * @param type - single, dual, triple, or quad (based on number of images)
 * @returns Template image URL or null if not found
 */
export async function getTemplateReference(
  type: TemplateType
): Promise<string | null> {
  try {
    const payload = await getPayload({ config })

    // Query templates matching type only
    const templates = await payload.find({
      collection: 'media',
      where: {
        and: [
          { isTemplate: { equals: true } },
          { templateType: { equals: type } },
        ],
      },
    })

    if (!templates.docs || templates.docs.length === 0) {
      console.warn(`⚠️ No template found for type: ${type}`)
      return null
    }

    // Random select from matching templates
    const randomIndex = Math.floor(Math.random() * templates.docs.length)
    const selectedTemplate = templates.docs[randomIndex]
    
    console.log(`📐 Selected template: ${selectedTemplate.filename}`)
    console.log(`   Type: ${type}`)
    console.log(`   Total available: ${templates.docs.length}`)

    // Convert relative URL to absolute URL
    const relativeUrl = selectedTemplate.url
    if (!relativeUrl) return null
    
    // If already absolute URL, return as-is
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl
    }
    
    // Convert to absolute URL
    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    const absoluteUrl = `${baseUrl}${relativeUrl.startsWith('/') ? relativeUrl : '/' + relativeUrl}`
    
    console.log(`   URL: ${absoluteUrl}`)
    
    return absoluteUrl
  } catch (error) {
    console.error('Error getting template reference:', error)
    return null
  }
}

/**
 * Get all available templates for a specific type
 * Useful for previewing options in UI
 */
export async function getAllTemplatesForType(
  type: TemplateType
): Promise<Array<{ url: string; filename: string }>> {
  try {
    const payload = await getPayload({ config })

    const templates = await payload.find({
      collection: 'media',
      where: {
        and: [
          { isTemplate: { equals: true } },
          { templateType: { equals: type } },
        ],
      },
    })

    return templates.docs.map((doc) => ({
      url: doc.url || '',
      filename: doc.filename || 'unknown',
    }))
  } catch (error) {
    console.error('Error getting templates:', error)
    return []
  }
}

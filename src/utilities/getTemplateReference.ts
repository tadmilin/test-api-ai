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
    console.log(`   Raw template data:`, JSON.stringify({
      id: selectedTemplate.id,
      filename: selectedTemplate.filename,
      url: selectedTemplate.url,
      mimeType: selectedTemplate.mimeType,
      filesize: selectedTemplate.filesize,
    }, null, 2))

    // Get URL - Vercel Blob storage should provide direct URL
    // Try multiple fields in order of preference
    let templateUrl = selectedTemplate.url || selectedTemplate.filename
    
    if (!templateUrl) {
      console.warn('⚠️ Template has no URL or filename')
      return null
    }
    
    // Check if it's already a full storage URL
    if (templateUrl.includes('cloudinary.com') || templateUrl.includes('blob.vercel-storage.com') || templateUrl.includes('public.blob.vercel')) {
      console.log(`   ✅ Direct storage URL: ${templateUrl}`)
      return templateUrl
    }
    
    // If it's a Payload CMS path like /api/media/file/xxx, we need to convert it
    // But this shouldn't happen with Vercel Blob storage enabled
    if (templateUrl.includes('/api/media/file/')) {
      console.error('   ❌ Got Payload path instead of Blob URL - Blob storage may not be working')
      console.error('   This template was not uploaded to Blob storage')
      return null
    }
    
    // If it's a relative path, convert to absolute
    if (!templateUrl.startsWith('http://') && !templateUrl.startsWith('https://')) {
      const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
      templateUrl = `${baseUrl}${templateUrl.startsWith('/') ? templateUrl : '/' + templateUrl}`
      console.log(`   📝 Converted to absolute URL: ${templateUrl}`)
    } else {
      console.log(`   ✅ Using URL: ${templateUrl}`)
    }
    
    return templateUrl
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

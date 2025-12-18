/**
 * AI Vision Template Analyzer
 * Use GPT-4o mini with structured outputs to detect photo positions
 */

import OpenAI from 'openai'
import type { ImagePosition } from './templateHelpers'
import { downloadDriveFile, extractDriveFileId } from './downloadDriveFile'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface AnalyzedTemplate {
  positions: ImagePosition[]
  totalPhotos: number
  templateSize: { width: number; height: number }
}

/**
 * Analyze template image using GPT-4o mini with structured outputs
 * Detects photo positions even if template already contains sample images
 * 
 * @param templateUrl - URL of template image
 * @param actualSize - Actual template size from Sharp metadata (for scaling)
 */
export async function analyzeTemplateWithAI(
  templateUrl: string,
  actualSize?: { width: number; height: number }
): Promise<AnalyzedTemplate> {
  try {
    console.log('🤖 Analyzing template with AI Vision (GPT-4o mini)...')
    if (actualSize) {
      console.log(`   Actual size: ${actualSize.width}x${actualSize.height}`)
    }

    // ✅ Convert Google Drive URLs to base64 (OpenAI Vision can't access private Drive files)
    let imageUrlForAI = templateUrl
    const driveFileId = extractDriveFileId(templateUrl)
    
    if (driveFileId) {
      console.log(`   📂 Downloading Drive file for AI Vision: ${driveFileId}`)
      const buffer = await downloadDriveFile(driveFileId)
      
      // Convert to base64 data URL
      const base64 = buffer.toString('base64')
      const mimeType = 'image/png' // Assume PNG, or detect with sharp if needed
      imageUrlForAI = `data:${mimeType};base64,${base64}`
      console.log(`   ✅ Converted to base64 (${Math.round(base64.length / 1024)}KB)`)
    }

    // Define JSON schema for structured outputs (prevents parse errors)
    const responseSchema = {
      type: 'object',
      properties: {
        positions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              x: { type: 'number', description: 'Left position in pixels' },
              y: { type: 'number', description: 'Top position in pixels' },
              width: { type: 'number', description: 'Width in pixels' },
              height: { type: 'number', description: 'Height in pixels' },
            },
            required: ['x', 'y', 'width', 'height'],
            additionalProperties: false,
          },
        },
        totalPhotos: { type: 'number' },
        templateSize: {
          type: 'object',
          properties: {
            width: { type: 'number' },
            height: { type: 'number' },
          },
          required: ['width', 'height'],
          additionalProperties: false,
        },
      },
      required: ['positions', 'totalPhotos', 'templateSize'],
      additionalProperties: false,
    }

    const prompt = `Analyze this social media template. Find ALL rectangular photo/image placeholder areas.

Rules:
- Detect ONLY photo areas (ignore text, logos, backgrounds)
- Order: largest area first (hero), then others
- Exact pixel coordinates (x, y, width, height)
- Estimate template dimensions

Return valid JSON matching the schema.`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Modern, stable, cheaper than vision-preview
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: imageUrlForAI, detail: 'high' }, // Use base64 for Drive files
            },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'template_analysis',
          strict: true,
          schema: responseSchema,
        },
      },
      max_tokens: 1000,
      temperature: 0.1, // Low temp for consistency
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from AI Vision')
    }

    // Safe JSON parse (schema guarantees valid JSON)
    let parsed: AnalyzedTemplate
    try {
      parsed = JSON.parse(content) as AnalyzedTemplate
    } catch (parseError) {
      console.error('❌ JSON parse failed:', parseError)
      console.error('   Response:', content)
      throw new Error('Invalid JSON from AI Vision')
    }

    // Validate
    if (!parsed.positions || !Array.isArray(parsed.positions) || parsed.positions.length === 0) {
      throw new Error('No photo positions detected')
    }

    // Scale positions if actual size differs from AI estimate
    if (actualSize && parsed.templateSize) {
      const scaleX = actualSize.width / parsed.templateSize.width
      const scaleY = actualSize.height / parsed.templateSize.height
      
      // Scale if difference > 5%
      if (Math.abs(scaleX - 1) > 0.05 || Math.abs(scaleY - 1) > 0.05) {
        console.log(`   📐 Scaling positions: ${scaleX.toFixed(2)}x, ${scaleY.toFixed(2)}y`)
        parsed.positions = parsed.positions.map(pos => ({
          x: Math.round(pos.x * scaleX),
          y: Math.round(pos.y * scaleY),
          width: Math.round(pos.width * scaleX),
          height: Math.round(pos.height * scaleY),
        }))
        parsed.templateSize = actualSize
      }
    }

    console.log(`✅ Detected ${parsed.positions.length} positions`)
    return parsed

  } catch (error) {
    console.error('❌ AI Vision failed:', error)
    
    // Retry once with simplified prompt
    try {
      console.log('🔄 Retrying with fallback...')
      
      const retryResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Find photo areas. Return JSON: {"positions":[{"x":0,"y":0,"width":100,"height":100}],"totalPhotos":1,"templateSize":{"width":800,"height":800}}' },
              {
                type: 'image_url',
                image_url: { url: templateUrl, detail: 'low' },
              },
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0,
      })

      const retryContent = retryResponse.choices[0]?.message?.content
      if (retryContent) {
        const retryParsed = JSON.parse(retryContent) as AnalyzedTemplate
        if (actualSize) retryParsed.templateSize = actualSize
        console.log('✅ Retry successful')
        return retryParsed
      }
    } catch (retryError) {
      console.error('❌ Retry failed:', retryError)
    }

    throw new Error(
      `AI Vision failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Fallback: Manual positions for common template styles
 * Use this if AI Vision fails or for faster processing
 */
export const PRESET_TEMPLATES = {
  'resort-3photos': {
    positions: [
      { x: 80, y: 80, width: 230, height: 280 },
      { x: 310, y: 80, width: 230, height: 280 },
      { x: 540, y: 80, width: 230, height: 280 },
    ],
    totalPhotos: 3,
    templateSize: { width: 1080, height: 1080 },
  },
  '2x2-grid': {
    positions: [
      { x: 0, y: 0, width: 540, height: 540 },
      { x: 540, y: 0, width: 540, height: 540 },
      { x: 0, y: 540, width: 540, height: 540 },
      { x: 540, y: 540, width: 540, height: 540 },
    ],
    totalPhotos: 4,
    templateSize: { width: 1080, height: 1080 },
  },
} as const

export type PresetTemplateName = keyof typeof PRESET_TEMPLATES

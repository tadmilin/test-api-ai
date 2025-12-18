/**
 * AI Vision Template Analyzer
 * Use GPT-4 Vision to detect photo positions in template images
 */

import OpenAI from 'openai'
import type { ImagePosition } from './templateHelpers'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface AnalyzedTemplate {
  positions: ImagePosition[]
  totalPhotos: number
  templateSize: { width: number; height: number }
}

/**
 * Analyze template image using GPT-4 Vision
 * Detects photo positions even if template already contains sample images
 */
export async function analyzeTemplateWithAI(
  templateUrl: string
): Promise<AnalyzedTemplate> {
  try {
    console.log('🤖 Analyzing template with AI Vision...')

    const response = await openai.chat.completions.create({
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this social media template image. Find ALL photo/image positions (even if they already contain sample photos).
              
I need exact coordinates for each photo area so I can replace them with new images.

Return ONLY valid JSON (no markdown, no explanation) in this format:
{
  "positions": [
    { "x": 100, "y": 50, "width": 650, "height": 540 },
    { "x": 750, "y": 50, "width": 430, "height": 540 }
  ],
  "totalPhotos": 3,
  "templateSize": { "width": 1080, "height": 1080 }
}

Rules:
- x, y are top-left coordinates in pixels
- Detect ALL rectangular photo areas (ignore text, logos, backgrounds)
- Order positions: main/hero photo first, then smaller ones
- Measure carefully - exact pixel values are critical`,
            },
            {
              type: 'image_url',
              image_url: { url: templateUrl },
            },
          ],
        },
      ],
      max_tokens: 1000,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from AI Vision')
    }

    // Parse JSON response
    const result = JSON.parse(content) as AnalyzedTemplate

    console.log(`✅ AI Vision detected ${result.totalPhotos} photo positions`)
    console.log('Positions:', result.positions)

    return result
  } catch (error) {
    console.error('❌ AI Vision analysis failed:', error)
    throw new Error(
      `Failed to analyze template: ${error instanceof Error ? error.message : 'Unknown error'}`
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

/**
 * Template Position Cache System
 * 
 * Cache AI Vision analysis results to avoid:
 * - Repeated API calls ($0.01-0.03 per analysis)
 * - Slow response times (5-10s per analysis)
 * - Inconsistent results
 * 
 * Usage:
 * 1. First time: analyzeTemplateWithAI() → save to cache
 * 2. Next times: check cache first → use cached positions
 */

import type { AnalyzedTemplate } from './aiVisionTemplate'

// In-memory cache (resets on server restart)
// For production: use Redis, DB, or Vercel KV
const templateCache = new Map<string, AnalyzedTemplate>()

/**
 * Generate cache key from template URL
 */
function getCacheKey(templateUrl: string): string {
  try {
    const url = new URL(templateUrl)
    // Use pathname + hash for Google Drive URLs
    if (url.hostname.includes('drive.google.com')) {
      const match = url.pathname.match(/\/d\/([^/]+)/)
      return match ? `drive-${match[1]}` : templateUrl
    }
    // For other URLs, use full URL
    return templateUrl
  } catch {
    return templateUrl
  }
}

/**
 * Get cached template analysis
 */
export function getCachedTemplate(templateUrl: string): AnalyzedTemplate | null {
  const key = getCacheKey(templateUrl)
  const cached = templateCache.get(key)
  
  if (cached) {
    console.log(`✅ Cache HIT for template: ${key}`)
    return cached
  }
  
  console.log(`❌ Cache MISS for template: ${key}`)
  return null
}

/**
 * Save template analysis to cache
 */
export function cacheTemplate(templateUrl: string, analysis: AnalyzedTemplate): void {
  const key = getCacheKey(templateUrl)
  templateCache.set(key, analysis)
  console.log(`💾 Cached template analysis: ${key} (${analysis.positions.length} positions)`)
}

/**
 * Clear specific template from cache
 */
export function clearTemplateCache(templateUrl: string): void {
  const key = getCacheKey(templateUrl)
  const deleted = templateCache.delete(key)
  if (deleted) {
    console.log(`🗑️ Cleared cache for template: ${key}`)
  }
}

/**
 * Clear all template cache
 */
export function clearAllTemplateCache(): void {
  const size = templateCache.size
  templateCache.clear()
  console.log(`🗑️ Cleared all template cache (${size} entries)`)
}

/**
 * Get cache statistics
 */
export function getTemplateCacheStats() {
  return {
    size: templateCache.size,
    keys: Array.from(templateCache.keys()),
  }
}

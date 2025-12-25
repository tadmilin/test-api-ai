/**
 * Script to check MongoDB collection sizes
 * Run: npx ts-node scripts/check-db-size.ts
 */

import { getPayload } from 'payload'
import config from '../src/payload.config'

async function checkDBSize() {
  const payload = await getPayload({ config })
  
  console.log('\n📊 MongoDB Collection Size Analysis\n')
  console.log('='.repeat(60))
  
  try {
    // Get all jobs
    const jobs = await payload.find({
      collection: 'jobs',
      limit: 1000,
    })
    
    console.log(`\n📦 Jobs Collection:`)
    console.log(`   Total Jobs: ${jobs.totalDocs}`)
    
    // Calculate average job size
    let totalSize = 0
    let largestJob = { id: '', size: 0, productName: '' }
    
    for (const job of jobs.docs) {
      const jobJSON = JSON.stringify(job)
      const jobSize = new Blob([jobJSON]).size
      totalSize += jobSize
      
      if (jobSize > largestJob.size) {
        largestJob = {
          id: job.id,
          size: jobSize,
          productName: job.productName || 'Unknown'
        }
      }
      
      // Check if templateUrl contains base64
      if (job.templateUrl && job.templateUrl.startsWith('data:')) {
        console.log(`   ⚠️ Job ${job.id} has Base64 templateUrl (${(jobSize / 1024).toFixed(2)} KB)`)
      }
    }
    
    const avgSize = totalSize / jobs.totalDocs
    console.log(`   Average Job Size: ${(avgSize / 1024).toFixed(2)} KB`)
    console.log(`   Total Jobs Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   Largest Job: ${largestJob.productName} (${(largestJob.size / 1024).toFixed(2)} KB)`)
    
    // Get job logs
    const logs = await payload.find({
      collection: 'job-logs',
      limit: 1000,
    })
    
    console.log(`\n📝 Job Logs Collection:`)
    console.log(`   Total Logs: ${logs.totalDocs}`)
    
    let logsSize = 0
    let largestLog = { id: '', size: 0, message: '' }
    
    for (const log of logs.docs) {
      const logJSON = JSON.stringify(log)
      const logSize = new Blob([logJSON]).size
      logsSize += logSize
      
      if (logSize > largestLog.size) {
        largestLog = {
          id: log.id,
          size: logSize,
          message: log.message.substring(0, 50)
        }
      }
    }
    
    const avgLogSize = logsSize / logs.totalDocs
    console.log(`   Average Log Size: ${(avgLogSize / 1024).toFixed(2)} KB`)
    console.log(`   Total Logs Size: ${(logsSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   Largest Log: ${largestLog.message}... (${(largestLog.size / 1024).toFixed(2)} KB)`)
    
    // Get media
    const media = await payload.find({
      collection: 'media',
      limit: 1000,
    })
    
    console.log(`\n🖼️ Media Collection:`)
    console.log(`   Total Media: ${media.totalDocs}`)
    
    let mediaSize = 0
    for (const m of media.docs) {
      const mediaJSON = JSON.stringify(m)
      mediaSize += new Blob([mediaJSON]).size
    }
    
    console.log(`   Total Media Metadata Size: ${(mediaSize / 1024 / 1024).toFixed(2)} MB`)
    
    console.log('\n' + '='.repeat(60))
    console.log(`\n📊 Summary:`)
    console.log(`   Jobs: ${(totalSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   Logs: ${(logsSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   Media: ${(mediaSize / 1024 / 1024).toFixed(2)} MB`)
    console.log(`   Estimated Total: ${((totalSize + logsSize + mediaSize) / 1024 / 1024).toFixed(2)} MB`)
    console.log(`\n   MongoDB Shows: 117.43 MB`)
    console.log(`   Difference: ${(117.43 - (totalSize + logsSize + mediaSize) / 1024 / 1024).toFixed(2)} MB (indexes, system collections)`)
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
  
  process.exit(0)
}

checkDBSize()

import { v2 as cloudinary } from 'cloudinary'

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * Upload image to Cloudinary
 * @param imageUrl - URL of the image to upload (can be external URL)
 * @param folder - Cloudinary folder path (e.g., 'text-to-image', 'enhanced')
 * @param filename - Optional custom filename
 * @returns Cloudinary URL
 */
export async function uploadToCloudinary(
  imageUrl: string,
  folder: string = 'uploads',
  filename?: string,
): Promise<string> {
  try {
    const options: any = {
      folder,
      resource_type: 'image',
      overwrite: false,
      quality: 'auto',
      fetch_format: 'auto',
    }

    if (filename) {
      options.public_id = filename
    }

    const result = await cloudinary.uploader.upload(imageUrl, options)
    
    return result.secure_url
  } catch (error: any) {
    console.error('❌ Cloudinary upload error:', error.message)
    throw new Error(`Failed to upload to Cloudinary: ${error.message}`)
  }
}

/**
 * Upload image buffer to Cloudinary
 * @param buffer - Image buffer
 * @param folder - Cloudinary folder path
 * @param filename - Optional custom filename
 * @returns Cloudinary URL
 */
export async function uploadBufferToCloudinary(
  buffer: Buffer,
  folder: string = 'uploads',
  filename?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const options: any = {
      folder,
      resource_type: 'image',
      overwrite: true, // ✅ Always upload new image (prevent reusing old uploads)
      quality: 'auto',
      fetch_format: 'auto',
    }

    if (filename) {
      options.public_id = filename
    }

    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        console.error('❌ Cloudinary buffer upload error:', error.message)
        reject(new Error(`Failed to upload buffer to Cloudinary: ${error.message}`))
      } else {
        resolve(result!.secure_url)
      }
    })

    uploadStream.end(buffer)
  })
}

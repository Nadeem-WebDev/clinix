import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env.js'

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
})

// Exported as a single mutable object, not standalone functions - this
// environment has no real Cloudinary credentials to test against, and
// Jest's ESM module-mocking is fiddly. Tests instead monkey-patch these
// methods directly (`cloudinaryClient.upload = jest.fn(...)`) - safe
// because ES modules are singletons, so every importer shares the same
// object reference.
export const cloudinaryClient = {
  // Uploads a buffer via Cloudinary's private/authenticated delivery type
  // ("use private storage URLs where possible") - resourceType should be
  // 'image' for jpg/png or 'raw' for pdf (Cloudinary categorizes by type).
  upload(buffer, { folder, resourceType, filename }) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          type: 'authenticated',
          filename_override: filename,
          use_filename: true,
          unique_filename: true,
        },
        (err, result) => {
          if (err) return reject(err)
          return resolve(result)
        },
      )
      stream.end(buffer)
    })
  },

  destroy(publicId, resourceType) {
    return cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated' })
  },

  // Public image upload, for clinic logos only - never patient data. The
  // incoming transformation scales anything larger than 512px down on
  // Cloudinary's side, so a huge photo can't become a huge logo download.
  uploadPublicImage(buffer, { folder, filename }) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          type: 'upload',
          filename_override: filename,
          use_filename: true,
          unique_filename: true,
          transformation: [{ width: 512, height: 512, crop: 'limit' }],
        },
        (err, result) => {
          if (err) return reject(err)
          return resolve(result)
        },
      )
      stream.end(buffer)
    })
  },

  destroyPublicImage(publicId) {
    return cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'upload' })
  },

  // URL of a clinic logo converted to a small PNG on Cloudinary's side, for
  // embedding in generated PDFs (pdfkit can't read WebP).
  pdfLogoUrl(publicId) {
    return cloudinary.url(publicId, {
      secure: true,
      resource_type: 'image',
      type: 'upload',
      format: 'png',
      transformation: [{ width: 240, height: 240, crop: 'limit' }],
    })
  },

  // A time-limited signed URL for an authenticated-type asset - never a
  // permanent public link.
  signedUrl(publicId, resourceType, expiresInSeconds = 300) {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds
    return cloudinary.utils.private_download_url(publicId, undefined, {
      resource_type: resourceType,
      type: 'authenticated',
      expires_at: expiresAt,
    })
  },
}

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

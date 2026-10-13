import multer from 'multer'
import path from 'node:path'
import { ApiError } from '../utils/ApiError.js'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

// Both MIME type AND extension are checked - relying on either alone is
// spoofable (a browser sets Content-Type from the file's own claimed
// extension). Never accept anything that could be executable.
const ALLOWED = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
}

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase()
  const allowedExts = ALLOWED[file.mimetype]
  if (!allowedExts || !allowedExts.includes(ext)) {
    cb(ApiError.badRequest('Only PDF, JPG, and PNG files are allowed', 'UNSUPPORTED_FILE_TYPE'))
    return
  }
  cb(null, true)
}

const upload = multer({
  storage: multer.memoryStorage(), // never touches disk - straight through to Cloudinary
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter,
})

// Clinic logos: raster images only, and much smaller. SVG is deliberately
// excluded - it can carry script, and logos are served from a public URL.
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

const ALLOWED_IMAGES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
}

function imageFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase()
  const allowedExts = ALLOWED_IMAGES[file.mimetype]
  if (!allowedExts || !allowedExts.includes(ext)) {
    cb(ApiError.badRequest('Only PNG, JPG, and WebP images are allowed', 'UNSUPPORTED_FILE_TYPE'))
    return
  }
  cb(null, true)
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
  fileFilter: imageFileFilter,
})

// Wraps multer's single-file middleware so its errors (file-too-large,
// unsupported type) flow through the app's normal centralized error
// handler instead of multer's own default (uncaught-exception-shaped) behavior.
function wrapSingle(middleware, sizeLabel) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) return next()
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.badRequest(`File exceeds the ${sizeLabel} size limit`, 'FILE_TOO_LARGE'))
      }
      return next(err)
    })
  }
}

// Doctor signatures: PNG or JPG only - they are embedded in prescription
// PDFs as stored, and pdfkit can't read WebP.
const MAX_SIGNATURE_SIZE_BYTES = 1024 * 1024 // 1MB

const ALLOWED_SIGNATURES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
}

const signatureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIGNATURE_SIZE_BYTES },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase()
    const allowedExts = ALLOWED_SIGNATURES[file.mimetype]
    if (!allowedExts || !allowedExts.includes(ext)) {
      cb(ApiError.badRequest('Only PNG and JPG images are allowed', 'UNSUPPORTED_FILE_TYPE'))
      return
    }
    cb(null, true)
  },
})

export function uploadSignatureImage(fieldName) {
  return wrapSingle(signatureUpload.single(fieldName), '1MB')
}

export function uploadSingleFile(fieldName) {
  return wrapSingle(upload.single(fieldName), '10MB')
}

export function uploadSingleImage(fieldName) {
  return wrapSingle(imageUpload.single(fieldName), '2MB')
}

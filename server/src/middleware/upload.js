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

// Wraps multer's single-file middleware so its errors (file-too-large,
// unsupported type) flow through the app's normal centralized error
// handler instead of multer's own default (uncaught-exception-shaped) behavior.
export function uploadSingleFile(fieldName) {
  const middleware = upload.single(fieldName)
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) return next()
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.badRequest('File exceeds the 10MB size limit', 'FILE_TOO_LARGE'))
      }
      return next(err)
    })
  }
}

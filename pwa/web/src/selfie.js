// Selfie pipeline + persistence. Same localStorage key as the iOS SelfieStore.
import { readString, writeString, removeString } from './stores.js'

export const SELFIE_KEY = 'poc.selfie'
const MAX_EDGE = 1024
const JPEG_QUALITY = 0.85

export function loadSelfie() {
  return readString(SELFIE_KEY)
}

/** Returns false when the photo did not fit into storage (quota/private mode). */
export function saveSelfie(dataUrl) {
  if (!dataUrl) {
    removeString(SELFIE_KEY)
    return true
  }
  return writeString(SELFIE_KEY, dataUrl) !== false
}

export function initialsFor(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return words.map((word) => word[0]).join('').toUpperCase() || 'LH'
}

/** Decode check used by the self-test (`selfie decodes`). */
export function selfieDecodes(dataUrl) {
  if (!dataUrl) return Promise.resolve(false)
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
    image.src = dataUrl
  })
}

/**
 * File → decodable source. Safari's `createImageBitmap()` rejects Blob/File
 * sources (it only takes already-decoded images), so every failure falls back to
 * an `<img>` decode of an object URL. Without that fallback the selfie silently
 * never reaches localStorage on iOS.
 */
async function decodeImage(file) {
  if (globalThis.createImageBitmap) {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close?.(),
      }
    } catch (error) {
      console.warn('createImageBitmap(file) failed, falling back to <img>:', error?.message)
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Image could not be read'))
      element.src = url
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

async function encodeJpeg(source, width, height) {
  // A plain <canvas> is the one path that behaves identically in Safari and
  // Chromium (`toBlob` is available everywhere we target).
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(source, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('JPEG-Encoding fehlgeschlagen'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** File → downscaled JPEG ≤ ~300 KB → data URL → poc.selfie. */
export async function processImageFile(file, { maxEdge = MAX_EDGE } = {}) {
  if (!file || !String(file.type).startsWith('image/')) throw new Error('Keine Bilddatei')
  const decoded = await decodeImage(file)
  try {
    const { width, height } = decoded
    if (!width || !height) throw new Error('Bild hat keine Abmessungen')

    const scale = Math.min(1, maxEdge / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))
    const blob = await encodeJpeg(decoded.source, targetWidth, targetHeight)

    const dataUrl = await blobToDataUrl(blob)
    saveSelfie(dataUrl)
    return dataUrl
  } finally {
    decoded.release()
  }
}

/** Wire an <input type="file"> to the pipeline (used by Home in M3). */
export function attachSelfieInput(input, onSaved) {
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      onSaved(await processImageFile(file))
    } catch (error) {
      console.warn('Could not save selfie:', error)
    }
  })
}

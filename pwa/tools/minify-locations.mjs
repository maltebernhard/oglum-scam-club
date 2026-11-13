// Remove metadata that is not used by the PWA location seed generator.
// Usage: node pwa/tools/minify-locations.mjs [input] [output]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const input = path.resolve(process.argv[2] ?? path.join(root, 'data', 'locations.json'))
const output = path.resolve(process.argv[3] ?? input)
const source = JSON.parse(fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, ''))

if (!Array.isArray(source.locations)) throw new Error('Expected a locations array')

const locations = source.locations.map((location, index) => {
  if (!location || typeof location.name !== 'string' || typeof location.studioType !== 'string') {
    throw new Error(`Location ${index} is missing name or studioType`)
  }

  const result = {
    name: location.name,
    studioType: location.studioType,
    address: { city: location.address?.city ?? '' },
  }
  const latitude = location.coordinates?.latitude
  const longitude = location.coordinates?.longitude
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    result.coordinates = { latitude, longitude }
  }
  return result
})

const reduced = { locations }
fs.writeFileSync(output, `${JSON.stringify(reduced, null, 2)}\n`)
console.log(`wrote ${locations.length} locations to ${path.relative(process.cwd(), output)}`)

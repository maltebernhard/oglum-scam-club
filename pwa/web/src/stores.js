// Persistence parity with the iOS UserDefaults keys.
import { normalize, fold } from './categories.js'
import { seed, makeID, cryptoId } from './seed.js'

const CUSTOM_KEY = 'poc.studios.custom'
const HISTORY_KEY = 'poc.history'
const HISTORY_LIMIT = 50

// ---------------------------------------------------------------------------
// Storage: every access is guarded; on quota/blocked storage the latest value
// stays in this in-memory fallback so the check-in flow never breaks.
// ---------------------------------------------------------------------------

const memory = new Map()

// Health of the real storage backend, so the debug panel can show why nothing
// survives a relaunch (private mode, "Block All Cookies", full quota).
let storageState = { available: true, error: null }

function markStorageError(error) {
  storageState = { available: false, error: String(error?.name ?? error?.message ?? error) }
}

function markStorageOk() {
  if (!storageState.available) storageState = { available: true, error: null }
}

export function storageStatus() {
  let bytes = 0
  const keys = []
  // Reading works even when writing throws (private mode, "Block All Cookies"),
  // so probe a write before reporting the storage as healthy.
  try {
    localStorage.setItem('poc.__probe', '1')
    localStorage.removeItem('poc.__probe')
    markStorageOk()
  } catch (error) {
    markStorageError(error)
  }
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith('poc.')) continue
      const value = localStorage.getItem(key) ?? ''
      keys.push({ key, bytes: value.length })
      bytes += key.length + value.length
    }
  } catch (error) {
    markStorageError(error)
  }
  return { ...storageState, pending: memory.size, bytes, keys }
}

export function readString(key) {
  if (memory.has(key)) return memory.get(key)
  try {
    const value = localStorage.getItem(key)
    markStorageOk()
    return value
  } catch (error) {
    markStorageError(error)
    return null
  }
}

/** Returns false only when the value could not leave memory. */
export function writeString(key, value) {
  memory.set(key, value)
  try {
    localStorage.setItem(key, value)
    memory.delete(key)
    markStorageOk()
    return true
  } catch (error) {
    // keep the in-memory copy so the flow keeps working
    markStorageError(error)
    return false
  }
}

export function removeString(key) {
  memory.set(key, null)
  try {
    localStorage.removeItem(key)
    memory.delete(key)
    markStorageOk()
  } catch (error) {
    markStorageError(error)
  }
}

export function readJSON(key, fallback) {
  const raw = readString(key)
  if (raw == null) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeJSON(key, value) {
  try {
    writeString(key, JSON.stringify(value))
    return true
  } catch (error) {
    console.warn('Could not save', key, error)
    return false
  }
}

// ---------------------------------------------------------------------------
// StudioStore
// ---------------------------------------------------------------------------

function sanitizeCustom(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((item) => item && typeof item === 'object' && typeof item.name === 'string' && item.name.trim())
    .map((item) => {
      const name = item.name.trim()
      return {
        id: typeof item.id === 'string' && item.id ? item.id : makeID(name),
        name,
        category: normalize(item.category),
        city: typeof item.city === 'string' ? item.city.trim() : '',
        ...(Number.isFinite(item.lat) && Number.isFinite(item.lng) ? { lat: item.lat, lng: item.lng } : {}),
        isCustom: true,
      }
    })
}

export class StudioStore {
  constructor() {
    this.studios = [...seed, ...sanitizeCustom(readJSON(CUSTOM_KEY, []))]
  }

  studio(id) {
    if (!id) return null
    return this.studios.find((studio) => studio.id === id) ?? null
  }

  matching(query, category = null) {
    const q = fold(String(query ?? '').trim())
    return this.studios.filter((studio) => {
      if (category != null && studio.normalizedCategory() !== category) return false
      if (!q) return true
      // City is searchable too: "berlin" finds all Berlin partners even when the
      // studio name does not repeat the city.
      return (
        fold(studio.name).includes(q) ||
        fold(studio.normalizedCategory()).includes(q) ||
        fold(studio.city ?? '').includes(q)
      )
    })
  }

  count(category) {
    return this.studios.filter((studio) => studio.normalizedCategory() === category).length
  }

  add(name, category, city = '') {
    const trimmed = String(name ?? '').trim()
    if (!trimmed) return null

    const id = makeID(trimmed)
    const existing = this.studios.find((studio) => studio.id === id)
    if (existing) return existing

    const studio = withHelpers({
      id,
      name: trimmed,
      category: normalize(category),
      isCustom: true,
    })
    this.studios.push(studio)
    this.persistCustom()
    return studio
  }

  delete(studio) {
    if (!studio?.isCustom) return
    this.studios = this.studios.filter((item) => item.id !== studio.id)
    this.persistCustom()
  }

  persistCustom() {
    writeJSON(CUSTOM_KEY, this.studios.filter((studio) => studio.isCustom).map(plainStudio))
  }
}

function withHelpers(studio) {
  return {
    ...studio,
    city: studio.city ?? '',
    normalizedCategory: () => normalize(studio.category),
    initials: () => (studio.name.match(/\S+/g) ?? []).slice(0, 2).map((word) => word[0]).join('').toUpperCase(),
  }
}

function plainStudio({ id, name, category, city, lat, lng, isCustom }) {
  return { id, name, category, city: city ?? '', ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}), isCustom }
}

export const studioStore = new StudioStore()
// Make seed entries behave like custom ones at call sites.
studioStore.studios = studioStore.studios.map((studio) => (studio.normalizedCategory ? studio : withHelpers(studio)))

// ---------------------------------------------------------------------------
// HistoryStore
// ---------------------------------------------------------------------------

function normalizeRecord(record) {
  if (!record || typeof record !== 'object') return null
  const studio = String(record.studio ?? '').trim()
  if (!studio) return null
  let date = Number(record.date)
  if (!Number.isFinite(date)) date = Date.now()
  if (date < 1e12) date *= 1000 // tolerate Swift epoch-seconds records
  return {
    id: typeof record.id === 'string' && record.id ? record.id : cryptoId(),
    studio,
    category: normalize(record.category),
    date,
  }
}

export class HistoryStore {
  constructor() {
    const list = readJSON(HISTORY_KEY, [])
    this.records = Array.isArray(list) ? list.map(normalizeRecord).filter(Boolean).slice(0, HISTORY_LIMIT) : []
  }

  add(studio, category, date = Date.now()) {
    this.records.unshift({
      id: cryptoId(),
      studio: String(studio ?? ''),
      category: normalize(category),
      date: date instanceof Date ? date.getTime() : Number(date),
    })
    if (this.records.length > HISTORY_LIMIT) this.records = this.records.slice(0, HISTORY_LIMIT)
    this.persist()
  }

  clear() {
    this.records = []
    this.persist()
  }

  persist() {
    writeJSON(HISTORY_KEY, this.records)
  }
}

export const historyStore = new HistoryStore()

// ---------------------------------------------------------------------------
// Profile (poc.name / location / locationID / category / timestamp)
// ---------------------------------------------------------------------------

export const Profile = {
  get name() {
    return readString('poc.name') ?? ''
  },
  set name(value) {
    writeString('poc.name', String(value ?? ''))
  },
  get location() {
    return readString('poc.location') ?? ''
  },
  set location(value) {
    writeString('poc.location', String(value ?? ''))
  },
  get locationID() {
    return readString('poc.locationID')
  },
  set locationID(value) {
    value == null ? removeString('poc.locationID') : writeString('poc.locationID', String(value))
  },
  get category() {
    return readString('poc.category') ?? ''
  },
  set category(value) {
    writeString('poc.category', String(value ?? ''))
  },
  get timestamp() {
    const raw = readString('poc.timestamp')
    if (raw == null || raw === '') return null
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) return null
    return value < 1e12 ? value * 1000 : value
  },
  set timestamp(value) {
    value == null ? removeString('poc.timestamp') : writeString('poc.timestamp', String(Number(value)))
  },
  save({ name, location, locationID, category, timestamp }) {
    if (name !== undefined) this.name = name
    if (location !== undefined) this.location = location
    if (locationID !== undefined) this.locationID = locationID
    if (category !== undefined) this.category = category
    if (timestamp !== undefined) this.timestamp = timestamp
  },

  /** Everything the check-in screen needs, as one plain object. */
  snapshot() {
    return {
      name: this.name,
      location: this.location,
      locationID: this.locationID,
      category: this.category,
      timestamp: this.timestamp,
    }
  },
}

export { CUSTOM_KEY, HISTORY_KEY, HISTORY_LIMIT }

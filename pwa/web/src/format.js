// en-US, e.g. "11/11/26, 08:35 PM" — the check-in line's Intl options.
export function formatTimestamp(ms) {
  const date = new Date(Number.isFinite(ms) ? ms : Date.now())
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
    .format(date)
    .replace(/[\u202f\u00a0]/g, ' ')
}

export function initialsFor(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return words.map((word) => word[0]).join('').toUpperCase() || 'LH'
}

/** "Berlin Running Society Berlin" → "Berlin Running Society". Never returns an empty string. */
export function stripCitySuffix(name, city) {
  const value = String(name ?? '').trim()
  const full = String(city ?? '').trim()
  if (!full) return value
  for (const candidate of new Set([full, full.split('-')[0]])) {
    if (!candidate) continue
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const stripped = value.replace(new RegExp(`[\\s,\\-–]+${escaped}$`, 'i'), '').trim()
    if (stripped && stripped !== value) return stripped
  }
  return value
}

/** Google Maps web link for a studio, or null when it has no coordinates. */
export function mapsUrl(studio) {
  const { lat, lng } = studio ?? {}
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

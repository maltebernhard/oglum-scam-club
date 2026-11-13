// Category.normalize / symbol mapping — port of Model.swift `Category`.

// Order = chip order on Home; matches the categories present in the partner export.
export const ALL = [
  'Fitness',
  'Wellness',
  'Outdoor',
  'Yoga',
  'Pilates',
  'EMS',
  'CrossFit',
  'Martial Arts',
  'Dance',
  'Bouldering',
  'Physio',
  'Racket',
  'Water Sports',
  'Cycling',
  'Fever Dream',
  'Other',
]

/** Case- and diacritic-insensitive fold, equivalent to Swift's .diacriticInsensitive. */
export function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

// Labels written by earlier builds (German UI, old export) → current English category.
const LEGACY = {
  fitnessstudio: 'Fitness',
  kampfsport: 'Martial Arts',
  tanz: 'Dance',
  bouldern: 'Bouldering',
  wassersport: 'Water Sports',
  sonstiges: 'Other',
}

export function normalize(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return 'Other'
  const key = fold(s)
  return ALL.find((category) => category.toLowerCase() === key) ?? LEGACY[key] ?? s
}

/** Web icon token per category (renderer lives in the views). */
export const SYMBOLS = {
  Fitness: 'dumbbell',
  Wellness: 'leaf',
  Outdoor: 'person-hiking',
  Yoga: 'lotus',
  Pilates: 'mat-stretch',
  Bouldering: 'climbing-hold',
  'Martial Arts': 'boxing-glove',
  Dance: 'dancing-figure',
  EMS: 'bolt',
  CrossFit: 'barbell',
  Physio: 'physio',
  Racket: 'racket',
  'Water Sports': 'paddle',
  Cycling: 'bike',
  'Fever Dream': 'sparkles',
  Other: 'map-pin',
}

export function symbol(category) {
  return SYMBOLS[category] ?? SYMBOLS.Other
}

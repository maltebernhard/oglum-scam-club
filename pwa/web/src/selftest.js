// Port of `OSCwellPassPoCApp.swift:runSelfTestIfRequested` + dataset assertions (counts come from tools/gen-seed.mjs).
import { ALL, normalize } from './categories.js'
import { studioStore, historyStore, readString, CUSTOM_KEY, HISTORY_KEY } from './stores.js'
import { loadSelfie, selfieDecodes } from './selfie.js'
import { formatTimestamp, stripCitySuffix, mapsUrl } from './format.js'

const SEED_TOTAL = 982
const SEED_WITH_COORDS = 891

export async function runSelfTest({ keep = false } = {}) {
  const lines = []
  const check = (label, ok, detail = '') => {
    lines.push(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  }

  const store = studioStore
  const seedStudios = store.studios.filter((studio) => !studio.isCustom)
  const seedCount = seedStudios.length
  const inCity = (city) => seedStudios.filter((studio) => studio.city === city).length
  check(`seed count == ${SEED_TOTAL}`, seedCount === SEED_TOTAL, String(seedCount))
  check('Berlin 731 / Potsdam 41 / Köln 41 / Düsseldorf 50', inCity('Berlin') === 731 && inCity('Potsdam') === 41 && inCity('Köln') === 41 && inCity('Düsseldorf') === 50)
  check('unique ids', new Set(store.studios.map((studio) => studio.id)).size === store.studios.length)
  check('every category is known', seedStudios.every((studio) => ALL.includes(studio.normalizedCategory())))
  check(`${SEED_WITH_COORDS} studios have coordinates`, seedStudios.filter((studio) => mapsUrl(studio)).length === SEED_WITH_COORDS)
  check('Köln has no maps link', seedStudios.filter((studio) => studio.city === 'Köln').every((studio) => mapsUrl(studio) === null))

  check('16 English categories', ALL.length === 16 && !ALL.includes('USC'))
  check('Fitnessstudio -> Fitness', normalize('Fitnessstudio') === 'Fitness')
  check('legacy German labels map', normalize('Kampfsport') === 'Martial Arts' && normalize('Tanz') === 'Dance' && normalize('Bouldern') === 'Bouldering' && normalize('Wassersport') === 'Water Sports' && normalize('Sonstiges') === 'Other')
  check('normalize keeps Wellness', normalize('wellness') === 'Wellness')
  check('empty category -> Other', normalize('') === 'Other')

  check('city suffix stripped', stripCitySuffix('Berlin Running Society Berlin', 'Berlin') === 'Berlin Running Society')
  check('city in the middle kept', stripCitySuffix('Yayaspa Berlin (Kreuzberg)', 'Berlin') === 'Yayaspa Berlin (Kreuzberg)')
  check('name == city kept', stripCitySuffix('Berlin', 'Berlin') === 'Berlin')
  check('Berlin-Mahlsdorf strips Berlin', stripCitySuffix('Studio X Berlin', 'Berlin-Mahlsdorf') === 'Studio X')
  check('timestamp format', /^\d\d\/\d\d\/\d\d, \d\d:\d\d (AM|PM)$/.test(formatTimestamp(Date.now())), formatTimestamp(Date.now()))
  check('maps url', mapsUrl({ lat: 52.5, lng: 13.4 }) === 'https://www.google.com/maps/search/?api=1&query=52.5,13.4')

  const koeln = store.matching('köln', null)
  check('search köln hits', koeln.length > 5, String(koeln.length))
  const plain = store.matching('koln', null)
  check('search is diacritic-insensitive', plain.length === koeln.length, String(plain.length))
  check('search potsdam hits city', store.matching('potsdam', null).length >= 41, String(store.matching('potsdam', null).length))
  const fitness = store.matching('', 'Fitness')
  check('filter Fitness', fitness.every((studio) => studio.normalizedCategory() === 'Fitness'), String(fitness.length))

  const added = store.add('Selftest Studio', 'Fitnessstudio')
  check('add custom location', added != null)
  check('custom is Fitness', added?.normalizedCategory() === 'Fitness')
  check('custom visible', store.studio(added?.id) != null)
  check('duplicate returns existing', store.add('Selftest Studio', 'EMS')?.id === added?.id)
  check('persisted', readString(CUSTOM_KEY) != null)

  if (added) store.delete(added)
  check('delete custom', store.studio(added?.id) == null)
  const seedCountAfter = store.studios.filter((studio) => !studio.isCustom).length
  check('seed survives delete', seedCountAfter === SEED_TOTAL, String(seedCountAfter))
  check('search berlin hits city', store.matching('berlin', null).length >= 730, String(store.matching('berlin', null).length))
  check('category Yoga exists', store.count('Yoga') === 188, String(store.count('Yoga')))

  const before = historyStore.records.length
  historyStore.add('Selftest Studio', 'Fitness')
  check('history append', historyStore.records.length === before + 1)
  check('history encodes', readString(HISTORY_KEY) != null)
  if (keep) {
    check('history kept for screenshots', true)
  } else {
    historyStore.clear()
    check('history clear', historyStore.records.length === 0)
  }

  const selfie = loadSelfie()
  check('selfie decodes', await selfieDecodes(selfie), selfie ? `${selfie.length} chars` : 'nil')

  const result = lines.join('\n')
  try {
    localStorage.setItem('poc.selftest.result', result)
  } catch {
    // the console output below is still authoritative
  }
  console.table(lines.map((line) => ({ result: line.slice(0, 4), assertion: line.slice(5) })))
  console.log(result)
  return lines
}

export function isSelfTestRequested() {
  const params = new URLSearchParams(location.search)
  return params.get('selftest') === 'on' || params.get('selftest') === '1'
}

export function shouldKeepSelfTestHistory() {
  const params = new URLSearchParams(location.search)
  return params.get('selftest.keep') === 'on' || params.get('keep') === 'on'
}

import { normalize } from '../categories.js'
import { Profile, studioStore } from '../stores.js'
import { loadSelfie } from '../selfie.js'
import { formatTimestamp, initialsFor, stripCitySuffix } from '../format.js'
import { backdropMarkup } from '../checkin-backdrop.js'

// Dynamic layer geometry, expressed as fractions of the screen height.
export const DEFAULT_NAME = 'Oğlum McDoglum'
export const DEFAULT_LOCATION = 'Holmes Place Potsdamer Platz'

// The disc grows by this fraction of the frame width, see syncPulse().
const PULSE_EXPAND_WIDTH_FRACTION = 0.1
const AVATAR_SIZE = 0.2305
const STAGE_RATIO = 9 / 16

let onResize = null

function locationText(profile) {
  const studio = studioStore.studio(profile.locationID)
  if (studio && studio.name === profile.location) return stripCitySuffix(studio.name, studio.city)
  return profile.location || DEFAULT_LOCATION
}

export function mount(root, { navigate } = {}) {
  const profile = Profile.snapshot()
  const name = profile.name.trim() || DEFAULT_NAME
  const category = normalize(profile.category || 'Fitness')
  const timestamp = formatTimestamp(profile.timestamp ?? Date.now())
  const selfie = loadSelfie()

  const section = document.createElement('section')
  section.id = 'checkin'
  section.className = 'screen'
  section.innerHTML = `
    <div class="ci-stage">
      ${backdropMarkup()}
      <button type="button" class="ci-back" aria-label="Back"></button>
    </div>

    <div class="ci-overlay">
      <span class="ci-pulse" aria-hidden="true"></span>
      <span class="ci-avatar">
        <span class="ci-initials"></span>
        ${selfie ? '<img class="ci-photo" alt="" />' : ''}
      </span>
      <p class="ci-text ci-name"></p>
      <p class="ci-text ci-meta ci-location"></p>
      <p class="ci-text ci-meta ci-activity"></p>
      <p class="ci-text ci-meta ci-datetime"></p>
    </div>`

  section.querySelector('.ci-name').textContent = name
  section.querySelector('.ci-location').textContent = locationText(profile)
  section.querySelector('.ci-activity').textContent = category
  section.querySelector('.ci-datetime').textContent = timestamp
  section.querySelector('.ci-initials').textContent = initialsFor(name)

  const image = section.querySelector('.ci-photo')
  if (image) {
    image.src = selfie
    image.addEventListener('error', () => image.remove())
  }

  section.querySelector('.ci-back').addEventListener('click', () => {
    if (window.history.state?.pwa) window.history.back()
    else if (navigate) navigate('/app/', { replace: true })
    else window.location.assign('/app/')
  })

  root.append(section)

  // Scale = (avatar + 10 % of the frame width) / avatar. Frame width is the screen width, capped at the
  // stage width so wide desktop windows don't get a huge pulse.
  const syncPulse = () => {
    const height = section.clientHeight
    if (!height) return
    const avatar = height * AVATAR_SIZE
    const frameWidth = Math.min(section.clientWidth || window.innerWidth, height * STAGE_RATIO)
    section.style.setProperty('--pulse-scale', ((avatar + PULSE_EXPAND_WIDTH_FRACTION * frameWidth) / avatar).toFixed(4))
  }
  syncPulse()
  onResize = syncPulse
  window.addEventListener('resize', onResize)
}

export function unmount() {
  if (onResize) window.removeEventListener('resize', onResize)
  onResize = null
}

import { ALL, normalize, symbol } from '../categories.js'
import { icon } from '../icons.js'
import { studioStore, historyStore, Profile, storageStatus } from '../stores.js'
import { loadSelfie, processImageFile } from '../selfie.js'
import { formatTimestamp, mapsUrl } from '../format.js'
import { openAddLocationDialog } from './add-location.js'
import { shouldShowInstallHint, dismissInstallHint, isStandalone, installHintOpen, setInstallHintOpen, canPromptInstall, onInstallPromptChange, promptInstall } from '../install.js'
import { platform } from '../transition.js'

let state = null

function params() {
  return new URLSearchParams(location.search)
}

function clearLocationIfSelected(studio) {
  if (Profile.locationID !== studio.id) return
  Profile.locationID = null
  Profile.location = ''
  Profile.category = ''
}

function restoreLastLocation() {
  const studio = studioStore.studio(Profile.locationID)
  if (!studio) return
  if (Profile.location !== studio.name || Profile.category !== studio.normalizedCategory()) {
    Profile.location = studio.name
    Profile.category = studio.normalizedCategory()
  }
}

// Onboarding for iPhone/iPad and Android: plain words, no "PWA"/"Service Worker" jargon.
function installStepsMarkup() {
  if (platform() === 'android') {
    return `
        <button type="button" class="install-action" id="install-prompt" hidden>Install app</button>
        <ol class="install-steps">
          <li><span class="install-num">1</span><span>Tap the <b>⋮</b> menu at the top right of Chrome.</span></li>
          <li><span class="install-num">2</span><span>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</span></li>
          <li><span class="install-num">3</span><span>Confirm with <b>Install</b>.</span></li>
          <li><span class="install-num">4</span><span>Done: the app icon is now with your other apps.</span></li>
        </ol>`
  }
  return `
        <ol class="install-steps">
          <li><span class="install-num">1</span><span>Tap <b>Share</b> ${icon('share', 13, { strokeWidth: 2 })} at the bottom of Safari.</span></li>
          <li><span class="install-num">2</span><span>Scroll a little and tap <b>Add to Home Screen</b>.</span></li>
          <li><span class="install-num">3</span><span>Tap <b>Add</b> at the top right.</span></li>
          <li><span class="install-num">4</span><span>Done: the app icon is now with your other apps.</span></li>
        </ol>`
}

function installHintMarkup() {
  if (!shouldShowInstallHint()) return ''
  const open = installHintOpen()
  return `
    <section class="card install-card" id="install-card" aria-labelledby="install-title">
      <button type="button" class="install-head" id="install-toggle" aria-expanded="${open}"
              aria-controls="install-body">
        <span class="install-copy">
          <span class="install-title" id="install-title">Add to your home screen</span>
          <span class="install-sub">Opens like a regular app</span>
        </span>
        <span class="install-chevron" id="install-chevron">${icon(open ? 'chevron-up' : 'chevron-down', 13, { strokeWidth: 2.4 })}</span>
      </button>
      <div class="install-body" id="install-body"${open ? '' : ' hidden'}>
        <p class="install-lead">It then opens like any other app — with its own icon and no address bar.</p>${installStepsMarkup()}
        <button type="button" class="install-dismiss" id="install-dismiss">Got it</button>
      </div>
    </section>
  `
}

function cardMarkup() {
  return `
    <header class="home-header">
      <div>
        <h1 class="home-title">Wellpass</h1>
        <p class="home-subtitle">Prepare your check-in</p>
      </div>
    </header>

    ${installHintMarkup()}

    <button type="button" class="card selfie-card" id="selfie-button">
      <span class="selfie-avatar">
        <img id="selfie-img" alt="" hidden />
        <span class="selfie-placeholder" id="selfie-placeholder">${icon('camera', 20, { strokeWidth: 2 })}</span>
      </span>
      <span class="selfie-copy">
        <span class="selfie-title">Selfie</span>
        <span class="selfie-sub" id="selfie-sub">Choose photo</span>
      </span>
      <span class="selfie-chevron">${icon('chevron-right', 14, { strokeWidth: 2.4 })}</span>
    </button>

    <div class="card name-card">
      <label class="field-label" for="name-input">Name</label>
      <input id="name-input" class="name-input" type="text" placeholder="Your name"
             autocomplete="name" autocapitalize="words" spellcheck="false" />
    </div>

    <div class="card location-card">
      <div class="location-label-row">
        <span class="field-label">Location</span>
        <button type="button" class="add-location" id="add-location">
          ${icon('plus-circle', 13, { strokeWidth: 2.2 })}<span>New</span>
        </button>
      </div>

      <div class="search-pill" id="search-pill">
        ${icon('search', 15, { strokeWidth: 2.2 })}
        <input id="search-input" type="search" placeholder="Search studios" autocomplete="off"
               autocapitalize="none" spellcheck="false" enterkeyhint="search" />
        <button type="button" class="search-clear" id="search-clear" aria-label="Clear search" hidden>
          ${icon('x-circle', 15, { strokeWidth: 2 })}
        </button>
      </div>

      <div class="chips" id="chips" role="group" aria-label="Categories"></div>
      <div class="location-body" id="location-body"></div>
    </div>

    <button type="button" class="checkin-button" id="checkin-button">Check-In</button>

    <section class="card history-card" id="history-card">
      <button type="button" class="history-head" id="history-toggle" aria-expanded="false">
        <span class="history-title">History</span>
        <span class="history-count" id="history-count" hidden></span>
        <span class="history-chevron" id="history-chevron">${icon('chevron-down', 13, { strokeWidth: 2.4 })}</span>
      </button>
      <div class="history-body" id="history-body" hidden></div>
    </section>
  `
}

export function mount(root, { navigate } = {}) {
  if (!state) state = { query: '', categoryFilter: null, searchFocused: false, showHistory: false }
  state.query = ''
  state.categoryFilter = null
  state.searchFocused = false
  state.showHistory = false

  const section = document.createElement('section')
  section.id = 'home'
  section.className = 'screen'
  const chromeParam = params().get('chrome')
  section.innerHTML = `${chromeParam === '0' ? '<div class="chrome-spacer" aria-hidden="true"></div>' : ''}
    <div class="home-scroll">${cardMarkup()}</div>
    <input id="selfie-input" type="file" accept="image/*" capture="user" hidden />`
  root.append(section)

  const refs = {
    installToggle: section.querySelector('#install-toggle'),
    installChevron: section.querySelector('#install-chevron'),
    installBody: section.querySelector('#install-body'),
    installDismiss: section.querySelector('#install-dismiss'),
    installPrompt: section.querySelector('#install-prompt'),
    selfieButton: section.querySelector('#selfie-button'),
    selfieImg: section.querySelector('#selfie-img'),
    selfiePlaceholder: section.querySelector('#selfie-placeholder'),
    selfieSub: section.querySelector('#selfie-sub'),
    selfieInput: section.querySelector('#selfie-input'),
    nameInput: section.querySelector('#name-input'),
    searchPill: section.querySelector('#search-pill'),
    searchInput: section.querySelector('#search-input'),
    searchClear: section.querySelector('#search-clear'),
    chips: section.querySelector('#chips'),
    locationBody: section.querySelector('#location-body'),
    addLocation: section.querySelector('#add-location'),
    checkin: section.querySelector('#checkin-button'),
    historyToggle: section.querySelector('#history-toggle'),
    historyChevron: section.querySelector('#history-chevron'),
    historyCount: section.querySelector('#history-count'),
    historyBody: section.querySelector('#history-body'),
  }

  refs.nameInput.value = Profile.name
  updateSelfie(refs)

  // Onboarding card: expandable like History, dismissed for good by its button.
  let installOpen = installHintOpen()
  const renderInstall = () => {
    refs.installToggle.setAttribute('aria-expanded', String(installOpen))
    refs.installChevron.innerHTML = icon(installOpen ? 'chevron-up' : 'chevron-down', 13, { strokeWidth: 2.4 })
    refs.installBody.hidden = !installOpen
  }
  if (refs.installToggle) {
    refs.installToggle.addEventListener('click', () => {
      installOpen = !installOpen
      setInstallHintOpen(installOpen)
      renderInstall()
    })
    refs.installDismiss.addEventListener('click', () => {
      dismissInstallHint()
      section.querySelector('#install-card')?.remove()
    })
    if (refs.installPrompt) {
      const syncPrompt = () => {
        refs.installPrompt.hidden = !canPromptInstall()
      }
      syncPrompt()
      onInstallPromptChange(syncPrompt)
      refs.installPrompt.addEventListener('click', async () => {
        if (await promptInstall()) section.querySelector('#install-card')?.remove()
      })
    }
  }

  const renderChips = () => {
    refs.chips.replaceChildren()
    for (const category of ALL) {
      const selected = state.categoryFilter === category
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `chip${selected ? ' is-selected' : ''}`
      button.setAttribute('aria-pressed', String(selected))
      button.innerHTML = `${icon(categoryIcon(category), 10.5, { strokeWidth: 2.2 })}<span>${category}</span>`
      button.addEventListener('click', () => {
        state.categoryFilter = selected ? null : category
        state.searchFocused = false
        renderChips()
        renderBody()
        updateClear(refs)
      })
      refs.chips.append(button)
    }
  }

  const renderBody = () => {
    const showResults = state.searchFocused || state.query !== '' || state.categoryFilter !== null
    if (showResults) renderResults(refs, renderAll)
    else renderSelected(refs)
  }

  const renderAll = () => {
    renderChips()
    renderBody()
    updateClear(refs)
    renderHistory(refs)
  }

  refs.selfieButton.addEventListener('click', () => refs.selfieInput.click())
  refs.selfieInput.addEventListener('change', async () => {
    const file = refs.selfieInput.files?.[0]
    refs.selfieInput.value = ''
    if (!file) return
    try {
      await processImageFile(file)
      updateSelfie(refs)
    } catch (error) {
      console.warn('Could not save selfie:', error)
      refs.selfieSub.textContent = 'Photo unreadable — please choose again'
      setTimeout(() => updateSelfie(refs), 2600)
    }
  })

  // iOS fires `change` after autofill/dictation without a per-keystroke `input`,
  // so save on every event that can carry the final value.
  const saveName = () => {
    if (Profile.name !== refs.nameInput.value) Profile.name = refs.nameInput.value
  }
  refs.nameInput.addEventListener('input', saveName)
  refs.nameInput.addEventListener('change', saveName)
  refs.nameInput.addEventListener('blur', saveName)

  // A home-screen app can be killed from the switcher without `unload`:
  // flush whatever is on screen while the page is still alive — but never let a
  // stale/empty field wipe a stored name.
  const flush = () => {
    if (refs.nameInput.value.trim() !== '') saveName()
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })

  refs.searchInput.addEventListener('focus', () => {
    state.searchFocused = true
    renderBody()
  })
  refs.searchInput.addEventListener('input', () => {
    state.query = refs.searchInput.value
    state.searchFocused = true
    updateClear(refs)
    renderBody()
  })
  refs.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      state.query = ''
      state.categoryFilter = null
      state.searchFocused = false
      refs.searchInput.value = ''
      refs.searchInput.blur()
      renderAll()
    }
  })
  refs.searchClear.addEventListener('click', () => {
    state.query = ''
    state.categoryFilter = null
    state.searchFocused = false
    refs.searchInput.value = ''
    refs.searchInput.blur()
    renderAll()
  })

  refs.addLocation.addEventListener('click', () => {
    openAddLocationDialog((name, category) => {
      const studio = studioStore.add(name, category)
      if (!studio) return
      selectStudio(studio)
      state.query = ''
      state.searchFocused = false
      refs.searchInput.value = ''
      renderAll()
    })
  })

  refs.checkin.addEventListener('click', () => {
    Profile.timestamp = Date.now()
    historyStore.add(Profile.location || 'WellPass Studio', normalize(Profile.category), Profile.timestamp)
    ;(navigate ?? navigateTo)('/app/checkin')
  })

  refs.historyToggle.addEventListener('click', () => {
    state.showHistory = !state.showHistory
    renderHistory(refs)
  })

  restoreLastLocation()
  const demo = params().get('demo')
  if (demo === 'search') {
    state.query = 'fitness first'
    state.categoryFilter = 'Fitness'
    state.searchFocused = true
    refs.searchInput.value = state.query
  } else if (demo === 'history') {
    state.showHistory = true
  }

  renderAll()

  setTimeout(() => {
    if (demo === 'search') refs.searchInput.focus()
  }, 0)

  if (params().get('debug') === '1') addDebugPanel(section)
}

function navigateTo(url) {
  history.pushState({ pwa: true }, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

// Category → icon token lives in categories.js so Home, the dialog and Check-in agree.
const categoryIcon = symbol

function updateSelfie(refs) {
  const selfie = loadSelfie()
  if (selfie) {
    refs.selfieImg.src = selfie
    refs.selfieImg.hidden = false
    refs.selfiePlaceholder.hidden = true
    refs.selfieSub.textContent = 'Change photo'
  } else {
    refs.selfieImg.removeAttribute('src')
    refs.selfieImg.hidden = true
    refs.selfiePlaceholder.hidden = false
    refs.selfieSub.textContent = 'Choose photo'
  }
}

function updateClear(refs) {
  refs.searchClear.hidden = state.query === '' && state.categoryFilter === null
}

function selectStudio(studio) {
  Profile.locationID = studio.id
  Profile.location = studio.name
  Profile.category = studio.normalizedCategory()
}

function renderResults(refs, onChange) {
  const results = studioStore.matching(state.query, state.categoryFilter).slice(0, 40)
  const list = document.createElement('div')
  list.className = 'results'

  if (results.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'results-empty'
    empty.textContent = 'Nothing found — tap “New” to add it.'
    list.append(empty)
  } else {
    for (const studio of results) {
      list.append(studioRow(studio, refs, onChange))
    }
  }
  refs.locationBody.replaceChildren(list)
}

function studioRow(studio, refs, onChange) {
  const selected = Profile.locationID === studio.id
  const row = document.createElement('button')
  row.type = 'button'
  row.className = 'studio-row'
  row.dataset.studioId = studio.id
  row.innerHTML = `
    <span class="studio-icon">${icon(categoryIcon(studio.normalizedCategory()), 14, { strokeWidth: 2.2 })}</span>
    <span class="studio-copy">
      <span class="studio-name"></span>
      <span class="studio-category"></span>
    </span>
    <span class="studio-check${selected ? '' : ' is-hidden'}">${icon('check-circle', 15, { strokeWidth: 2 })}</span>`
  row.querySelector('.studio-name').textContent = studio.name
  row.querySelector('.studio-category').textContent = studio.normalizedCategory()

  const deleteStudio = () => {
    studioStore.delete(studio)
    clearLocationIfSelected(studio)
    onChange()
  }

  let pressTimer = null
  let longPressed = false

  const attachDeleteGesture = (wrapper, deleteButton) => {
    let start = null
    let dragging = false
    let dx = 0
    let open = false
    let suppressClick = false

    const setOpen = (next) => {
      open = next
      wrapper.classList.toggle('is-open', open)
      row.style.transition = ''
      row.style.transform = open ? 'translateX(-88px)' : ''
      deleteButton.tabIndex = open ? 0 : -1
    }
    const cancelPress = () => {
      clearTimeout(pressTimer)
      pressTimer = null
    }
    const settle = () => {
      cancelPress()
      if (!dragging) {
        start = null
        return
      }
      const travel = dx
      start = null
      dragging = false
      if (travel <= -132) {
        deleteStudio()
        return
      }
      setOpen(travel <= -44)
      suppressClick = true
      setTimeout(() => (suppressClick = false), 250)
    }

    row.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      longPressed = false
      suppressClick = false
      start = { x: event.clientX, y: event.clientY }
      dragging = false
      dx = open ? -88 : 0
      cancelPress()
      pressTimer = setTimeout(async () => {
        if (dragging) return
        longPressed = true
        if (await confirmDialog(`Delete “${studio.name}”?`, 'Delete')) deleteStudio()
      }, 550)
    })

    row.addEventListener('pointermove', (event) => {
      if (!start) return
      const moveX = event.clientX - start.x
      const moveY = event.clientY - start.y
      if (!dragging) {
        if (Math.abs(moveX) < 8 || Math.abs(moveX) <= Math.abs(moveY)) return
        dragging = true
        cancelPress()
        row.setPointerCapture?.(event.pointerId)
      }
      event.preventDefault()
      dx = Math.max(-140, Math.min(0, (open ? -88 : 0) + moveX))
      row.style.transition = 'none'
      row.style.transform = `translateX(${dx}px)`
    })

    for (const eventName of ['pointerup', 'pointercancel']) row.addEventListener(eventName, settle)
    row.addEventListener('pointerleave', () => {
      if (!dragging) cancelPress()
    })
    row.addEventListener('contextmenu', async (event) => {
      event.preventDefault()
      if (await confirmDialog(`Delete “${studio.name}”?`, 'Delete')) deleteStudio()
    })
    deleteButton.addEventListener('click', deleteStudio)

    row.addEventListener('click', (event) => {
      if (suppressClick) {
        event.preventDefault()
        suppressClick = false
        return
      }
      if (longPressed) {
        event.preventDefault()
        longPressed = false
        return
      }
      if (open) {
        event.preventDefault()
        setOpen(false)
        return
      }
      selectStudio(studio)
      state.query = ''
      state.searchFocused = false
      refs.searchInput.value = ''
      onChange()
    })
  }

  if (studio.isCustom) {
    const wrapper = document.createElement('div')
    wrapper.className = 'studio-swipe'
    const deleteButton = document.createElement('button')
    deleteButton.type = 'button'
    deleteButton.className = 'studio-delete'
    deleteButton.textContent = 'Delete'
    deleteButton.tabIndex = -1
    deleteButton.setAttribute('aria-label', `Delete “${studio.name}”`)
    wrapper.append(deleteButton, row)
    attachDeleteGesture(wrapper, deleteButton)
    return wrapper
  }

  row.addEventListener('click', () => {
    selectStudio(studio)
    state.query = ''
    state.searchFocused = false
    refs.searchInput.value = ''
    onChange()
  })
  return row
}

function renderSelected(refs) {
  const studio = studioStore.studio(Profile.locationID)
  if (studio) {
    const card = document.createElement('div')
    card.className = 'selected-card'
    card.innerHTML = `
      <span class="studio-icon">${icon(categoryIcon(studio.normalizedCategory()), 15, { strokeWidth: 2.2 })}</span>
      <span class="studio-copy">
        <span class="selected-name"></span>
        <span class="studio-category"></span>
      </span>
      <span class="studio-check">${icon('check-circle', 17, { strokeWidth: 2 })}</span>`
    card.querySelector('.selected-name').textContent = studio.name
    card.querySelector('.studio-category').textContent = studio.normalizedCategory()
    const href = mapsUrl(studio)
    if (href) {
      const link = document.createElement('a')
      link.className = 'maps-link'
      link.href = href
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.setAttribute('aria-label', `Open ${studio.name} in Maps`)
      link.innerHTML = `${icon('map-pin', 14, { strokeWidth: 2.2 })}<span>Maps</span>`
      card.querySelector('.studio-check').before(link)
    }
    refs.locationBody.replaceChildren(card)
    return
  }

  const empty = document.createElement('button')
  empty.type = 'button'
  empty.className = 'location-empty'
  empty.textContent = 'Select a studio — search above or add one'
  empty.addEventListener('click', () => refs.searchInput.focus())
  refs.locationBody.replaceChildren(empty)
}

function renderHistory(refs) {
  refs.historyToggle.setAttribute('aria-expanded', String(state.showHistory))
  refs.historyChevron.innerHTML = icon(state.showHistory ? 'chevron-up' : 'chevron-down', 13, { strokeWidth: 2.4 })
  refs.historyCount.hidden = historyStore.records.length === 0
  refs.historyCount.textContent = String(historyStore.records.length)
  refs.historyBody.hidden = !state.showHistory
  if (!state.showHistory) {
    refs.historyBody.replaceChildren()
    return
  }

  const nodes = []
  if (historyStore.records.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'history-empty'
    empty.textContent = 'No check-ins yet.'
    nodes.push(empty)
  } else {
    for (const record of historyStore.records) {
      const row = document.createElement('div')
      row.className = 'history-row'
      row.innerHTML = `
        <span class="history-icon">${icon(categoryIcon(normalize(record.category)), 13, { strokeWidth: 2.2 })}</span>
        <span class="history-copy">
          <span class="history-studio"></span>
          <span class="history-date"></span>
        </span>
        <span class="history-category"></span>`
      row.querySelector('.history-studio').textContent = record.studio
      row.querySelector('.history-date').textContent = formatTimestamp(record.date)
      row.querySelector('.history-category').textContent = normalize(record.category)
      nodes.push(row)
    }
    const divider = document.createElement('div')
    divider.className = 'history-divider'
    nodes.push(divider)

    const clear = document.createElement('button')
    clear.type = 'button'
    clear.className = 'history-clear'
    clear.textContent = 'Clear history'
    clear.addEventListener('click', async () => {
      if (!(await confirmDialog('Delete the entire history?', 'Clear history'))) return
      historyStore.clear()
      renderHistory(refs)
    })
    nodes.push(clear)
  }
  refs.historyBody.replaceChildren(...nodes)
}

function confirmDialog(message, confirmLabel) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.className = 'confirm-dialog'
    dialog.innerHTML = `
      <p class="confirm-message"></p>
      <div class="confirm-actions">
        <button type="button" class="confirm-cancel">Cancel</button>
        <button type="button" class="confirm-ok">${confirmLabel}</button>
      </div>`
    dialog.querySelector('.confirm-message').textContent = message
    const close = (result) => {
      dialog.close()
      dialog.remove()
      resolve(result)
    }
    dialog.querySelector('.confirm-cancel').addEventListener('click', () => close(false))
    dialog.querySelector('.confirm-ok').addEventListener('click', () => close(true))
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      close(false)
    })
    document.body.append(dialog)
    dialog.showModal()
  })
}

function addDebugPanel(section) {
  const panel = document.createElement('details')
  panel.className = 'debug-panel'
  panel.innerHTML = `
    <summary>Debug: Export / Import</summary>
    <div class="debug-actions">
      <button type="button" class="debug-button" id="export-json">Export JSON</button>
      <label class="debug-button">Import JSON<input id="import-json" type="file" accept="application/json" hidden /></label>
    </div>
    <pre class="debug-status" id="debug-status"></pre>`
  section.querySelector('.home-scroll').append(panel)
  const status = panel.querySelector('#debug-status')

  const storage = storageStatus()
  status.textContent = storage.available
    ? `Storage: ok · ${storage.keys.length} entries · ${(storage.bytes / 1024).toFixed(0)} kB
${storage.keys.map((entry) => `  ${entry.key}: ${(entry.bytes / 1024).toFixed(1)} kB`).join('\n')}`
    : `Storage NOT available (${storage.error}) — data will not survive closing the app.\nTurn off private mode or "Block All Cookies".`

  // Which cache version the device is running — the quickest way to tell a stale
  // home-screen install from a real regression.
  status.textContent += `\nHome-screen app: ${isStandalone() ? 'yes' : 'no'} · Device: ${platform()}`

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        const worker = registration?.active
        status.textContent += `\nService worker: ${worker ? worker.state : registration ? 'installing' : 'none'}`
      })
      .catch(() => {})
  }

  if ('caches' in window) {
    caches
      .keys()
      .then((keys) => {
        status.textContent += `\nCaches: ${keys.join(', ') || '—'}`
      })
      .catch(() => {})
  }

  panel.querySelector('#export-json').addEventListener('click', () => {
    const dump = {}
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key?.startsWith('poc.')) dump[key] = localStorage.getItem(key)
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'wellpass-state.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    status.textContent = `Exported: ${Object.keys(dump).length} entries`
  })

  panel.querySelector('#import-json').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      let count = 0
      for (const [key, value] of Object.entries(data)) {
        if (!key.startsWith('poc.') || typeof value !== 'string') continue
        localStorage.setItem(key, value)
        count++
      }
      status.textContent = `Imported: ${count} entries — reloading …`
      setTimeout(() => location.reload(), 600)
    } catch (error) {
      status.textContent = `Import failed: ${error.message}`
    }
  })
}

export function unmount() {
  state = null
}

// "Add to home screen" onboarding — shown on iPhone/iPad and Android until the app runs from the
// icon. Deliberately free of jargon: no PWA, no browser-menu wording beyond the labels
// the phone actually shows.
import { platform } from './transition.js'
import { readString, writeString } from './stores.js'

const KEY = 'poc.installHint'
const OPEN_KEY = 'poc.installHintOpen'

/** True when the page runs as an installed app (own window, no address bar). */
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches === true || navigator.standalone === true
}

export function installHintDismissed() {
  try {
    return localStorage.getItem(KEY) != null
  } catch {
    return false
  }
}

export function dismissInstallHint() {
  writeString(KEY, new Date().toISOString())
}

/**
 * iPhone/iPad and Android, only while it is not installed yet and the page is served from a
 * secure origin (installing is impossible from file://). `?install=1` forces the card
 * (screenshots, support), `?install=0` suppresses it.
 */
export function shouldShowInstallHint(search = location.search) {
  const flag = new URLSearchParams(search).get('install')
  if (flag === '0') return false
  if (flag === '1') return true
  const kind = platform()
  if (kind !== 'ios' && kind !== 'android') return false
  return window.isSecureContext === true && !isStandalone() && !installHintDismissed()
}

/** Disclosure state of the card: open on first visit, then whatever the user chose. */
export function installHintOpen() {
  return readString(OPEN_KEY) !== '0'
}

export function setInstallHintOpen(open) {
  writeString(OPEN_KEY, open ? '1' : '0')
}

// Android/Chrome: keep the browser's own install prompt so the card can offer a real button.
let deferredPrompt = null
const listeners = new Set()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event
    listeners.forEach((listener) => listener())
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    dismissInstallHint()
    listeners.forEach((listener) => listener())
  })
}

export function canPromptInstall() {
  return deferredPrompt != null
}

/** Calls `listener` whenever the prompt becomes (un)available; returns an unsubscribe function. */
export function onInstallPromptChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Shows the native install dialog. Resolves to true when the user accepted. */
export async function promptInstall() {
  const prompt = deferredPrompt
  if (!prompt) return false
  deferredPrompt = null
  prompt.prompt()
  const choice = await prompt.userChoice.catch(() => null)
  listeners.forEach((listener) => listener())
  return choice?.outcome === 'accepted'
}

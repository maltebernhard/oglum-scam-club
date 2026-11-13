// pushState router with one popstate listener, one layer per screen, and native-feeling
// transitions (see transition.js). The outgoing layer stays in the DOM until its
// animation settles so the push/pop can slide both screens at once.
import * as home from './views/home.js'
import * as checkin from './views/checkin.js'
import { platform, runScreenTransition } from './transition.js'

const ROUTES = [
  { pattern: /^\/app\/?$/, view: home, name: 'home' },
  { pattern: /^\/app\/checkin\/?$/, view: checkin, name: 'checkin' },
]

// The single-file build (`npm run build:single`) is opened from file:// and has no
// server, so it keeps the same routes in the hash instead of the path.
const SINGLE_FILE = typeof window !== 'undefined' && window.__WELLPASS_SINGLE_FILE__ === true

let stage = null
let current = null
let currentLayer = null
let currentDepth = 0

function currentPath() {
  if (!SINGLE_FILE) return location.pathname
  const hash = location.hash.replace(/^#/, '')
  return hash.startsWith('/app') ? hash : '/app/'
}

function matchRoute(pathname) {
  return ROUTES.find((route) => route.pattern.test(pathname)) ?? ROUTES[0]
}

function render() {
  const route = matchRoute(currentPath())
  const depth = ROUTES.indexOf(route)
  const direction = depth === currentDepth ? 'cross' : depth > currentDepth ? 'forward' : 'back'
  const outgoing = currentLayer

  current?.view.unmount?.()
  current = route
  currentDepth = depth

  const layer = document.createElement('div')
  layer.className = 'screen-layer'
  layer.dataset.route = route.name
  stage.append(layer)
  currentLayer = layer
  route.view.mount(layer, { navigate })

  if (!outgoing) return

  // A push starts at the top of the new screen, like every native navigation stack.
  if (direction === 'forward') window.scrollTo(0, 0)
  outgoing.classList.add('is-outgoing')

  runScreenTransition({ outgoing, incoming: layer, direction }).finally(() => {
    outgoing.remove()
  })
}

export function navigate(url, { replace = false } = {}) {
  const target = SINGLE_FILE ? `#${url}` : url
  if (replace) history.replaceState({ pwa: true }, '', target)
  else history.pushState({ pwa: true }, '', target)
  render()
}

export function start(root) {
  stage = document.createElement('div')
  stage.className = 'screen-stage'
  root.replaceChildren(stage)
  // Lets CSS and the verify harness know which transition flavour is active.
  document.documentElement.dataset.platform = platform()
  window.addEventListener('popstate', render)
  render()
}

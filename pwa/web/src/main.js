import { start } from './router.js'
import { runSelfTest, isSelfTestRequested, shouldKeepSelfTestHistory } from './selftest.js'

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing')

start(root)

if (isSelfTestRequested()) {
  runSelfTest({ keep: shouldKeepSelfTestHistory() }).catch((error) => console.error('Self-test failed:', error))
}

// Offline cache. Needs HTTPS (or localhost) and a sw.js next to the page; a lone .html still works online.
// Modules run from Blob URLs, so the worker URL must be resolved against the page, not the module.
if ('serviceWorker' in navigator) {
  if (window.isSecureContext && /^https?:$/.test(location.protocol)) {
    const register = () => {
      const scriptURL = new URL('sw.js', document.baseURI).href
      const scope = new URL('./', document.baseURI).href
      navigator.serviceWorker.register(scriptURL, { scope }).catch((error) => {
        console.info('Offline cache not available (no sw.js next to this page?):', error?.message ?? error)
      })
    }
    // This module is imported after the page's own scripts, so `load` may already have fired.
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register)
  } else {
    console.info('Offline cache disabled: service workers need HTTPS or localhost.')
  }
}

// Assemble web/ into the single-file wellpass.html and the hosting-ready dist/ folder.
// Usage: node pwa/tools/build.mjs [--check]   (--check: fail if wellpass.html is not up to date, write nothing)
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const web = path.join(root, 'web')

// Same order as the original JSON object; the loader resolves imports, so order is cosmetic.
const MODULES = [
  'main.js',
  'router.js',
  'transition.js',
  'install.js',
  'categories.js',
  'icons.js',
  'format.js',
  'seed.js',
  'stores.js',
  'selfie.js',
  'selftest.js',
  'checkin-backdrop.js',
  'views/home.js',
  'views/checkin.js',
  'views/add-location.js',
].filter((name) => fs.existsSync(path.join(web, 'src', name)))

const dataUri = (file) => `data:image/png;base64,${fs.readFileSync(path.join(web, 'icons', file)).toString('base64')}`

export function buildHtml({ manifest = false } = {}) {
  const modules = {}
  for (const name of MODULES) modules[name] = fs.readFileSync(path.join(web, 'src', name), 'utf8')
  // The original file escapes "</" so the JSON can never close its <script> tag.
  const json = JSON.stringify(modules).replace(/<\//g, '<\\/')
  const icons = `<link rel="icon" type="image/png" href="${dataUri('favicon-64.png')}" />\n    <link rel="apple-touch-icon" href="${dataUri('apple-touch-icon.png')}" />`
  const shell = fs.readFileSync(path.join(web, 'shell.html'), 'utf8')
  const style = fs.readFileSync(path.join(web, 'style.css'), 'utf8')
  return shell
    .replace('@@ICONS@@', () => icons)
    .replace('@@MANIFEST@@', () => (manifest ? '<link rel="manifest" href="manifest.webmanifest" />' : ''))
    .replace('@@STYLE@@', () => style)
    .replace('@@MODULES@@', () => json)
}

function buildDist(distHtml) {
  const dist = path.join(root, 'dist')
  fs.rmSync(dist, { recursive: true, force: true })
  fs.mkdirSync(path.join(dist, 'icons'), { recursive: true })
  const version = crypto.createHash('sha256').update(distHtml).digest('hex').slice(0, 10)
  fs.writeFileSync(path.join(dist, 'index.html'), distHtml)
  fs.copyFileSync(path.join(web, 'manifest.webmanifest'), path.join(dist, 'manifest.webmanifest'))
  fs.writeFileSync(path.join(dist, 'sw.js'), fs.readFileSync(path.join(web, 'sw.js'), 'utf8').replace('@@VERSION@@', version))
  for (const file of fs.readdirSync(path.join(web, 'icons'))) {
    if (file !== 'favicon-64.png') fs.copyFileSync(path.join(web, 'icons', file), path.join(dist, 'icons', file))
  }
  return version
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const single = buildHtml()
  const target = path.join(root, 'wellpass.html')
  if (process.argv.includes('--check')) {
    const same = fs.readFileSync(target, 'utf8') === single
    console.log(same ? 'wellpass.html is up to date' : 'wellpass.html is OUTDATED — run node pwa/tools/build.mjs')
    process.exit(same ? 0 : 1)
  }
  fs.writeFileSync(target, single)
  const version = buildDist(buildHtml({ manifest: true }))
  console.log(`wrote wellpass.html (${(single.length / 1024).toFixed(1)} KB) and dist/ (cache osc-${version})`)
}

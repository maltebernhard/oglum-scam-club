# OSC PWA

This repository contains the standalone browser app for the Oglum Scam Club
check-in experience. It is an installable progressive web app (PWA) and a
single-file HTML app.

## What is included

- `web/` - editable HTML, CSS, JavaScript, manifest, service worker, and icons
- `data/locations.json` - source location data
- `assets/oscLogo.png` - source image for generated PWA icons
- `tools/` - data, icon, and build generators
- `wellpass.html` - standalone build that works from disk or an HTTPS host
- `dist/` - hosting build containing the manifest, service worker, and icons
- `docs/wellpass-html.md` - detailed architecture and requirements

Edit files in `web/`, `data/`, or `assets/`; do not edit `wellpass.html` or
`dist/` by hand.

## Requirements

- Node.js 20 or newer
- Python 3 with Pillow, only when regenerating icons

## Build

Regenerate the location seed after changing the location data:

```bash
node tools/gen-seed.mjs
```

Remove unused metadata from the location source:

```bash
node tools/minify-locations.mjs
```

The reducer keeps only `name`, `studioType`, `address.city`, and available
latitude/longitude values. It rewrites `data/locations.json` unless an
alternative output path is supplied.

Regenerate icons after changing `assets/oscLogo.png`:

```bash
python tools/gen-icons.py
```

Build both deliverables:

```bash
node tools/build.mjs
```

The build writes:

- `wellpass.html` - a self-contained single-file app; `dist/index.html` is the identical file
- `dist/` - the PWA deployment directory (adds `sw.js` for offline use, plus manifest and icons)

Both HTML files are fully standalone: the icons are embedded and the web app
manifest is generated at runtime from the page's own URL. Uploading only
`index.html` to any HTTPS host is enough to install it from the browser; the
service worker (offline use) is only active when `sw.js` is hosted next to it.

Check whether the single-file build is current without writing files:

```bash
node tools/build.mjs --check
```

## Test locally

The single file can be opened directly, but service workers and PWA
installation require an HTTP(S) origin. Serve the full PWA build locally:

```bash
python -m http.server 8123 --directory dist
```

Open <http://localhost:8123/> and verify the app, manifest, icons, service
worker, offline reload, and install prompt.

## GitHub Pages hosting

GitHub Pages should publish the contents of `dist/`, not the repository root.
The recommended setup is a GitHub Actions workflow that:

1. Checks out the repository.
2. Runs `node tools/gen-seed.mjs` if generated data is not committed.
3. Runs `node tools/build.mjs`.
4. Uploads `dist/` as the Pages artifact.
5. Deploys that artifact with the official Pages deployment action.

In the repository settings, configure **Pages → Source** as **GitHub Actions**.
The generated site then has a stable HTTPS origin, which is required for the
service worker and Android installation. Relative manifest and service-worker
URLs allow deployment under a project URL such as
`https://<user>.github.io/<repository>/`.

Before making the repository public, check:

- `dist/index.html` is the intended public entry point.
- No secrets, private location data, or development files are included.
- The Pages URL and project base path work when opening, refreshing, and
  installing the app.
- The service worker scope is limited to this Pages project path.
- The repository's license and public visibility are intentional.

GitHub Pages is public for a public repository. Do not use it for private
content or as an access-controlled deployment.

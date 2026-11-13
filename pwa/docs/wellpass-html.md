# `wellpass.html` – architecture, requirements and implementation plan

Status: **implemented** (phases 0–4; hosting still open, see §8). Last updated 2026‑11‑11. What differs from the original plan is listed in §9.

Scope: the browser/PWA version of the WellPass check‑in screen ([`wellpass.html`](../wellpass.html)). USC mode and video are out of scope.

Guiding rule: **change the existing HTML app as little as possible.** Home screen, stores, router, transitions, selfie pipeline, history, custom locations, self‑test and debug panel keep their structure. Only the items in §3 change.

---

## 1. Existing architecture (as found)

### 1.1 Packaging

`wellpass.html` is one self‑contained 151 KB file (1,418 lines, no external requests):

| Lines | Content |
|---|---|
| 1–14 | `<head>`: meta tags, inline favicon and `apple-touch-icon` (base64 PNG) |
| 15–1378 | one `<style>` block: design tokens, home, dialogs, check‑in |
| 1383 | `<script type="application/json" id="wp-modules">`: **14 ES modules stored as JSON strings** (about 89 KB on one line) |
| 1384–1415 | bootstrap script: turns each module into a `Blob` URL, rewrites `from './x.js'` imports to those URLs, then `import()`s `main.js` |

The bootstrap sets `window.__WELLPASS_SINGLE_FILE__ = true`, so routes live in the hash (`#/app/`, `#/app/checkin`) and the file works from `file://`.

The original source tree (the comments mention `ios/…/Theme.swift` and `npm run build:single`) is **not in this repo**. The JSON line is not practical to edit by hand, which drives decision D1 (§5).

### 1.2 Modules

| Module | Responsibility |
|---|---|
| `main.js` | starts router; `?selftest`; registers `/app/sw.js` (scope `/app/`) only in secure contexts. **No `sw.js` exists**, so registration fails silently. |
| `router.js` | pushState/hash router, one layer per screen, 2 routes (`home`, `checkin`) |
| `transition.js` | platform detection; iOS push (420 ms), Android shared‑axis (300 ms), desktop fade (200 ms); honours reduced motion |
| `install.js` | iOS “Add to Home Screen” hint card: show conditions, dismissed/open state in localStorage |
| `categories.js` | 15 German category labels (chip order), `normalize()`, `fold()` (diacritic‑insensitive), icon token per category |
| `icons.js` | inline SVG icon set (`icon(name, size, opts)`) |
| `format.js` | `formatTimestamp` → `dd.MM.yy - HH:mm`; `initialsFor` |
| `seed.js` | 337 built‑in studios as tuples `[name, category, city]` (Berlin 246, Düsseldorf 50, Köln 41); ids via `makeID(name)` slug |
| `stores.js` | guarded localStorage + in‑memory fallback; `StudioStore` (seed + custom, search, add, delete); `HistoryStore` (max 50); `Profile` (name, location, locationID, category, timestamp) |
| `selfie.js` | image file → downscaled JPEG data URL (max edge 1024, q 0.85), stored in localStorage |
| `selftest.js` | `?selftest=on` assertions (seed count 337, search, add/delete, history, selfie) |
| `views/home.js` | selfie card, name, location card (search pill, category chips, results list with swipe/long‑press delete for custom, selected card), Check‑In button, history card, install hint, debug panel (`?debug=1`) |
| `views/add-location.js` | “add location” `<dialog>` with name + category radio list |
| `views/checkin.js` | check‑in screen (DOM below) |

### 1.3 Data and flags

localStorage keys: `poc.name`, `poc.location`, `poc.locationID`, `poc.category`, `poc.timestamp`, `poc.studios.custom`, `poc.history`, `poc.selfie`, `poc.installHint`, `poc.installHintOpen`, `poc.selftest.result`.
Query flags: `?selftest=on` (+`keep=on`), `?install=0|1`, `?chrome=0`, `?demo=search|history`, `?debug=1`.

Flow: Home → select studio (`Profile.*`) → **Check‑In** adds a history record and navigates to `#/app/checkin` → the check‑in view reads `Profile.snapshot()`. `Profile.timestamp` is never written, so the shown time is the time the check‑in view is mounted (effectively the tap time).

### 1.4 Current check‑in screen (what is being replaced)

Everything is built from elements; **no background image is embedded**:

* `<svg class="checkin-stripe" viewBox="0 0 390 844" preserveAspectRatio="none">`: one cubic path, 100‑unit stroke, `#2e7882`. The aspect ratio is forced, so it distorts on non‑390:844 screens.
* `.checkin-card`: glass card (`backdrop-filter: blur(10px)…`), margins about 3 %.
* Text sized with `--k = min(100vw, 430px) / 390`: header, German headline, selfie disc 200·k, name 26·k, meta 16·k, footer wordmarks.
* One ease‑out pulse, 0.675 s loop, `#7ca18d`.

### 1.5 Reference check‑in artwork

The reference artwork is stretched to the **screen height** (width = height × 2160/3840, centred; may overflow or underflow the screen width). Only the dynamic parts are drawn on top. Everything is scaled by `frameHeight / 3840`, so positions and sizes are **fractions of the screen height H**.

| Element | `top` | size | Style |
|---|---|---|---|
| Avatar disc | 0.3294 H | diameter 0.2305 H | centred on screen width; circle, `#0f172a` background, image `cover`, fallback text `:)` |
| Pulse disc | same as avatar | same | `#20755e`, behind avatar, `pointerEvents: none` |
| Name | 0.5800 H | font 0.032 H | `#000`, weight 600, letter‑spacing −0.5 px, centred over full screen width |
| Location | 0.6350 H | font 0.018 H | `#4b5563`, weight 600, letter‑spacing 0.2 px, centred |
| Activity | 0.6700 H | font 0.018 H | same as location |
| Check‑in date/time | 0.7050 H | font 0.018 H | same; text `MM/DD/YY, hh:mm AM/PM` |

`top` is the top of the text box. The HTML keeps its existing system font stack.

Pulse timing (`PULSE_CYCLE_MS = 400 + 400 + 800 = 1,600 ms`, linear, looping while the screen is open). Interpolation breakpoints are 0, 25 %, 25 %, 50 %, 50 %, 100 %:

| Phase | 0 → 25 % (0–400 ms) | 25 % jump | 25 → 50 % (400–800 ms) | 50 % jump | 50 → 100 % (800–1600 ms) |
|---|---|---|---|---|---|
| scale | 1 → S | → 1 | 1 → S | → 1 | 1 (hidden behind avatar) |
| opacity | 0.5 → 0 | → 1 | 1 → 0 | → 0.5 | 0.5 |

`S = (avatarSize + 0.1 × frameWidth) / avatarSize`.

---

## 2. Reference measurements of `Wellpass_FINAL.png`

Measured on the 2160 × 3840 file (fractions of width **W** / height **H**). These are the targets for the element‑built background; they are re‑verified by overlay in §6.

| Item | Value |
|---|---|
| Page background | `#f3f3f3` |
| Card fill | `#fafafa`; edges at x 0.122 W – 0.886 W, y 0.113 H – 0.874 H; corner radius about 0.049 W (≈ 106 px) |
| Card shadow | right/left: `#e4e4e4` at the edge → `#f2f2f2` after ≈ 0.03 W; bottom: `#c3c3c3` at the edge → `#f2f2f2` after ≈ 0.025 H (offset downwards) |
| Teal band | `#337b89`; darkened to `#2d6e7a` where the card shadow falls on it |
| Band edges, left strip (x → upper y / lower y, in H) | 0 → 0.1167 / 0.2617 · 0.056 → 0.1344 / 0.2865 · 0.111 → 0.1539 / 0.3117 · 0.121 → 0.1576 / 0.3167 |
| Band edges, right strip | 0.886 → 0.7198 / 0.8982 · 0.926 → 0.7523 / 0.9081 · 0.972 → 0.7826 / 0.9169 · 1.0 → 0.7964 / 0.9219 |
| Band shape | S‑curve: upper‑edge slope ≈ 0.6 on the left and ≈ 1.2 on the right (px/px); lower edge ≈ 0.8 → ≈ 0.4. The path is fitted to these samples in phase 2. |
| Smear inside the card | the same band continued under the card, blurred and translucent: `#cbd4d7` at the card edge (≈ 24 % of `#337b89` over `#fafafa`) fading to `#fafafa` after ≈ 0.26 W horizontally |
| Back chevron | box x 0.159–0.181 W, y 0.076–0.098 H (centre 0.170 W, 0.087 H); black |
| “Check‑in” title | centre x 0.503 W; ascender height 0.013 H → font ≈ 0.0178 H; black, semibold |
| Headline “Session Validated” | x 0.216–0.789 W (centre 0.503 W); y 0.2505–0.2797 H; ascender height 0.029 H → font ≈ 0.037 H; colour `#094450`, semibold. Fit the font size so the text width ≈ 0.573 W. |
| Footer “E G Y M” | y 0.9161–0.9284 H, x 0.437–0.574 W; cap height 0.0122 H |
| Footer “W E L L P A S S” | y 0.9406–0.9594 H, x 0.343–0.667 W; cap height 0.0188 H; wide tracking |
| Grey placeholder disc | baked into the PNG; the avatar disc covers it |

---

## 3. Requirements

IDs are used by the plan (§5) and the test matrix (§6). “Must” items were agreed with the user in the feature discussion.

### 3.1 Check‑in screen

| ID | Requirement |
|---|---|
| CI‑1 | Layout units are fractions of the viewport height **H** (`100dvh`) inside a **9:16 stage** of width `H × 9/16`, centred horizontally. Stage overflow is visible; the page background `#f3f3f3` shows outside it. This mirrors the reference artwork placement. |
| CI‑2 | Dynamic text and avatar use the **exact reference geometry** from §1.5 (tops, font sizes, avatar size), centred over the **viewport** width. Colours, weights and letter‑spacing as in §1.5. Font family stays the existing system stack. |
| CI‑3 | Row order: name, location, category (as “activity”), date/time. Location shows the name with a trailing city suffix removed (CI‑7). |
| CI‑4 | Date/time text uses `Intl` options (`en-US`, 2‑digit month/day/year, 2‑digit hour/minute, `hour12`), e.g. `11/11/26, 08:35 PM`. U+202F before AM/PM is replaced by a normal space. It is taken once when **Check‑In** is tapped and stored in `Profile.timestamp`. |
| CI‑5 | Headline text is **“Session Validated”**, colour `#094450`, positioned per §2. Header title “Check‑in”, back button (accessible label “Back”). |
| CI‑6 | **Pulse animation** follows the reference timing: linear, 1,600 ms cycle, `#20755e`, scale factor `S` computed in JS from the avatar size and `0.1 × min(viewport width, stage width)` and set as a CSS variable (recomputed on resize/orientation change). Implemented with CSS keyframes using the duplicate‑percentage trick (`24.999 %` / `25 %`, `49.999 %` / `50 %`) for the instant jumps. The disc is behind the avatar and non‑interactive. `prefers-reduced-motion` keeps the current behaviour (animation off). |
| CI‑7 | `displayName(studio)`: strip a trailing city from the location name (`/[\s,\-–]*<city>$/i`, using the studio’s own `city`), never producing an empty string. Applies on the check‑in screen only; lists and history keep full names. |
| CI‑8 | **Background built from elements** (the agreed choice): page colour, teal band (SVG, viewBox 2160 × 3840 matching §2), card with the shadow measured in §2, blurred translucent copy of the band clipped to the card (the “smear”). No `backdrop-filter` (unreliable and costly on iOS and Android). Band, card and smear live in one isolated module so they can be swapped (§7). |
| CI‑9 | Footer “E G Y M / W E L L P A S S” stays text, sized per §2, system font. |
| CI‑10 | If the selfie is missing, initials are shown as today. |
| CI‑11 | The old `.checkin-*` CSS and the `--k` scaling are removed; nothing else uses them. |

Reference pixel values for sanity checks (H = 844, W = 390): avatar top 278 px, diameter 194.5 px; name top 489.5 px, font 27.0 px; location top 536 px, font 15.2 px; activity 565.5 px; date/time 595 px. At H = 915 (Pixel 7a): avatar top 301 px / 211 px diameter, name font 29.3 px.

### 3.2 Locations and categories

| ID | Requirement |
|---|---|
| LOC‑1 | Built‑in list = **890** studios from `pwa/data/locations.json` (Berlin 730, Potsdam 41, 42 other Brandenburg towns 119) **plus** the **91** Köln (41) and Düsseldorf (50) studios from the current seed = **981**. The 2 old Berlin‑only entries are dropped (Berlin comes from the new data). |
| LOC‑2 | Only these fields are kept per studio: `name`, `category`, `city`, and for new entries `lat`, `lng` (5 decimals). All other fields in the JSON are discarded. The source JSON stays in `pwa/data/` and is **not** embedded. |
| LOC‑3 | Seed format becomes tuples `[name, category, city, lat, lng]` (`lat`/`lng` omitted for Köln/Düsseldorf), generated by a script (not hand‑edited). Expected size ≈ 75 KB. |
| LOC‑4 | Ids stay `makeID(name)`. The generator fails on id collisions (or suffixes them deterministically) so ids are stable and unique. Previously chosen studios keep working: unchanged names produce unchanged ids, and `restoreLastLocation()` already ignores unknown ids. |
| LOC‑5 | **English categories** (chip order): Fitness, Wellness, Outdoor, Yoga, Pilates, EMS, CrossFit, Martial Arts, Dance, Bouldering, Physio, Racket, Water Sports, Cycling, Other. |
| LOC‑6 | `studioType` mapping: GYM→Fitness (264) · YOGA_STUDIO→Yoga (183) · OUTDOOR→Outdoor (79) · SWIMMING_POOL + WATER_SPORT→Water Sports (61 + 16) · DANCE→Dance (56) · EMS_STUDIO→EMS (51) · MARTIAL_ARTS→Martial Arts (47) · WELLNESS→Wellness (43) · PILATES→Pilates (34) · RACKET→Racket (13) · BALL_SPORT + OTHERS + GOLF→Other (6 + 6 + 1) · CYCLING→Cycling (11) · PHYSIO→Physio (7) · CROSSFIT→CrossFit (6) · BOULDER_HALL→Bouldering (6). Counts are for the 890 new entries; Köln/Düsseldorf add their own. |
| LOC‑7 | **Legacy data migration:** `normalize()` accepts old German labels and old raw labels and maps them to the English set (`Fitnessstudio`→Fitness, `Kampfsport`→Martial Arts, `Tanz`→Dance, `Bouldern`→Bouldering, `Wassersport`→Water Sports, `Sonstiges`/empty→Other, plus case/diacritic folding). Applies to stored history, custom studios and `Profile.category`, so no stored data is lost. |
| LOC‑8 | Search matches name, category and city, diacritic‑insensitive (existing behaviour). |
| LOC‑9 | **“Open in Maps”**: small button on the selected‑location card (setup page). Opens `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` with `target="_blank" rel="noopener"`. Hidden when `lat`/`lng` are missing (custom, Köln, Düsseldorf). The 40‑result list and swipe/long‑press delete stay unchanged. |

### 3.3 Home screen and language

| ID | Requirement |
|---|---|
| UI‑1 | All user‑visible strings become English (`<html lang="en">`, meta description, home, dialogs, install card, errors, debug panel, check‑in “Back”). The task includes a sweep for German text (umlauts, `„ “`, known words) and a list of every changed string in the change description. |
| UI‑2 | `formatTimestamp` (history rows) uses the same format as CI‑4 so the app has one date format. |
| UI‑3 | Fallbacks if nothing is set: name “Oğlum McDoglum” and location “Holmes Place Potsdamer Platz”. The old fallbacks (“Lena Hoffmann”, “Fitnessstudio Köln”) are removed. |
| UI‑4 | Kept unchanged: custom locations (“New”), history (max 50), category chips, selfie capture and downscale, page transitions, `?selftest`, debug panel. |

### 3.4 PWA and installability

| ID | Requirement |
|---|---|
| PWA‑1 | Name “Oglum Scam Club”, short name “OSC”, icon from `assets/oscLogo.png` (white OSC on black, red fez). Generated: 192, 512, maskable 512 (logo inside the 80 % safe zone), apple‑touch 180; replaces the embedded favicon and touch icon. `theme_color` / `background_color`: `#000000`. |
| PWA‑2 | Deliverables (build output): **A.** `wellpass.html`, a single file that still works from disk and over any HTTPS host. **B.** `dist/` folder: `index.html` (same content), `manifest.webmanifest`, `sw.js`, `icons/`. |
| PWA‑3 | `manifest.webmanifest`: `display: standalone`, `orientation: portrait`, `start_url` and `scope` relative (`./`), `lang: en`, icons as in PWA‑1. |
| PWA‑4 | `sw.js`: precache `index.html`, manifest, icons; cache‑first for those, versioned cache name (`osc-v<build>`), old caches deleted on activate, `skipWaiting` + `clients.claim`. Registration changes from `/app/sw.js` (scope `/app/`) to the relative `./sw.js`, only on `http(s)`, and fails silently on `file://`. |
| PWA‑5 | In‑app install hint on **iPhone/iPad and Android**, while not installed (`display-mode: standalone` / `navigator.standalone`) and not dismissed: iOS shows the Share → Add to Home Screen steps; Android captures `beforeinstallprompt`, shows an **Install** button, and falls back to “⋮ → Install app / Add to Home screen” steps when no prompt is offered. Hidden when `!isSecureContext` (installing is impossible there), unless `?install=1`. |
| PWA‑6 | Mobile meta tags kept (`apple-mobile-web-app-capable`, `viewport-fit=cover`, status bar style, title). `apple-mobile-web-app-title` = “OSC” unless a longer label is chosen. |
| PWA‑7 | Debug panel shows the SW/cache state (extends the current cache listing). |

### 3.5 Non‑functional

* NF‑1 No new runtime dependencies; plain ES modules, no framework.
* NF‑2 `wellpass.html` size target below ≈ 260 KB (today 151 KB; the seed grows by ≈ 55 KB, the new check‑in CSS/SVG by ≈ 10 KB, the English strings are neutral).
* NF‑3 Smooth animation: only `transform` and `opacity` are animated.
* NF‑4 Works in Safari iOS 16.4+, Chrome/Samsung Internet on Android 10+, and desktop Chrome/Edge/Firefox.
* NF‑5 Existing localStorage keys (`poc.*`) are unchanged so existing installs keep their data.

---

## 4. Target architecture (what changes)

```
pwa/
  wellpass.html                ← build output (still the single‑file deliverable, no manifest link)
  dist/                        ← build output: index.html (+ manifest link), manifest.webmanifest, sw.js, icons/
  web/                         ← editable sources (extracted 1:1 from the old wellpass.html)
  shell.html                   head + loader script; placeholders @@ICONS@@ @@MANIFEST@@ @@STYLE@@ @@MODULES@@
  style.css
  src/…                        the modules (same file names as before) + checkin-backdrop.js (NEW)
  data/legacy-koeln-duesseldorf.json   the 91 old entries, English categories
  icons/                       generated PNGs (tools/gen-icons.py)
  manifest.webmanifest, sw.js  PWA files (sw.js gets the build hash as cache name)
  data/locations.json          source location data
  tools/                        PWA generators and build script
  docs/wellpass-html.md         this file
```

**Never edit `pwa/wellpass.html` or `pwa/dist/` by hand**; edit `pwa/web/` and run `node pwa/tools/build.mjs`. `pwa/web/src/seed.js` is generated; change `pwa/tools/gen-seed.mjs` or the data instead.

### 4.1 Check‑in DOM (new)

```
section#checkin.screen              position:relative; height:100dvh; overflow:hidden; background:#f3f3f3
 ├─ div.ci-stage                    height:100dvh; width:calc(100dvh*9/16); left:50%; translateX(-50%)
 │   ├─ svg.ci-band                 viewBox 0 0 2160 3840; band path; blurred, card‑clipped copy for the smear
 │   ├─ div.ci-card                 left .122, top .113, w .764, h .761 (of stage); radius .049 W; shadow
 │   ├─ header.ci-header            back button (.170 W, .087 H) + <h1>Check‑in</h1> (centre .503 W)
 │   ├─ h2.ci-headline              “Session Validated”
 │   └─ footer.ci-footer            E G Y M / W E L L P A S S
 └─ div.ci-overlay                  inset:0 (viewport); reference-aligned dynamic layer
     ├─ span.ci-pulse               top .3294 H, size .2305 H, #20755e
     ├─ div.ci-avatar               same box; img/initials
     ├─ p.ci-name  p.ci-location  p.ci-activity  p.ci-datetime
```

All sizes are `calc(var(--H) * f)` with `--H: 100dvh` (stage children use percentages of the stage). The back button sits above the overlay (`z-index`), the overlay has `pointer-events: none`.

### 4.2 Other adaptations

* `categories.js`: new English `ALL`, `SYMBOLS`, legacy alias map in `normalize()`.
* `seed.js`: generated, see LOC‑3. Header comment updated.
* `stores.js`: studios carry optional `lat`/`lng`; `plainStudio()` persists them for custom studios (none today) without breaking old records.
* `views/home.js`: English strings, “Open in Maps” button in `renderSelected()`, Android install flow, `Profile.timestamp = Date.now()` on Check‑In.
* `views/checkin.js`: rebuilt around §4.1; pulse scale updated on resize.
* `install.js`: Android support, `beforeinstallprompt`, secure‑context rule.
* `main.js`: relative SW registration.
* `selftest.js`: new expected values (see LOC‑1/LOC‑6, computed by `gen-seed.mjs`) plus tests for legacy mapping, city‑suffix stripping and the maps URL.

### 4.3 Hosting model (see §8)

The app has **no server logic**; everything is static and per device (localStorage). Hosting only affects installability and offline.

---

## 5. Implementation plan

Decisions that are mine and can be vetoed before work starts:

* **D1 – extract to `web/` and rebuild** instead of editing the 89 KB JSON line in place. Round‑trip gate: building the unchanged `web/` must reproduce `wellpass.html` byte‑for‑byte (the original escapes `</` as `<\/` inside the JSON, so the serializer must do the same). If it does not, the gate falls back to “modules parse equal”.
* **D2 – category names** “Bouldering” and “Other” (the other 13 follow your examples).
* **D3 – history uses the new date format** (UI‑2).
* **D4 – no hidden 120 × 120 close area** from the original screen; the visible back chevron remains.
* **D5 – long text:** single line, `text-overflow: ellipsis`, 4 % side padding; no auto‑shrink.
* **D6 – `line-height: 1.2`** for overlay text, calibrated against the reference screenshot (§6).
* **D7 – short name “OSC”** for the home‑screen label.

### Phase 0 – safety net (no behaviour change)
1. `pwa/tools/extract.mjs`: split `pwa/wellpass.html` into `pwa/web/shell.html`, `pwa/web/style.css`, `pwa/web/src/**`.
2. `pwa/tools/build.mjs`: reassemble `pwa/wellpass.html`. **Gate:** identical to the original; commit as “extract sources”.

### Phase 1 – data
3. `pwa/tools/gen-seed.mjs`: read `pwa/data/locations.json` (it has a UTF‑8 BOM), map types (LOC‑6), city, lat/lng, merge legacy Köln/Düsseldorf, check uniqueness (LOC‑4), write `seed.js` and `pwa/web/data/expected.json` (counts per city and category).
4. `categories.js`: English set + legacy aliases (LOC‑5, LOC‑7). Update `selftest.js` to read the expected counts.
5. **Gate:** self‑test green; totals 981 = 890 + 91; per‑category counts match LOC‑6.

### Phase 2 – check‑in screen
6. `checkin-backdrop.js` + CSS: stage, band, card, smear, shadow (CI‑1, CI‑8) from §2 values.
7. Header, headline, footer per §2 (CI‑5, CI‑9).
8. Overlay: avatar, pulse, text rows with reference geometry (CI‑2, CI‑3); date format (CI‑4); suffix stripping (CI‑7).
9. Pulse keyframes + JS scale variable (CI‑6).
10. Remove old `.checkin-*`/`--k` CSS (CI‑11).
11. **Gate:** overlay diff and geometry checks (§6.1).

### Phase 3 – home screen
12. English strings sweep (UI‑1), fallbacks (UI‑3), `formatTimestamp` (UI‑2).
13. “Open in Maps” button (LOC‑9); `Profile.timestamp` on Check‑In.
14. **Gate:** manual walk‑through; `?selftest=on`.

### Phase 4 – PWA
15. Icons from `oscLogo.png`; `manifest.webmanifest`; `sw.js`; relative registration (PWA‑1…4).
16. Install hint for iOS and Android (PWA‑5); debug panel (PWA‑7).
17. `build.mjs` writes `wellpass.html` and `dist/` (PWA‑2).
18. **Gate:** Lighthouse “installable” and offline check on a local `localhost` server (§6.3).

### Phase 5 – docs
19. Update this file with what actually changed (§9), and add a short “How to run / build / install” section to `pwa/README.md`.

---

## 6. Verification

### 6.1 Check‑in screen
* Playwright screenshots at 360 × 640 (exactly 9:16), 390 × 844, 412 × 915, 430 × 932 and 768 × 1024.
* At 360 × 640 the page with no dynamic text and no avatar is overlaid on `Wellpass_FINAL.png` (50 % blend and pixel diff). Tolerances: card edges, band edges and header/headline/footer boxes within **±0.3 % of H**; colours within ΔE ≈ 3.
* Geometry assertions via `getBoundingClientRect()`: avatar top/size, text tops and font sizes equal §1.5 × H (±1 px).
* Animation: sample `getComputedStyle` of the pulse at 0, 200, 400, 401, 600, 800, 1,200 ms and compare with the table in §1.5; check `S` for two widths.

### 6.2 Data and logic
* `?selftest=on` plus new assertions: counts (981; Berlin 730; Köln 41; Düsseldorf 50), category counts, legacy mapping, suffix stripping (e.g. “Berlin Running Society Berlin” → “Berlin Running Society”, “Yayaspa Berlin (Kreuzberg)” unchanged), maps URL present only with coordinates, id uniqueness.
* Search: “potsdam”, “koln” (diacritics), category chip + query combined.
* Existing localStorage from the old build (German categories, old location id, history) loads without errors.

### 6.3 PWA
* Serve `dist/` on `localhost`; Chrome DevTools → Application: manifest valid, icons load, SW active, offline reload works, Lighthouse PWA installable.
* On a real iPhone and a real Android phone using whichever host is chosen (§8): install, launch from the icon, airplane mode, update flow (bump cache version).

---

## 7. Possible future changes

### 7.1 Replace the element background with the PNG
The seam is `checkin-backdrop.js`, which returns the DOM for everything inside `.ci-stage`. All dynamic overlay positions are already fractions of H, i.e. the same coordinate system as the PNG, so no overlay value changes. A config constant `BACKDROP` selects the variant:

| Variant | Stage content | Overlay | Notes |
|---|---|---|---|
| `elements` (planned) | band + card + header + headline + footer as elements | reference geometry | sharp at any DPR, translatable, ≈ 10 KB |
| `png-full` | `<img src=Wellpass_FINAL.png>` stretched to stage height | same | header, headline (“Session Validated”) and footer are baked in; not translatable; grey placeholder disc is covered by the avatar; 394 KB (≈ 525 KB base64 when embedded); needs `sw.js` precache if kept as a file |
| `png-band` | cropped PNG of band + card + smear only (needs a cleaned asset; source `assets/Wellpass.xcf`) | same + header/headline/footer as elements | best fidelity of the smear without baked text |
| `logo-only` | elements everywhere, footer text replaced by `assets/Wellpass_Logo_RGB_EGYM-Wellpass-Black-Color.png` (3508 × 2482 with transparent margins; crop first) | same | the logo has the real typeface; place by the footer box in §2 |

The image can be loaded as a file (cached by the SW in `dist/`) or as a base64 data URL (keeps the single‑file property). Because the stage is 9:16 and the PNG is 9:16, the stretching behaviour matches the reference artwork.

### 7.2 Other candidates
Dark theme; per‑location “activity” override; export/import of settings outside the debug panel; auto‑shrink for long names (D5); apple splash screens; Köln/Düsseldorf refreshed from the Wellpass finder (coordinates would enable Maps there).

---

## 8. Installability and HTTPS hosting (open)

**Status: open, deliberately not decided.** Constraint stated by the user: not publicly hosted; ideally a web service where people upload the `.html` and then install from it. The task stays open until a host is chosen.

Facts:
* iOS and Android install a web app only from an **HTTPS origin** (or `localhost`). A `.html` file opened from disk, chat or mail (`file://`, `content://`) can be viewed but **not installed**, and has no service worker.
* **iOS** needs no manifest to “Add to Home Screen” (the page’s meta tags and apple‑touch icon are used); standalone mode works with any HTTPS host serving the single file.
* **Offline** needs a separate `sw.js` file on the same origin (it cannot be inlined or served from a `blob:` URL). A host that only serves one `.html` therefore gives **install without offline**.
* **Android Chrome** “Install app” needs a manifest and normally a service worker; a single page on a file host usually gives only “Add to Home screen” (shortcut). A data‑URI manifest is a possible experiment but **unverified**.

| Tier | Needs | Gives |
|---|---|---|
| A – single `wellpass.html` on any HTTPS host | upload one file | iOS: standalone app, online only · Android: shortcut / possibly install, online only |
| B – `dist/` folder on a host that serves folders | upload or deploy a folder/zip | full PWA: manifest, icons, offline, update flow |

Candidates (from one web search; **not verified, check current terms before choosing**):
* GitHub Pages: public even for a private repo on the free plan → does not meet the “not public” wish.
* Netlify Drop and similar drag‑and‑drop hosts: unlisted (unguessable) URL rather than private; accepts a folder (tier B).
* tiiny.host‑style single‑file hosts: tier A only; free limits and password options need checking.
* Cloudflare Pages + Cloudflare Access: real login, tier B, more setup; a login wall can interfere with installing.
* No third party: serve `dist/` from a home/office machine via HTTPS (e.g. a tunnel with access control).

Consequences for the implementation: both tiers are produced by the same build (PWA‑2), the registration is relative so any path works, and the install hint is hidden when not secure (PWA‑5). The user‑facing install steps are:

**iPhone (iOS 16.4+, Safari):** open the HTTPS link → **Share** (iOS 26: “⋯” menu) → **Add to Home Screen** → keep “Open as Web App” → **Add**. Launch from the icon. Storage is separate from Safari, so choose the selfie again once.
**Android (Chrome):** open the link → “⋮” → **Install app** (or **Add to Home screen**) → **Install**; or use the in‑app **Install** button. Samsung Internet: “≡” → **Add page to** → **Home screen**.

Decision needed later: which host and tier. Until then the work stops after phase 4’s localhost verification.

---

## 9. Adaptations log

| Date | Change | Reason |
|---|---|---|
| 2026‑11‑11 | Phase 0 gate passed: rebuilding the extracted sources reproduced the old `wellpass.html` byte for byte. The one‑time extractor was then deleted so it cannot overwrite `web/`. | D1 |
| 2026‑11‑11 | `checkin-backdrop.js` returns the whole static artwork as **one SVG** in PNG coordinates (band, card + shadow, smear, back chevron, title, headline, footer), not just band/card/smear. Texts use `textLength`, so they have exactly the PNG’s width in any device font. The back button is a transparent HTML button over the chevron. | One swap point for `png-full`; font independence (§7.1) |
| 2026‑11‑11 | Card shadow and smear are SVG filters (`feDropShadow`, `feGaussianBlur`), not CSS `backdrop-filter`. Shadow is a downward offset (dy 45, σ 40, 21 %), fitted to the PNG’s side/bottom values; the card has no top shadow, as in the PNG. | CI‑8 |
| 2026‑11‑11 | Band edges are degree‑4 polynomials fitted to the PNG edge samples, with the hidden middle fitted against the smear (RMS error ≈ 2 % of full scale; smear σ 110, opacity 0.276). Measured match to the PNG at 1125 × 2000: card edges, band edges and shadow within a few grey levels; the lower right smear is slightly lighter than in the PNG. | §2 |
| 2026‑11‑11 | Card rectangle used x 266–1915, y 432–3355 (re‑measured; §2 had rounded values). | accuracy |
| 2026‑11‑11 | `main.js`: the service worker URL is resolved against `document.baseURI` (the module itself runs from a `blob:` URL, so a relative path would be invalid), and registration runs immediately when `load` has already fired (the old `load` listener never fired because this module is imported late). | found while testing offline |
| 2026‑11‑11 | `manifest.webmanifest`: `theme_color #f2f3f4` (matches the UI) and `background_color #060404` (the logo’s real background; `oscLogo.png` is not pure black), instead of `#000000` for both. | PWA‑1 |
| 2026‑11‑11 | The wellpass.html head no longer links a manifest (the single file has none next to it); `dist/index.html` does. Both embed the favicon and apple‑touch icon as data URIs generated from `oscLogo.png`. | PWA‑2 |
| 2026‑11‑11 | Pulse scale (`--pulse-scale`) is recomputed on `resize`; “screen width” is `min(viewport width, stage width)`. | CI‑6 |
| 2026‑11‑11 | The Maps button shows a pin icon and the word “Maps”, and sits between the category text and the check mark of the selected card. | LOC‑9 |

### Verified
* Self‑test (`?selftest=on`): 33 of 34 assertions pass; “selfie decodes” fails only when no selfie is stored (same as before).
* Check‑in overlay: avatar, name and meta rows at exactly 0.3294 / 0.58 / 0.635 / 0.67 / 0.705 H, font sizes 0.032 / 0.018 H at 360 × 640, 390 × 844 and 412 × 915.
* Pulse: 0 / 200 / 399 / 401 / 600 / 799 / 801 ms give opacity 0.5 / 0.25 / 0 / 1 / 0.5 / 0 / 0.5 and scale 1 / 1.1 / 1.2 / 1 / 1.1 / 1.2 / 1 (S = 1.2005 at 390 × 844).
* Headless Edge on `localhost`: service worker activates, cache `osc-<hash>` created, the app loads with the network off, manifest parses.
* Data from the old build (German categories in history, custom studios and profile) loads and shows English categories.

### Not verified / known
* Real iPhone and Android devices, the Android `beforeinstallprompt` button, and Lighthouse were not run.
* Fonts differ per platform; headline, title and footer keep the PNG’s widths, and the name and meta rows keep the reference sizes and tops (line height 1.2) but not its exact glyphs.
* Existing bug, not changed: `transition.js` uses unit‑less `translate(28)` / `translate(0, 8)` keyframes for Android and desktop; browsers reject them (console warning), so those two transitions only fade.

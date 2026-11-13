// Check-in backdrop built from elements (no image): teal band, card with shadow, the band's blurred
// "smear" showing through the card, and the static texts of Wellpass_FINAL.png.
//
// Everything lives in the PNG's own coordinate system (2160 x 3840), so a 9:16 stage at any size lines up
// with the reference artwork (which stretches that PNG to the screen height). Geometry measured off the PNG, see
// docs/wellpass-html.md §2. To use the PNG instead, replace backdropMarkup() with an <img> of the same box.
const W = 2160
const H = 3840

const TEAL = '#337b89'
const CARD = { x: 266, y: 432, w: 1649, h: 2923, r: 106 }
const SMEAR = { opacity: 0.2757, blur: 110 }

// Band edges as y/H = poly(x/W) (highest power first), fitted to the edge samples measured left and right of
// the card; the hidden middle is fitted against the smear. Outside 0..1 the edges continue as straight lines
// so the band also fills stages narrower than the screen.
const UPPER = [-1.5753778593467926, 2.635182230884844, -0.7748525618809043, 0.39642729313606845, 0.11552173755825348]
const LOWER = [-0.860289703042492, 0.762868045740052, 0.35567233891097694, 0.39862421608992166, 0.2623766892241983]

const evalPoly = (coeffs, x) => coeffs.reduce((acc, c) => acc * x + c, 0)
const derivPoly = (coeffs, x) => {
  const n = coeffs.length - 1
  return coeffs.slice(0, -1).reduce((acc, c, i) => acc * x + c * (n - i), 0)
}

function edgeY(coeffs, x) {
  if (x >= 0 && x <= 1) return evalPoly(coeffs, x)
  const edge = x < 0 ? 0 : 1
  return evalPoly(coeffs, edge) + derivPoly(coeffs, edge) * (x - edge)
}

function bandPath() {
  const from = -1.5
  const to = 2.5
  const steps = 64
  const xs = Array.from({ length: steps + 1 }, (_, i) => from + ((to - from) * i) / steps)
  const point = (coeffs, x) => `${(x * W).toFixed(1)} ${(edgeY(coeffs, x) * H).toFixed(1)}`
  const upper = xs.map((x) => point(UPPER, x))
  const lower = xs.map((x) => point(LOWER, x)).reverse()
  return `M${upper.join('L')}L${lower.join('L')}Z`
}

const escapeXml = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// textLength pins each text to the width it has in the PNG whatever font the device has.
function text({ value, x, y, size, length, weight, fill, spacing = 0 }) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="${spacing}"
    textLength="${length}" lengthAdjust="spacing">${escapeXml(value)}</text>`
}

export function backdropMarkup({ title = 'Check-in', headline = 'Session Validated' } = {}) {
  const card = `x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}" ry="${CARD.r}"`
  return `
    <svg class="ci-bg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id="ci-card-shadow" filterUnits="userSpaceOnUse" x="-200" y="200" width="2560" height="3700">
          <feDropShadow dx="0" dy="45" stdDeviation="40" flood-color="#000" flood-opacity="0.21" />
        </filter>
        <filter id="ci-smear-blur" filterUnits="userSpaceOnUse" x="-100" y="150" width="2360" height="3500">
          <feGaussianBlur stdDeviation="${SMEAR.blur}" />
        </filter>
        <clipPath id="ci-card-clip"><rect ${card} /></clipPath>
      </defs>
      <path d="${bandPath()}" fill="${TEAL}" />
      <rect ${card} fill="#fafafa" filter="url(#ci-card-shadow)" />
      <g clip-path="url(#ci-card-clip)">
        <path d="${bandPath()}" fill="${TEAL}" fill-opacity="${SMEAR.opacity}" filter="url(#ci-smear-blur)" />
      </g>
      <path d="M388 295 L346 335 L388 375" fill="none" stroke="#111" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" />
      ${text({ value: title, x: 941, y: 357, size: 68, length: 290, weight: 600, fill: '#111' })}
      ${text({ value: headline, x: 467, y: 1073, size: 153, length: 1237, weight: 600, fill: '#094450' })}
      ${text({ value: 'EGYM', x: 943, y: 3565, size: 66, length: 297, weight: 600, fill: '#1a1a1a' })}
      ${text({ value: 'WELLPASS', x: 740, y: 3684, size: 101, length: 701, weight: 400, fill: '#1a1a1a' })}
    </svg>`
}

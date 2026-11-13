// Inline SVG icon set — no CDN. Category tokens match BUILD.md §6.
const ICONS = {
  dumbbell: '<path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12"/>',
  leaf: '<path d="M20 4C12 4 5 8 5 15a5 5 0 0 0 5 5c7 0 10-8 10-16Z"/><path d="M5 20c2-6 6-9 11-11"/>',
  'person-hiking': '<circle cx="13" cy="4" r="2"/><path d="M10 22l2-6 3 2 2 4M11 9l-2 7 4 1 2-5-3-2-1-1Z"/>',
  'climbing-hold': '<path d="M7 21l1-7 3 1 1-5 3 1-1 5 3-2 1 4-4 3Z"/><path d="M8 14l-3-2M16 10l2-3"/>',
  'boxing-glove': '<path d="M7 21h10v-4l2-4V7a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v6l2 4v4Z"/><path d="M7 10h10"/>',
  'dancing-figure': '<circle cx="13" cy="4" r="2"/><path d="M12 7l-3 5 4 2 2-4M9 12l-3 3M13 14l-2 8M13 14l4 3 2 5"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  barbell: '<path d="M4 8v8M20 8v8M7 6v12M17 6v12M7 12h10"/>',
  'map-pin': '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  lotus: '<path d="M12 4c2.3 2.2 3.4 4.3 3.4 6.2a3.4 3.4 0 0 1-6.8 0c0-1.9 1.1-4 3.4-6.2Z"/><path d="M4.6 10.4c1.9-.7 3.6 0 4.8 1.4M19.4 10.4c-1.9-.7-3.6 0-4.8 1.4"/><path d="M3 16.2c2.9 2.6 5.9 3.6 9 3.6s6.1-1 9-3.6"/>',
  'mat-stretch': '<circle cx="6.2" cy="9" r="2"/><path d="M8.4 11H14l4 4M8.4 11 7.4 17M14 11l2 6M18 15h2.2"/>',
  physio: '<path d="M12 20.2S5.4 16.2 5.4 11.4A3.6 3.6 0 0 1 12 9.3a3.6 3.6 0 0 1 6.6 2.1c0 4.8-6.6 8.8-6.6 8.8Z"/>',
  racket: '<ellipse cx="10" cy="8.8" rx="4.8" ry="5.8"/><path d="m13.4 13.2 5.4 5.4"/><path d="M7.6 6.6h4.8M7 9.8h5.8"/>',
  paddle: '<path d="M2.8 17.4c2 1.5 4 1.5 6 0s4-1.5 6 0 3.9 1.5 5.4.2"/><path d="M12 3.2v9.6"/><path d="m9.8 5.4 2.2-2.2 2.2 2.2"/>',
  bike: '<circle cx="6" cy="17" r="3.2"/><circle cx="18" cy="17" r="3.2"/><path d="M9.2 17h4.6l-2-6H9M11.8 11l3 6M13.9 8h2.8"/>',
  sparkles: '<path d="M10 3l1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9Z"/><path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9Z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  // iOS share sheet: arrow out of the box.
  share: '<path d="M12 3.4v10.6"/><path d="m8.4 7 3.6-3.6L15.6 7"/><path d="M7.4 10.6H4.8V20.6h14.4V10.6h-2.6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  'plus-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  'x-circle': '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.8 2.8L16.5 9"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7"/>',
  'chevron-down': '<path d="m5 9 7 7 7-7"/>',
  'chevron-up': '<path d="m5 15 7-7 7 7"/>',
  'chevron-left': '<path d="M15 5l-7 7 7 7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 21h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
}

export function icon(name, size = 16, { strokeWidth = 2, className = '' } = {}) {
  const body = ICONS[name] ?? ICONS['map-pin']
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}

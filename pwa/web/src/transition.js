// Screen transitions: iOS gets a UIKit push/pop, Android gets Material 3 shared-axis.
//
// Both are pure transform/opacity animations on the two stacked layers, so they run on
// the compositor and never touch layout. The outgoing layer keeps its DOM until the
// animation settles (its view is already unmounted, so nothing responds to taps).

const EASE_IOS = 'cubic-bezier(0.32, 0.72, 0, 1)'; // ≈ UIKit push curve since iOS 7
const EASE_ANDROID = 'cubic-bezier(0.2, 0, 0, 1)'; // M3 "emphasized decelerate"
const EASE_DESKTOP = 'cubic-bezier(0.4, 0, 0.2, 1)';

export function platform() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13+ claims to be a Mac; a touch-capable Mac is an iPad in disguise.
  if (/Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1) return 'ios';
  return 'desktop';
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

const translate = (x, y = 0) => `translate3d(${x}, ${y}, 0)`;

function iosPlan(direction) {
  const forward = direction !== 'back';
  const shadow = (x) => `${x}px 0 26px -14px rgba(0, 0, 0, 0.34)`;
  const clear = (x) => `${x}px 0 26px -14px rgba(0, 0, 0, 0)`;
  const seam = forward ? -18 : 18;
  return {
    duration: 420,
    easing: EASE_IOS,
    incoming: [
      { transform: translate(forward ? '100%' : '-30%'), boxShadow: shadow(seam) },
      { transform: translate(0), boxShadow: clear(seam) },
    ],
    outgoing: [
      { transform: translate(0) },
      { transform: translate(forward ? '-30%' : '100%') },
    ],
    // UIKit dims the view underneath a push — and the revealed one while popping.
    incomingDim: forward ? [0, 0] : [0.14, 0],
    outgoingDim: forward ? [0, 0.14] : [0, 0],
  };
}

function androidPlan(direction) {
  const forward = direction !== 'back';
  return {
    duration: 300,
    easing: EASE_ANDROID,
    incoming: [
      { transform: translate(forward ? 28 : -28), opacity: 0 },
      { transform: translate(0), opacity: 1 },
    ],
    outgoing: [
      { transform: translate(0), opacity: 1 },
      { transform: translate(forward ? -14 : 14), opacity: 0 },
    ],
    incomingDim: [0, 0],
    outgoingDim: [0, 0],
  };
}

function desktopPlan(direction) {
  return {
    duration: 200,
    easing: EASE_DESKTOP,
    incoming: [{ opacity: 0, transform: translate(0, 8) }, { opacity: 1, transform: translate(0) }],
    outgoing: [{ opacity: 1 }, { opacity: 0 }],
    incomingDim: [0, 0],
    outgoingDim: [0, 0],
  };
}

export function transitionPlan(direction) {
  const kind = platform();
  if (kind === 'ios') return iosPlan(direction);
  if (kind === 'android') return androidPlan(direction);
  return desktopPlan(direction);
}

/** Animates `incoming` over `outgoing`; resolves when the layers can be cleaned up. */
export function runScreenTransition({ outgoing, incoming, direction }) {
  if (!outgoing || !incoming || typeof incoming.animate !== 'function') return Promise.resolve();
  if (prefersReducedMotion()) return Promise.resolve();

  const plan = transitionPlan(direction);
  const options = { duration: plan.duration, easing: plan.easing, fill: 'both' };
  const dims = [];

  const animateDim = (layer, [from, to]) => {
    if (from === to) return null;
    const node = document.createElement('span');
    node.className = 'layer-dim';
    layer.append(node);
    dims.push(node);
    return node.animate([{ opacity: from }, { opacity: to }], options);
  };

  const animations = [
    incoming.animate(plan.incoming, options),
    outgoing.animate(plan.outgoing, options),
    animateDim(incoming, plan.incomingDim),
    animateDim(outgoing, plan.outgoingDim),
  ].filter(Boolean);

  return Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    // Drop the fill so the layers sit at their natural position before we remove one.
    for (const animation of animations) animation.cancel();
    for (const node of dims) node.remove();
  });
}

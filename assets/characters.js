// The plan page's animated characters: which pose group a tile shows, the picker that varies the animation over time, and the frame player.
// A classic script: tools/plan-page-build inlines it into the page (after characters-frames.js), and tests/characters.test.ts loads it with require.
// The frames are drawn in tools/charart.ts. One definition: the page, the screenshot tools and the tests all use the names below.
const CHAR_FR = typeof CHAR_FRAMES !== 'undefined' ? CHAR_FRAMES : require('./characters-frames.js')
// Group -> animation names, taken from the drawn frames.
const CHAR_ANIMS = {}
for (const g of Object.keys(CHAR_FR)) CHAR_ANIMS[g] = Object.keys(CHAR_FR[g])

// A tile's pose group from its count: 0 is asleep, above 0 is the tile's own active group.
function poseFor(key, count) { return count > 0 ? key : 'asleep' }
// The plan is done when it has steps and every one is done (nothing running, waiting, parked or to do).
function danceOn(c) { return c.n > 0 && c.done === c.n }

// mulberry32: a small seeded generator, so a fixed seed gives a fixed sequence.
function makeRng(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
// Idle animations are named <group>-idle-<what>: small movements (breathing, blinking, a foot tap) for between the main animations.
function isIdle(name) { return name.indexOf('-idle-') > 0 }
// A picker for one group: next() is a random animation of the group, never the one before, and it interleaves idle animations with the main ones
// (after a main animation it picks an idle one about half the time; after an idle one it picks a main one). holdMs() is how long the last pick plays:
// 2.5 to 6 s for a main animation, 2 to 5 s for an idle one.
function makePicker(group, seed, rnd) {
  const list = CHAR_ANIMS[group], r = rnd || makeRng(seed)
  const idles = list.filter(isIdle), mains = list.filter(n => !isIdle(n))
  let prev = '', cur = ''
  return {
    next() {
      let pool = list
      if (idles.length && mains.length) pool = isIdle(prev) ? mains : (r() < 0.5 ? idles : mains)
      pool = pool.filter(n => n !== prev)
      if (!pool.length) pool = list.filter(n => n !== prev)
      prev = cur = pool[Math.floor(r() * pool.length)]
      return cur
    },
    holdMs() { return isIdle(cur) ? Math.round(2000 + r() * 3000) : Math.round(2500 + r() * 3500) }
  }
}

// What a character shows at `now`, as a pure function of (group, seed, now): the picker is replayed from the start of a 10-minute window, so every caller
// (the pane redraws from scratch each second) gets the same answer. Returns the animation and when it started.
function scheduleAt(group, seed, now) {
  const WIN = 600000, w0 = Math.floor(now / WIN) * WIN
  const p = makePicker(group, (seed + Math.floor(now / WIN)) >>> 0)
  let anim = p.next(), start = w0, hold = p.holdMs()
  while (now >= start + hold) { start += hold; anim = p.next(); hold = p.holdMs() }
  return { anim, start }
}

// The frame player: which frame of an animation shows at time `now`, given when it started. Pure, so a test can drive it with a fake clock.
function frameIndex(group, anim, startMs, now) {
  const a = CHAR_FR[group][anim]
  return Math.floor(Math.max(0, now - startMs) * a.fps / 1000) % a.frames.length
}
// One character: tick(now) returns the animation and frame to show; it moves to the picker's next animation when the hold runs out.
function makeActor(group, seed, startMs) {
  const p = makePicker(group, seed)
  let anim = p.next(), start = startMs, hold = p.holdMs()
  return {
    tick(now) {
      if (now - start >= hold) { anim = p.next(); start = now; hold = p.holdMs() }
      return { anim, idx: frameIndex(group, anim, start, now) }
    }
  }
}
// A frame (20 strings of letters) as SVG rects, one per horizontal run; the letter is the CSS class (see .chr in the page).
function frameRects(rows) {
  let s = ''
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const c = row[x]
      if (c === '.') { x++; continue }
      let e = x
      while (e + 1 < row.length && row[e + 1] === c) e++
      s += `<rect class="${c}" x="${x}" y="${y}" width="${e - x + 1}" height="1"/>`
      x = e + 1
    }
  })
  return s
}
// The still pose: the first frame of the group's first animation (what reduced motion shows).
function stillFrame(group) { return CHAR_FR[group][CHAR_ANIMS[group][0]].frames[0] }

// ---- The goal-area trip ------------------------------------------------------------------------------------------------------------------------
// When the plan is complete the four tile characters run out of their tiles to the goal area and dance there; when it stops being complete they run back.
// The state is { phase: 'home' | 'out' | 'away' | 'back', t0 }. These functions are pure (the caller passes the clock), so a test can drive them.
const TRAVEL_MS = 1200
// How far along the trip is: 0 at the tiles, 1 in the goal area.
function travelProgress(st, now) {
  if (st.phase === 'home') return 0
  if (st.phase === 'away') return 1
  const t = Math.min(1, Math.max(0, (now - st.t0) / TRAVEL_MS))
  return st.phase === 'out' ? t : 1 - t
}
// The next state given whether the plan is complete. A trip that is reversed half way turns round from where it is. Reduced motion jumps.
function travelNext(st, complete, now, reduced) {
  const ph = st.phase
  if (reduced) { const want = complete ? 'away' : 'home'; return ph === want ? st : { phase: want, t0: now } }
  if (ph === 'home') return complete ? { phase: 'out', t0: now } : st
  if (ph === 'away') return complete ? st : { phase: 'back', t0: now }
  if (now - st.t0 >= TRAVEL_MS) return { phase: ph === 'out' ? 'away' : 'home', t0: now }
  const p = travelProgress(st, now)
  if (ph === 'out' && !complete) return { phase: 'back', t0: now - (1 - p) * TRAVEL_MS }
  if (ph === 'back' && complete) return { phase: 'out', t0: now - p * TRAVEL_MS }
  return st
}
// Where the n characters are: in their tiles, flying between, or in the goal area. Always adds up to n, and the goal area is empty unless the trip has begun.
function travelLayout(st, n) {
  if (st.phase === 'home') return { tile: n, fly: 0, goal: 0 }
  if (st.phase === 'away') return { tile: 0, fly: 0, goal: n }
  return { tile: 0, fly: n, goal: 0 }
}
// A tile with count 0 is dimmed (and so is the character in it, by the same CSS token); above 0 it is at full brightness.
function dimFor(count) { return !(count > 0) }
// How much a dimmed tile and its character fade: one value for the page (--dim-o) and the pane.
const DIM_O = 0.5
// The frame colours by letter (the pane draws with these; the page CSS in plan-page.tpl.html repeats them and a test keeps the two equal).
// b and d follow the tile colour, o follows the theme, z and x are the muted text colour.
const CHAR_COLORS = { s: '#f3c38f', e: '#1b1f22', m: '#b4533f', k: '#2c3036', w: '#fff', y: '#f2c230', p: '#9a6b3f', c: '#f4efe2', r: '#e0533f', u: '#6ec1e4', h: '#7d8791', n: '#f08fb4', g: '#4fbf6a' }
const CHAR_OUTLINE = { light: '#161c1a', dark: '#050807' }
if (typeof module !== 'undefined') module.exports = { CHAR_FR, CHAR_ANIMS, poseFor, danceOn, makeRng, makePicker, isIdle, frameIndex, makeActor, frameRects, stillFrame, TRAVEL_MS, travelProgress, travelNext, travelLayout, dimFor, scheduleAt, DIM_O, CHAR_COLORS, CHAR_OUTLINE }

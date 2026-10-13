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
// A picker for one group: next() is a random animation of the group, never the one before; holdMs() is 2.5 to 6 seconds.
function makePicker(group, seed, rnd) {
  const list = CHAR_ANIMS[group], r = rnd || makeRng(seed)
  let prev = -1
  return {
    next() {
      let i = Math.floor(r() * list.length)
      if (i === prev) i = (i + 1 + Math.floor(r() * (list.length - 1))) % list.length
      prev = i
      return list[i]
    },
    holdMs() { return Math.round(2500 + r() * 3500) }
  }
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
if (typeof module !== 'undefined') module.exports = { CHAR_FR, CHAR_ANIMS, poseFor, danceOn, makeRng, makePicker, frameIndex, makeActor, frameRects, stillFrame }

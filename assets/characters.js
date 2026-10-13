// The plan page's animated characters: which pose a tile shows, and the small picker that varies the animation over time.
// A classic script: tools/plan-page-build inlines it into the page, and tests/characters.test.ts loads it with require.
// One definition: the page and the tests both use poseFor, danceOn, ANIMS and makePicker.
const CHAR_ANIMS = {
  asleep: ['sleep-breathe', 'sleep-sway'],
  running: ['run-bob', 'run-dash', 'run-hop'],
  you: ['you-bounce', 'you-wave', 'you-shake'],
  todo: ['todo-pace', 'todo-sway', 'todo-look'],
  done: ['done-cheer', 'done-jump', 'done-spin'],
  dance: ['dance-twirl', 'dance-bounce', 'dance-sway', 'dance-wiggle', 'dance-spin']
}
// Small glyph drifting beside the character while a pose holds ('' = none).
const CHAR_GLYPH = { asleep: 'z', running: '', you: '!', todo: '', done: '★', dance: '♪' }

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
if (typeof module !== 'undefined') module.exports = { CHAR_ANIMS, CHAR_GLYPH, poseFor, danceOn, makeRng, makePicker }

// Page side of the characters: draws them and runs the timers. Needs characters.js and characters-sprites.js above it.
const CHR_SEED = (typeof window.CHR_SEED === 'number') ? window.CHR_SEED : Math.floor(Math.random() * 1e9);
let CHR_TIMERS = [];
function charSvg(sprite, group, n) {
  const asleep = group === 'asleep', s = CHAR_SPRITES[sprite];
  return `<span class="chr" data-g="${group}" data-n="${n}"><svg viewBox="3 2 18 19" shape-rendering="crispEdges" aria-hidden="true"><g class="body">${asleep ? s.asleep : s.awake}</g></svg><i class="gl">${CHAR_GLYPH[group]}</i></span>`;
}
// Gives every .chr in root its own picker; each swaps animation class after a random hold, passing through a short rest pose.
function charsStart(root) {
  CHR_TIMERS.forEach(clearTimeout); CHR_TIMERS = [];
  if (window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  root.querySelectorAll('.chr').forEach((el, i) => {
    const g = el.dataset.g, p = makePicker(g, CHR_SEED + i * 7919 + g.length);
    const set = a => { el.className = 'chr ' + a; };
    set(p.next());
    const tick = () => {
      el.className = 'chr rest';
      CHR_TIMERS.push(setTimeout(() => { set(p.next()); CHR_TIMERS.push(setTimeout(tick, p.holdMs())); }, 220));
    };
    CHR_TIMERS.push(setTimeout(tick, p.holdMs()));
  });
}

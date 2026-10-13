// Page side of the characters: draws them and runs one frame timer. Needs characters-frames.js and characters.js above it.
const CHR_SEED = (typeof window.CHR_SEED === 'number') ? window.CHR_SEED : Math.floor(Math.random() * 1e9);
let CHR_TIMER = 0;
// c is the tile's colour name (run, blk, todo, done): the character is drawn in var(--c).
function charSvg(c, group, n) {
  return `<span class="chr" data-g="${group}" data-n="${n}" style="--cb:var(--${c})"><svg viewBox="0 0 20 20" shape-rendering="crispEdges" aria-hidden="true">${frameRects(stillFrame(group))}</svg></span>`;
}
// Gives every .chr in root an actor; one 60 ms timer redraws a character only when its frame changes. Reduced motion keeps the still pose.
function charsStart(root) {
  clearInterval(CHR_TIMER);
  if (window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const t0 = Date.now(), list = [...root.querySelectorAll('.chr')].map((el, i) => ({ el, svg: el.firstChild, a: makeActor(el.dataset.g, CHR_SEED + i * 7919 + el.dataset.g.length, t0), key: '' }));
  const draw = () => {
    if (document.hidden) return;
    const now = Date.now();
    for (const o of list) {
      const s = o.a.tick(now), k = s.anim + s.idx;
      if (k !== o.key) { o.key = k; o.svg.innerHTML = frameRects(CHAR_FR[o.el.dataset.g][s.anim].frames[s.idx]); }
    }
  };
  draw();
  CHR_TIMER = setInterval(draw, 60);
}

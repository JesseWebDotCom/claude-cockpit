// Page side of the characters: draws them, runs one frame timer, and moves the four tile characters to the goal area when the plan is complete.
// Needs characters-frames.js and characters.js above it. The trip rules (travelNext, travelLayout) are pure and live in characters.js.
const CHR_SEED = (typeof window.CHR_SEED === 'number') ? window.CHR_SEED : Math.floor(Math.random() * 1e9);
let CHR_TIMER = 0;
let CHR_ST = { phase: 'home', t0: 0 }; // survives page re-renders, so a trip in progress carries on
const CHR_Z = {}; // each tile's last dim state, so a count change fades instead of jumping
// c is the tile's colour name (run, blk, todo, done): the character is drawn in var(--c).
function charSvg(c, group, n) {
  return `<span class="chr" data-g="${group}" data-c="${c}" data-n="${n}" style="--cb:var(--${c})"><svg viewBox="0 0 20 20" shape-rendering="crispEdges" aria-hidden="true">${frameRects(stillFrame(group))}</svg></span>`;
}
function chrNow() { return typeof window.CHR_CLOCK === 'function' ? window.CHR_CLOCK() : Date.now(); }
function chrFade(root) {
  // A tile whose count just crossed 0 starts from its old look and fades to the new one.
  root.querySelectorAll('.stat[data-k]').forEach(t => {
    const k = t.dataset.k, lo = t.classList.contains('lo');
    if (CHR_Z[k] !== undefined && CHR_Z[k] !== lo) { t.classList.toggle('lo', CHR_Z[k]); requestAnimationFrame(() => requestAnimationFrame(() => t.classList.toggle('lo', lo))); }
    CHR_Z[k] = lo;
  });
}
// Gives every .chr in root an actor; one 60 ms timer redraws a character only when its frame changes. `complete` is whether the plan is done.
// Reduced motion keeps still poses and moves the characters to the goal area (or back) without travelling.
function charsStart(root, complete) {
  clearInterval(CHR_TIMER);
  document.querySelectorAll('.chr.fly').forEach(e => e.remove());
  chrFade(root);
  const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches);
  const goalEl = root.querySelector('.dancer');
  const tiles = [...root.querySelectorAll('.stat .chr')];
  const t0 = chrNow();
  const mk = (el, i, grp) => ({ el, svg: el.firstChild, a: makeActor(grp, CHR_SEED + i * 7919 + grp.length, t0), g: grp, key: '' });
  const tileA = tiles.map((el, i) => mk(el, i, el.dataset.g));
  let goalA = [], flyers = [];
  const paint = (o, s) => { const k = s.anim + s.idx; if (k !== o.key) { o.key = k; o.svg.innerHTML = frameRects(CHAR_FR[o.g][s.anim].frames[s.idx]); } };
  const ease = p => p * p * (3 - 2 * p);
  const sync = now => {
    CHR_ST = travelNext(CHR_ST, complete, now, reduced);
    if (!reduced && complete && typeof window.CHR_P === 'number') CHR_ST = { phase: 'out', t0: now - window.CHR_P * TRAVEL_MS }; // a fixed point of the trip, for screenshots
    const L = travelLayout(CHR_ST, tiles.length);
    if (L.tile === 0 && goalEl && !goalEl.children.length) {
      goalEl.innerHTML = tiles.map((el, i) => charSvg(el.dataset.c, 'dance', 90 + i)).join('');
      goalA = [...goalEl.children].map((el, i) => mk(el, 50 + i, 'dance'));
    }
    if (L.tile > 0 && goalEl && goalEl.children.length) { goalEl.innerHTML = ''; goalA = []; }
    tiles.forEach(el => el.classList.toggle('gone', L.tile === 0));
    goalA.forEach(o => o.el.classList.toggle('gone', L.goal === 0));
    if (L.fly && !flyers.length) {
      flyers = tiles.map(el => { const f = document.createElement('span'); f.className = 'chr fly'; f.style.setProperty('--cb', `var(--${el.dataset.c})`); f.innerHTML = '<svg viewBox="0 0 20 20" shape-rendering="crispEdges" aria-hidden="true"></svg>'; document.body.append(f); return f; });
    }
    if (!L.fly && flyers.length) { flyers.forEach(f => f.remove()); flyers = []; }
    if (L.fly) {
      const e = ease(travelProgress(CHR_ST, now)), fi = frameIndex('running', 'running-cycle', CHR_ST.t0, now);
      flyers.forEach((f, i) => {
        const a = tiles[i].getBoundingClientRect(), b = goalA[i] ? goalA[i].el.getBoundingClientRect() : a;
        const lerp = (u, v) => u + (v - u) * e, hop = Math.sin(Math.PI * e) * 14;
        f.style.cssText = `--cb:var(--${tiles[i].dataset.c});left:${lerp(a.left, b.left)}px;top:${lerp(a.top, b.top) - hop}px;width:${lerp(a.width, b.width)}px;height:${lerp(a.height, b.height)}px;transform:${b.left < a.left ? 'scaleX(-1)' : 'none'}`;
        f.firstChild.innerHTML = frameRects(CHAR_FR.running['running-cycle'].frames[fi]);
      });
    }
  };
  if (reduced) {
    sync(t0);
    goalA.forEach(o => { o.svg.innerHTML = frameRects(stillFrame('dance')); });
    return;
  }
  const draw = () => {
    if (document.hidden) return;
    const now = chrNow();
    sync(now);
    for (const o of tileA) if (!o.el.classList.contains('gone')) paint(o, o.a.tick(now));
    for (const o of goalA) if (!o.el.classList.contains('gone')) paint(o, o.a.tick(now));
  };
  draw();
  CHR_TIMER = setInterval(draw, 60);
}

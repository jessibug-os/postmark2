/**
 * The /grass labs.
 *
 * Every algorithm below is a transcription of the shipped one, not an
 * impression of it: `hash2` and `tileNoise` are copied out of
 * `src/world/terrain.ts`, the detail sheet is `makeGroundDetailTexture`'s three
 * channels, and the classifier is `applyGroundDetail`'s two smoothsteps
 * evaluated in linear space the way three.js hands them to the shader. That is
 * the point of the page — if a panel here is wrong, the engine is wrong too.
 *
 * The board data is measured, not invented: `scripts/grass-survey.mjs` reads
 * tier, grass share and mean ground height per acre out of the live build.
 */

// --- measured board, seed-80085 (scripts/grass-survey.mjs, 2026-08-29) -------
const BOARD = {"cols":16,"rows":12,"kinds":["cliff-cascade","cliff-ramp","cliff-transition","dock","inland","islet","ocean","post-office","river-bend","river-cascade","river-mouth","river-spring","river-straight","shore","shore-corner","shore-cove"],"acres":[[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.22],[6,0,0,-1.2],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.2],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.2],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.23],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.23],[14,0,0,-0.38],[15,0,0,-0.01],[13,0,0,-0.23],[15,0,0,-0.12],[13,0,0,-0.22],[15,0,0,0.19],[15,0,0,-0.11],[13,0,0,-0.08],[15,0,0,0.19],[15,0,0,-0.11],[13,0,0,-0.23],[14,0,0,-0.4],[6,0,0,-1.22],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.2],[15,0,0,0.07],[4,0,0,0.5],[2,0,0,0.78],[2,0,0,1.26],[2,0,0,1.26],[2,0,0,1.26],[2,0,0,1.26],[2,0,0,1.26],[2,0,0,1.26],[2,0,0,0.78],[4,0,0,0.5],[13,0,0,-0.07],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[15,0,0,-0.12],[2,0,0,0.78],[2,0,0,1.75],[2,1,0,2.48],[2,1,0,3],[2,1,0,3],[2,1,0,3],[2,1,0,3],[2,1,0,2.48],[2,0,0,1.71],[2,0,0,0.78],[13,0,0,-0.25],[6,0,0,-1.24],[6,0,0,-1.24],[5,0,0,-1.24],[6,0,0,-1.24],[13,0,0,-0.25],[2,0,0,1.26],[2,1,0,2.48],[2,1,0,3.38],[11,2,0,3.5],[8,2,0,3.56],[2,1,0,3.34],[2,1,0,2.93],[2,1,0,2.48],[4,1,0,2.2],[2,0,0,1.23],[13,0,0,-0.06],[6,0,0,-1.22],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[13,0,0,-0.12],[2,0,0,1.26],[2,1,0,2.48],[2,1,0,2.93],[1,1,0,2.96],[0,1,0,2.65],[1,1,0.12,2.55],[4,1,0.14,2.2],[8,1,0.14,1.89],[12,1,0.14,1.92],[0,0,0.14,0.95],[10,0,0.14,0.08],[6,0,0.14,-1.15],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[13,0,0,-0.24],[2,0,0,1.26],[7,1,0,2.2],[4,1,0,2.2],[4,1,0,2.2],[9,1,0,1.9],[12,1,0.86,1.92],[12,1,0.67,1.92],[8,1,1,1.95],[2,0,1,1.68],[2,0,1,0.78],[13,0,1,-0.2],[6,0,1,-1.22],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[15,0,0,-0.12],[2,0,0,0.78],[2,0,0,1.71],[4,1,0,2.2],[2,0,0,1.68],[2,0,0,1.23],[2,0,0.86,1.23],[2,0,0.55,1.23],[1,0,1,1.44],[2,0,1,0.78],[4,0,1,0.5],[13,0,1,-0.25],[6,0,1,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[13,0,0,-0.23],[4,0,0,0.5],[2,0,0,0.78],[2,0,0,1.23],[2,0,0,0.78],[4,0,0,0.5],[4,0,0.86,0.68],[13,0,1,-0.06],[13,0,1,-0.25],[13,0,1,-0.26],[13,0,1,-0.24],[14,0,1,-0.4],[6,0,1,-1.23],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.22],[14,0,0,-0.41],[13,0,0,-0.26],[3,0,0,0.01],[13,0,0,-0.09],[13,0,0,-0.26],[13,0,0,-0.24],[14,0,0.86,-0.36],[6,0,1,-1.19],[6,0,1,-1.24],[6,0,1,-1.24],[6,0,1,-1.24],[6,0,1,-1.22],[6,0,1,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.23],[6,0,0,-1.24],[6,0,0,-1.19],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0,-1.24],[6,0,0.86,-1.22],[6,0,1,-1.24],[6,0,1,-1.24],[6,0,1,-1.24],[6,0,1,-1.24],[6,0,1,-1.24],[6,0,1,-1.24]],"fakeBorders":[{"col":12,"row":6,"axis":"x","units":2},{"col":12,"row":6,"axis":"z","units":13.5},{"col":9,"row":7,"axis":"z","units":12},{"col":10,"row":7,"axis":"z","units":2},{"col":11,"row":7,"axis":"x","units":13.5},{"col":11,"row":7,"axis":"z","units":13.5}],"falseUnits":56.5,"trueUnits":0,"byTier":[1539,151,0]};

// --- constants read off the live build --------------------------------------
const PX_PER_UNIT = 35.7;   // one world unit across, in the 480x360 buffer
const DETAIL_TILE = 3.2;    // DETAIL_TILE_UNITS in terrain.ts
const ACRE = 14;            // ACRE_SIZE

// --- colour -----------------------------------------------------------------
const hex2rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const rgb2css = (r, g, b) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
const srgb2lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lin2srgb = (c) => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

// --- noise, transcribed from terrain.ts -------------------------------------
function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 10000) / 10000;
}
/** `tileNoise` — value noise that wraps every `period` cells. */
function tileNoise(x, z, period) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const w = (n) => ((n % period) + period) % period;
  const a = hash2(w(ix), w(iz)), b = hash2(w(ix + 1), w(iz));
  const c = hash2(w(ix), w(iz + 1)), d = hash2(w(ix + 1), w(iz + 1));
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
/**
 * Rotate a world point before sampling.
 *
 * **Every noise function in `terrain.ts` is sampled on the world axes**, and
 * value noise on an integer lattice carries that lattice: its extrema sit on
 * grid lines, so several octaves stacked in the same frame read as a plaid
 * rather than as a field. It is the same complaint `AGENTS.md` rule 4 makes
 * about the plaza's grid of ovals, one level down. Giving each octave its own
 * angle costs two multiplies and takes the grid out.
 */
function rot(x, z, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - z * s, x * s + z * c];
}

/** Non-tiling value noise at a feature size in world units. */
function vnoise(x, z, scale, seed = 0) {
  const fx = x / scale, fz = z / scale;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const a = hash2(ix + seed, iz - seed), b = hash2(ix + 1 + seed, iz - seed);
  const c = hash2(ix + seed, iz + 1 - seed), d = hash2(ix + 1 + seed, iz + 1 - seed);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}

/**
 * `makeGroundDetailTexture`, evaluated per point instead of baked to 256px.
 * u,v are tile-relative in 0..1. Returns the three channels the shader reads.
 */
function detailSheet(u, v, band) {
  const TAU = Math.PI * 2;
  // Layer 3's second half: warp the sample point by a low-frequency term
  // before the octaves are read, so the value lattice stops lining up with
  // itself. The warp is drawn from the same tiling noise, so the sheet still
  // tiles — that property is the whole reason this is one 256px texture.
  if (band) {
    const wu = tileNoise(u * 3, v * 3, 3) - 0.5;
    const wv = tileNoise(u * 3 + 7, v * 3 + 3, 3) - 0.5;
    u += wu * 0.10; v += wv * 0.10;
  }
  const clump = tileNoise(u * 8, v * 8, 8);
  const fine = tileNoise(u * 26, v * 26, 26);
  const hatch =
    Math.sin((u * 14 + v * 5) * TAU + clump * 5) * 0.5 +
    Math.sin((v * 17 - u * 4) * TAU + fine * 4) * 0.5;
  const blade = Math.pow(Math.max(0, hatch * 0.5 + 0.5), 2.2);
  // `band` lets the studio show layer 3: amplitude moved out of the terms that
  // land under the buffer's Nyquist limit and into the ones that survive.
  const fineW = band ? 0.09 : 0.34;
  const bladeW = band ? 0.11 : 0.30;   // the cross-hatch: a plaid at this scale
  const clumpW = band ? 0.90 : 0.62;
  let r = 0.5 + (clump - 0.5) * clumpW + (fine - 0.5) * fineW + (blade - 0.45) * bladeW;
  const warp = tileNoise(u * 5, v * 5, 5);
  const ripple = Math.sin((v * 9 + warp * 1.6) * TAU) * 0.5 + 0.5;
  const grit = tileNoise(u * 40, v * 40, 40);
  const g = 0.5 + (ripple - 0.5) * 0.5 + (grit - 0.5) * 0.4;
  const broad = tileNoise(u * 3, v * 3, 3);
  const mid = tileNoise(u * 11, v * 11, 11);
  const b = 0.5 + (broad - 0.5) * 0.7 + (mid - 0.5) * 0.45;
  return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)];
}

// --- the shipped swatches ---------------------------------------------------
const SWATCHES = [
  { name: 'grass, tier 0-1', hex: 0x424932 },
  { name: 'grass, tier 2', hex: 0x707447 },
  { name: 'sand', hex: 0xbea37e },
  { name: 'dirt', hex: 0x5d4c3a },
  { name: 'rock', hex: 0x7f786b },
];
const GRASS_T0 = 0x424932;
const GRASS_T1 = 0x4a5238;  // GRASS_T0 x 1.12, as the painter writes it

/** `applyGroundDetail`'s classifier, on a linear colour. */
function masks(lin, edge = 0.09) {
  const grass = smoothstep(0, edge, lin[1] - lin[0]);
  const sand = smoothstep(0.03, 0.16, lin[0] - lin[2]) * (1 - grass);
  return [grass, sand];
}
const toLin = (hex) => hex2rgb(hex).map(srgb2lin);

// ---------------------------------------------------------------------------
// 1. Hero — today's lawn, at game scale
// ---------------------------------------------------------------------------
/**
 * Paints today's lawn: the tier plate, the acre seam, and the detail sheet at
 * whatever strength the classifier grants it. `opts.mask` overrides the
 * classifier so the studio can show the same code at full strength.
 */
function paintToday(img, w, h, opts = {}) {
  const scale = opts.scale ?? 1;
  const seamAt = opts.seam === false ? null : (opts.seamAt ?? w * 0.52);
  const base = img.data;
  const t0 = hex2rgb(GRASS_T0), t1 = hex2rgb(GRASS_T1);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const wx = (px / PX_PER_UNIT) * scale;
      const wz = (py / (PX_PER_UNIT * 0.74)) * scale; // the camera's foreshortening
      const plate = seamAt !== null && px > seamAt ? t1 : t0;
      const lin = plate.map(srgb2lin);
      const [gm, sm] = opts.forceMask !== undefined ? [opts.forceMask, 0] : masks(lin);
      const dt = detailSheet((wx / DETAIL_TILE) % 1, (wz / DETAIL_TILE) % 1, opts.band);
      const m = 1 + (dt[0] - 0.5) * 0.58 * gm + (dt[1] - 0.5) * 0.40 * sm + (dt[2] - 0.5) * 0.16;
      for (let c = 0; c < 3; c++) base[i + c] = clamp(plate[c] * m, 0, 255);
      base[i + 3] = 255;
    }
  }
}

function drawHero() {
  const cv = document.getElementById('heroCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(cv.width, cv.height);
  paintToday(img, cv.width, cv.height);
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// 2. The mask lab
// ---------------------------------------------------------------------------
function drawMask() {
  const cv = document.getElementById('maskCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const edge = +document.getElementById('maskEdge').value;
  const showSand = document.getElementById('maskShowSand').checked;
  const W = cv.width, H = cv.height;
  const padL = 62, padR = 24, padT = 22, padB = 52;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const XMAX = 0.16;
  const X = (v) => x0 + (v / XMAX) * (x1 - x0);
  const Y = (v) => y1 - v * (y1 - y0);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0e1209'; ctx.fillRect(0, 0, W, H);

  // grid
  ctx.strokeStyle = '#2b3323'; ctx.lineWidth = 1;
  ctx.font = '11px ui-monospace, Menlo, monospace';
  for (let v = 0; v <= 1.001; v += 0.25) {
    ctx.beginPath(); ctx.moveTo(x0, Y(v)); ctx.lineTo(x1, Y(v)); ctx.stroke();
    ctx.fillStyle = '#7f8a71'; ctx.fillText(v.toFixed(2), 20, Y(v) + 4);
  }
  for (let v = 0; v <= XMAX + 1e-6; v += 0.02) {
    ctx.beginPath(); ctx.moveTo(X(v), y0); ctx.lineTo(X(v), y1); ctx.stroke();
    ctx.fillStyle = '#7f8a71'; ctx.fillText(v.toFixed(2), X(v) - 12, y1 + 17);
  }
  ctx.fillStyle = '#9aa48c'; ctx.font = '12px Georgia, serif';
  ctx.fillText('g − r, linear', (x0 + x1) / 2 - 34, y1 + 38);
  ctx.save(); ctx.translate(15, (y0 + y1) / 2 + 30); ctx.rotate(-Math.PI / 2);
  ctx.fillText('mask', 0, 0); ctx.restore();

  // the sand test, drawn on its own axis for context
  if (showSand) {
    ctx.strokeStyle = '#6b5a3a'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const v = (i / 200) * XMAX;
      const p = smoothstep(0.03, 0.16, v);
      i ? ctx.lineTo(X(v), Y(p)) : ctx.moveTo(X(v), Y(p));
    }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#8a7551'; ctx.font = '11px Georgia, serif';
    ctx.fillText('sand test, on r − b', X(0.115), Y(0.78));
  }

  // shipped curve, ghosted
  ctx.strokeStyle = '#414c36'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
  ctx.beginPath();
  for (let i = 0; i <= 300; i++) {
    const v = (i / 300) * XMAX, p = smoothstep(0, 0.09, v);
    i ? ctx.lineTo(X(v), Y(p)) : ctx.moveTo(X(v), Y(p));
  }
  ctx.stroke(); ctx.setLineDash([]);

  // live curve
  ctx.strokeStyle = '#a8bd63'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i <= 300; i++) {
    const v = (i / 300) * XMAX, p = smoothstep(0, edge, v);
    i ? ctx.lineTo(X(v), Y(p)) : ctx.moveTo(X(v), Y(p));
  }
  ctx.stroke();

  // The swatches, at their real positions. The two grass hexes land 0.0005
  // apart on this axis, so the labels go in a legend with leaders rather than
  // beside the dots, where they would sit on top of each other.
  let grassMask = 0;
  const plotted = [];
  for (const s of SWATCHES) {
    const lin = toLin(s.hex);
    const d = lin[1] - lin[0];
    if (d <= 0) continue;
    const p = smoothstep(0, edge, d);
    if (s.name.startsWith('grass, tier 0')) grassMask = p;
    plotted.push({ ...s, d, p, cx: X(d), cy: Y(p) });
  }
  const legX = x0 + 26, legY = y0 + 18;
  plotted.forEach((s, i) => {
    const ly = legY + i * 22;
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(legX + 200, ly - 4); ctx.lineTo(s.cx, s.cy - 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s.cx, y1); ctx.lineTo(s.cx, s.cy); ctx.stroke();
    ctx.beginPath(); ctx.arc(s.cx, s.cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = rgb2css(...hex2rgb(s.hex)); ctx.fill();
    ctx.strokeStyle = '#e9e6d2'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = rgb2css(...hex2rgb(s.hex));
    ctx.fillRect(legX, ly - 12, 12, 12);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(legX + 0.5, ly - 11.5, 11, 11);
    ctx.fillStyle = '#e2e6d4'; ctx.font = '12px Georgia, serif';
    ctx.fillText(s.name, legX + 19, ly - 1);
    ctx.fillStyle = s.p < 0.2 ? '#d68c72' : '#b9cc7e';
    ctx.font = '12px ui-monospace, Menlo, monospace';
    ctx.fillText(s.p.toFixed(3), legX + 152, ly - 1);
  });
  // The three that score zero never reach the axis; say so rather than
  // leaving the reader to wonder where they went.
  ctx.fillStyle = '#6f7a62'; ctx.font = '12px Georgia, serif';
  ctx.fillText('sand, dirt and rock sit at or left of zero — they are never grass, correctly', x0 + 6, y1 - 10);

  document.getElementById('maskEdgeV').textContent = edge.toFixed(3);
  const swing = 2 * (0.5 * 0.58 * grassMask + 0.5 * 0.16);
  const dirtLin = toLin(0x5d4c3a), rockLin = toLin(0x7f786b);
  const bleed = Math.max(smoothstep(0, edge, dirtLin[1] - dirtLin[0]), smoothstep(0, edge, rockLin[1] - rockLin[0]));
  const v = document.getElementById('maskVerdict');
  v.innerHTML = edge > 0.0855 && edge < 0.0945
    ? `<b>Shipped setting.</b> Grass scores <span class="num">${grassMask.toFixed(3)}</span>, so the detail sheet may move a grass texel by <span class="num">±${(swing / 2).toFixed(3)}</span> — nearly all of it the neutral blue channel, which every surface gets. The blade channel contributes <span class="num">±${(0.5 * 0.58 * grassMask).toFixed(3)}</span>.`
    : edge < 0.016
      ? `<b>Threshold at <span class="num">${edge.toFixed(3)}</span>.</b> Grass now scores <span class="num">${grassMask.toFixed(3)}</span> — but the margin is gone: the whole ground palette lives inside 0.04 of g − r, so a swatch change of a few points either way flips a material's identity. This is why the fix is to stop asking the pixel and start reading the material id the painter already knows. ${bleed > 0.05 ? `Dirt and rock are already bleeding in at <span class="num">${bleed.toFixed(2)}</span>.` : ''}`
      : `<b>Threshold at <span class="num">${edge.toFixed(3)}</span>.</b> Grass scores <span class="num">${grassMask.toFixed(3)}</span>; the sheet's swing on the lawn is <span class="num">±${(swing / 2).toFixed(3)}</span>. Authored full strength is ±0.29.`;
}

// ---------------------------------------------------------------------------
// 3. The lattice lab
// ---------------------------------------------------------------------------
function drawLattice() {
  const cv = document.getElementById('latticeCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const mode = document.getElementById('latticeMode').value;
  const showSeams = document.getElementById('latticeSeams').checked;
  const showGrid = document.getElementById('latticeGrid').checked;
  const W = cv.width, H = cv.height;
  const cw = W / BOARD.cols, ch = H / BOARD.rows;
  ctx.fillStyle = '#0e1209'; ctx.fillRect(0, 0, W, H);

  const land = BOARD.acres.filter((a) => a && a.g > 0.02);
  const hs = land.map((a) => a[3]);
  const hMin = Math.min(...hs), hMax = Math.max(...hs);

  for (let r = 0; r < BOARD.rows; r++) {
    for (let c = 0; c < BOARD.cols; c++) {
      const a = BOARD.acres[r * BOARD.cols + c];
      const x = c * cw, y = r * ch;
      if (!a) { ctx.fillStyle = '#131a12'; ctx.fillRect(x, y, cw, ch); continue; }
      const [ki, tier, grass, height] = a;
      if (grass < 0.02) {
        // Not lawn: draw it as the water or sand it is, so the board reads.
        const kind = BOARD.kinds[ki];
        // Dimmed on purpose: the lawn is the subject of this panel and the
        // sea should not out-contrast it.
        ctx.fillStyle = kind.startsWith('ocean') ? '#161f24'
          : kind.startsWith('river') ? '#1c2e35' : '#2a271e';
        ctx.fillRect(x, y, cw, ch);
        continue;
      }
      let v;
      if (mode === 'tier') v = tier / 2;
      else if (mode === 'height') v = (height - hMin) / Math.max(0.001, hMax - hMin);
      else {
        const t = tier / 2, hnorm = (height - hMin) / Math.max(0.001, hMax - hMin);
        v = Math.abs(t - hnorm);
        // The difference view is a heat map, not a lawn.
        const rgb = hsl2rgb(mix(120, 8, clamp(v * 2.2, 0, 1)), 0.42, mix(0.20, 0.46, clamp(v * 2.2, 0, 1)));
        ctx.fillStyle = rgb2css(...rgb); ctx.fillRect(x, y, cw, ch);
        ctx.globalAlpha = 0.5; ctx.fillStyle = '#000';
        ctx.globalAlpha = 1;
        continue;
      }
      // The painter's own ladder: the tier-0 swatch, times 1 + tier x 0.12.
      const base = hex2rgb(GRASS_T0);
      const mul = mode === 'tier' ? 1 + tier * 0.12 : 1 + v * 0.24;
      ctx.fillStyle = rgb2css(...base.map((cch) => clamp(cch * mul, 0, 255)));
      ctx.fillRect(x, y, cw, ch);
      // The 12% step is real but small; the digit says which plate this is
      // without exaggerating the colour that carries the finding.
      if (mode === 'tier') {
        ctx.fillStyle = 'rgba(255,255,255,.30)';
        ctx.font = '10px ui-monospace, Menlo, monospace';
        ctx.fillText(String(tier), x + 4, y + 12);
      }
    }
  }

  if (showGrid) {
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
    for (let c = 0; c <= BOARD.cols; c++) { ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, H); ctx.stroke(); }
    for (let r = 0; r <= BOARD.rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(W, r * ch); ctx.stroke(); }
  }

  if (showSeams) {
    for (const b of BOARD.fakeBorders) {
      const x = b.col * cw, y = b.row * ch;
      ctx.strokeStyle = '#e2603f';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      if (b.axis === 'x') { ctx.moveTo(x + cw, y + 2); ctx.lineTo(x + cw, y + ch - 2); }
      else { ctx.moveTo(x + 2, y + ch); ctx.lineTo(x + cw - 2, y + ch); }
      ctx.stroke();
      ctx.fillStyle = '#f2d5c8'; ctx.font = '10px ui-monospace, Menlo, monospace';
      const lx = b.axis === 'x' ? x + cw + 4 : x + 4;
      const ly = b.axis === 'x' ? y + ch / 2 : y + ch - 5;
      ctx.fillText(`${b.units}u`, lx, ly);
    }
  }

  const cap = document.getElementById('latticeCap');
  const sub = document.getElementById('latticeSub');
  cap.textContent = mode === 'tier' ? 'Acre tier — what the painter reads'
    : mode === 'height' ? 'Mean ground height — the field in the next variable'
      : 'The difference — where the two disagree';
  sub.textContent = mode === 'tier'
    ? 'Three flat values across the whole island, snapped to acre rectangles. This is the shading term, exactly.'
    : mode === 'height' ? `Continuous from ${hMin.toFixed(2)} u to ${hMax.toFixed(2)} u. Acres that carry a climb inside them are no longer one value.`
      : 'Red is an acre whose declared tier does not describe the ground standing on it — a cliff, ramp or transition piece with two heights and one integer.';

  document.getElementById('latticeVerdict').innerHTML =
    `<b>${BOARD.falseUnits} world units</b> of grass-to-grass acre border where the painted value steps and the ground does not, against <b>${BOARD.trueUnits} units</b> where both step together. Across the whole shipped map, <b>every single tier seam on the lawn is a false one</b>. Grass by tier: ${BOARD.byTier[0]} / ${BOARD.byTier[1]} / ${BOARD.byTier[2]} authored cells.`;
}

/**
 * The worst border, in section.
 *
 * Three tracks over one axis, because the whole finding is that two of them
 * disagree: what the lawn is painted, what the ground is doing, and where the
 * two part company. Drawing the paint *on* the profile hides exactly the thing
 * being shown, which is that its step is somewhere else.
 */
function drawLatticeZoom() {
  const cv = document.getElementById('latticeZoom');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.fillStyle = '#0e1209'; ctx.fillRect(0, 0, W, H);
  const padL = 20, padR = 20;
  const x0 = padL, x1 = W - padR;
  const span = 28;                       // world units across, border at 14
  const X = (u) => x0 + (u / span) * (x1 - x0);
  const BORDER = 14;

  /** The measured shape: a tier-0 transition acre that climbs inside itself. */
  const profile = (u) => (u < 9 ? 0.5 : u < 14 ? 0.5 + smoothstep(9, 14, u) * 1.7 : 2.2);

  const label = (text, x, y, col, font) => {
    ctx.fillStyle = col; ctx.font = font || '12px Georgia, serif'; ctx.fillText(text, x, y);
  };

  // --- track 1: what the lawn is painted ------------------------------------
  const t1y = 52, t1h = 36;
  label('WHAT THE LAWN IS PAINTED', x0, t1y - 12, '#8e9880', '11px ui-monospace, Menlo, monospace');
  for (let i = 0; i < 420; i++) {
    const u = (i / 420) * span;
    ctx.fillStyle = rgb2css(...hex2rgb(u < BORDER ? GRASS_T0 : GRASS_T1));
    ctx.fillRect(X(u), t1y, (x1 - x0) / 420 + 1, t1h);
  }
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
  ctx.strokeRect(x0 + .5, t1y + .5, x1 - x0 - 1, t1h - 1);
  label('#424932', X(1), t1y + t1h + 15, '#9aa48c', '11px ui-monospace, Menlo, monospace');
  label('#4a5238  — 12% brighter', X(15), t1y + t1h + 15, '#c3cda6', '11px ui-monospace, Menlo, monospace');

  // --- track 2: what the ground is doing ------------------------------------
  const t2y = 148, t2h = 232;
  label('WHAT THE GROUND IS DOING', x0, t2y - 10, '#8e9880', '11px ui-monospace, Menlo, monospace');
  const gy = (hh) => t2y + t2h - (hh / 2.6) * (t2h - 26);
  ctx.beginPath();
  ctx.moveTo(X(0), gy(profile(0)));
  for (let i = 1; i <= 420; i++) ctx.lineTo(X((i / 420) * span), gy(profile((i / 420) * span)));
  ctx.lineTo(X(span), t2y + t2h); ctx.lineTo(X(0), t2y + t2h); ctx.closePath();
  ctx.fillStyle = '#2d3626'; ctx.fill();
  ctx.strokeStyle = '#d8cfa8'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(X(0), gy(profile(0)));
  for (let i = 1; i <= 420; i++) ctx.lineTo(X((i / 420) * span), gy(profile((i / 420) * span)));
  ctx.stroke();
  // the climb, called out where it actually is
  ctx.strokeStyle = 'rgba(216,207,168,.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(X(9), t2y + 4); ctx.lineTo(X(9), t2y + t2h);
  ctx.moveTo(X(14), t2y + 4); ctx.lineTo(X(14), t2y + t2h); ctx.stroke();
  ctx.setLineDash([]);
  label('the ground climbs here', X(9.2), t2y + 18, '#e6dcb4');
  label('0.5 u', X(3), gy(0.5) - 9, '#a9b294', '11px ui-monospace, Menlo, monospace');
  label('2.2 u', X(20), gy(2.2) - 9, '#a9b294', '11px ui-monospace, Menlo, monospace');

  // --- the acre border, through both tracks ---------------------------------
  ctx.strokeStyle = '#e2603f'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(X(BORDER), t1y - 6); ctx.lineTo(X(BORDER), t2y + t2h + 8); ctx.stroke();
  ctx.setLineDash([]);
  label('acre border', X(BORDER) + 7, t1y - 20, '#e2603f');

  // --- track 3: the disagreement --------------------------------------------
  const t3y = t2y + t2h + 40;
  label('14 units of flat ground, painted 12% brighter than the flat ground it continues',
    X(0.4), t3y - 9, '#efb9a6', '12.5px Georgia, serif');
  ctx.fillStyle = 'rgba(226,96,63,.28)';
  ctx.fillRect(X(BORDER), t3y, X(span) - X(BORDER), 18);
  ctx.strokeStyle = '#e2603f'; ctx.lineWidth = 1.5;
  ctx.strokeRect(X(BORDER) + .5, t3y + .5, X(span) - X(BORDER) - 1, 17);

  ctx.fillStyle = '#8e9880'; ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.fillText('tier 0 acre — 14 u', X(0.4), t3y + 40);
  ctx.fillText('tier 1 acre — 14 u', X(14.4), t3y + 40);
}

// ---------------------------------------------------------------------------
// 4. The grass studio
// ---------------------------------------------------------------------------
/** The four-stop ramp this page proposes. Hue and value move together. */
function grassRamp(hueSpread, valSpread) {
  // Centre of mass is deliberately where the Era 1 grade left it: hue 78,
  // sat 0.19, luma 0.27. Only the spread is authored here.
  const H0 = 78, S0 = 0.21, L0 = 0.235;
  return [
    { at: 0.00, h: H0 - hueSpread * 0.75, s: S0 * 0.86, l: L0 + valSpread * 0.42 }, // dry / sunburnt
    { at: 0.38, h: H0 - hueSpread * 0.10, s: S0, l: L0 + valSpread * 0.06 },        // the lawn
    { at: 0.72, h: H0 + hueSpread * 0.62, s: S0 * 1.18, l: L0 - valSpread * 0.18 }, // lush
    { at: 1.00, h: H0 + hueSpread * 0.90, s: S0 * 1.05, l: L0 - valSpread * 0.50 }, // deep / shaded
  ];
}
function sampleRamp(ramp, t) {
  t = clamp(t, 0, 1);
  let a = ramp[0], b = ramp[ramp.length - 1];
  for (let i = 0; i < ramp.length - 1; i++) {
    if (t >= ramp[i].at && t <= ramp[i + 1].at) { a = ramp[i]; b = ramp[i + 1]; break; }
  }
  const k = b.at === a.at ? 0 : (t - a.at) / (b.at - a.at);
  return hsl2rgb(mix(a.h, b.h, k), mix(a.s, b.s, k), mix(a.l, b.l, k));
}

/** The season table, as ramp shifts rather than as a multiply. */
const SEASON_SHIFT = {
  spring: { hue: -8, sat: 1.10, lum: +0.020, dry: 0.10, cover: 1.15, accent: '#e9c8d6' },
  summer: { hue: 0, sat: 1.00, lum: 0.000, dry: 0.22, cover: 1.00, accent: '#e6d089' },
  autumn: { hue: -20, sat: 1.14, lum: -0.012, dry: 0.52, cover: 0.62, accent: '#cf8a45' },
  winter: { hue: +6, sat: 0.62, lum: -0.030, dry: 0.34, cover: 0.28, accent: '#cfd8dc' },
};

const LAYERS = [
  { id: 'macro', on: true, name: 'Macro mottle', note: 'Three rotated octaves at 11 u, 4.5 u and 1.8 u, driving position along the ramp rather than brightness. Baked into the ground sheet — free, the painter already walks every texel.' },
  { id: 'ramp', on: true, name: 'Four-stop ramp', note: 'Hue and value move together instead of one brightness multiplier. Centre of mass unchanged from the shipped swatch.' },
  { id: 'blade', on: true, name: 'Blade sheet, unmasked', note: 'The existing detail sheet at the strength it was authored for. This layer is not new — it is F2 repaired.' },
  { id: 'band', on: true, name: 'Sheet rebalanced', note: 'Amplitude moved out of the 26- and 40-cycle terms, which land under the buffer\'s Nyquist limit, into the 8-cycle clump that survives.' },
  { id: 'wear', on: true, name: 'Wear field', note: 'Traffic thins and pales the lawn and suppresses cover. Same accumulate-and-quantise path as WetnessField.' },
  { id: 'cover', on: true, name: 'Ground cover', note: 'Blue-noise tufts and clover, density from the macro field. One InstancedMesh in the engine; drawn here at its screen footprint.' },
];

function studioState() {
  const on = {};
  for (const l of LAYERS) on[l.id] = document.getElementById('L_' + l.id)?.checked ?? l.on;
  return {
    on,
    season: document.getElementById('studioSeason').value,
    zoom: +document.getElementById('studioZoom').value,
    hue: +document.getElementById('studioHue').value,
    val: +document.getElementById('studioVal').value,
    squeeze: document.getElementById('studioSqueeze').checked,
    seam: document.getElementById('studioSeam').checked,
  };
}

/** Wear: a route across the patch, plus a wide apron. 0 = untouched, 1 = bare. */
function wearAt(wx, wz) {
  // A path that bends, so it does not read as a painted stripe.
  const cz = 4.1 + Math.sin(wx * 0.42) * 1.15 + Math.sin(wx * 0.17 + 1.3) * 0.6
    + (vnoise(wx, 0, 2.6, 61) - 0.5) * 0.9;
  const d = Math.abs(wz - cz);
  // The edge wanders by a fifth of a unit, which is what stops a worn path
  // reading as a painted stripe — the same argument EDGE_WOBBLE makes for the
  // sand boundary in `terrain.ts`.
  const rw = rot(wx, wz, 0.87);
  const wobble = (vnoise(rw[0], rw[1], 0.9, 29) - 0.5) * 0.42;
  const core = 1 - smoothstep(0.30 + wobble, 1.45 + wobble, d);
  return clamp(core * (0.70 + vnoise(wx, wz, 1.1, 17) * 0.55), 0, 1);
}

function paintProposed(img, w, h, st) {
  const data = img.data;
  const S = SEASON_SHIFT[st.season];
  const ramp = grassRamp(st.hue, st.val).map((s) => ({
    at: s.at, h: s.h + S.hue, s: s.s * S.sat, l: clamp(s.l + S.lum, 0.05, 0.6),
  }));
  const zoom = st.zoom;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const wx = (px / PX_PER_UNIT) * zoom;
      const wz = (py / (PX_PER_UNIT * 0.74)) * zoom;

      // --- layer 1: macro mottle, the only thing that decides ramp position
      let t = 0.5;
      if (st.on.macro) {
        // Three octaves, not two. The 11 u term alone reads as soft cloud;
        // the 1.8 u term is what gives the field an edge to catch the light on.
        const r1 = rot(wx, wz, 0.31), r2 = rot(wx, wz, 1.19), r3 = rot(wx, wz, 2.41);
        const a = vnoise(r1[0], r1[1], 11, 3);
        const b = vnoise(r2[0], r2[1], 4.5, 91);
        const cc = vnoise(r3[0], r3[1], 1.8, 41);
        t = clamp(a * 0.50 + b * 0.32 + cc * 0.18, 0, 1);
        t = smoothstep(0.20, 0.80, t);
      }
      // Seasonal dryness pulls the whole field toward the pale end.
      t = clamp(t * (1 - S.dry * 0.55), 0, 1);

      // --- layer 4: wear, before the ramp so it moves colour, not just light
      const wear = st.on.wear ? wearAt(wx, wz) : 0;
      t = clamp(t - wear * 0.62, 0, 1);

      // --- layer 2: the ramp
      let rgb = st.on.ramp ? sampleRamp(ramp, t)
        : hex2rgb(GRASS_T0).map((c) => clamp(c * (1 + t * 0.12), 0, 255));

      // --- layer 3: the blade sheet, at full strength, told what it is on
      if (st.on.blade) {
        const dt = detailSheet((wx / DETAIL_TILE) % 1, (wz / DETAIL_TILE) % 1, st.on.band);
        // Wear thins the blades as well as paling them.
        const m = 1 + (dt[0] - 0.5) * 0.58 * (1 - wear * 0.7) + (dt[2] - 0.5) * 0.16;
        rgb = rgb.map((c) => clamp(c * m, 0, 255));
      }
      // Bare earth showing through the worn core.
      if (wear > 0.72) {
        const k = smoothstep(0.72, 0.98, wear);
        const soil = hex2rgb(0x5d4c3a);
        rgb = rgb.map((c, ci) => mix(c, soil[ci], k * 0.72));
      }
      for (let c = 0; c < 3; c++) data[i + c] = rgb[c];
      data[i + 3] = 255;
    }
  }

  // --- layer 5: ground cover, drawn at its screen footprint ------------------
  //
  // In the engine this is one InstancedMesh of cross-quads re-anchored to the
  // camera each frame — a fixed pool, not an island-wide scatter, which is what
  // keeps the count constant and the density high where anyone can see it.
  // Here each instance is drawn at the two or three pixels it would cover.
  if (!st.on.cover) return;
  const put = (px, py, r, g, b, a) => {
    px = Math.round(px); py = Math.round(py);
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    const i = (py * w + px) * 4;
    data[i] = mix(data[i], r, a);
    data[i + 1] = mix(data[i + 1], g, a);
    data[i + 2] = mix(data[i + 2], b, a);
  };
  const SPACING = 0.45;                                  // world units between candidates
  const worldW = (w / PX_PER_UNIT) * st.zoom;
  const worldD = (h / (PX_PER_UNIT * 0.74)) * st.zoom;
  const cols = Math.ceil(worldW / SPACING) + 1;
  const rows = Math.ceil(worldD / SPACING) + 2;          // +2: tufts lean up out of frame
  const accent = hex2rgb(parseInt(SEASON_SHIFT[st.season].accent.slice(1), 16));
  const coverSeason = SEASON_SHIFT[st.season].cover;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Jittered lattice: cheap blue noise, the same trick the scatter uses —
      // a plain grid of tufts is the plaza's ovals all over again.
      const jx = hash2(c * 7 + 1, r * 13 + 5), jz = hash2(c * 17 + 3, r * 5 + 11);
      // Row offset as well as cell jitter: a jittered square lattice still
      // bands at this spacing, and banding is the tell of a generated scatter.
      const stagger = (r % 2) * 0.5 + hash2(r * 23 + 7, 3) * 0.35;
      const wx = (c + jx + stagger) * SPACING, wz = (r + jz * 1.35) * SPACING;
      const px = (wx / st.zoom) * PX_PER_UNIT;
      const py = (wz / st.zoom) * PX_PER_UNIT * 0.74;
      if (px < -6 || py < -10 || px > w + 6 || py > h + 10) continue;
      const wear = st.on.wear ? wearAt(wx, wz) : 0;
      const dr = rot(wx, wz, 0.31);
      const dens = st.on.macro ? clamp(smoothstep(0.10, 0.90, vnoise(dr[0], dr[1], 11, 3)), 0, 1) : 0.55;
      // Thin, not bald: even the sparse end keeps some cover, or the macro
      // field reads as a mask rather than as ground.
      const keep = (0.34 + dens * 0.66) * coverSeason * (1 - wear * 0.92);
      if (hash2(c * 31 + 7, r * 29 + 3) > keep) continue;
      // A tuft: a stem darker than the ground it stands on, a lit tip, and a
      // lean so no two read as the same object.
      const under = (clamp(Math.round(py), 0, h - 1) * w + clamp(Math.round(px), 0, w - 1)) * 4;
      const base = [data[under], data[under + 1], data[under + 2]];
      // **Low contrast on purpose.** A tuft two shades off the ground reads as
      // ground with texture on it; a black one reads as an insect, which is
      // what the first pass of this panel looked like.
      const dark = base.map((v) => clamp(v * 0.74 - 2, 0, 255));
      const tip = base.map((v, i) => clamp(v * 1.30 + (i === 1 ? 9 : 3), 0, 255));
      const tall = 4 + Math.floor(hash2(c * 3, r * 9) * 3);
      const lean = hash2(c * 5 + 2, r * 7 + 4) < 0.5 ? -1 : 1;
      for (let k = 0; k < tall; k++) {
        const dx = k >= tall - 2 ? lean : 0;
        put(px + dx, py - k, dark[0], dark[1], dark[2], 0.52 + 0.18 * (k / tall));
      }
      put(px + lean, py - tall, tip[0], tip[1], tip[2], 0.62);
      // A second blade off the same root, most of the time.
      if (hash2(c * 11 + 5, r * 3 + 7) > 0.35) {
        const t2 = Math.max(2, tall - 2);
        for (let k = 0; k < t2; k++) put(px - lean, py - k, dark[0], dark[1], dark[2], 0.44);
        put(px - lean * 2, py - t2, tip[0], tip[1], tip[2], 0.4);
      }
      // Clover and flower heads, at a fraction of the density.
      if (hash2(c * 41 + 13, r * 23 + 19) > 0.94) {
        put(px, py - tall, accent[0], accent[1], accent[2], 0.72);
        put(px + lean, py - tall + 1, accent[0], accent[1], accent[2], 0.44);
      }
    }
  }
}

function drawStudio() {
  const a = document.getElementById('studioA'), b = document.getElementById('studioB');
  if (!a || !b) return;
  const st = studioState();
  const step = st.squeeze ? 2 : 1;
  const W = a.width, H = a.height;

  const actx = a.getContext('2d');
  const aimg = actx.createImageData(W, H);
  paintToday(aimg, W, H, { scale: st.zoom, seam: st.seam, seamAt: W * 0.52 });
  actx.putImageData(aimg, 0, 0);

  const bctx = b.getContext('2d');
  const bimg = bctx.createImageData(W, H);
  paintProposed(bimg, W, H, st);
  bctx.putImageData(bimg, 0, 0);

  if (step === 2) {
    for (const ctx of [actx, bctx]) {
      const src = ctx.getImageData(0, 0, W, H);
      const out = ctx.createImageData(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const sx = (x >> 1) << 1, sy = (y >> 1) << 1;
        const si = (sy * W + sx) * 4, di = (y * W + x) * 4;
        for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c];
      }
      ctx.putImageData(out, 0, 0);
    }
  }

  /**
   * Measure both panels the same way.
   *
   * **Not a distinct-colour count.** These are rendered pixels, and the shader's
   * neutral breakup channel already dithers today's flat plate across dozens of
   * near-identical values — a count would report the shipped lawn as varied
   * when it is one tone wobbling by five levels. The gate's SPREAD assertion
   * runs on the *baked sheet*, before that, where two hexes really are 98% of
   * the lawn. What is comparable on screen is how much of the frame sits at one
   * value: the share within 2.5% luma of the median, and the p5-p95 range.
   */
  const count = (ctx) => {
    const d = ctx.getImageData(0, 0, W, H).data;
    const total = d.length / 4;
    const luma = new Float64Array(total);
    const hues = new Set();
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      luma[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      // Hue bucketed to 6 degrees: how many directions the colour actually goes.
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx - mn > 0.012) {
        let hh;
        if (mx === r) hh = ((g - b) / (mx - mn)) * 60;
        else if (mx === g) hh = (2 + (b - r) / (mx - mn)) * 60;
        else hh = (4 + (r - g) / (mx - mn)) * 60;
        hues.add(Math.round((((hh % 360) + 360) % 360) / 6));
      }
    }
    const sorted = Float64Array.from(luma).sort();
    const med = sorted[total >> 1];
    const p5 = sorted[Math.floor(total * 0.05)], p95 = sorted[Math.floor(total * 0.95)];
    let flat = 0;
    for (let j = 0; j < total; j++) if (Math.abs(luma[j] - med) <= 0.025) flat++;
    return { flat: flat / total, range: p95 - p5, hues: hues.size };
  };
  const ca = count(actx), cb = count(bctx);
  document.getElementById('studioZoomV').textContent = st.zoom.toFixed(2) + '×';
  document.getElementById('studioHueV').textContent = st.hue + '°';
  document.getElementById('studioValV').textContent = st.val.toFixed(2);
  const onNames = LAYERS.filter((l) => st.on[l.id]).length;
  document.getElementById('studioBCap').textContent =
    `${onNames} of 6 layers on, ${st.season}. Same buffer, same scale, same detail sheet.`;
  document.getElementById('studioVerdict').innerHTML =
    `<b>Both panels, measured the same way.</b> Share of the frame within 2.5% luma of its median &mdash; today <span class="num">${(ca.flat * 100).toFixed(1)}%</span>, proposed <span class="num">${(cb.flat * 100).toFixed(1)}%</span>. Luma p5&ndash;p95 &mdash; today <span class="num">${ca.range.toFixed(3)}</span>, proposed <span class="num">${cb.range.toFixed(3)}</span>. Distinct hue directions in 6&deg; buckets &mdash; today <span class="num">${ca.hues}</span>, proposed <span class="num">${cb.hues}</span>. <em>These measure flatness, not quality. Under the jury rule neither panel is approved by any of them.</em>`;

  for (const l of LAYERS) {
    document.getElementById('row_' + l.id)?.classList.toggle('off', !st.on[l.id]);
  }
}

function buildLayerRows() {
  const host = document.getElementById('studioLayers');
  if (!host) return;
  host.innerHTML = LAYERS.map((l, i) => `
    <div class="layer" id="row_${l.id}">
      <input type="checkbox" id="L_${l.id}" ${l.on ? 'checked' : ''} />
      <b>${i + 1} · ${l.name}</b>
      <span>${l.note}</span>
    </div>`).join('');
  for (const l of LAYERS) document.getElementById('L_' + l.id).addEventListener('input', drawStudio);
}

// ---------------------------------------------------------------------------
// 5. The ramp and the scale diagram
// ---------------------------------------------------------------------------
function drawRamp() {
  const cv = document.getElementById('rampCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const hue = +(document.getElementById('studioHue')?.value ?? 26);
  const val = +(document.getElementById('studioVal')?.value ?? 0.16);
  const ramp = grassRamp(hue, val);
  const W = cv.width, H = cv.height;
  for (let x = 0; x < W; x++) {
    const rgb = sampleRamp(ramp, x / (W - 1));
    ctx.fillStyle = rgb2css(...rgb);
    ctx.fillRect(x, 0, 1, H - 34);
  }
  // The shipped pair, for comparison, laid underneath.
  ctx.fillStyle = rgb2css(...hex2rgb(GRASS_T0)); ctx.fillRect(0, H - 30, W / 2, 30);
  ctx.fillStyle = rgb2css(...hex2rgb(GRASS_T1)); ctx.fillRect(W / 2, H - 30, W / 2, 30);
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.fillText('#424932', 8, H - 11); ctx.fillText('#4a5238', W / 2 + 8, H - 11);
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '11px Georgia, serif';
  ctx.fillText('shipped, 98% of the lawn', W - 168, H - 11);

  const stops = ramp.map((s) => {
    const rgb = sampleRamp(ramp, s.at).map(Math.round);
    return { s, hex: '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('') };
  });
  const names = ['dry / sunburnt', 'the lawn', 'lush', 'deep / shaded'];
  document.getElementById('rampReadout').innerHTML = stops.map((st, i) =>
    `<div class="readout-row"><span>${names[i]} — ramp position ${st.s.at.toFixed(2)}</span><b><span class="swatch" style="background:${st.hex}"></span>${st.hex} · h${Math.round(st.s.h)} s${st.s.s.toFixed(2)} l${st.s.l.toFixed(2)}</b></div>`).join('');
}

function drawScale() {
  const cv = document.getElementById('scaleCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.fillStyle = '#f8f1e2'; ctx.fillRect(0, 0, W, H);
  const padL = 116, padR = 18, padT = 26, padB = 40;
  const x0 = padL, x1 = W - padR;
  // log scale, 0.05 u to 30 u
  const LO = Math.log(0.05), HI = Math.log(30);
  const X = (u) => x0 + (Math.log(u) - LO) / (HI - LO) * (x1 - x0);

  // the resolvable band: 2 screen px per feature up to a third of the frame
  const lo = 2 / PX_PER_UNIT, hi = 480 / PX_PER_UNIT / 3;
  ctx.fillStyle = 'rgba(76,90,52,.13)';
  ctx.fillRect(X(lo), padT - 6, X(hi) - X(lo), H - padB - padT + 12);
  ctx.strokeStyle = 'rgba(76,90,52,.4)'; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(X(lo), padT - 6); ctx.lineTo(X(lo), H - padB + 6);
  ctx.moveTo(X(hi), padT - 6); ctx.lineTo(X(hi), H - padB + 6); ctx.stroke();
  ctx.setLineDash([]);

  const bars = [
    { name: 'base sheet', from: 2, to: 30, col: '#6f7a44', note: 'macro mottle, ramp position' },
    { name: 'detail sheet', from: 0.28, to: 1.6, col: '#8b9058', note: 'blades, clumps' },
    { name: 'ground cover', from: 0.18, to: 0.6, col: '#a8bd63', note: 'tufts, clover' },
    { name: 'wear field', from: 1.0, to: 4.0, col: '#775b3f', note: 'paths, bare earth' },
  ];
  const bh = 26, gap = 15;
  ctx.font = '12px Georgia, serif';
  bars.forEach((b, i) => {
    const y = padT + i * (bh + gap);
    ctx.fillStyle = b.col;
    ctx.fillRect(X(b.from), y, X(b.to) - X(b.from), bh);
    ctx.fillStyle = '#29231f'; ctx.textAlign = 'right';
    ctx.fillText(b.name, padL - 10, y + 17);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f6f0e0'; ctx.font = '11px Georgia, serif';
    ctx.fillText(b.note, X(b.from) + 7, y + 17);
    ctx.font = '12px Georgia, serif';
  });

  ctx.fillStyle = '#756d61'; ctx.font = '11px ui-monospace, Menlo, monospace';
  for (const u of [0.1, 0.3, 1, 3, 10, 30]) {
    ctx.fillText(u + ' u', X(u) - 8, H - padB + 20);
    ctx.strokeStyle = 'rgba(0,0,0,.10)';
    ctx.beginPath(); ctx.moveTo(X(u), padT - 6); ctx.lineTo(X(u), H - padB + 4); ctx.stroke();
  }
  ctx.fillStyle = '#4c5a34'; ctx.font = '11px Georgia, serif';
  ctx.fillText('resolvable at the default camera', X(lo) + 6, H - padB - 4);
}

// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  drawHero();
  drawMask();
  drawLattice();
  drawLatticeZoom();
  buildLayerRows();
  drawStudio();
  drawRamp();
  drawScale();

  document.getElementById('maskEdge').addEventListener('input', drawMask);
  document.getElementById('maskShowSand').addEventListener('input', drawMask);
  for (const id of ['latticeMode', 'latticeSeams', 'latticeGrid']) {
    document.getElementById(id).addEventListener('input', drawLattice);
  }
  for (const id of ['studioSeason', 'studioZoom', 'studioSqueeze', 'studioSeam']) {
    document.getElementById(id).addEventListener('input', drawStudio);
  }
  for (const id of ['studioHue', 'studioVal']) {
    document.getElementById(id).addEventListener('input', () => { drawStudio(); drawRamp(); });
  }
});

/**
 * The two stroke sheets every water surface is drawn with, and the world scale
 * they are mapped at.
 *
 * Three things were wrong here and all three were invisible from the source:
 *
 * **They resampled on every load.** `makeWaterTexture` called `Math.random()`
 * forty to sixty times per page load, so no two runs of the review harness
 * photographed the same sea and no before/after pair of the water surface was a
 * comparison. `makeLapTexture` and `makeFallTexture` both already state the rule
 * — a texture that resamples every load cannot be regressed against its own
 * baseline — and these two were the ones that broke it.
 *
 * **The ocean's repeat outlived the mesh it was sized for.** It was set from the
 * span of a 560-unit `PlaneGeometry` carrying normalised 0..1 UVs. That plane
 * was replaced by hand-emitted quads carrying *world* UVs (`x / ACRE_SIZE`), and
 * the repeat stayed. Multiplied together, one tile of a 128x256 sheet covered
 * 0.35 x 0.175 world units: with mipmapping the sea resolved to the average
 * colour of its own texture, which is why the open water measured a 2% colour
 * drift across the entire frame.
 *
 * **Neither sheet was square in world units.** The ocean's tile was 2:1 and the
 * river's 4:1, both against a sheet that is 1:2 — so a round stroke rendered as
 * an ellipse lying across the current. `ChannelFlow` fixed which way a river
 * runs and left the aspect that made its strokes lie across the flow.
 *
 * The rule now: **one tile is `TILE_U` x `TILE_V` world units, chosen so the
 * sheet's texel density matches the framebuffer's pixel density**, and both
 * sheets use it. See `TILE_U`.
 */
import * as THREE from 'three';
import { palette } from '../../art/palette';
import { ACRE_SIZE } from '../island/AcreLibrary';

/**
 * World width of one repeat of a water sheet, in units.
 *
 * Derived, not taste. The sheet is 128 texels across and the retro pipeline
 * renders at 480x360, which works out to about 35 internal pixels per world
 * unit at the shipped camera (measured by projecting two points a unit apart at
 * the player's feet). 128 / 35 = 3.66, so a 3.5-unit tile puts roughly one
 * texel on one pixel — the scale a hand-drawn sheet is meant to be seen at, and
 * the scale below which mipmapping starts averaging the strokes away.
 */
export const TILE_U = 3.5;

/**
 * World length of one repeat, in units.
 *
 * Twice `TILE_U`, because the sheet is 128 x 256. This is the part that was
 * inverted: the old ocean comment argued for a 2:1 world tile to "keep the
 * sheet's own aspect", but a 1:2 sheet needs a 1:2 tile. A 2:1 tile squashes
 * every stroke to a quarter of its drawn length.
 */
export const TILE_V = TILE_U * 2;

/**
 * How fast the open sea drifts, in world units per second.
 *
 * Expressed in world units because that is the only frame in which the number
 * means anything. It used to be "one texture tile per 45 seconds", which sounds
 * slow and was in fact 3.9 millimetres per second — the sea was, measurably,
 * not moving. Against a 3.9 u/s walk this is about a twelfth of walking pace.
 */
export const OCEAN_DRIFT = 0.30;

/**
 * How far the sea slides across its drift, and how fast it breathes.
 *
 * A single linear scroll reads as a conveyor belt to anyone standing still on
 * the dock, which is exactly what the opening asks the player to do.
 */
export const OCEAN_SWAY = 0.09;
export const OCEAN_SWAY_PERIOD = 11;

/**
 * How fast a river runs, in world units per second.
 *
 * Faster than the sea and slower than the player: a stream you can see moving
 * and could still wade against. Applied along the channel's own downstream
 * axis — see `ChannelFlow`.
 */
export const RIVER_FLOW = 0.85;

/**
 * Seconds per advection cycle for the river's flow map.
 *
 * `RIVER_FLOW * FLOW_CYCLE` = 1.7 world units is how far a texel is ever
 * dragged from where it is mapped — just under half a `TILE_U`. Below about a
 * second the cross-fade between the two phases becomes a visible pulse; much
 * above two and the stretching at the end of each cycle starts to show on the
 * strokes. See `FLOW_CHUNK`.
 */
export const FLOW_CYCLE = 2;

/** How fast a falls falls, in world units per second. Order faster again. */
export const FALL_SPEED = 5.0;

/**
 * Map a water sheet onto the world at the shared tile size.
 *
 * Both sheets receive world-space UVs divided by `ACRE_SIZE`, so the repeat that
 * turns one acre into one tile is `ACRE_SIZE / TILE`. Set here rather than at
 * each call site because the two surfaces disagreeing about scale is the defect
 * this module exists to close.
 */
export function applyWaterTiling(texture: THREE.Texture): void {
  texture.repeat.set(ACRE_SIZE / TILE_U, ACRE_SIZE / TILE_V);
}

/**
 * The scroll offset for a surface moving at `speed` world units per second.
 *
 * Takes the tile length rather than assuming it, so a sheet mapped at a
 * different scale still scrolls at the speed it was asked for.
 */
export function scrollOffset(seconds: number, speed: number, tile = TILE_V): number {
  return ((seconds * speed) / tile) % 1;
}

/**
 * A small deterministic generator, seeded per sheet.
 *
 * The same xorshift-multiply `makeLapTexture` uses. Per-sheet seeds rather than
 * one shared stream so that changing the ocean's stroke count cannot silently
 * repaint the river.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), state | 1) >>> 0);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which sheet to draw. */
export type WaterSheet = 'ocean' | 'fresh';

/**
 * Strokes on a neutral ground.
 *
 * **The base fill is a light neutral and that is the point.** It used to be a
 * blue — a slate for the sea, a paler one for fresh — which meant the hue of
 * every water surface was decided twice: once by the sheet and once by the
 * registered tint that multiplies it. Two mid-blues multiplied together land
 * far darker and far greyer than either, which is most of how the sea ended up
 * measuring an olive grey at noon. The sheet now carries *pattern* and the tint
 * carries *colour*, which is what `WaterMaterials` was built to guarantee and
 * could not while the map held a second opinion.
 */
function drawSheet(kind: WaterSheet): HTMLCanvasElement {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = palette.water.sheet.ground;
  ctx.fillRect(0, 0, w, h);

  const ocean = kind === 'ocean';
  const rnd = seeded(ocean ? 0x5f3a91c7 : 0x2b7d44e1);

  // Stroke widths start at 1.5px rather than 1. At the tile size above, one
  // texel is about one screen pixel, and a one-pixel line under vertex snapping
  // crawls rather than sits.
  const strokes = ocean ? 54 : 72;
  for (let i = 0; i < strokes; i++) {
    ctx.strokeStyle = rnd() < 0.5 ? palette.water.sheet.light : palette.water.sheet.dark;
    ctx.globalAlpha = ocean ? 0.13 + rnd() * 0.09 : 0.15 + rnd() * 0.11;
    ctx.lineWidth = 1.5 + rnd() * 2.2;
    ctx.lineCap = 'round';
    const x = rnd() * w;
    const y = rnd() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    if (ocean) {
      // Crests lie *across* the drift: the sheet scrolls along v, so a swell
      // streak runs along u. Long and nearly straight — open water.
      const len = 26 + rnd() * 58;
      ctx.lineTo(x + len, y + (rnd() - 0.5) * 5);
    } else {
      // **Fresh strokes have no preferred direction any more, and that is a
      // requirement of the flow map rather than a taste.**
      //
      // They used to be drawn along v, because v ran downstream: `channelUv`
      // rotated the whole mapping into the channel's frame. The flow map
      // replaced that with a planar mapping and a per-pixel advected lookup
      // (see `FLOW_CHUNK`), which buys a continuous current at the cost of the
      // sheet no longer knowing which way the river goes. A sheet of parallel
      // strokes under that mapping would run north-south while the water ran
      // east — the exact defect the rotation existed to fix, reintroduced by
      // the thing that replaced it.
      //
      // So the ripples are scattered through a full turn. Direction now comes
      // entirely from the motion, which is the only part of it that is
      // continuous; the sheet supplies texture and nothing about heading. This
      // is also closer to what a stream looks like from above, where the
      // ripples are not parallel to anything.
      const len = 10 + rnd() * 22;
      const angle = rnd() * Math.PI * 2;
      const ex = x + Math.cos(angle) * len;
      const ey = y + Math.sin(angle) * len;
      // Bowed off the straight line between its ends, on a side chosen at
      // random, so no two ripples curve the same way.
      const bow = (rnd() - 0.5) * 9;
      ctx.quadraticCurveTo(
        (x + ex) / 2 - Math.sin(angle) * bow,
        (y + ey) / 2 + Math.cos(angle) * bow,
        ex,
        ey,
      );
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return canvas;
}

/**
 * Build one water sheet, tiled at the shared world scale.
 *
 * Ocean and fresh differ only in stroke shape and density; both are neutral, so
 * either can be tinted to anything the registry asks for.
 */
export function makeWaterSheet(kind: WaterSheet): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(drawSheet(kind));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  applyWaterTiling(texture);
  return texture;
}

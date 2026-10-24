import { PALETTE_CSS, PALETTE_HEX } from './swatches.generated';

export { PALETTE_CSS, PALETTE_HEX };

/** Named art-direction palette. Feature code uses these semantic names first. */
export const palette = {
  brass: PALETTE_HEX.h9a7f4e,
  brassHighlight: PALETTE_HEX.hb08d52,
  patina: PALETTE_HEX.h4a6a72,
  ivory: PALETTE_HEX.hd8cdb4,
  ink: PALETTE_HEX.h201a14,
  amber: PALETTE_HEX.hffb347,
  postalRed: PALETTE_HEX.ha8402f,
  paintedWood: PALETTE_HEX.h8a7455,
  weatheredTimber: PALETTE_HEX.h5c4a38,
  cloth: PALETTE_HEX.hcbbf9e,
  stone: PALETTE_HEX.h7d7a72,
  glass: PALETTE_HEX.hbcd0e8,
  /**
   * Water tints, as day/night pairs — **and the one family that is not graded.**
   *
   * Every water surface in the world is tinted from exactly one of these by
   * `WaterMaterials`. They live here rather than beside the meshes because the
   * lip of a waterfall and the river it falls out of are meant to be the same
   * colour, and the only way to keep that true is for there to be one place
   * that says what the colour is.
   *
   * **These are literals, deliberately, and must stay literals.** Everything
   * else in this file resolves through `swatches.generated.ts`, which
   * `scripts/grade-palette.mjs` rewrote once with the Era 1 grade: pull each
   * channel 22% toward the RGB average, then gain and lift per channel with
   * blue given the least of both — its own comment reads "age blue slightly
   * more than red". That is the right grade for brass, timber, grass and sand,
   * whose read is texture and value. Water has neither. Hue and motion are the
   * whole of what says "water", and the grade took most of one: the ocean's day
   * tint went `#8fb0c0` to `#97aaaa`, HSL saturation 0.28 to 0.10, hue 200 deg
   * to 180. The shipped sea measured `#3d3c27` at noon — less saturated than
   * the sand it met, and in the same warm hue family. Routing water around the
   * generated table is what lets these numbers mean what they say.
   *
   * The values below are *not* the pre-grade originals restored. They are
   * authored against a measurement: with a neutral sheet under them (see
   * `world/water/WaterTextures.ts`) and unlit materials over them, the rendered
   * noon sea is required to sit in the blue-cyan band and to be no less
   * saturated than the beach beside it. `scripts/water-gate.mjs` measures it.
   */
  water: {
    /** Rivers, ponds, and every part of a falls that is the same water. */
    fresh: { day: 0x66a8b6, night: 0x3a6479 },
    /** The open sea, which sits colder and deeper than fresh water. */
    ocean: { day: 0x6ab4d2, night: 0x2f5d85 },
    /** Churn: plunge foam and thrown spray. Bright, but not at midnight. */
    foam: { day: 0xfffaef, night: 0xc4d2dc },
    /**
     * Winter. Colder and greyer, and the whole point is that it is *different*
     * — water was the only surface in the world that did not know the month,
     * so the island went white in a snowstorm while the sea stayed summer teal.
     */
    winter: {
      fresh: { day: 0xa8c8d4, night: 0x3a5f7a },
      ocean: { day: 0x8fb6cc, night: 0x2c5476 },
      foam: { day: 0xeaf4fb, night: 0xbfc8cc },
    },
    /**
     * Submerged ground, as the ground painter draws it.
     *
     * **This was one blue, and being blue was the bug.** It was set to water's
     * own colour during the period when the ocean sheet was back-face culled
     * and therefore invisible: the bed *was* the sea, so painting it as the sea
     * was the only way the sea appeared at all. That has not been true since
     * the sheet's winding was fixed, and the leftover meant every water surface
     * in the game was semi-transparent over a copy of itself. You could see
     * straight through the river and there was nothing on the other side.
     *
     * Two colours now, because a seabed and a riverbed are different ground.
     * Both are **generated swatches rather than literals**, unlike the tints
     * above: the "must stay literals" rule protects water's *hue*, and this is
     * not water. It is the ground under it, and it has to agree with the beach
     * and the bank it runs into, which are graded.
     *
     * `terrain.ts` darkens both with depth; these are the shallow end, and
     * `sea` is deliberately the same swatch the dry beach uses so the waterline
     * is a change in depth rather than a change in material.
     */
    bed: {
      /** The ocean floor: the beach, continuing under the water. */
      sea: PALETTE_HEX.hc4a882,
      /** A channel bottom: silt and wet gravel, darker and far less saturated. */
      channel: PALETTE_HEX.h7a6a54,
    },
    /**
     * The stroke sheet's own greys, as canvas colours.
     *
     * Neutral on purpose: the sheet carries pattern and the tints above carry
     * colour. A blue baked in here is a second opinion about hue that multiplies
     * against the first and darkens both.
     */
    sheet: { ground: '#d8dcdc', light: '#ffffff', dark: '#6a7f8a' },
  },
  /**
   * The sky, as authored ramp stops — **literals, for water's reason.**
   *
   * The generated swatch table pulls every channel 22% toward the RGB average.
   * That is right for brass and timber, whose read is value and texture, and it
   * is wrong here for the same reason it was wrong for water: hue *is* the
   * sky's information. A dawn that has lost a fifth of its rose is a grey with
   * a story about being a dawn. These are authored against the frames in
   * `docs/review-queue/sky/`, and the pair on each stop is measured together —
   * a horizon is only warm relative to the zenith above it.
   *
   * Ordered by hour; `skyRamp.ts` interpolates between them and owns the
   * timing. Nothing else in the world may sample these: the ground, water and
   * lights take their cue from `DayNight`, which is the one place that knows
   * what time it is.
   */
  sky: {
    /** Zenith/horizon pairs at the hours the day actually changes character. */
    stops: [
      { hour: 0, zenith: 0x0b1024, horizon: 0x1b2440 },
      { hour: 4.4, zenith: 0x131c38, horizon: 0x2d3355 },
      { hour: 5.4, zenith: 0x2c3a63, horizon: 0x7a5f6e },
      { hour: 6.4, zenith: 0x4d6f9a, horizon: 0xe0a071 },
      { hour: 8, zenith: 0x6f97bd, horizon: 0xbfd0d8 },
      { hour: 12, zenith: 0x7fa8cc, horizon: 0xcfdbe0 },
      { hour: 16, zenith: 0x7ba0c4, horizon: 0xd3cfc2 },
      { hour: 18.4, zenith: 0x5d7fa8, horizon: 0xe8a668 },
      { hour: 19.4, zenith: 0x3f4f7d, horizon: 0xc9705f },
      { hour: 20.4, zenith: 0x23305a, horizon: 0x6b4a63 },
      { hour: 21.4, zenith: 0x0b1024, horizon: 0x1b2440 },
    ],
    /** The two bodies. The sun is never white — noon white is the film pass. */
    sun: 0xffe9b8,
    moon: 0xe6ecdf,
    /** Stars sit just off white so they read cold against an indigo zenith. */
    star: 0xdfe6f4,
    /** Cloud, lit and unlit. The lit face takes the sun's colour at golden hour. */
    cloud: { lit: 0xf2e4cf, shade: 0x8d90a4, storm: 0x5c6070 },
  },
  seasons: {
    spring: {
      ground: PALETTE_HEX.h8a9a5a,
      accent: PALETTE_HEX.hf6c6d8,
    },
    summer: {
      ground: PALETTE_HEX.h7d8f5c,
      accent: PALETTE_HEX.hc9a227,
    },
    autumn: {
      ground: PALETTE_HEX.h8a6b45,
      accent: PALETTE_HEX.hc87a3a,
    },
    winter: {
      ground: PALETTE_HEX.ha8bcc8,
      accent: PALETTE_HEX.he8f0f8,
    },
  },
} as const;

// Embedded DOM styles use custom properties so their source contains no hidden
// palette literals. Canvas/Three.js callers use the typed maps above.
if (typeof document !== 'undefined') {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(PALETTE_CSS)) {
    root.style.setProperty(`--pm-${name}`, value);
  }
}


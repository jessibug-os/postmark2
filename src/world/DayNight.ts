import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import type { Season } from '../systems/Calendar';

/** Per-season light tint + intensity nudge, multiplied onto the day look. */
const SEASON_TINT: Record<Season, { light: number; hemi: number; sat: number }> = {
  spring: { light: PALETTE_HEX.hfff0f4, hemi: PALETTE_HEX.hf0e8f4, sat: 1.05 },
  summer: { light: PALETTE_HEX.hfff8e6, hemi: PALETTE_HEX.heaf2f2, sat: 1.1 },
  autumn: { light: PALETTE_HEX.hffe8c0, hemi: PALETTE_HEX.hf0e2cc, sat: 1.0 },
  winter: { light: PALETTE_HEX.he8f0ff, hemi: PALETTE_HEX.hdce8f4, sat: 0.86 },
};

/**
 * Time-of-day lighting: hemisphere sky bounce + sun/moon directional, lerped
 * between night, golden-hour and noon looks. AC rule: night is deep and blue
 * but always cozy-readable — never survival-horror dark.
 */
export class DayNight {
  season: Season = 'summer';
  private rain = 0;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private fill: THREE.AmbientLight;
  private characterRim: THREE.DirectionalLight;

  private skyNight = new THREE.Color(PALETTE_HEX.h1e2a4a);
  private skyGold = new THREE.Color(PALETTE_HEX.hc09070);
  private skyDay = new THREE.Color(PALETTE_HEX.h9cb8d8);
  // Night bounce is deep blue, not grey: grey ambient over green grass is
  // exactly what makes a night scene read as mud instead of moonlight.
  private hemiSkyNight = new THREE.Color(PALETTE_HEX.h4c63a0);
  private hemiSkyDay = new THREE.Color(PALETTE_HEX.he8f0f8);
  private hemiGroundNight = new THREE.Color(PALETTE_HEX.h263048);
  private hemiGroundDay = new THREE.Color(PALETTE_HEX.h9a9a80);
  private sunNight = new THREE.Color(PALETTE_HEX.h93a8e0); // moonlight
  private sunGold = new THREE.Color(PALETTE_HEX.hffc38a);
  private sunDay = new THREE.Color(PALETTE_HEX.hfff8ec); // clean near-white noon
  private fillNight = new THREE.Color(PALETTE_HEX.h5c74b4);
  private fillDay = new THREE.Color(PALETTE_HEX.hd8d2c4);
  private skyWork = new THREE.Color();
  private seasonLightWork = new THREE.Color();
  private seasonHemiWork = new THREE.Color();

  constructor(private scene: THREE.Scene) {
    this.hemi = new THREE.HemisphereLight(PALETTE_HEX.he8f0f8, PALETTE_HEX.h9a9a80, 0.75);
    this.fill = new THREE.AmbientLight(PALETTE_HEX.hd8d2c4, 0.24);
    this.sun = new THREE.DirectionalLight(PALETTE_HEX.hfff8ec, 1.5);
    this.sun.position.set(12, 20, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -38;
    this.sun.shadow.camera.right = 38;
    this.sun.shadow.camera.top = 38;
    this.sun.shadow.camera.bottom = -38;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 80;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.035;
    this.characterRim = new THREE.DirectionalLight(PALETTE_HEX.h93a8e0, 0.75);
    this.characterRim.position.set(-8, 10, -10);
    this.characterRim.layers.set(1);
    scene.add(this.hemi, this.fill, this.sun, this.sun.target, this.characterRim);
    // The fog IS the horizon now.
    //
    // 48/170 was reach for POSTMARK's backdrop mountains, which sat at z -130
    // and had to read as hazy layers rather than a wall. Those are gone: the
    // island is open sea on every side, and the only thing left at distance is
    // the ocean plane, which extends 280 units from the map centre. Fog has to
    // close before that edge is reachable or the sea ends in a visible seam.
    //
    // 150 clears the island's own far corner (140 units from centre) while
    // burying the plane's edge, so the water fades into sky instead of
    // stopping. Looking clean across the long axis (224) is fully fogged, which
    // is the intent — St. Mystere should feel closed in by weather.
    scene.fog = new THREE.Fog(PALETTE_HEX.h93a8bc, 40, 150);
  }

  update(daylight: number, hour: number): void {
    const sky = this.skyWork;
    if (daylight < 0.5) {
      sky.copy(this.skyNight).lerp(this.skyGold, daylight * 2);
    } else {
      sky.copy(this.skyGold).lerp(this.skyDay, (daylight - 0.5) * 2);
    }
    this.scene.background = sky;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(sky);

    this.hemi.color.copy(this.hemiSkyNight).lerp(this.hemiSkyDay, daylight);
    this.hemi.groundColor.copy(this.hemiGroundNight).lerp(this.hemiGroundDay, daylight);
    // Pull the flat ambient down hard after dark. It used to sit at 0.72 all
    // night, which lit every surface evenly and left nothing for the lamps to
    // do — the town has to actually get dark for warm light to feel warm.
    this.hemi.intensity = 0.34 + daylight * 0.7;
    // The ambient fill turns cool at night so shadowed sides go blue, not tan.
    this.fill.color.copy(this.fillNight).lerp(this.fillDay, Math.min(1, daylight * 1.4));
    this.fill.intensity = 0.1 + daylight * 0.2;

    // Sun by day, moon by night — the light never goes out.
    if (daylight < 0.35) {
      this.sun.color.copy(this.sunNight).lerp(this.sunGold, daylight / 0.35);
      // Moonlight is a rim, not a sun: low and cool, so form reads from the
      // hemisphere bounce and the lamps supply the only warmth in frame.
      this.sun.intensity = 0.55 - daylight * 0.3;
      // Moon hangs high and steady.
      this.sun.position.set(-10, 24, 6);
    } else {
      this.sun.color.copy(this.sunDay).lerp(this.sunGold, 1 - (daylight - 0.35) / 0.65);
      this.sun.intensity = 0.6 + daylight * 1.25;
      const a = ((hour - 6) / 12) * Math.PI;
      this.sun.position.set(Math.cos(a) * 20, Math.max(6, Math.sin(a) * 22), 8);
    }
    // A cool character-only edge keeps the cast readable at night without
    // flattening the world. Character meshes opt into layer 1.
    this.characterRim.intensity = THREE.MathUtils.lerp(0.92, 0.10, daylight);

    // Season tint: warm daytime light toward the season's cast, cooler+dimmer
    // in winter. Applied as a multiplicative nudge so night stays night.
    const tint = SEASON_TINT[this.season];
    const daymix = daylight * 0.5;
    this.sun.color.lerp(this.seasonLightWork.setHex(tint.light), daymix);
    this.hemi.color.lerp(this.seasonHemiWork.setHex(tint.hemi), daymix);
    if (this.season === 'winter') {
      this.sun.intensity *= 0.9;
      this.hemi.intensity *= 1.05; // snow bounce
    }
    // Cloud cover removes direction and saturation without erasing the cool
    // character rim that keeps the player readable.
    this.sun.intensity *= 1 - this.rain * 0.24;
    this.hemi.intensity *= 1 - this.rain * 0.12;
    this.fill.intensity *= 1 - this.rain * 0.08;
  }

  setRain(intensity: number): void {
    this.rain = THREE.MathUtils.clamp(intensity, 0, 1);
  }

  shadowDirection(): { x: number; y: number; z: number } {
    return {
      x: -this.sun.position.x,
      y: -this.sun.position.y,
      z: -this.sun.position.z,
    };
  }
}

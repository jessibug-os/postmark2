import { chromium } from 'playwright-core';

const base = process.env.BASE_URL ?? 'http://localhost:5173';
const outDir = process.env.SHOTS_DIR ?? 'docs/review-queue/weather';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  console.log('weather-review: browser');
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
      version: 3, playerName: 'Postmaster', createdAt: Date.now(), playedSeconds: 60,
      player: { x: -8, z: 8, coatItemId: 'coat-postal', equippedTool: null },
      inventory: { slots: [], gears: 0 }, museum: [], questSteps: { main: 0 },
      completedQuests: [], reactivatedNpcs: [], constructedBuildings: [],
      unlockedZones: ['town', 'forest', 'meadow'], placedFurniture: [],
      lastDigRefresh: Date.now(), introSeen: true,
    }));
  });
  await page.goto(`${base}/?pack=kindly-forward`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  console.log('weather-review: loaded');
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30_000 });
  console.log('weather-review: canvas');
  await page.waitForTimeout(2_000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2_500);
  await page.evaluate(async () => {
    // The plaza anchor, not the retired `map.postboxPos` — the postbox moved
    // onto island anchors and this harness stopped running when it vanished.
    const { PLAZA } = await import('/src/world/mapConstants.ts');
    const hooks = window.__postmark;
    hooks.warp(PLAZA.x - 2.2, PLAZA.z + 2.2);
    hooks.game.weather.setWeather('rain');
  });
  await page.waitForTimeout(5_000);
  await page.screenshot({ path: `${outDir}/rain-plaza.png` });
  // Rain's per-frame cost, and what it is spending it on. A single 9k-triangle
  // cliff mesh once found its way into the interceptor sweep and cost 4.9ms a
  // frame — more than every other part of the weather system combined — while
  // the 300 drops themselves cost 0.09ms. Budget the tick, and list what it
  // raycasts, so the next large mesh to drift in is visible here.
  const rainCost = await page.evaluate(() => new Promise((resolve) => {
    const weather = window.__postmark.game.weather;
    const proto = Object.getPrototypeOf(weather);
    const original = proto.update;
    const samples = [];
    proto.update = function (...args) {
      const started = performance.now();
      const out = original.apply(this, args);
      samples.push(performance.now() - started);
      return out;
    };
    const start = performance.now();
    const tick = () => {
      if (performance.now() - start < 2_500) { requestAnimationFrame(tick); return; }
      proto.update = original;
      samples.sort((a, b) => a - b);
      const pick = (q) => +samples[Math.floor(samples.length * q)].toFixed(3);
      resolve({
        msPerFrameP50: pick(0.5),
        msPerFrameP95: pick(0.95),
        interceptors: weather.interceptors.map((object) => ({
          name: object.name,
          tris: object.geometry?.index
            ? object.geometry.index.count / 3
            : (object.geometry?.attributes?.position?.count ?? 0) / 3,
          terrain: Boolean(object.userData.isTerrain),
        })),
      });
    };
    requestAnimationFrame(tick);
  }));
  const terrainInterceptor = rainCost.interceptors.find((entry) => entry.terrain);
  if (terrainInterceptor) {
    throw new Error(`Height-field geometry is being raycast per drop: ${terrainInterceptor.name}`);
  }
  if (rainCost.msPerFrameP50 > 1.5) {
    throw new Error(`Weather tick over budget in rain: ${JSON.stringify(rainCost)}`);
  }
  await page.keyboard.press('Backquote');
  await page.keyboard.type('/weather');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backquote');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/weather-debug-panel.png` });
  // Same camera and weather, forced moisture endpoints. These controls prove
  // the ground shader itself changes rather than mistaking the rain grade for
  // wet terrain.
  await page.evaluate(async () => {
    const { wetnessField } = await import('/src/world/weather/WetnessState.ts');
    const now = new Date();
    window.__postmark.timeOffset(((12 - now.getHours()) + 24) % 24 - now.getMinutes() / 60);
    window.__postmark.game.weather.setWeather('clear');
    wetnessField.setAll(0);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/ground-dry-control.png` });
  await page.evaluate(async () => {
    const { wetnessField } = await import('/src/world/weather/WetnessState.ts');
    wetnessField.setAll(1);
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${outDir}/ground-soaked-control.png` });
  await page.evaluate(async () => {
    const { wetnessField } = await import('/src/world/weather/WetnessState.ts');
    window.__postmark.game.weather.setWeather('rain');
    wetnessField.setAll(0);
    for (let i = 0; i < 250; i++) wetnessField.update(0.1, true);
    const game = window.__postmark.game;
    const now = new Date();
    window.__postmark.timeOffset(((12 - now.getHours()) + 24) % 24 - now.getMinutes() / 60);
    game.gridView.setMode('wetness');
    game.gridView.setVisible(true);
    game.gridView.update(game.player.position.x, game.player.position.z);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/grid-wetness.png` });
  await page.evaluate(() => window.__postmark.game.gridView.setVisible(false));

  const treeShelter = await page.evaluate(async () => {
    const game = window.__postmark.game;
    const tree = game.map.features.find((feature) => feature.kind === 'tree-live');
    if (!tree) return null;
    const { CELL_SIZE } = await import('/src/world/island/IslandCellGrid.ts');
    const { wetnessField } = await import('/src/world/weather/WetnessState.ts');
    wetnessField.setAll(0);
    for (let i = 0; i < 250; i++) wetnessField.update(0.1, true);
    window.__postmark.warp(tree.x, tree.z + CELL_SIZE * 3);
    game.gridView.setMode('wetness');
    game.gridView.setVisible(true);
    game.gridView.update(game.player.position.x, game.player.position.z);
    return { x: tree.x, z: tree.z };
  });
  if (treeShelter) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/tree-shelter-grid.png` });
    await page.evaluate(() => window.__postmark.game.gridView.setVisible(false));
  }

  const warpToTerrain = async (wanted) => page.evaluate(async (terrain) => {
    const { ACTIVE_CELLS } = await import('/src/world/mapConstants.ts');
    if (!ACTIVE_CELLS) return false;
    for (let row = 0; row < 96; row++) for (let col = 0; col < 128; col++) {
      const cell = ACTIVE_CELLS.cellAt({ col, row });
      if (!cell || (Array.isArray(terrain) ? !terrain.includes(cell.terrain) : cell.terrain !== terrain)) continue;
      const point = ACTIVE_CELLS.cellToWorld({ col, row });
      window.__postmark.warp(point.x, point.z);
      return true;
    }
    return false;
  }, wanted);

  for (const [name, terrain] of [
    ['rain-water', ['river', 'pond']], ['rain-beach', 'beach'], ['rain-ramp', 'ramp'],
  ]) {
    if (!await warpToTerrain(terrain)) continue;
    await page.waitForTimeout(1_200);
    await page.screenshot({ path: `${outDir}/${name}.png` });
    if (name === 'rain-beach') {
      await page.evaluate(() => {
        const game = window.__postmark.game;
        game.gridView.setMode('wetness');
        game.gridView.setVisible(true);
        game.gridView.update(game.player.position.x, game.player.position.z);
      });
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${outDir}/rain-beach-grid.png` });
      for (const seconds of [30, 60]) {
        await page.evaluate(async (elapsed) => {
          const { wetnessField } = await import('/src/world/weather/WetnessState.ts');
          for (let i = 0; i < 120; i++) wetnessField.update(0.25, 0);
          const game = window.__postmark.game;
          game.gridView.update(game.player.position.x, game.player.position.z);
          void elapsed;
        }, seconds);
        await page.waitForTimeout(150);
        await page.screenshot({ path: `${outDir}/rain-beach-dry-${seconds}s-grid.png` });
      }
      await page.evaluate(() => window.__postmark.game.gridView.setVisible(false));
    }
  }
  await page.evaluate(() => window.__postmark.game.weather.setWeather('clear'));
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: `${outDir}/post-rain.png` });
  await page.evaluate(async () => {
    const { snowField } = await import('/src/world/weather/SnowState.ts');
    const { groundUniforms } = await import('/src/world/terrain.ts');
    snowField.setWinter(true);
    groundUniforms.uSnow.value = 0.9;
    snowField.setAll(0);
    window.__postmark.game.weather.setWeather('snow');
  });
  for (const [name, seconds] of [['snow-start', 0], ['snow-building', 45], ['snow-deep', 90]]) {
    if (seconds) await page.evaluate(async (elapsed) => {
      const { snowField } = await import('/src/world/weather/SnowState.ts');
      for (let i = 0; i < elapsed * 4; i++) snowField.update(0.25, 1, 0, 0.4, 0.35, 0.1);
    }, seconds);
    await page.evaluate(async () => {
      const { groundUniforms } = await import('/src/world/terrain.ts');
      groundUniforms.uSnow.value = 0.9;
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${outDir}/${name}.png` });
  }
  // Snow is drawn in whole levels, so the review needs a frame per level from
  // one fixed viewpoint over open ground. Forcing the whole field flat isolates
  // the step itself; the natural shot after it shows the terraces the noise
  // makes when neighbouring cells round differently.
  if (await warpToTerrain(['grass', 'dirt'])) {
    await page.evaluate(() => window.__postmark.game.weather.setWeather('clear'));
    await page.waitForTimeout(1_200);
    for (let level = 0; level <= 5; level++) {
      await page.evaluate(async (depth) => {
        const { snowField } = await import('/src/world/weather/SnowState.ts');
        const { groundUniforms } = await import('/src/world/terrain.ts');
        snowField.setAll(depth);
        groundUniforms.uSnow.value = 0.9;
      }, level / 5);
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${outDir}/snow-level-${level}.png` });
    }
    await page.evaluate(async () => {
      const { snowField } = await import('/src/world/weather/SnowState.ts');
      snowField.setAll(0);
      for (let i = 0; i < 320; i++) snowField.update(0.25, 1, 0, 0.4, 0.35, 0.1);
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${outDir}/snow-levels-natural.png` });
    await page.evaluate(() => {
      const game = window.__postmark.game;
      game.gridView.setMode('wetness');
      game.gridView.setVisible(true);
      game.gridView.update(game.player.position.x, game.player.position.z);
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${outDir}/snow-levels-natural-grid.png` });
    await page.evaluate(() => window.__postmark.game.gridView.setVisible(false));
  }
  const snowPixelProbe = await page.evaluate(async () => {
    const game = window.__postmark.game;
    const { snowField } = await import('/src/world/weather/SnowState.ts');
    const { groundUniforms } = await import('/src/world/terrain.ts');
    game.weather.setWeather('clear');
    groundUniforms.uSnow.value = 0.9;
    game.renderer.setAnimationLoop(null);
    const gl = game.renderer.getContext();
    const width = game.renderer.domElement.width;
    const height = game.renderer.domElement.height;
    const read = (cover) => {
      snowField.setAll(cover);
      game.pipeline.render(game.scene, game.rig.camera);
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const bare = read(0);
    const covered = read(1);
    let changed = 0;
    let lighter = 0;
    for (let i = 0; i < bare.length; i += 4) {
      const a = bare[i] * 0.299 + bare[i + 1] * 0.587 + bare[i + 2] * 0.114;
      const b = covered[i] * 0.299 + covered[i + 1] * 0.587 + covered[i + 2] * 0.114;
      if (Math.abs(a - b) > 1) changed++;
      if (b > a + 1) lighter++;
    }
    return { changed, lighter, snowUniform: groundUniforms.uSnow.value };
  });
  if (snowPixelProbe.changed === 0 || snowPixelProbe.lighter === 0) {
    throw new Error(`Ground pixels did not whiten between forced snow endpoints: ${JSON.stringify(snowPixelProbe)}`);
  }
  // Snow and wetness are drawn in discrete levels, so sweeping the field
  // continuously must produce a staircase, not a ramp: many input values in a
  // row render identically, and the ground only changes at a level boundary.
  const levelStaircase = await page.evaluate(async () => {
    const game = window.__postmark.game;
    const { snowField } = await import('/src/world/weather/SnowState.ts');
    const { wetnessField } = await import('/src/world/weather/WetnessState.ts');
    const { groundUniforms } = await import('/src/world/terrain.ts');
    game.weather.setWeather('clear');
    groundUniforms.uSnow.value = 0.9;
    game.renderer.setAnimationLoop(null);
    const gl = game.renderer.getContext();
    const width = game.renderer.domElement.width;
    const height = game.renderer.domElement.height;
    const meanLuma = () => {
      game.pipeline.render(game.scene, game.rig.camera);
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let total = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        total += pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
      }
      return total / (width * height);
    };
    const sweep = (set) => {
      const steps = [];
      for (let v = 0; v <= 1.0001; v += 0.02) {
        set(Math.min(1, v));
        steps.push({ value: Math.round(v * 100) / 100, luma: Math.round(meanLuma() * 100) / 100 });
      }
      const plateaus = [];
      for (const step of steps) {
        const last = plateaus[plateaus.length - 1];
        if (last && Math.abs(last.luma - step.luma) < 0.05) { last.until = step.value; continue; }
        plateaus.push({ from: step.value, until: step.value, luma: step.luma });
      }
      return { plateaus: plateaus.length, edges: plateaus.map((p) => p.from) };
    };
    wetnessField.setAll(0);
    const snow = sweep((v) => snowField.setAll(v));
    snowField.setAll(0);
    const wetness = sweep((v) => wetnessField.setAll(v));
    wetnessField.setAll(0);
    return {
      snow, wetness,
      snowLevels: groundUniforms.uSnowLevels.value,
      wetLevels: groundUniforms.uWetLevels.value,
    };
  });
  // What the levels are actually made of. A storm of fixed length, then the
  // share of cells sitting at each level. The interesting number is the spread:
  // if every cell accumulates at nearly the island average they all cross into
  // the next level together and the histogram is a single spike walking up the
  // scale, which is a wash with hard edges rather than patches of depth.
  const levelSpread = await page.evaluate(async () => {
    const { snowField } = await import('/src/world/weather/SnowState.ts');
    const { wetnessField } = await import('/src/world/weather/WetnessState.ts');
    const { quantizeLevel, SNOW_LEVELS, WETNESS_LEVELS } = await import('/src/world/weather/levels.ts');
    const { ACCUMULATION_SPREAD } = await import('/src/world/weather/variance.ts');
    // Land cells only. Ocean, river and pond cells absorb nothing and sit at
    // zero forever; counting them buries the real distribution under a level-0
    // spike the player never sees, because the ground shader masks water out.
    const { ACTIVE_CELLS } = await import('/src/world/mapConstants.ts');
    const land = [];
    for (let row = 0; row < wetnessField.rows; row++) {
      for (let col = 0; col < wetnessField.cols; col++) {
        const terrain = ACTIVE_CELLS?.cellAt({ col, row })?.terrain;
        if (!terrain || terrain === 'ocean' || terrain === 'river' || terrain === 'pond') continue;
        land.push(row * wetnessField.cols + col);
      }
    }
    const report = (values, levels) => {
      const bins = new Array(levels + 1).fill(0);
      let total = 0;
      for (const i of land) { bins[Math.round(quantizeLevel(values[i], levels) * levels)]++; total += values[i]; }
      const mean = total / land.length;
      let squared = 0;
      for (const i of land) squared += (values[i] - mean) ** 2;
      return {
        mean: +mean.toFixed(3),
        stdDev: +Math.sqrt(squared / land.length).toFixed(3),
        occupied: bins.filter((n) => n / land.length > 0.02).length,
        bins: bins.map((n) => +(n / land.length * 100).toFixed(1)),
      };
    };
    wetnessField.setAll(0);
    snowField.setAll(0);
    for (let i = 0; i < 240; i++) snowField.update(0.25, 1, 0, 0.4, 0.35, 0.1);
    const snow = report(snowField.values, SNOW_LEVELS);
    snowField.setAll(0);
    wetnessField.setAll(0);
    for (let i = 0; i < 240; i++) wetnessField.update(0.25, 1);
    const wetness = report(wetnessField.values, WETNESS_LEVELS);
    wetnessField.setAll(0);
    return { spread: ACCUMULATION_SPREAD, landCells: land.length, snow, wetness };
  });
  if (levelStaircase.snow.plateaus > levelStaircase.snowLevels + 1) {
    throw new Error(`Snow renders as a ramp, not levels: ${JSON.stringify(levelStaircase.snow)}`);
  }
  if (levelStaircase.wetness.plateaus > levelStaircase.wetLevels + 1) {
    throw new Error(`Wetness renders as a ramp, not levels: ${JSON.stringify(levelStaircase.wetness)}`);
  }
  const groundShader = await page.evaluate(() => {
    const game = window.__postmark.game;
    const gl = game.renderer.getContext();
    const program = game.renderer.info.programs?.find((candidate) =>
      String(candidate.cacheKey).includes('retro-ground-detail'));
    const source = program?.fragmentShader ? gl.getShaderSource(program.fragmentShader) : null;
    const wetnessLocation = program?.program ? gl.getUniformLocation(program.program, 'uWetnessMap') : null;
    return {
      programFound: Boolean(program),
      wetnessUniform: Boolean(source?.includes('uWetnessMap')),
      wetnessUniformActive: wetnessLocation !== null,
      postLightDarken: Boolean(source?.includes('outgoingLight *= groundWetnessDarken')),
    };
  });
  const wetnessPixelProbe = await page.evaluate(async () => {
    const game = window.__postmark.game;
    const { wetnessField } = await import('/src/world/weather/WetnessState.ts');
    game.renderer.setAnimationLoop(null);
    const gl = game.renderer.getContext();
    const width = game.renderer.domElement.width;
    const height = game.renderer.domElement.height;
    const read = (wetness) => {
      wetnessField.setAll(wetness);
      game.pipeline.render(game.scene, game.rig.camera);
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const dry = read(0);
    const dryTexture = {
      value: wetnessField.texture.image.data[0],
      version: wetnessField.texture.version,
      sourceVersion: wetnessField.texture.source.version,
      gpuVersion: game.renderer.properties.get(wetnessField.texture).__version ?? null,
    };
    const soaked = read(1);
    const soakedTexture = {
      value: wetnessField.texture.image.data[0],
      version: wetnessField.texture.version,
      sourceVersion: wetnessField.texture.source.version,
      gpuVersion: game.renderer.properties.get(wetnessField.texture).__version ?? null,
    };
    let changed = 0;
    let darker = 0;
    let lumaDelta = 0;
    for (let i = 0; i < dry.length; i += 4) {
      const a = dry[i] * 0.299 + dry[i + 1] * 0.587 + dry[i + 2] * 0.114;
      const b = soaked[i] * 0.299 + soaked[i + 1] * 0.587 + soaked[i + 2] * 0.114;
      if (Math.abs(a - b) > 1) changed++;
      if (b < a - 1) darker++;
      lumaDelta += a - b;
    }
    return {
      width, height, changed, darker,
      meanLumaDelta: lumaDelta / (width * height), dryTexture, soakedTexture,
      fieldTextureUuid: wetnessField.texture.uuid,
    };
  });
  if (!groundShader.wetnessUniformActive || !groundShader.postLightDarken) {
    throw new Error('Ground wetness shader is not active');
  }
  if (wetnessPixelProbe.changed === 0 || wetnessPixelProbe.darker === 0
      || wetnessPixelProbe.meanLumaDelta < 8) {
    throw new Error('Ground pixels did not darken visibly between forced dry and soaked fields');
  }
  console.log(JSON.stringify({
    outDir, errors, rainCost, groundShader, wetnessPixelProbe, snowPixelProbe, levelStaircase,
    levelSpread,
  }));
} finally {
  await browser.close();
}

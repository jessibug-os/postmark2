/** Fixed locations, complete wave cycles, and real lateral input. Visual approval is human. */
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const base = process.env.BASE_URL ?? 'http://localhost:5173';
// Write outside Vite's watched tree while capturing.
const out = process.env.SHOTS_DIR ?? '/tmp/coastline-review';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADFUL !== '1' });
const context = await browser.newContext({ viewport: { width: 960, height: 720 }, recordVideo: { dir: out, size: { width: 960, height: 720 } } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => { errors.push(String(e)); console.error(String(e)); });
page.on('console', e => { if(e.type()==='error') { errors.push(e.text()); console.error(e.text()); } });
try {
  await page.addInitScript(() => {
    localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
      version: 3, playerName: 'Postmaster', createdAt: Date.now(), playedSeconds: 60,
      player: { x: -8, z: 8, coatItemId: 'coat-postal', equippedTool: null },
      inventory: { slots: [], gears: 0 }, museum: [], questSteps: { main: 0 },
      completedQuests: [], reactivatedNpcs: [], constructedBuildings: [],
      unlockedZones: ['town', 'forest', 'meadow'], placedFurniture: [], lastDigRefresh: Date.now(), introSeen: true,
    }));
  });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__postmark?.game, null, { timeout: 90000 });
  console.log('booted');
  await page.keyboard.press('Space'); await page.waitForTimeout(700);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__postmark?.game.state === 'play', null, { timeout: 60000 });
  await page.evaluate(() => { window.__postmark.game.rig.idlePitch = window.__postmark.game.rig.basePitch; });
  await page.waitForTimeout(5000); // let the season card and welcome toast clear
  const spots = process.env.SPOTS_FILE ? JSON.parse(readFileSync(process.env.SPOTS_FILE, 'utf8')).spots : await page.evaluate(async () => {
    const { ACTIVE_LAYOUT, ACTIVE_FIELD } = await import('/src/world/mapConstants.ts');
    const { acreCentre } = await import('/src/world/island/AcreLibrary.ts');
    const { coastDistance } = await import('/src/world/island/IslandRuntime.ts');
    const island=ACTIVE_LAYOUT.acres;
    const pick = (kind) => {
      const a=island.acres.find(a => a.kind===kind);
      if(!a) return null;
      const c=acreCentre(a.col,a.row);
      let best=null,score=Infinity;
      for(let dx=-6;dx<=6;dx+=.5) for(let dz=-6;dz<=6;dz+=.5) {
        const x=c.x+dx,z=c.z+dz,d=coastDistance(island,x,z);
        if(!ACTIVE_FIELD.walkableAt(x,z)||d<1.25||d>3) continue;
        const s=Math.abs(d-1.8)+Math.hypot(dx,dz)*.03;
        if(s<score) {score=s;best={x,z};}
      }
      return {...(best??c),kind};
    };
    return {straight:pick('shore'),point:pick('shore-corner'),cove:pick('shore-cove'),dock:pick('dock'),mouth:pick('river-mouth')};
  });
  if (process.env.MOUTH_ONLY === '1') {
    for (const name of Object.keys(spots)) if (name !== 'mouth') delete spots[name];
  }
  const shot = async name => { if(await page.evaluate(()=>window.__postmark?.game.state)!=='play') throw new Error(`Left play during ${name}; capture invalid`); await page.screenshot({path:`${out}/${name}.png`}); console.log(name); };
  for(const [name,spot] of Object.entries(spots)) {
    if(!spot) continue;
    await page.evaluate(({x,z}) => { const h=window.__postmark; h.game.time.setLocalHour(12);h.game.weather.setWeather('clear');h.warp(x,z); },spot);
    await page.waitForTimeout(1500);
    await shot(`${name}-day`);
    if(process.env.QUICK !== '1') { await page.waitForTimeout(16000); await shot(`${name}-cycle`); }
  }
  const s=spots.straight??spots.cove??spots.mouth;
  if(s) {
    await page.evaluate(({x,z}) => window.__postmark.warp(x,z),s);
    for(const hour of [12,23]) {
      await page.evaluate(hour=>window.__postmark.game.time.setLocalHour(hour),hour);
      await page.waitForTimeout(1000); await shot(`walk-start-${hour}`);
      await page.keyboard.down('KeyD'); await page.waitForTimeout(2400); await page.keyboard.up('KeyD');
      await page.keyboard.down('KeyA'); await page.waitForTimeout(2400); await page.keyboard.up('KeyA');
      await shot(`walk-end-${hour}`);
    }
  }
  if(s && process.env.QUICK !== '1') {
    await page.evaluate(({x,z}) => {window.__postmark.warp(x,z);window.__postmark.game.time.setLocalHour(12);},s);
    for(const [name,seconds] of [['low',0],['advance',.18],['high',.4],['retreat',.72]]) {
      await page.evaluate(async ({phase,x,z})=>{ const {shorePhase,SHORE_CYCLE}=await import('/src/world/water/ShoreCycle.ts'); window.__postmark.game.map.oceanMat.userData.reviewSeconds=((phase-shorePhase(0,x,z)+1)%1)*SHORE_CYCLE.seconds; },{phase:seconds,...s});
      await page.waitForTimeout(300); await shot(`phase-${name}`);
    }
    await page.evaluate(()=> {delete window.__postmark.game.map.oceanMat.userData.reviewSeconds;window.__postmark.game.weather.setWeather('rain');});
    await page.waitForTimeout(5000); await shot('rain-day');
    await page.evaluate(()=> {const g=window.__postmark.game;g.weather.setWeather('snow');g.map.water.setSeason('winter');});
    await page.waitForTimeout(6500); await shot('winter-day');
    await page.evaluate(()=> {const g=window.__postmark.game;g.weather.setWeather('clear');g.map.water.setSeason(g.season);});
  }
  const diagnostics = await page.evaluate(() => {
    const g=window.__postmark.game, mesh=g.map.group.getObjectByName('island-ocean');
    const u=g.map.oceanMat.userData.coastalOcean;
    return {state:g.state,player:g.player.position.toArray(),fish:g.fishing.shadows.length,
      canCast:g.fishing.canCastFrom(g.player.position), moonPlane:!!g.map.group.getObjectByName('island-moon-path'),
      oldFoam:!!g.map.group.getObjectByName('island-shore-lap'),
      oceanTriangles:mesh.geometry.attributes.position.count/3,
      moonStrength:u?.coastMoonlight.value,draws:g.pipeline?.renderer?.info?.render};
  });
  writeFileSync(`${out}/report.json`,JSON.stringify({spots,diagnostics,errors},null,2));
  console.log(JSON.stringify({spots,diagnostics,errors},null,2));
  if(errors.length) process.exitCode=1;
} finally { const video = page.video(); await context.close(); if(video) await video.saveAs(`${out}/coastline-motion.webm`); await browser.close(); }

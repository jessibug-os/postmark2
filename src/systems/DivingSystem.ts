import { PALETTE_HEX } from '../art/palette';
import * as THREE from 'three';
import { makeRetroMaterial } from '../core/RetroMaterial';
import { SEA_CREATURES } from '../data/collections';
import { inHourWindow, inSeason } from '../data/items';
import type { Calendar } from './Calendar';
import type { TimeSystem } from './TimeSystem';
import { inOcean, nearestWater } from '../world/geography';
import { ACTIVE_FIELD } from '../world/mapConstants';

interface Shadow { mesh: THREE.Mesh; itemId: string; speed: number; phase: number }

/** Ocean swimming with visible bubble trails: chase a shadow, press E to dive. */
export class DivingSystem {
  swimming = false;
  diving = false;
  private shadows: Shadow[] = [];
  onCatch: ((itemId:string,pos:THREE.Vector3)=>void)|null = null;
  constructor(private scene:THREE.Scene, private time:TimeSystem, private calendar:Calendar) {}

  /**
   * The sea used to be a half-plane south of `beachLine(x)`, so entering it was
   * a comparison on z and leaving it was the same comparison reversed. The
   * island's coast faces every direction, so both are now "which way is the
   * water" and "which way is the land".
   */
  canEnter(pos:THREE.Vector3):boolean {
    const near = nearestWater(pos.x, pos.z, 4);
    return Number.isFinite(near.dist) && near.dist <= 2.2 && inOcean(near.x, near.z);
  }
  /** Nearest standable ground, for wading back out. */
  private landNear(pos:THREE.Vector3):{x:number;z:number}|null {
    const field = ACTIVE_FIELD;
    if (!field) return null;
    for (let r = 1; r <= 8; r += 0.5) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const px = pos.x + Math.cos(a) * r;
        const pz = pos.z + Math.sin(a) * r;
        if (field.walkableAt(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  }
  toggle(pos:THREE.Vector3):boolean {
    if (this.swimming) {
      const land = this.landNear(pos);
      if (land && Math.hypot(land.x - pos.x, land.z - pos.z) < 2.8) {
        this.swimming=false; this.clear();
        pos.x=land.x; pos.z=land.z;
        return true;
      }
      return false;
    }
    if (!this.canEnter(pos)) return false;
    const water = nearestWater(pos.x, pos.z, 4);
    this.swimming=true;
    pos.x=water.x; pos.z=water.z; pos.y=-0.18;
    return true;
  }
  action(pos:THREE.Vector3):boolean {
    if (!this.swimming || this.diving) return false;
    let best:Shadow|null=null, dist=2.2;
    for (const s of this.shadows) {
      const d=s.mesh.position.distanceTo(pos);
      if (d<dist) { best=s; dist=d; }
    }
    if (!best) return false;
    this.diving=true;
    const caught=best;
    setTimeout(()=>{
      if (!this.swimming) return;
      this.scene.remove(caught.mesh);
      this.shadows=this.shadows.filter(s=>s!==caught);
      this.diving=false;
      this.onCatch?.(caught.itemId,pos.clone());
    },700);
    return true;
  }
  update(dt:number,pos:THREE.Vector3):void {
    if (!this.swimming) return;
    // Hold the swimmer in the sea: if a stroke took them onto dry ground,
    // put them back where the water is.
    if (!inOcean(pos.x,pos.z)) {
      const back=nearestWater(pos.x,pos.z,6);
      if (Number.isFinite(back.dist)) { pos.x=back.x; pos.z=back.z; }
    }
    pos.y=-0.18;
    while(this.shadows.length<4) this.spawn(pos);
    for(const s of this.shadows) {
      s.phase+=dt*s.speed;
      s.mesh.position.x+=Math.cos(s.phase)*dt*s.speed*.22;
      s.mesh.position.z+=Math.sin(s.phase*.7)*dt*s.speed*.16;
      if (!inOcean(s.mesh.position.x,s.mesh.position.z)) {
        const back=nearestWater(s.mesh.position.x,s.mesh.position.z,8);
        if (Number.isFinite(back.dist)) s.mesh.position.set(back.x,-0.42,back.z);
      }
    }
  }
  private spawn(pos:THREE.Vector3):void {
    const available=SEA_CREATURES.filter(s=>inHourWindow(this.time.hour,s.hours)&&inSeason(this.calendar.season,s));
    const total=available.reduce((n,s)=>n+s.weight,0); let roll=Math.random()*total; let chosen=available[0];
    for(const s of available){roll-=s.weight;if(roll<=0){chosen=s;break;}}
    const mesh=new THREE.Mesh(new THREE.CircleGeometry(.22+chosen.speed*.07,7),makeRetroMaterial({color:PALETTE_HEX.h314858,transparent:true,opacity:.72,side:THREE.DoubleSide}));
    mesh.rotation.x=-Math.PI/2;
    // Scatter around the swimmer, then pull each shadow onto real water.
    const sx=pos.x+(Math.random()-.5)*10, sz=pos.z+(Math.random()-.5)*8;
    const wet=inOcean(sx,sz)?{x:sx,z:sz}:nearestWater(sx,sz,10);
    mesh.position.set(Number.isFinite((wet as {dist?:number}).dist ?? 0)?wet.x:pos.x,-.42,Number.isFinite((wet as {dist?:number}).dist ?? 0)?wet.z:pos.z);
    this.scene.add(mesh); this.shadows.push({mesh,itemId:chosen.itemId,speed:chosen.speed,phase:Math.random()*6});
  }
  private clear():void { for(const s of this.shadows)this.scene.remove(s.mesh); this.shadows=[]; this.diving=false; }
}

import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
 const page = await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(30000);
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://localhost:5173/harbor?room=world');
 await page.waitForFunction(()=>!!window.__harborWorldPreview);
 const door=async(anchor,destination)=>{
   await page.evaluate(id=>{
     const {world,player,places}=window.__harborWorldPreview;const a=places.anchor(id);const room=world.room;
     const p=player.position.clone();p.x=a.transform.x+(room?room.origin.x-room.halfW:0);p.z=a.transform.z+(room?room.origin.z-room.halfD:0);p.y=room?room.floorY:p.y;
     player.restoreTransform(p,a.transform.yaw);
   },anchor);
   await page.waitForFunction(()=>document.getElementById('status').textContent.includes('E / A:'));
   await page.keyboard.press('e',{delay:100});
   await page.waitForFunction(destination=>window.__harborWorldPreview.world.host.currentPlaceId===destination&&!window.__harborWorldPreview.world.host.busy,destination);
 };
 await page.screenshot({path:'/tmp/harbor-connected-town.png'});
 await door('bakery.stairs','starter-room');
 await page.screenshot({path:'/tmp/harbor-connected-home.png'});
 await door('starter-room.exit','town');
 await door('cafe.door','cafe');
 await page.screenshot({path:'/tmp/harbor-connected-cafe.png'});
 await door('cafe.exit','town');
 await door('bakery.stairs','starter-room');
 await page.evaluate(()=>window.__harborWorldPreview.services.save());
 await page.reload();await page.waitForFunction(()=>!!window.__harborWorldPreview);
 const result=await page.evaluate(()=>{const{world,services,player}=window.__harborWorldPreview;return{place:world.host.currentPlaceId,saved:services.commands.snapshot.state.player.position.placeId,interior:player.interior.id,paused:services.time.paused,bed:!!world.room.group.getObjectByName('starter-bed')};});
 assert.deepEqual(result,{place:'starter-room',saved:'starter-room',interior:'starter-room',paused:false,bed:true});assert.deepEqual(errors,[]);
 console.log(JSON.stringify(result));
}finally{await browser.close();}

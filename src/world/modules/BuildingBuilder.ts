import type { TownMap } from '../TownMap';
import { PALETTE_CSS, PALETTE_HEX } from '../../art/palette';
import * as THREE from 'three';
import { makeFoliageMaterial, makeRetroMaterial } from '../../core/RetroMaterial';
import { brickSheet, plasterSheet, woodSheet } from '../../core/texturePaint';
import { makeGablePrism } from '../TownMap';

export function makeBuilding(this: TownMap, id: string): THREE.Group {
    const g = new THREE.Group();
    const dark = makeRetroMaterial({ color: PALETTE_HEX.h54432f });
    const ivory = makeRetroMaterial({ map: plasterSheet(PALETTE_CSS.hd8cdb4) });
    const wood = makeRetroMaterial({ map: woodSheet(PALETTE_CSS.h8a7455) });

    const windowBox = (x: number, y: number, z: number, rotY = 0): void => {
      const boxG = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.08), ivory);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.6, 0.06),
        this.windowGlass(),
      );
      glass.position.z = 0.03;
      const planter = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.24), wood);
      planter.position.set(0, -0.5, 0.12);
      boxG.add(frame, glass, planter);
      for (let f = 0; f < 3; f++) {
        const bloom = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.08, 0),
          makeFoliageMaterial({ color: [PALETTE_HEX.hc0553f, PALETTE_HEX.hc9a227, PALETTE_HEX.hd8b8c8][f] }, 0.04, 2),
        );
        bloom.position.set(-0.25 + f * 0.25, -0.36, 0.16);
        boxG.add(bloom);
      }
      boxG.position.set(x, y, z);
      boxG.rotation.y = rotY;
      g.add(boxG);
    };

    // Dormer: a little gabled window poking out of the south roof slope.
    const dormer = (x: number, y: number, z: number): void => {
      const dg = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), ivory);
      const dRoof = makeGablePrism(1.1, 1.1, 0.45, dark);
      dRoof.userData.rainMaterial = 'roof';
      dRoof.position.y = 0.4;
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.45, 0.06),
        this.windowGlass(),
      );
      glass.position.set(0, 0.05, 0.46);
      dg.add(box, dRoof, glass);
      dg.position.set(x, y, z);
      g.add(dg);
    };

    const hangingSign = (x: number, y: number, z: number, color: number): void => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.08), dark);
      arm.position.set(x, y, z);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.06), makeRetroMaterial({ color }));
      sign.position.set(x + 0.35, y - 0.45, z);
      const icon = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 5, 8), makeRetroMaterial({ color: PALETTE_HEX.hc9a227 }));
      icon.position.set(x + 0.35, y - 0.45, z + 0.05);
      g.add(arm, sign, icon);
    };

    if (id === 'emporium') {
      // Two-story shopfront: brick base, cream upper, big gabled roof,
      // porch with posts, striped awning, hanging gear-sign, roof horn.
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(5.8, 1.8, 4.6),
        makeRetroMaterial({ map: brickSheet(PALETTE_CSS.h9c5a3c, PALETTE_CSS.h7a6a58) }),
      );
      base.position.y = 0.9;
      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(5.4, 1.5, 4.2),
        makeRetroMaterial({ map: plasterSheet(PALETTE_CSS.hd0c4a4) }),
      );
      upper.position.y = 2.55;
      const beltline = new THREE.Mesh(new THREE.BoxGeometry(5.9, 0.2, 4.7), dark);
      beltline.position.y = 1.85;
      const roof = makeGablePrism(6.4, 5.0, 1.7, makeRetroMaterial({ color: PALETTE_HEX.h6a3540 }));
      roof.userData.rainMaterial = 'roof';
      roof.position.y = 4.15;
      const chimney = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 1.6, 0.6),
        makeRetroMaterial({ map: brickSheet(PALETTE_CSS.h7d7a72, PALETTE_CSS.h5f5a52) }),
      );
      chimney.position.set(2.1, 4.7, 0.9);
      g.add(base, upper, beltline, roof, chimney);
      dormer(-1.0, 4.55, 1.5);
      this.smokeEmitters.push({ pos: new THREE.Vector3(2.1, 5.6, 0.9), timer: 0 });
      // Porch: platform + posts + striped awning.
      const porch = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 1.6), wood);
      porch.position.set(0, 0.15, 3.0);
      g.add(porch);
      for (const side of [-1.9, 1.9]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.0, 5), ivory);
        post.position.set(side, 1.3, 3.5);
        g.add(post);
      }
      for (let s = 0; s < 6; s++) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.72, 0.1, 1.9),
          makeRetroMaterial({ color: s % 2 ? PALETTE_HEX.ha8402f : PALETTE_HEX.he8dfc8 }),
        );
        stripe.position.set(-1.8 + s * 0.72, 2.4, 3.1);
        stripe.rotation.x = 0.3;
        g.add(stripe);
      }
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 0.15), dark);
      door.position.set(-0.8, 0.85 + 0.3, 2.32);
      g.add(door);
      const shopWindow = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 1.1, 0.1),
        this.windowGlass(),
      );
      shopWindow.position.set(1.2, 1.15, 2.32);
      g.add(shopWindow);
      windowBox(-1.4, 2.6, 2.15);
      windowBox(1.4, 2.6, 2.15);
      hangingSign(2.9, 2.6, 2.6, PALETTE_HEX.h6a3540);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 8), makeRetroMaterial({ color: PALETTE_HEX.h9a7f4e }));
      horn.position.set(-1.8, 4.9, 0);
      horn.rotation.z = -0.9;
      g.add(horn);
    } else if (id === 'archive') {
      // Stone rotunda: octagonal base, dome, columned porch with pediment.
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2, 3.4, 3.4, 8),
        makeRetroMaterial({ map: brickSheet(PALETTE_CSS.h6a6156, PALETTE_CSS.h57504a) }),
      );
      base.position.y = 1.7;
      const cornice = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.3, 8), ivory);
      cornice.position.y = 3.4;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(3.0, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), makeRetroMaterial({ color: PALETTE_HEX.h7a8a7a }));
      dome.position.y = 3.5;
      dome.scale.y = 0.75;
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), makeRetroMaterial({ color: PALETTE_HEX.h9a7f4e }));
      finial.position.y = 6.0;
      g.add(base, cornice, dome, finial);
      // Porch: four columns + pediment.
      for (const side of [-1.3, -0.45, 0.45, 1.3]) {
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.6, 7), ivory);
        column.position.set(side, 1.3, 4.0);
        g.add(column);
      }
      const architrave = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.35, 1.0), ivory);
      architrave.position.set(0, 2.8, 4.0);
      const pediment = makeGablePrism(3.6, 1.2, 0.8, makeRetroMaterial({ color: PALETTE_HEX.h8a8478 }));
      pediment.position.set(0, 3.35, 4.0);
      g.add(architrave, pediment);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.3, 0.15), dark);
      door.position.set(0, 1.15, 3.35);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 0.3), ivory);
      lintel.position.set(0, 2.45, 3.35);
      g.add(door, lintel);
      // Tall arched windows all the way round the rotunda, each with a stone
      // surround and a keystone, so the Archive reads as a public building
      // rather than a drum. They light up from inside after dark.
      for (let w = 0; w < 6; w++) {
        const a = (w / 6) * Math.PI * 2 + Math.PI / 6;
        // Skip the arc behind the portico.
        if (Math.abs(a - Math.PI / 2) < 0.5) continue;
        const sx = Math.sin(a);
        const cz = Math.cos(a);
        // Sits above the specimen-drawer band and below the cornice.
        const surround = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.75, 0.12), ivory);
        surround.position.set(sx * 3.24, 2.4, cz * 3.24);
        surround.rotation.y = a;
        const pane = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.1), this.windowGlass());
        pane.position.set(sx * 3.32, 2.4, cz * 3.32);
        pane.rotation.y = a;
        // A moulded head and sill instead of a true arch: a half-cylinder at
        // this scale is one blurry pixel row, but the ledges read clearly.
        const head = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.18, 0.22), ivory);
        head.position.set(sx * 3.28, 3.34, cz * 3.28);
        head.rotation.y = a;
        const sill = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.14, 0.26), ivory);
        sill.position.set(sx * 3.28, 1.5, cz * 3.28);
        sill.rotation.y = a;
        const keystone = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.2), ivory);
        keystone.position.set(sx * 3.32, 3.46, cz * 3.32);
        keystone.rotation.y = a;
        // Muntin bar breaks the pane into upper and lower panels.
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.06, 0.12), ivory);
        bar.position.set(sx * 3.36, 2.4, cz * 3.36);
        bar.rotation.y = a;
        g.add(surround, pane, head, sill, keystone, bar);
      }
      // Specimen-drawer relief band.
      for (let d = 0; d < 6; d++) {
        const a = (d / 6) * Math.PI * 2 + 0.3;
        const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.08), ivory);
        drawer.position.set(Math.sin(a) * 3.25, 0.95, Math.cos(a) * 3.25);
        drawer.rotation.y = a;
        g.add(drawer);
      }
      // Hanging sign: a bracket off the portico carrying a board with the
      // Cataloger's jeweller's-lens emblem.
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 0.09), dark);
      bracket.position.set(2.05, 2.65, 4.05);
      const hook = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.06), dark);
      hook.position.set(2.5, 2.46, 4.05);
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.75, 0.07), makeRetroMaterial({ color: PALETTE_HEX.h3f4a45 }));
      board.position.set(2.5, 1.95, 4.05);
      const boardTrim = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.09, 0.05), makeRetroMaterial({ color: PALETTE_HEX.h9a7f4e }));
      boardTrim.position.set(2.5, 2.3, 4.06);
      const lensRim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 5, 10), makeRetroMaterial({ color: PALETTE_HEX.hc9a227 }));
      lensRim.position.set(2.5, 1.95, 4.1);
      const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.17, 10), makeRetroMaterial({ color: PALETTE_HEX.ha8bcc8 }));
      lensGlass.position.set(2.5, 1.95, 4.11);
      g.add(bracket, hook, board, boardTrim, lensRim, lensGlass);
      // Worn stone steps up to the portico.
      for (let s = 0; s < 3; s++) {
        const stepMesh = new THREE.Mesh(
          new THREE.BoxGeometry(3.6 - s * 0.25, 0.18, 0.55),
          makeRetroMaterial({ map: plasterSheet(PALETTE_CSS.hb4a894) }),
        );
        stepMesh.position.set(0, 0.09 + s * 0.18, 4.9 - s * 0.5);
        g.add(stepMesh);
      }
      // Iron lamps flanking the door.
      for (const side of [-1.85, 1.85]) {
        const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 5), dark);
        lampPost.position.set(side, 0.8, 4.5);
        const lampHead = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.26), this.windowGlass());
        lampHead.position.set(side, 1.72, 4.5);
        const lampCap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.2, 4), dark);
        lampCap.position.set(side, 1.95, 4.5);
        lampCap.rotation.y = Math.PI / 4;
        g.add(lampPost, lampHead, lampCap);
      }
    } else {
      // Cottages: gabled roofs, porch step, window box, chimney with smoke.
      const isMarigold = id === 'house-marigold';
      const isPlayer = id === 'house-player';
      const tint = isPlayer ? PALETTE_CSS.hc8b890 : isMarigold ? PALETTE_CSS.h8a9a5a : PALETTE_CSS.h5a7a8a;
      const roofColor = isPlayer ? PALETTE_HEX.h8a4a3a : isMarigold ? PALETTE_HEX.h6a5240 : PALETTE_HEX.h3f4a5a;
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 2.4, 3.8),
        makeRetroMaterial({ map: plasterSheet(tint) }),
      );
      base.position.y = 1.2;
      const roof = makeGablePrism(4.8, 4.2, 1.6, makeRetroMaterial({ color: roofColor }));
      roof.userData.rainMaterial = 'roof';
      roof.position.y = 3.2;
      if (!isMarigold) roof.rotation.y = Math.PI / 2; // vary silhouettes
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.7, 0.12), wood);
      door.position.set(-0.9, 0.95, 1.92);
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.7), makeRetroMaterial({ color: PALETTE_HEX.h8a8478 }));
      step.position.set(-0.9, 0.09, 2.3);
      const chimney = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 1.7, 0.5),
        makeRetroMaterial({ map: brickSheet(PALETTE_CSS.h7d7a72, PALETTE_CSS.h5f5a52) }),
      );
      chimney.position.set(isMarigold ? 1.5 : -1.5, 3.6, 0.9);
      g.add(base, roof, door, step, chimney);
      // Corner boards, a sill band and barge trim: cheap geometry that turns a
      // painted box into a built thing.
      for (const cx of [-2.06, 2.06]) {
        for (const cz2 of [-1.86, 1.86]) {
          const corner = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 0.16), ivory);
          corner.position.set(cx, 1.2, cz2);
          g.add(corner);
        }
      }
      const sillBand = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.16, 3.9), ivory);
      sillBand.position.y = 0.42;
      const eaveBand = new THREE.Mesh(new THREE.BoxGeometry(4.34, 0.18, 3.94), ivory);
      eaveBand.position.y = 2.32;
      g.add(sillBand, eaveBand);
      // Shutters either side of the front window.
      for (const sx of [-0.42, 0.42]) {
        const shutter = new THREE.Mesh(
          new THREE.BoxGeometry(0.26, 0.85, 0.07),
          makeRetroMaterial({ color: roofColor }),
        );
        shutter.position.set(0.9 + sx, 1.6, 1.95);
        g.add(shutter);
      }
      // A picket fence with a gap for the path, and a couple of yard props.
      const picketMat = makeRetroMaterial({ color: PALETTE_HEX.hd0c4a4 });
      for (let f = -5; f <= 5; f++) {
        const fx = f * 0.42;
        if (Math.abs(fx + 0.9) < 0.75) continue; // gateway in front of the door
        const picket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.06), picketMat);
        picket.position.set(fx, 0.31, 2.95);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 4), picketMat);
        tip.position.set(fx, 0.68, 2.95);
        tip.rotation.y = Math.PI / 4;
        g.add(picket, tip);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.07, 0.05), picketMat);
      rail.position.set(0, 0.44, 2.95);
      g.add(rail);
      // Stacked firewood against the gable end.
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 6), wood);
          log.position.set(2.35, 0.1 + r * 0.19, -1.0 + c * 0.2 + (r % 2) * 0.08);
          log.rotation.z = Math.PI / 2;
          g.add(log);
        }
      }
      dormer(isMarigold ? -0.6 : 0.6, 3.6, 1.1);
      this.smokeEmitters.push({
        pos: new THREE.Vector3(isMarigold ? 1.5 : -1.5, 4.6, 0.9),
        timer: Math.random() * 3,
      });
      windowBox(0.9, 1.6, 1.92);
      if (isPlayer) {
        // The postmaster's own cottage: a brass letter-slot door plaque and
        // a little red mailbox on a post by the step.
        const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.03), makeRetroMaterial({ color: PALETTE_HEX.h9a7f4e }));
        plaque.position.set(-0.9, 1.25, 1.99);
        g.add(plaque);
        const mbPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 5), dark);
        mbPost.position.set(-2.2, 0.45, 2.3);
        const mbBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.55), makeRetroMaterial({ color: PALETTE_HEX.ha8402f }));
        mbBox.position.set(-2.2, 1.0, 2.3);
        const mbFlag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), makeRetroMaterial({ color: PALETTE_HEX.hc9a227 }));
        mbFlag.position.set(-2.0, 1.25, 2.1);
        g.add(mbPost, mbBox, mbFlag);
      } else if (isMarigold) {
        // Trellis with climbing blooms.
        for (let t = 0; t < 3; t++) {
          const bloom = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.12, 0),
            makeFoliageMaterial({ color: PALETTE_HEX.hc9a227 }, 0.04, 1),
          );
          bloom.position.set(-2.15, 0.8 + t * 0.6, 1.2 - t * 0.3);
          g.add(bloom);
        }
      } else {
        // A striped mooring buoy by BUOY's door.
        const moor = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 6), makeRetroMaterial({ color: PALETTE_HEX.ha8402f }));
        moor.position.set(1.6, 0.3, 2.2);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 5, 9), ivory);
        band.position.copy(moor.position);
        band.rotation.x = Math.PI / 2;
        g.add(moor, band);
      }
    }
    return g;
  }


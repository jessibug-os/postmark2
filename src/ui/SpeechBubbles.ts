
import * as THREE from 'three';

/**
 * Overheard speech: small kraft bubbles that track a villager's head in screen
 * space. Text lives in the DOM rather than the 3D scene so it stays crisp over
 * the 480x360 render target, the same reasoning as the rest of the UI.
 *
 * These are deliberately quiet — no portrait, no nameplate, no input. The
 * player is eavesdropping, not being addressed.
 */
export class SpeechBubbles {
  private root: HTMLDivElement;
  private active: Array<{
    el: HTMLDivElement;
    anchor: THREE.Object3D;
    /** Seconds left before it fades out. */
    life: number;
    height: number;
  }> = [];

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.style.cssText = `
      position:absolute; inset:0; pointer-events:none; z-index:14; overflow:hidden;
    `;
    container.appendChild(this.root);
  }

  /** Pop a bubble over an object for `seconds`. Replaces that object's last. */
  show(anchor: THREE.Object3D, text: string, seconds = 3.2, height = 2.3): void {
    this.clearFor(anchor);
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `
      position:absolute; transform:translate(-50%, -100%) scale(0.7);
      transform-origin:50% 100%;
      max-width:230px; padding:6px 10px;
      background:var(--pm-kraft, var(--pm-he8dfc8)); color:var(--pm-ink, var(--pm-h3a3129));
      border:1px solid rgba(60,50,38,0.35); border-radius:9px;
      font-size:12px; line-height:1.35; text-align:center;
      box-shadow:0 3px 8px rgba(0,0,0,0.28);
      opacity:0;
      transition:opacity 160ms ease, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
    `;
    this.root.appendChild(el);
    // Pop up from a small, squashed state rather than fading a static rectangle.
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%, -100%) scale(1)';
    });
    this.active.push({ el, anchor, life: seconds, height });
  }

  private clearFor(anchor: THREE.Object3D): void {
    for (const b of this.active.filter((x) => x.anchor === anchor)) b.life = 0;
  }

  /** Drop every bubble immediately (conversation interrupted, scene change). */
  clear(): void {
    for (const b of this.active) b.el.remove();
    this.active = [];
  }

  update(dt: number, camera: THREE.Camera): void {
    if (!this.active.length) return;
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    const v = new THREE.Vector3();
    for (const b of [...this.active]) {
      b.life -= dt;
      if (b.life <= 0) {
        b.el.style.opacity = '0';
        // Give the fade a moment before the node goes away.
        if (b.life < -0.25) {
          b.el.remove();
          this.active = this.active.filter((x) => x !== b);
        }
        continue;
      }
      b.anchor.getWorldPosition(v);
      v.y += b.height;
      v.project(camera);
      // Behind the camera, or off the edges: hide rather than wrap around.
      const onScreen = v.z < 1 && v.x > -1.2 && v.x < 1.2 && v.y > -1.2 && v.y < 1.2;
      b.el.style.display = onScreen ? 'block' : 'none';
      if (!onScreen) continue;
      // Keep the bubble fully on screen even when its speaker is at the edge;
      // a half-cut line of overheard dialogue is worse than a nudged bubble.
      const bw = b.el.offsetWidth || 160;
      const x = Math.min(Math.max((v.x * 0.5 + 0.5) * w, bw / 2 + 6), w - bw / 2 - 6);
      const y = Math.max((-v.y * 0.5 + 0.5) * h, b.el.offsetHeight + 6);
      b.el.style.left = `${x}px`;
      b.el.style.top = `${y}px`;
    }
  }
}

import * as THREE from 'three';

interface FadeState {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  faded: THREE.Material | THREE.Material[];
  opacity: number;
  wanted: boolean;
}

export interface SubjectProtectionStatus {
  blockers: number;
  opaqueBlockers: number;
}

/**
 * Keeps the followed actor readable through every kind of scenery. A ray from
 * camera to torso finds foreground meshes and eases just those surfaces away;
 * restoring the exact original materials avoids permanently mutating shared
 * world materials.
 */
export class SubjectProtection {
  private readonly ray = new THREE.Raycaster();
  private readonly origin = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly worldSphere = new THREE.Sphere();
  private readonly closest = new THREE.Vector3();
  private readonly fades = new Map<THREE.Mesh, FadeState>();
  private currentStatus: SubjectProtectionStatus = { blockers: 0, opaqueBlockers: 0 };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly subject: THREE.Object3D,
  ) {}

  status(): SubjectProtectionStatus {
    return { ...this.currentStatus };
  }

  update(dt: number): void {
    for (const state of this.fades.values()) state.wanted = false;

    this.origin.copy(this.camera.position);
    this.subject.getWorldPosition(this.target);
    this.target.y += 0.85;
    this.direction.subVectors(this.target, this.origin);
    const distance = this.direction.length();
    if (distance > 0.5) {
      this.direction.multiplyScalar(1 / distance);
      this.ray.set(this.origin, this.direction);
      this.ray.near = 0.12;
      this.ray.far = Math.max(0.12, distance - 0.32);
      // Raycaster's recursive scene walk also invokes Sprite.raycast(), which
      // requires a screen-space camera and can abort the entire game loop.
      // Subject protection is geometry-only, so feed it meshes explicitly.
      const geometry: THREE.Object3D[] = [];
      this.scene.traverse((object) => {
        // Instanced meshes are whole-map coverage batches (grass, ferns,
        // decorative flowers, contact shadows). Raycasting one asks Three to
        // test every instance in the batch, even though none is large enough
        // to hide the player and none can be faded independently. Including
        // them here turned this one visibility safeguard into the dominant
        // per-tick CPU cost.
        if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
        if (!object.visible || object.userData.noSubjectFade === true) return;
        if (!object.geometry.boundingSphere) object.geometry.computeBoundingSphere();
        if (!object.geometry.boundingSphere) return;
        this.worldSphere.copy(object.geometry.boundingSphere).applyMatrix4(object.matrixWorld);
        this.ray.ray.closestPointToPoint(this.worldSphere.center, this.closest);
        if (this.closest.distanceToSquared(this.worldSphere.center) > this.worldSphere.radius ** 2) return;
        if (this.origin.distanceTo(this.closest) > this.ray.far + this.worldSphere.radius) return;
        geometry.push(object);
      });
      for (const hit of this.ray.intersectObjects(geometry, false)) {
        const mesh = hit.object;
        if (!(mesh instanceof THREE.Mesh) || this.belongsToSubject(mesh)) continue;
        if (!mesh.visible || mesh.userData.noSubjectFade === true) continue;
        this.ensureFade(mesh).wanted = true;
      }
    }

    const ease = 1 - Math.exp(-dt * 14);
    let blockers = 0;
    let opaqueBlockers = 0;
    for (const [mesh, state] of this.fades) {
      const goal = state.wanted ? 0.12 : 1;
      state.opacity = THREE.MathUtils.lerp(state.opacity, goal, ease);
      this.setOpacity(state.faded, state.opacity);
      if (state.wanted) {
        blockers++;
        if (state.opacity > 0.38) opaqueBlockers++;
      }
      if (!state.wanted && state.opacity > 0.995) {
        mesh.material = state.original;
        this.dispose(state.faded);
        this.fades.delete(mesh);
      }
    }
    this.currentStatus = { blockers, opaqueBlockers };
  }

  private belongsToSubject(object: THREE.Object3D): boolean {
    for (let current: THREE.Object3D | null = object; current; current = current.parent) {
      if (current === this.subject) return true;
    }
    return false;
  }

  private ensureFade(mesh: THREE.Mesh): FadeState {
    const existing = this.fades.get(mesh);
    if (existing) return existing;
    const original = mesh.material;
    const faded = Array.isArray(original)
      ? original.map((material) => this.cloneForFade(material))
      : this.cloneForFade(original);
    // Protection is an invariant, not a flourish: a newly encountered wall
    // must not spend several frames opaque over the player. Restoration eases.
    const state = { mesh, original, faded, opacity: 0.12, wanted: true };
    this.setOpacity(faded, state.opacity);
    mesh.material = faded;
    this.fades.set(mesh, state);
    return state;
  }

  private cloneForFade(source: THREE.Material): THREE.Material {
    const material = source.clone();
    // Material.clone() omits callbacks. Preserve the retro rolling-world
    // transform so mixed-material authored props cannot separate while faded.
    material.onBeforeCompile = source.onBeforeCompile;
    material.customProgramCacheKey = source.customProgramCacheKey;
    material.transparent = true;
    material.depthWrite = false;
    material.needsUpdate = true;
    return material;
  }

  private setOpacity(material: THREE.Material | THREE.Material[], opacity: number): void {
    for (const entry of Array.isArray(material) ? material : [material]) entry.opacity = opacity;
  }

  private dispose(material: THREE.Material | THREE.Material[]): void {
    for (const entry of Array.isArray(material) ? material : [material]) entry.dispose();
  }
}

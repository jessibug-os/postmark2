import * as THREE from 'three';

const SPRING_BONES = ['extra_hem_front', 'extra_hem_back', 'extra_hair_back'];
const STEP = 1 / 120;
const VELOCITY_SMOOTHING = 0.08;
const TELEPORT_SPEED = 25;

interface Tune {
  frequency: number;
  damping: number;
  drag: number;
  follow: number;
  limit: number;
  inward: number;
}

const HEM: Tune = { frequency: 2.4, damping: 0.4, drag: 0.025, follow: 0.45, limit: THREE.MathUtils.degToRad(25), inward: 0.12 };
const HAIR: Tune = { frequency: 1.4, damping: 0.3, drag: 0.03, follow: 0, limit: THREE.MathUtils.degToRad(20), inward: 0.1 };

interface Spring {
  bone: THREE.Object3D;
  parent: THREE.Object3D;
  rest: THREE.Quaternion;
  forward: THREE.Vector3;
  side: THREE.Vector3;
  tune: Tune;
  facing: 1 | -1;
  pitch: number;
  roll: number;
  pitchRate: number;
  rollRate: number;
  last: THREE.Vector3;
  velocity: THREE.Vector3;
  seeded: boolean;
}

interface Leg {
  thigh: THREE.Object3D;
  knee: THREE.Vector3;
  rest: number;
}

export interface Springs {
  update(dt: number): void;
}

export function withoutSpringTracks(clip: THREE.AnimationClip): THREE.AnimationClip {
  const keep = clip.tracks.filter((track) => !SPRING_BONES.some((bone) => track.name.startsWith(`${bone}.`)));
  if (keep.length === clip.tracks.length) return clip;
  return new THREE.AnimationClip(clip.name, clip.duration, keep, clip.blendMode);
}

export function createSprings(root: THREE.Object3D): Springs | null {
  const [front, back, hair] = SPRING_BONES.map((name) => root.getObjectByName(name) ?? null);
  const hips = front?.parent;
  if (!front || !back || !hair || !hips || back.parent !== hips || !hair.parent) return null;
  root.updateWorldMatrix(true, true);
  const hipsQ = hips.getWorldQuaternion(new THREE.Quaternion());
  const worldUp = new THREE.Vector3(0, 1, 0);
  const hipsUp = worldUp.clone().applyQuaternion(hipsQ.clone().invert());
  const hipsForward = front.position.clone().sub(back.position);
  hipsForward.addScaledVector(hipsUp, -hipsForward.dot(hipsUp)).normalize();
  const worldForward = hipsForward.clone().applyQuaternion(hipsQ);

  const spring = (bone: THREE.Object3D, tune: Tune, facing: 1 | -1): Spring => {
    const parent = bone.parent!;
    const inverse = parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const up = worldUp.clone().applyQuaternion(inverse);
    const forward = worldForward.clone().applyQuaternion(inverse);
    forward.addScaledVector(up, -forward.dot(up)).normalize();
    return {
      bone, parent, tune, facing,
      rest: bone.quaternion.clone(),
      forward,
      side: forward.clone().cross(up).normalize(),
      pitch: 0, roll: 0, pitchRate: 0, rollRate: 0,
      last: new THREE.Vector3(), velocity: new THREE.Vector3(), seeded: false,
    };
  };
  const springs = [spring(front, HEM, 1), spring(back, HEM, -1), spring(hair, HAIR, -1)];

  const swingOf = (knee: THREE.Vector3, q: THREE.Quaternion): number => {
    const dir = knee.clone().applyQuaternion(q);
    return Math.atan2(dir.dot(hipsForward), -dir.dot(hipsUp));
  };
  const legs: Leg[] = (['l', 'r'] as const).flatMap((s) => {
    const thigh = root.getObjectByName(`extra_thigh_${s}`);
    const shin = root.getObjectByName(`extra_shin_${s}`);
    if (!thigh || !shin || thigh.parent !== hips) return [];
    const knee = shin.position.clone();
    return [{ thigh, knee, rest: swingOf(knee, thigh.quaternion) }];
  });

  const position = new THREE.Vector3();
  const sample = new THREE.Vector3();
  const local = new THREE.Vector3();
  const parentQ = new THREE.Quaternion();
  const pitchQ = new THREE.Quaternion();
  const rollQ = new THREE.Quaternion();

  return {
    update(dt: number): void {
      if (dt <= 0) return;
      const swings = legs.map((leg) => swingOf(leg.knee, leg.thigh.quaternion) - leg.rest);
      const lead = Math.max(0, ...swings);
      const trail = Math.min(0, ...swings);
      const smoothing = 1 - Math.exp(-dt / VELOCITY_SMOOTHING);
      const steps = Math.ceil(dt / STEP);
      const h = dt / steps;
      for (const s of springs) {
        const { tune } = s;
        s.parent.getWorldPosition(position);
        if (!s.seeded) {
          s.last.copy(position);
          s.seeded = true;
        }
        sample.subVectors(position, s.last).divideScalar(dt);
        s.last.copy(position);
        if (sample.length() > TELEPORT_SPEED) sample.set(0, 0, 0);
        s.velocity.lerp(sample, smoothing);
        local.copy(s.velocity).applyQuaternion(s.parent.getWorldQuaternion(parentQ).invert());
        const follow = tune.follow * (s.facing > 0 ? lead : trail);
        const pitchTarget = -tune.drag * local.dot(s.forward) + follow;
        const rollTarget = tune.drag * local.dot(s.side);
        const omega = Math.PI * 2 * tune.frequency;
        const [pitchMin, pitchMax] = s.facing > 0 ? [-tune.inward, tune.limit] : [-tune.limit, tune.inward];
        const rollLimit = tune.limit * 0.6;
        for (let i = 0; i < steps; i++) {
          s.pitchRate += (omega * omega * (pitchTarget - s.pitch) - 2 * tune.damping * omega * s.pitchRate) * h;
          s.rollRate += (omega * omega * (rollTarget - s.roll) - 2 * tune.damping * omega * s.rollRate) * h;
          s.pitch += s.pitchRate * h;
          s.roll += s.rollRate * h;
          if (s.pitch < pitchMin || s.pitch > pitchMax) {
            s.pitch = THREE.MathUtils.clamp(s.pitch, pitchMin, pitchMax);
            s.pitchRate = 0;
          }
          if (Math.abs(s.roll) > rollLimit) {
            s.roll = THREE.MathUtils.clamp(s.roll, -rollLimit, rollLimit);
            s.rollRate = 0;
          }
        }
        pitchQ.setFromAxisAngle(s.side, s.pitch);
        rollQ.setFromAxisAngle(s.forward, s.roll);
        s.bone.quaternion.copy(pitchQ).multiply(rollQ).multiply(s.rest);
      }
    },
  };
}

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createCharacter, type Character } from './createCharacter';
import type { Expression } from './face/types';
import type { CharacterRecipeV2 } from './recipeV2';

const CLIPS = ['idle', 'walk', 'run_lower', 'seated_idle'] as const;
const CLIP_LABELS: Record<(typeof CLIPS)[number], string> = {
  idle: 'Idle', walk: 'Walk', run_lower: 'Run', seated_idle: 'Sit',
};

export function CharacterPreview({ recipe, expression = 'idle', talking = false }: { recipe: CharacterRecipeV2; expression?: Expression; talking?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const character = useRef<Character | null>(null);
  const play = useRef<(name: string) => void>(() => {});
  const spin = useRef(true);
  const far = useRef(false);
  const [clip, setClip] = useState<string>('idle');
  const [spinning, setSpinning] = useState(true);
  const [distant, setDistant] = useState(false);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#2a2622');
    scene.add(new THREE.HemisphereLight('#fff4dc', '#5a4a3a', 1.6));
    const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
    sun.position.set(2, 5, 4);
    scene.add(sun);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 24).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#4a5a3c' }),
    );
    scene.add(ground);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const made = createCharacter(recipe);
    character.current = made;
    scene.add(made.root);
    const mixer = new THREE.AnimationMixer(made.root);
    let action: THREE.AnimationAction | null = null;
    play.current = (name) => {
      const next = made.clips.find((c) => c.name === name);
      if (!next) return;
      action?.fadeOut(0.2);
      action = mixer.clipAction(next).reset().fadeIn(0.2).play();
    };
    play.current('idle');

    let yaw = 0.5;
    let drag: number | null = null;
    const down = (e: PointerEvent): void => { drag = e.clientX; };
    const move = (e: PointerEvent): void => {
      if (drag === null) return;
      yaw += (e.clientX - drag) * 0.01;
      drag = e.clientX;
    };
    const up = (): void => { drag = null; };
    renderer.domElement.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);

    const resize = (): void => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    const clock = new THREE.Clock();
    let frame = 0;
    const tick = (): void => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.1);
      mixer.update(dt);
      made.face.update(dt);
      if (spin.current && drag === null) yaw += dt * 0.5;
      made.root.rotation.y = yaw;
      const distance = far.current ? 22 : 8;
      camera.position.set(0, far.current ? 9 : 2.2, distance);
      camera.lookAt(0, 1.25, 0);
      renderer.render(scene, camera);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      renderer.dispose();
      renderer.domElement.remove();
      character.current = null;
    };
  }, []);

  useEffect(() => {
    character.current?.apply(recipe);
  }, [recipe]);

  useEffect(() => {
    character.current?.face.setExpression(expression);
  }, [expression]);

  useEffect(() => {
    character.current?.face.talk(talking);
  }, [talking]);

  return (
    <div className="cc-preview">
      <div className="cc-stage" ref={host} />
      <div className="cc-stage-bar">
        {CLIPS.map((name) => (
          <button
            key={name}
            aria-pressed={clip === name}
            onClick={() => {
              setClip(name);
              play.current(name);
            }}
          >
            {CLIP_LABELS[name]}
          </button>
        ))}
        <span className="cc-gap" />
        <button aria-pressed={spinning} onClick={() => { spin.current = !spinning; setSpinning(!spinning); }}>Spin</button>
        <button aria-pressed={distant} onClick={() => { far.current = !distant; setDistant(!distant); }}>Far</button>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { audio } from '../core/AudioSystem';
import { ACTIVE_TITLE } from '../content/activePack';
import type { Input } from '../player/Input';
import type { SaveSlotId, SaveSlotSummary } from '../systems/SaveSystem';
import { ensureStyles } from './kit';

/**
 * Animal Crossing-style title: logo card over the live 3D scene, "press any
 * key", then a small menu.
 *
 * The game loop owns input (keyboard and gamepad are folded together in
 * `Input`), so the component doesn't listen for keys itself. The loop calls
 * `update` on the handle once per frame, and the component reads the frame's
 * presses from there.
 */

export interface TitleScreenOptions {
  slots: SaveSlotSummary[];
  onContinue: (slot: SaveSlotId) => void;
  onNewGame: (slot: SaveSlotId) => void;
  musicOn: boolean;
  sfxOn: boolean;
  /** Flip the setting and return its new value. */
  musicToggle: () => boolean;
  sfxToggle: () => boolean;
}

export interface TitleScreenHandle {
  readonly isOpen: boolean;
  /** Feed one frame of input. */
  update(input: Input, dt: number): void;
  /** The world behind the title is built; let the player in. */
  ready(): void;
  /** Take the title screen off the page for good (scene-preview mode). */
  dismiss(): void;
}

type FrameListener = (input: Input) => void;

const FADE_MS = 850;

export function mountTitleScreen(container: HTMLElement, opts: TitleScreenOptions): TitleScreenHandle {
  ensureStyles();
  const host = document.createElement('div');
  host.style.display = 'contents';
  container.appendChild(host);
  const root = createRoot(host);

  let open = true;
  let listener: FrameListener | null = null;

  const teardown = (): void => {
    root.unmount();
    host.remove();
  };

  const render = (ready: boolean): void => root.render(
    <TitleScreen
      {...opts}
      ready={ready}
      onFrame={(fn) => {
        listener = fn;
        return () => {
          if (listener === fn) listener = null;
        };
      }}
      onClosed={() => {
        open = false;
        setTimeout(teardown, FADE_MS);
      }}
    />,
  );
  render(false);

  return {
    get isOpen() {
      return open;
    },
    update(input) {
      if (open) listener?.(input);
    },
    ready() {
      if (open) render(true);
    },
    dismiss() {
      open = false;
      teardown();
    },
  };
}

type MenuEntry = { label: string; action: () => void };
type View = { kind: 'main' } | { kind: 'replace' } | { kind: 'confirm'; slot: SaveSlotSummary };

interface TitleScreenProps extends TitleScreenOptions {
  ready: boolean;
  onFrame: (fn: FrameListener) => () => void;
  onClosed: () => void;
}

function TitleScreen({ ready, onFrame, onClosed, ...opts }: TitleScreenProps) {
  const [phase, setPhase] = useState<'press' | 'menu' | 'closed'>('press');
  const [view, setView] = useState<View>({ kind: 'main' });
  const [selected, setSelected] = useState(0);
  const [musicOn, setMusicOn] = useState(opts.musicOn);
  const [sfxOn, setSfxOn] = useState(opts.sfxOn);

  const openMenu = (): void => {
    if (phase !== 'press' || !ready) return;
    audio.unlock();
    audio.sfx('confirm');
    setPhase('menu');
  };

  const show = (next: View): void => {
    setView(next);
    setSelected(0);
  };

  const finish = (action: () => void): void => {
    setPhase('closed');
    onClosed();
    action();
  };

  const entries = menuEntries(view, opts.slots, {
    continueSlot: (slot) => finish(() => opts.onContinue(slot)),
    newGame: (slot) => finish(() => opts.onNewGame(slot)),
    show,
    music: { on: musicOn, toggle: () => setMusicOn(opts.musicToggle()) },
    sfx: { on: sfxOn, toggle: () => setSfxOn(opts.sfxToggle()) },
  });

  // Point the frame listener at this render's closures, so it always sees the
  // current phase, entries and selection.
  const frame = useRef<FrameListener>(() => {});
  useEffect(() => {
    frame.current = (input) => {
      if (phase === 'press') {
        if (input.anyPressed()) openMenu();
        return;
      }
      if (phase !== 'menu') return;
      const move = (delta: number): void => {
        const n = entries.length;
        setSelected((i) => (((i + delta) % n) + n) % n);
        audio.sfx('blip');
      };
      if (input.wasPressed('ArrowDown') || input.wasPressed('KeyS')) move(1);
      if (input.wasPressed('ArrowUp') || input.wasPressed('KeyW')) move(-1);
      if (input.wasPressed('Enter') || input.wasPressed('KeyE') || input.wasPressed('Space')) {
        entries[selected]?.action();
      }
    };
  });
  useEffect(() => onFrame((input) => frame.current(input)), [onFrame]);

  return (
    <div
      style={{ ...styles.root, ...(phase === 'closed' ? styles.rootClosed : null) }}
      onPointerDown={openMenu}
    >
      <style>{keyframes}</style>
      <div style={styles.float}>
        <div style={styles.card}>
          <div style={styles.rings} />
          <div style={styles.rings2} />
          <div style={styles.logo}>{ACTIVE_TITLE.name}</div>
        </div>
      </div>

      {phase === 'press' && ready && <div style={styles.press}>· press any key or tap ·</div>}

      {phase !== 'press' && (
        <div className="pm-panel" style={styles.menu}>
          {entries.map((entry, i) => (
            <button
              key={`${view.kind}-${i}`}
              className={i === selected ? 'pm-btn selected' : 'pm-btn'}
              onClick={entry.action}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function menuEntries(
  view: View,
  slots: SaveSlotSummary[],
  go: {
    continueSlot: (slot: SaveSlotId) => void;
    newGame: (slot: SaveSlotId) => void;
    show: (view: View) => void;
    music: { on: boolean; toggle: () => void };
    sfx: { on: boolean; toggle: () => void };
  },
): MenuEntry[] {
  const occupied = slots.filter((slot) => slot.occupied);

  if (view.kind === 'confirm') {
    const { slot } = view;
    return [
      { label: `No — keep ${slot.playerName}`, action: () => go.show({ kind: 'replace' }) },
      { label: `Yes — erase Slot ${slot.slot}`, action: () => go.newGame(slot.slot) },
    ];
  }

  if (view.kind === 'replace') {
    return [
      ...occupied.map((slot) => ({
        label: `↻  Slot ${slot.slot} · ${slot.playerName}`,
        action: () => go.show({ kind: 'confirm', slot }),
      })),
      { label: '←  Keep every town', action: () => go.show({ kind: 'main' }) },
    ];
  }

  return [
    ...slots.map((slot) =>
      slot.occupied
        ? {
            label: `✉  Slot ${slot.slot} · ${slot.playerName} · ${formatDuration(slot.playedSeconds)}${slot.recovered ? ' · recovered' : ''}`,
            action: () => go.continueSlot(slot.slot),
          }
        : {
            label: `🌱  Slot ${slot.slot} · New town`,
            action: () => go.newGame(slot.slot),
          },
    ),
    ...(occupied.length
      ? [{ label: '↻  Start a slot over…', action: () => go.show({ kind: 'replace' }) }]
      : []),
    { label: `♪  Music: ${go.music.on ? 'on' : 'off'}`, action: go.music.toggle },
    { label: `🔔  Sounds: ${go.sfx.on ? 'on' : 'off'}`, action: go.sfx.toggle },
  ];
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

const keyframes = `
  @keyframes pm-title-float {
    0%, 100% { transform: translateY(0) rotate(-0.6deg); }
    50% { transform: translateY(-9px) rotate(0.5deg); }
  }
  @keyframes pm-title-in {
    from { opacity: 0; transform: translateY(24px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes pm-stamp-wiggle {
    0%, 100% { transform: rotate(8deg); }
    50% { transform: rotate(12deg); }
  }
  @keyframes pm-title-blink {
    0%, 100% { opacity: 0.45; }
    50% { opacity: 1; }
  }
`;

const styles = {
  root: {
    position: 'absolute',
    inset: 0,
    zIndex: 60,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: `
      linear-gradient(to bottom, rgba(20,16,13,0.35), rgba(20,16,13,0.0) 28%,
        rgba(20,16,13,0.0) 62%, rgba(20,16,13,0.5)),
      radial-gradient(ellipse at 50% 40%, rgba(20,16,13,0.0) 46%, rgba(20,16,13,0.3))`,
    fontFamily: 'Georgia, serif',
    userSelect: 'none',
  },
  rootClosed: {
    opacity: 0,
    transition: 'opacity 0.8s',
    pointerEvents: 'none',
  },
  float: {
    animation: 'pm-title-float 5.5s ease-in-out infinite',
  },
  // The card floats over the scene, so it has to stay a card. Sized to the
  // longest word in the title it went edge to edge on a 960 viewport, which
  // turns it into a banner and pushes the wax stamp (which hangs off the
  // corner by design) off the screen. Capped, the title wraps to two lines
  // instead, which is the better shape for it anyway.
  card: {
    position: 'relative',
    textAlign: 'center',
    padding: '34px 68px 30px',
    maxWidth: 'min(660px, 86vw)',
    boxSizing: 'border-box',
    background: 'linear-gradient(168deg, var(--pm-hf2ead6), var(--pm-hddd2b6))',
    border: '2px solid var(--pm-hb8a680)',
    borderRadius: 8,
    boxShadow: '0 18px 60px rgba(0,0,0,0.65), inset 0 0 40px rgba(154,127,78,0.18)',
    animation: 'pm-title-in 1.4s ease both',
  },
  stamp: {
    position: 'absolute',
    top: -22,
    right: -20,
    width: 64,
    height: 64,
    background: 'radial-gradient(circle at 35% 30%, var(--pm-hc05548), var(--pm-h8a3a32))',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--pm-hf2ead6)',
    fontSize: 26,
    boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
    animation: 'pm-stamp-wiggle 4s ease-in-out infinite',
  },
  rings: {
    position: 'absolute',
    top: -14,
    left: 24,
    width: 74,
    height: 74,
    border: '2px solid rgba(90, 70, 50, 0.35)',
    borderRadius: '50%',
    transform: 'rotate(-12deg)',
  },
  rings2: {
    position: 'absolute',
    top: -8,
    left: 30,
    width: 62,
    height: 62,
    border: '1px solid rgba(90, 70, 50, 0.3)',
    borderRadius: '50%',
  },
  logo: {
    color: 'var(--pm-h4a3a28)',
    fontSize: 'clamp(38px, 8.2vw, 68px)',
    letterSpacing: '0.12em',
    fontWeight: 'bold',
    lineHeight: 1.06,
    textShadow: '0 2px 0 var(--pm-hb8a680), 0 5px 0 rgba(90,70,50,0.35), 0 10px 22px rgba(0,0,0,0.25)',
  },
  rule: {
    height: 2,
    margin: '10px 30px 8px',
    background: 'linear-gradient(to right, transparent, var(--pm-h9a7f4e), transparent)',
  },
  press: {
    color: 'var(--pm-he8dfc8)',
    fontSize: 17,
    marginTop: 44,
    letterSpacing: '0.2em',
    animation: 'pm-title-blink 1.57s ease-in-out infinite',
  },
  menu: {
    position: 'static',
    display: 'block',
    marginTop: 36,
    padding: '14px 20px',
    width: 280,
  },
} satisfies Record<string, CSSProperties>;

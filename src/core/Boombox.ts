import { audio } from './AudioSystem';
import type { PlacedFurniture } from '../systems/FurnitureSystem';

export interface BoomboxTrack {
  id: string;
  title: string;
  duration: number;
  file: string;
}

interface Chain {
  element: HTMLAudioElement;
  volume: GainNode;
  distance: GainNode;
  hiss: GainNode;
}

function crunchCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(4096 * 4));
  const drive = 3.5;
  const steps = 20;
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.round((Math.tanh(drive * x) / Math.tanh(drive)) * steps) / steps;
  }
  return curve;
}

function buildChain(ctx: AudioContext, out: AudioNode): Chain {
  const element = new Audio();
  const source = ctx.createMediaElementSource(element);

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 380;
  highpass.Q.value = 0.7;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 2600;
  lowpass.Q.value = 1.2;
  const box = ctx.createBiquadFilter();
  box.type = 'peaking';
  box.frequency.value = 1200;
  box.gain.value = 7;

  const shaper = ctx.createWaveShaper();
  shaper.curve = crunchCurve();

  const wobble = ctx.createDelay(0.05);
  wobble.delayTime.value = 0.01;
  for (const [rate, depth] of [[0.5, 0.0028], [6.5, 0.0007]]) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const amount = ctx.createGain();
    amount.gain.value = depth;
    lfo.connect(amount).connect(wobble.delayTime);
    lfo.start();
  }

  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noise;
  noiseSource.loop = true;
  const hissFilter = ctx.createBiquadFilter();
  hissFilter.type = 'highpass';
  hissFilter.frequency.value = 4000;
  const hiss = ctx.createGain();
  hiss.gain.value = 0;
  noiseSource.connect(hissFilter).connect(hiss);
  noiseSource.start();

  const volume = ctx.createGain();
  const distance = ctx.createGain();
  source.connect(highpass).connect(box).connect(lowpass).connect(shaper).connect(wobble).connect(volume);
  hiss.connect(volume);
  volume.connect(distance).connect(out);
  return { element, volume, distance, hiss };
}

class Boombox {
  tracks: BoomboxTrack[] = [];
  current = -1;
  source: PlacedFurniture | null = null;
  onChange: (() => void) | null = null;
  private chain: Chain | null = null;
  private level = 0.8;
  private audible = 1;

  get playing(): boolean {
    return !!this.chain && !this.chain.element.paused;
  }

  get volume(): number {
    return this.level;
  }

  set volume(v: number) {
    this.level = v;
    if (this.chain) this.chain.volume.gain.setTargetAtTime(v, this.chain.volume.context.currentTime, 0.05);
  }

  async refresh(): Promise<void> {
    const response = await fetch('/api/boombox');
    this.tracks = response.ok ? await response.json() : [];
    this.onChange?.();
  }

  async add(url: string): Promise<BoomboxTrack> {
    const response = await fetch('/api/boombox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Download failed.');
    await this.refresh();
    return body;
  }

  private ensureChain(): Chain | null {
    if (this.chain) return this.chain;
    const ctx = audio.context;
    const out = audio.output;
    if (!ctx || !out) return null;
    this.chain = buildChain(ctx, out);
    this.chain.volume.gain.value = this.level;
    this.chain.element.addEventListener('ended', () => this.step(1));
    return this.chain;
  }

  play(index: number): void {
    const chain = this.ensureChain();
    const track = this.tracks[index];
    if (!chain || !track) return;
    this.current = index;
    chain.element.src = `/boombox/${track.file}`;
    void chain.element.play();
    this.setHiss(true);
    this.onChange?.();
  }

  toggle(): void {
    if (!this.chain || this.current < 0) return this.play(0);
    if (this.chain.element.paused) {
      void this.chain.element.play();
      this.setHiss(true);
    } else {
      this.chain.element.pause();
      this.setHiss(false);
    }
    this.onChange?.();
  }

  step(direction: number): void {
    if (!this.tracks.length) return;
    this.play((this.current + direction + this.tracks.length) % this.tracks.length);
  }

  stop(): void {
    if (this.chain) {
      this.chain.element.pause();
      this.setHiss(false);
    }
    this.source = null;
    audio.setSilenced(false);
    this.onChange?.();
  }

  setDistance(d: number): void {
    const near = 3;
    const far = 16;
    const t = Math.min(1, Math.max(0, (d - near) / (far - near)));
    const audible = (1 - t) * (1 - t);
    audio.setSilenced(this.playing && audible > 0.05);
    if (!this.chain || Math.abs(audible - this.audible) < 0.001) return;
    this.audible = audible;
    this.chain.distance.gain.setTargetAtTime(audible, this.chain.distance.context.currentTime, 0.1);
  }

  private setHiss(on: boolean): void {
    if (!this.chain) return;
    this.chain.hiss.gain.setTargetAtTime(on ? 0.014 : 0, this.chain.hiss.context.currentTime, 0.1);
  }
}

export const boombox = new Boombox();

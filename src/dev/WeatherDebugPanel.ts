import type { Game } from '../game/Game';
import { el, ensureStyles } from '../ui/kit';
import { snowField } from '../world/weather/SnowState';
import { wetnessField } from '../world/weather/WetnessState';

const seconds = (value: number): string => value <= 0 ? '—' : `${Math.ceil(value)}s`;
const percent = (value: number): string => `${Math.round(value * 100)}%`;

/** DOM diagnostic for the shared atmosphere. It owns no simulation state. */
export class WeatherDebugPanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private visible = false;
  private frame = 0;

  constructor(container: HTMLElement, private readonly game: Game) {
    ensureStyles();
    this.root = el('div', 'pm-panel');
    this.root.style.cssText += `
      right:14px; top:14px; width:280px; padding:12px 14px; display:none;
      z-index:45; pointer-events:none; font-family:ui-monospace, 'SF Mono', Menlo, monospace;
      font-size:11px; line-height:1.45; color:var(--pm-hcfc4ae);
    `;
    const title = el('div', '', 'WEATHER ENGINE');
    title.style.cssText = 'color:var(--pm-hffd58a); letter-spacing:0.12em; margin-bottom:7px;';
    this.body = el('div');
    this.body.style.whiteSpace = 'pre';
    this.root.append(title, this.body);
    container.appendChild(this.root);
  }

  get isVisible(): boolean { return this.visible; }

  setVisible(on: boolean): void {
    this.visible = on;
    this.root.style.display = on ? 'block' : 'none';
    if (on && !this.frame) this.frame = requestAnimationFrame(() => this.tick());
    if (!on && this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
  }

  private tick(): void {
    if (!this.visible) { this.frame = 0; return; }
    const weather = this.game.weather.debugSnapshot();
    const player = this.game.player.position;
    const localWet = this.game.currentInterior ? 0 : wetnessField.atWorld(player.x, player.z);
    const exposure = this.game.currentInterior ? 0 : wetnessField.exposureAtWorld(player.x, player.z);
    const schedule = weather.schedule.map((entry, index) =>
      `${index === 0 ? '▶' : ' '} ${entry.phase.padEnd(8)} ${index === 0 ? 'now' : `in ${seconds(entry.startsIn)}`}` +
      `${entry.duration > 0 ? ` · ${seconds(entry.duration)}` : ''}`,
    );
    const snowValues = snowField.values;
    let snowMean = 0;
    for (let i = 0; i < snowValues.length; i++) snowMean += snowValues[i];
    snowMean /= snowValues.length;
    this.body.textContent = [
      `kind       ${weather.kind}`,
      `phase      ${weather.phase}`,
      `intensity  ${percent(weather.intensity)}  target ${percent(weather.target)}`,
      `wind       ${weather.windX.toFixed(2)}, ${weather.windZ.toFixed(2)}`,
      `gust       ${percent(weather.gust)}`,
      `moisture   ${percent(weather.moisture)} mean`,
      `local wet  ${percent(localWet)}`,
      `snow       ${percent(snowMean)} mean`,
      `canopy     ${percent(Math.min(1, weather.canopy))}`,
      `listener   ${this.game.weather.listenerSurface}`,
      `position   ${player.x.toFixed(1)}, ${player.z.toFixed(1)}`,
      `exposure   ${this.game.currentInterior ? 'indoors' : percent(exposure)}`,
      '',
      'SCHEDULE',
      ...schedule,
    ].join('\n');
    this.frame = requestAnimationFrame(() => this.tick());
  }
}

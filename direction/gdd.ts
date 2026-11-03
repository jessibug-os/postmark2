import { audio, type ThemeName } from '../src/core/AudioSystem';

const search = document.querySelector<HTMLInputElement>('#section-search')!;
const links = [...document.querySelectorAll<HTMLAnchorElement>('.toc nav a')];
const status = document.querySelector<HTMLElement>('#search-status')!;
search.addEventListener('input', () => {
  const query = search.value.toLocaleLowerCase().trim();
  let count = 0;
  for (const link of links) {
    link.hidden = !link.textContent!.toLocaleLowerCase().includes(query);
    if (!link.hidden) count++;
  }
  status.textContent = query ? `${count} matching section${count === 1 ? '' : 's'}.` : '';
});
function markCurrent(id: string): void {
  for (const link of links) {
    if (link.hash === `#${id}`) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  }
}
const observer = new IntersectionObserver(entries => {
  const visible = entries.find(entry => entry.isIntersecting);
  if (visible) markCurrent(visible.target.id);
}, { rootMargin: '-5% 0px -75% 0px' });
document.querySelectorAll('.chapter').forEach(section => observer.observe(section));
const dialog = document.querySelector<HTMLDialogElement>('#image-dialog')!;
const image = document.querySelector<HTMLImageElement>('#expanded-image')!;
let imageTrigger: HTMLButtonElement | null = null;
document.querySelectorAll<HTMLButtonElement>('[data-image]').forEach(button => {
  button.addEventListener('click', () => {
    imageTrigger = button;
    image.src = button.dataset.image!;
    image.alt = button.dataset.caption!;
    document.querySelector('#image-caption')!.textContent = button.dataset.caption!;
    dialog.showModal();
  });
});
document.querySelector('#close-image')!.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => imageTrigger?.focus());
document.querySelector('#print-doc')!.addEventListener('click', () => window.print());

const theme = document.querySelector<HTMLSelectElement>('#audio-theme')!;
const volume = document.querySelector<HTMLInputElement>('#audio-volume')!;
const audioStatus = document.querySelector<HTMLElement>('#audio-status')!;
const playButton = document.querySelector<HTMLButtonElement>('#audio-play')!;
let playing = false;
function play(): void {
  try {
    audio.setMasterVolume(Number(volume.value));
    audio.setTheme(theme.value as ThemeName, true);
    audio.unlock();
    playing = true;
    playButton.setAttribute('aria-pressed', 'true');
    audioStatus.textContent = `Playing ${theme.selectedOptions[0].textContent}.`;
  } catch {
    audioStatus.textContent = 'Audio unavailable in this browser. The document remains readable.';
  }
}
function stop(): void {
  audio.setTheme('silence', true);
  playing = false;
  playButton.setAttribute('aria-pressed', 'false');
  audioStatus.textContent = 'Stopped.';
}
playButton.addEventListener('click', play);
document.querySelector('#audio-stop')!.addEventListener('click', stop);
theme.addEventListener('change', () => { if (playing) play(); });
volume.addEventListener('input', () => audio.setMasterVolume(Number(volume.value)));
document.addEventListener('visibilitychange', () => { if (document.hidden && playing) stop(); });

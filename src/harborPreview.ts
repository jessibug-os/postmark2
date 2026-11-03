import { configureBootstrap } from './content/BootstrapContext';
configureBootstrap({ contentId: 'little-harbor', mapId: 'little-harbor-v1',
  saveNamespace: 'little-harbor-save-v1', slotId: 1 });
try {
  if (new URLSearchParams(location.search).get('room') === 'world') await import('./game/startHarborWorldPreview');
  else if (new URLSearchParams(location.search).get('room') === 'cafe') await import('./game/startHarborCafePreview');
  else await import('./game/startHarborHomePreview');
}
catch (error) { document.getElementById('status')!.textContent = `Unable to open preview: ${String(error)}`; }

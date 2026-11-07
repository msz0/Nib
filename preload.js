const { contextBridge, ipcRenderer: ipc, webUtils } = require('electron');
const drops = [];
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => {   // only drops on a [data-zone] target do anything
  e.preventDefault();
  const z = e.target.closest && e.target.closest('[data-zone]'); if (!z) return;
  const paths = [...e.dataTransfer.files].map(f => webUtils.getPathForFile(f)).filter(Boolean);
  if (paths.length) ipc.invoke('files:drop', paths, z.dataset.zone).then(r => drops.forEach(f => f(r)));
});
const inv = c => (...a) => ipc.invoke(c, ...a);
contextBridge.exposeInMainWorld('nib', {
  on: cb => ipc.on('ev', (_, e) => cb(e)),
  onSound: cb => ipc.on('sound', (_, v) => cb(v)),
  onCursor: cb => ipc.on('cursor', (_, x, y) => cb(x, y)),
  onSettings: cb => ipc.on('settings', (_, s) => cb(s)),
  onDrop: cb => drops.push(cb),
  decide: (id, d) => ipc.send('decide', id, d),
  setIgnore: b => ipc.send('ignore', b),
  focusable: b => ipc.send('focusable', b),
  key: k => ipc.send('media:key', k),
  discord: k => ipc.send('discord:key', k),
  launch: t => ipc.send('app:launch', t),
  openSettings: () => ipc.send('settings:open'), checkUpdates: inv('updates:check'),
  releaseNotes: inv('nib:releaseNotes'), releaseHistory: inv('nib:releaseHistory'),
  getSettings: inv('settings:get'), setSettings: inv('settings:set'), pick: inv('pick'), pickLogo: inv('pick:logo'),
  youtubeGet: inv('youtube:get'), youtubeControl: inv('youtube:control'), np: inv('media:np'), cal: inv('cal:get'), tidy: inv('files:tidy'), undo: inv('files:undo'),
  spotifyStatus: inv('spotify:status'), spotifyConnect: inv('spotify:connect'), spotifyDisconnect: inv('spotify:disconnect'), onSpotify: cb => ipc.on('spotify', (_, v) => cb(v)),
  discordVoiceStatus: inv('discord:voice:status'), discordVoiceConnect: inv('discord:voice:connect'), discordVoiceEnable: inv('discord:voice:enable'),
  discordVoiceDisconnect: inv('discord:voice:disconnect'), discordVoiceForget: inv('discord:voice:forget'),
  onDiscordVoice: cb => ipc.on('discord:voice', (_, v) => cb(v)),
  notesGet: inv('notes:get'), notesSet: inv('notes:set'),
  music: inv('music:ctl'), art: inv('art:get'), sys: inv('sys:get'), clipGet: inv('clip:get'), clipCopy: inv('clip:copy'), clipClear: inv('clip:clear'), clipRemove: inv('clip:remove'), clipExport: inv('clip:export'), onClip: cb => ipc.on('clip', (_, v) => cb(v)),
  coffee: inv('coffee:set'), coffeeGet: inv('coffee:get'), claude: inv('claude:status'), claudeSet: inv('claude:set'),
  repairNotch: () => ipc.send('nib:repair'),
  onRepairCheck: cb => ipc.on('nib:recheck-pointer', cb),
  onNativeHover: cb => ipc.on('nib:native-hover', (_, over) => cb(over)),
  setHitbox: b => ipc.send('nib:hitbox', b),
  onCollapse: cb => ipc.on('nib:collapse', cb),
  onGameMode: cb => ipc.on('nib:game-mode', (_, enabled) => cb(!!enabled)),
  onForceOpen: cb => ipc.on('nib:force-open', cb),
  onRegionInit: cb => ipc.on('screen:region-init', (_, data) => cb(data)),
  regionSelection: (id, data) => ipc.send('screen:region-result', id, data),
  extrasCaptureRegion: inv('extras:captureRegion'),
  extrasSnipAndOcr: inv('extras:snipAndOcr'), extrasOcrToolVisibility: inv('extras:ocrToolVisibility'), extrasOcrClipboard: inv('extras:ocrClipboard'), extrasClipboardImage: inv('extras:clipboardImage'), extrasOpenOcrImage: inv('extras:openOcrImage'), extrasStartSnip: inv('extras:startSnip'),
  extrasPhone: inv('extras:phone'), extrasUpdates: inv('extras:updates'), extrasSaveAudio: inv('extras:saveAudio'), extrasListAudio: inv('extras:listAudio'), extrasReadAudio: inv('extras:readAudio'), extrasExportAudio: inv('extras:exportAudio'), extrasDeleteAudio: inv('extras:deleteAudio'), extrasOverlay: inv('extras:overlay'), extrasCapture: inv('extras:capture'), extrasOcr: inv('extras:ocr'), extrasCopyHex: inv('extras:copyHex'), extrasLiveColor: inv('extras:liveColor'),
  beat: () => ipc.send('beat'), inputStuck: () => ipc.send('input:stuck'),
  dragStart: () => ipc.send('drag:start'), dragEnd: () => ipc.send('drag:end'), resetPos: () => ipc.send('pos:reset'), onPos: cb => ipc.on('pos', (_, v) => cb(v)),
  preview: o => ipc.send('sound:preview', o), onPreview: cb => ipc.on('preview', (_, o) => cb(o)), quit: () => ipc.send('app:quit'),
  hasKey: inv('chat:hasKey'), setKey: inv('chat:setKey'), ask: inv('chat:ask')
});
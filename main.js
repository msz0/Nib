const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, safeStorage, dialog, shell, clipboard, powerSaveBlocker, powerMonitor } = require('electron');
const { autoUpdater } = require('electron-updater');
const os = require('os');
const path = require('path'), fs = require('fs'), { execFile } = require('child_process');
const { startServer } = require('./server');
const hooks = require('./claude-hooks'), { ask } = require('./chat');
const files = require('./files'), calendar = require('./calendar'), media = require('./media'), lyrics = require('./lyrics'), ICONS = require('./icons'), spotifyApi = require('./spotify');

const W = 520, H = 400;
const GATE = new Set(['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const CATALOG = {
  widgets: [['music', 'Music', 'What is playing, with synced lyrics and controls', 'spotify'], ['focus', 'Focus timer', 'A timer for focused work, in the island', 'focus'], ['notes', 'Notes', 'A quick notepad, always at hand', 'notepad'],
    ['clip', 'Clipboard', 'Your last copies. Click one to copy it again', 'clip'], ['files', 'Files', 'Drop files to sort them, tidy Downloads', 'folder'], ['calendar', 'Calendar', 'Your next events, with a chime when one starts', 'googlecalendar'],
    ['apps', 'Apps', 'A launcher with your favourite apps', 'apps'], ['chat', 'Chat', 'Ask your companion anything (your own API key)', 'chat'], ['coffee', 'Coffee', 'Keep the PC awake for a while', 'coffee'],
    ['discord', 'Discord', 'Mute and deafen with your keybinds', 'discord'], ['sys', 'System', 'CPU, memory and battery', 'sys'], ['claude', 'Claude Code', 'See what Claude is doing, approve things from the island', 'claude']].map(([id, name, desc, ik]) => ({ id, name, desc, ik })),
  apps: [['spotify', 'Spotify', 'spotify:', 'spotify'], ['discord', 'Discord', 'discord:', 'discord'], ['gcal', 'Google Calendar', 'https://calendar.google.com', 'googlecalendar'],
    ['outlookcal', 'Outlook Calendar', 'outlookcal:', 'outlookcal'], ['gmail', 'Gmail', 'https://mail.google.com', 'gmail'], ['browser', 'Browser', 'https://www.google.com', 'browser'],
    ['youtube', 'YouTube', 'https://www.youtube.com', 'youtube'], ['vscode', 'VS Code', 'code', 'vscode'], ['terminal', 'Terminal', 'wt', 'terminal'], ['explorer', 'Files', 'explorer', 'explorer'],
    ['notepad', 'Notepad', 'notepad', 'notepad'], ['calc', 'Calculator', 'calc', 'calc'], ['settings', 'Windows Settings', 'ms-settings:', 'winsettings'], ['teams', 'Teams', 'msteams:', 'teams'],
    ['slack', 'Slack', 'slack:', 'slack'], ['whatsapp', 'WhatsApp', 'whatsapp:', 'whatsapp'], ['notion', 'Notion', 'notion:', 'notion'], ['taskmgr', 'Task Manager', 'taskmgr', 'taskmgr'],
    ['steam', 'Steam', 'steam:', 'steam'], ['github', 'GitHub', 'https://github.com', 'github'], ['telegram', 'Telegram', 'tg:', 'telegram'], ['figma', 'Figma', 'figma:', 'figma'],
    ['zoom', 'Zoom', 'https://zoom.us', 'zoom'], ['drive', 'Google Drive', 'https://drive.google.com', 'googledrive'], ['obsidian', 'Obsidian', 'obsidian:', 'obsidian']].map(([id, name, target, ik]) => ({ id, name, target, ik })),
  icons: ICONS
};
const DEF = { v: 3, name: 'Nib', you: '', spotifyId: '', player: 'Spotify', lyricOffset: 0,
  widgets: ['music', 'focus', 'notes', 'clip', 'files', 'calendar', 'apps', 'chat', 'coffee', 'claude'],
  apps: ['spotify', 'discord', 'gcal', 'browser', 'vscode', 'explorer', 'calc', 'settings'], custom: [], zones: [], sortBase: '', ics: '', discord: { mute: '', deafen: '' },
  island: { size: 'normal', style: 'attached', alpha: 0, open: 'hover', left: 'nothing', right: 'time', eyes: true, clock: 'auto', lyrics: true, music: true },
  sounds: { on: true, vol: .7, done: 'chime', ask: 'bell', focus: 'marimba', event: 'soft' } };
let win, sw, tray, server, spotify, S = { ...DEF }, gateOn = true, history = [];

const sfile = () => path.join(app.getPath('userData'), 'settings.json');
const keyFile = () => path.join(app.getPath('userData'), 'key.bin');
const readKey = () => { try { return safeStorage.decryptString(fs.readFileSync(keyFile())); } catch { return ''; } };
const load = () => {
  try { const j = JSON.parse(fs.readFileSync(sfile(), 'utf8')); S = { ...DEF, ...j, island: { ...DEF.island, ...(j.island || {}) }, sounds: { ...DEF.sounds, ...(j.sounds || {}) } }; } catch {}
  if ((S.v || 0) < 3) { S.v = 3; for (const w of ['notes', 'clip', 'coffee', 'claude']) if (!S.widgets.includes(w)) S.widgets.push(w); }
  for (const c of S.custom || []) if (!S.apps.includes(c.id)) S.apps.push(c.id);
};
const save = () => { fs.mkdirSync(path.dirname(sfile()), { recursive: true }); fs.writeFileSync(sfile(), JSON.stringify(S, null, 2)); };
const send = e => win && !win.isDestroyed() && win.webContents.send('ev', e);
const place = () => { const b = screen.getPrimaryDisplay().bounds; win.setBounds({ x: Math.round(b.x + b.width / 2 - W / 2), y: b.y, width: W, height: H }); };
const run = fn => {
  try { dialog.showMessageBox({ type: 'info', message: 'Done', detail: 'Updated ' + fn() + '\nRestart open Claude Code sessions to apply.' }); }
  catch (e) { dialog.showErrorBox('Nib', String(e.message || e)); }
};
function launch(t) {
  t = String(t || '').trim(); if (!t) return;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^[a-z]:[\\/]/i.test(t)) return shell.openExternal(t);
  if (fs.existsSync(t)) return shell.openPath(t);
  if (/[&|<>^%"]/.test(t)) return;
  execFile('cmd.exe', ['/c', 'start', '', t], { windowsHide: true }, () => {});
}
function openSettings() {
  if (sw && !sw.isDestroyed()) return sw.focus();
  sw = new BrowserWindow({ width: 940, height: 680, minWidth: 760, minHeight: 520, title: 'Settings', backgroundColor: '#0b0d11', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  sw.setMenu(null); sw.loadFile(path.join(__dirname, 'settings.html'));
}
function catIcon() {   // 16x16 cat head, drawn in code (BGRA)
  const px = Buffer.alloc(16 * 16 * 4);
  const tri = (p, a, b, c) => { const s = (u, v, w) => (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1]); const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const p = [x + .5, y + .5];
    const on = ((p[0] - 8) / 6.6) ** 2 + ((p[1] - 9.5) / 5.4) ** 2 < 1 || tri(p, [1.5, 7], [2.5, .8], [7, 4]) || tri(p, [14.5, 7], [13.5, .8], [9, 4]);
    if (!on) continue;
    const eye = (x === 5 || x === 10) && y >= 8 && y <= 10, o = (y * 16 + x) * 4;
    const [r, g, b] = eye ? [26, 29, 38] : [230, 207, 114]; px[o] = b; px[o + 1] = g; px[o + 2] = r; px[o + 3] = 255;
  }
  return nativeImage.createFromBitmap(px, { width: 16, height: 16 });
}

if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(() => {
  load();
  win = new BrowserWindow({ width: W, height: H, frame: false, transparent: true, resizable: false, focusable: false, skipTaskbar: true,
    alwaysOnTop: true, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false } });
  win.setAlwaysOnTop(true, 'screen-saver'); win.setIgnoreMouseEvents(true, { forward: true }); place();
  win.loadFile(path.join(__dirname, 'index.html')); win.once('ready-to-show', () => win.showInactive());
  screen.on('display-metrics-changed', place);

  // keep the island alive after games, alt-tab, resolution changes and sleep
  const keepAlive = () => {
    if (!win || win.isDestroyed()) return;
    place(); win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop();
    if (!win.isVisible()) win.showInactive();
    win.webContents.invalidate();
  };
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, () => setTimeout(keepAlive, 500));
  powerMonitor.on('resume', () => setTimeout(keepAlive, 1000));
  powerMonitor.on('unlock-screen', () => setTimeout(keepAlive, 500));
  setInterval(keepAlive, 4000);
  // if the page crashes or freezes (GPU reset by a game), reload it
  win.webContents.on('render-process-gone', () => { try { win.reload(); } catch {} });
  app.on('child-process-gone', (_, d) => { if (d.type === 'GPU') setTimeout(() => { try { win.reload(); } catch {} }, 1000); });
  setInterval(async () => {
    if (!win || win.isDestroyed()) return;
    try { await Promise.race([win.webContents.executeJavaScript('1'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]); }
    catch { try { win.reload(); } catch {} }
  }, 10000);

  // ---- auto update (checks GitHub Releases, asks before updating)
  autoUpdater.autoDownload = false;
  autoUpdater.on('update-available', info => {
    dialog.showMessageBox({ type: 'info', buttons: ['Update now', 'Later'], defaultId: 0, cancelId: 1,
      title: 'Nib update', message: `Nib ${info.version} is available`, detail: 'Update now? Nib will download it and restart.' })
      .then(r => { if (r.response === 0) autoUpdater.downloadUpdate().catch(() => {}); });
  });
  autoUpdater.on('update-downloaded', () => autoUpdater.quitAndInstall(true, true));
  autoUpdater.on('error', e => console.log('[update] error:', e.message));
  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 15000);
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
  }

  tray = new Tray(catIcon()); tray.setToolTip(S.name || 'Nib');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Settings...', click: openSettings },
    { label: 'Sounds', type: 'checkbox', checked: true, click: m => win.webContents.send('sound', m.checked) },
    { label: 'Check for updates', click: () => { if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {}); } },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: m => app.setLoginItemSettings({ openAtLogin: m.checked }) },
    { type: 'separator' },
    { label: 'Claude Code (optional)', enabled: false },
    { label: 'Connect Claude Code', click: () => run(hooks.connect) },
    { label: 'Disconnect Claude Code', click: () => run(hooks.disconnect) },
    { label: 'Ask in island before Bash and edits', type: 'checkbox', checked: true, click: m => gateOn = m.checked },
    { type: 'separator' },
    { label: 'Forget my API key', click: () => fs.rmSync(keyFile(), { force: true }) },
    { label: 'Quit', click: () => { media.stop(); app.quit(); } }
  ]));

  ipcMain.on('ignore', (_, b) => win.setIgnoreMouseEvents(b, { forward: true }));
  ipcMain.on('focusable', (_, b) => { win.setFocusable(b); if (b) win.focus(); });
  ipcMain.on('decide', (_, id, d) => server.decide(id, d));
  ipcMain.on('settings:open', openSettings);
  ipcMain.on('app:launch', (_, t) => launch(t));
  ipcMain.on('media:key', (_, k) => media.key(k));
  ipcMain.on('discord:key', (_, k) => media.keys(S.discord && S.discord[k]));
  ipcMain.handle('media:np', async () => {
    let m = spotify.connected() && /spotify/i.test(S.player || 'Spotify') ? await spotify.playing() : null;
    if (!m) m = await media.nowPlaying(S.player || 'Spotify');
    if (!m) return null;
    if (S.island.lyrics !== false && m.artist && !m.nopos) {
      const k = m.artist + '|' + m.title, l = lyrics.peek(k);
      if (l === undefined) lyrics.fetchFor(k, { title: m.title, artist: m.artist1 || m.artist, album: m.album, dur: m.dur }); else m.lyrics = l;
    }
    return m;
  });
  ipcMain.handle('pick:logo', async e => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'ico', 'svg', 'webp'] }] });
    if (r.canceled) return ''; const p = r.filePaths[0];
    try {
      if (/\.svg$/i.test(p)) { const t = fs.readFileSync(p); return t.length < 200000 ? 'data:image/svg+xml;base64,' + t.toString('base64') : ''; }
      const im = nativeImage.createFromPath(p); if (im.isEmpty()) return '';
      const { width, height } = im.getSize(), k = 64 / Math.max(width, height);
      return im.resize({ width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), quality: 'best' }).toDataURL();
    } catch { return ''; }
  });
  ipcMain.handle('settings:get', () => ({ settings: S, catalog: CATALOG }));
  ipcMain.handle('settings:set', async (_, s) => {
    S = { ...S, ...s };
    for (const a of S.custom || []) {   // no logo chosen: use the program's own icon when the target is a file
      delete a.icon;
      if (!a.logo && a.target && fs.existsSync(a.target)) { try { a.icon = (await app.getFileIcon(a.target, { size: 'large' })).resize({ width: 64, height: 64 }).toDataURL(); } catch {} }
    }
    save(); calendar.clear(); tray.setToolTip(S.name || 'Nib'); win.webContents.send('settings', S); return true; });
  ipcMain.handle('pick', async (e, kind) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: kind === 'file' ? ['openFile'] : ['openDirectory', 'createDirectory'] });
    return r.canceled ? '' : r.filePaths[0];
  });
  ipcMain.handle('cal:get', async () => { try { return { ok: true, events: await calendar.upcoming(S.ics) }; } catch (e) { return { ok: false, error: e.message }; } });
  const base = () => S.sortBase || path.join(app.getPath('documents'), 'Sorted');
  ipcMain.handle('files:drop', (_, paths, zone) => {
    if (zone === 'type') return { ...files.byType(paths, base()), label: 'by type' };
    const z = S.zones[+zone]; return z && z.path ? { ...files.toFolder(paths, z.path), label: 'to ' + z.name } : { moved: 0, failed: paths.length };
  });
  ipcMain.handle('files:tidy', () => { try { return { ...files.tidy(app.getPath('downloads')), label: 'in Downloads' }; } catch { return { moved: 0, failed: 1 }; } });
  ipcMain.handle('files:undo', () => files.undo());
  ipcMain.handle('chat:hasKey', () => !!readKey());
  ipcMain.handle('chat:setKey', (_, k) => {
    if (!safeStorage.isEncryptionAvailable()) return false;
    fs.mkdirSync(path.dirname(keyFile()), { recursive: true }); fs.writeFileSync(keyFile(), safeStorage.encryptString(String(k).trim())); return true;
  });
  ipcMain.handle('chat:ask', async (_, text) => {
    history = [...history, { role: 'user', content: text }].slice(-12);
    try { const r = await ask(readKey(), history, S.name || 'Nib'); history.push({ role: 'assistant', content: r }); return { ok: true, text: r }; }
    catch (e) { history.pop(); return { ok: false, error: e.message }; }
  });

  let lx = -1, ly = -1;   // cursor position drives hover, click-through and the cat's eyes
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint(); if (p.x === lx && p.y === ly) return; lx = p.x; ly = p.y;
    const b = win.getBounds(); win.webContents.send('cursor', p.x - b.x, p.y - b.y);
  }, 33);

  // ---- extra tools: music control (chosen player only), album art, system stats, clipboard history, keep-awake, Claude Code link
  ipcMain.handle('music:ctl', async (_, cmd) => {
    const r = await media.control(cmd, S.player || 'Spotify');
    return r === 'ok' ? true : spotify.connected() ? spotify.control(cmd) : false;
  });
  const artCache = new Map();
  ipcMain.handle('art:get', async (_, url) => {
    if (!/^https:\/\/[a-z0-9.-]*scdn\.co\//i.test(url || '')) return ''; if (artCache.has(url)) return artCache.get(url);
    try { const r = await fetch(url); const d = 'data:' + (r.headers.get('content-type') || 'image/jpeg') + ';base64,' + Buffer.from(await r.arrayBuffer()).toString('base64'); artCache.set(url, d); if (artCache.size > 20) artCache.delete(artCache.keys().next().value); return d; } catch { return ''; }
  });
  let prevCpu = os.cpus().map(c => c.times);
  ipcMain.handle('sys:get', () => {
    const cur = os.cpus().map(c => c.times); let idle = 0, total = 0;
    cur.forEach((t, i) => { const p = prevCpu[i]; let tot = 0; for (const k in t) tot += t[k] - p[k]; total += tot; idle += t.idle - p.idle; }); prevCpu = cur;
    return { cpu: total ? Math.round(100 * (1 - idle / total)) : 0, ram: Math.round(100 * (1 - os.freemem() / os.totalmem())) };
  });
  let clips = [], lastClip = '';
  // newer Electron versions may return a Promise from clipboard.readText(), so always await it
  Promise.resolve().then(() => clipboard.readText()).then(t => { lastClip = typeof t === 'string' ? t : ''; }).catch(() => {});
  setInterval(async () => {
    if (!S.widgets.includes('clip')) return;
    try {
      const t = await clipboard.readText();
      if (typeof t === 'string' && t && t !== lastClip) {
        lastClip = t;
        if (t.length <= 2000) { clips = [t, ...clips.filter(x => x !== t)].slice(0, 12); win.webContents.send('clip', clips); }
      }
    } catch (e) { console.log('[clip] error:', e.message); }
  }, 900);
  ipcMain.handle('clip:get', () => clips);
  ipcMain.handle('clip:copy', async (_, t) => { lastClip = String(t); await clipboard.writeText(lastClip); clips = [lastClip, ...clips.filter(x => x !== lastClip)]; return true; });
  ipcMain.handle('clip:clear', () => { clips = []; return true; });
  let cid = null, ct = null, cuntil = 0;
  const coffee = m => {
    if (cid !== null) { powerSaveBlocker.stop(cid); cid = null; } clearTimeout(ct); cuntil = 0;
    if (m) { cid = powerSaveBlocker.start('prevent-display-sleep'); if (m > 0) { cuntil = Date.now() + m * 60000; ct = setTimeout(() => coffee(0), m * 60000); } else cuntil = -1; }
    return { on: cid !== null, until: cuntil };
  };
  ipcMain.handle('coffee:set', (_, m) => coffee(+m || 0));
  ipcMain.handle('coffee:get', () => ({ on: cid !== null, until: cuntil }));
  ipcMain.handle('claude:status', () => ({ connected: hooks.isConnected(), gate: gateOn }));
  ipcMain.handle('claude:set', (_, o) => { try { if ('connect' in o) { if (o.connect) hooks.connect(); else hooks.disconnect(); } } catch (e) { return { error: e.message }; } if ('gate' in o) gateOn = !!o.gate; return { connected: hooks.isConnected(), gate: gateOn }; });
  ipcMain.on('sound:preview', (_, o) => win.webContents.send('preview', o));
  ipcMain.on('app:quit', () => { media.stop(); app.quit(); });
  const enc = t => safeStorage.encryptString(t), dec = b => safeStorage.decryptString(b);
  spotify = spotifyApi.create({ file: path.join(app.getPath('userData'), 'spotify.bin'), enc, dec, open: u => shell.openExternal(u), clientId: () => S.spotifyId,
    onChange: v => { if (sw && !sw.isDestroyed()) sw.webContents.send('spotify', v); win.webContents.send('spotify', v); } });
  ipcMain.handle('spotify:status', () => spotify.connected());
  ipcMain.handle('spotify:connect', () => { try { spotify.connect(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('spotify:disconnect', () => { spotify.disconnect(); return true; });
  const nfile = () => path.join(app.getPath('userData'), 'notes.json');
  ipcMain.handle('notes:get', () => { try { return JSON.parse(fs.readFileSync(nfile(), 'utf8')); } catch { return []; } });
  ipcMain.handle('notes:set', (_, n) => { if (!Array.isArray(n)) return false; fs.mkdirSync(path.dirname(nfile()), { recursive: true }); fs.writeFileSync(nfile(), JSON.stringify(n.map(x => ({ id: x.id, text: String(x.text || '') })))); return true; });
  const page = m => `<!doctype html><meta charset="utf-8"><body style="font:16px Segoe UI,sans-serif;background:#000;color:#eee;display:grid;place-items:center;height:100vh"><p>${m}</p>`;
  const onGet = (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1'); if (u.pathname !== '/spotify/callback') return false;
    spotify.callback(u.searchParams).then(() => page('Spotify connected. You can close this tab.'), e => page('Could not connect: ' + String(e.message).replace(/[<>&]/g, '')))
      .then(h => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(h); });
    return true;
  };
  server = startServer({ send, onGet, shouldGate: t => gateOn && GATE.has(t) });
  server.on('error', () => app.quit()); 
});
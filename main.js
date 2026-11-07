const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, safeStorage, dialog, shell, clipboard, powerSaveBlocker, powerMonitor, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const os = require('os');
const path = require('path'), fs = require('fs'), { execFile } = require('child_process');
const { startServer } = require('./server');
// Capture unexpected errors in a private local diagnostics log.
const logCrash = (kind, error) => { try { const out = path.join(app.getPath('userData'), 'nib-errors.log'); fs.mkdirSync(path.dirname(out), {recursive:true}); fs.appendFileSync(out, new Date().toISOString() + ' [' + kind + '] ' + String(error && (error.stack || error.message) || error).slice(0,4000) + '\n'); } catch (_) {} };
process.on('uncaughtException', error => logCrash('uncaughtException', error));
process.on('unhandledRejection', error => logCrash('unhandledRejection', error));
const hooks = require('./claude-hooks'), { ask } = require('./chat');
const files = require('./files'), calendar = require('./calendar'), media = require('./media'), lyrics = require('./lyrics'), ICONS = require('./icons'), spotifyApi = require('./spotify');

const W = 520, H = 400;
const GATE = new Set(['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const CATALOG = {
  widgets: [['music', 'Media controls', 'Control Spotify or YouTube from one place', 'spotify'], ['focus', 'Focus timer', 'A timer for focused work, in the island', 'focus'], ['notes', 'Notes', 'A quick notepad, always at hand', 'notepad'],
    ['clip', 'Clipboard', 'Your last copies. Click one to copy it again', 'clip'], ['files', 'Files', 'Drop files to sort them, tidy Downloads', 'folder'], ['calendar', 'Calendar', 'Your next events, with a chime when one starts', 'googlecalendar'],
    ['apps', 'Apps', 'A launcher with your favourite apps', 'apps'], ['chat', 'Chat', 'Ask your companion anything (your own API key)', 'chat'], ['coffee', 'Coffee', 'Keep the PC awake for a while', 'coffee'],
    ['discord', 'Discord', 'Mute and deafen with your keybinds', 'discord'], ['sys', 'System', 'CPU, memory, battery and GPU', 'sys'], ['screen', 'Screen tools', 'Color picker, text OCR and draw on screen', 'apps'], ['voice', 'Voice memo', 'Record a private audio note', 'chat'], ['claude', 'Claude Code', 'See what Claude is doing, approve things from the island', 'claude']].map(([id, name, desc, ik]) => ({ id, name, desc, ik })),
  apps: [['spotify', 'Spotify', 'spotify:', 'spotify'], ['discord', 'Discord', 'discord:', 'discord'], ['gcal', 'Google Calendar', 'https://calendar.google.com', 'googlecalendar'],
    ['outlookcal', 'Outlook Calendar', 'outlookcal:', 'outlookcal'], ['gmail', 'Gmail', 'https://mail.google.com', 'gmail'], ['browser', 'Browser', 'https://www.google.com', 'browser'],
    ['youtube', 'YouTube', 'https://www.youtube.com', 'youtube'], ['vscode', 'VS Code', 'code', 'vscode'], ['terminal', 'Terminal', 'wt', 'terminal'], ['explorer', 'Files', 'explorer', 'explorer'],
    ['notepad', 'Notepad', 'notepad', 'notepad'], ['calc', 'Calculator', 'calc', 'calc'], ['settings', 'Windows Settings', 'ms-settings:', 'winsettings'], ['teams', 'Teams', 'msteams:', 'teams'],
    ['slack', 'Slack', 'slack:', 'slack'], ['whatsapp', 'WhatsApp', 'whatsapp:', 'whatsapp'], ['notion', 'Notion', 'notion:', 'notion'], ['taskmgr', 'Task Manager', 'taskmgr', 'taskmgr'],
    ['steam', 'Steam', 'steam:', 'steam'], ['github', 'GitHub', 'https://github.com', 'github'], ['telegram', 'Telegram', 'tg:', 'telegram'], ['figma', 'Figma', 'figma:', 'figma'],
    ['zoom', 'Zoom', 'https://zoom.us', 'zoom'], ['drive', 'Google Drive', 'https://drive.google.com', 'googledrive'], ['obsidian', 'Obsidian', 'obsidian:', 'obsidian']].map(([id, name, target, ik]) => ({ id, name, target, ik })),
  icons: ICONS
};
const DEF = { v: 3, name: 'Nib', you: '', spotifyId: '', player: 'Spotify', youtubeBrowser: 'chrome', youtubeConnected: false, youtubePreviousPlayer: 'Spotify', lyricOffset: 0,
  widgets: ['music', 'focus', 'notes', 'clip', 'files', 'calendar', 'apps', 'chat', 'coffee', 'claude'], widgetOrder: [], theme: 'dark', profile: 'normal', greetings: true,
  apps: ['spotify', 'discord', 'gcal', 'browser', 'vscode', 'explorer', 'calc', 'settings'], custom: [], zones: [], sortBase: '', ics: '', discord: { mute: '', deafen: '' },
  island: { size: 'normal', style: 'attached', alpha: 0, open: 'hover', left: 'nothing', right: 'time', eyes: true, clock: 'auto', lyrics: true, music: true, pos: null, lock: false },
  gameModeShortcut: 'Ctrl+Alt+G',
  openShortcut: '',
  collapseShortcut: '',
  gameModeAuto: false,
  sounds: { on: true, vol: .7, done: 'chime', ask: 'bell', focus: 'marimba', event: 'soft' } };
let win, sw, tray, server, spotify, S = { ...DEF }, gateOn = true, history = [];

const sfile = () => path.join(app.getPath('userData'), 'settings.json');
const keyFile = () => path.join(app.getPath('userData'), 'key.bin');
const readKey = () => { try { return safeStorage.decryptString(fs.readFileSync(keyFile())); } catch { return ''; } };
const load = () => {
  try { const j = JSON.parse(fs.readFileSync(sfile(), 'utf8')); S = { ...DEF, ...j, island: { ...DEF.island, ...(j.island || {}) }, sounds: { ...DEF.sounds, ...(j.sounds || {}) } }; } catch {}
  if (!Array.isArray(S.widgetOrder)) S.widgetOrder = [];
  if ((S.v || 0) < 3) { S.v = 3; for (const w of ['notes', 'clip', 'coffee', 'claude']) if (!S.widgets.includes(w)) S.widgets.push(w); }
  for (const c of S.custom || []) if (!S.apps.includes(c.id)) S.apps.push(c.id);
};
const save = () => { fs.mkdirSync(path.dirname(sfile()), { recursive: true }); fs.writeFileSync(sfile(), JSON.stringify(S, null, 2)); };
const send = e => win && !win.isDestroyed() && win.webContents.send('ev', e);
let position, lastPosKey = '';
const LOGIN_ARGS = ['--at-login'];   // lets Nib wait a few seconds for the desktop when Windows starts it
const loginOn = () => app.getLoginItemSettings().openAtLogin || app.getLoginItemSettings({ args: LOGIN_ARGS }).openAtLogin;
const setLogin = on => { app.setLoginItemSettings({ openAtLogin: false }); if (on) app.setLoginItemSettings({ openAtLogin: true, args: LOGIN_ARGS }); };
const place = () => {
  if (!win || win.isDestroyed() || !position) return;
  const t = position.target(); win.setBounds({ x: t.x, y: t.y, width: W, height: H });
  const k = `${t.free}|${t.up}|${t.attached}`; if (k !== lastPosKey) { lastPosKey = k; win.webContents.send('pos', { free: t.free, up: t.up, attached: t.attached }); }
};
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
else app.whenReady().then(async () => {
  if (process.argv.includes('--at-login')) await new Promise(r => setTimeout(r, 5000));   // let Windows finish loading the desktop first
  load();
  const legacyDiscordToken = path.join(app.getPath('userData'), 'discord-bot.bin');
  try { fs.rmSync(legacyDiscordToken, { force: true }); }
  catch (e) { console.error('[discord] Could not remove the previously saved bot token:', e); }
  const hadLegacyDiscordSettings = 'discordVoiceUserId' in S || 'discordVoiceEnabled' in S || 'discordAvatars' in S.island;
  delete S.discordVoiceUserId;
  delete S.discordVoiceEnabled;
  delete S.island.discordAvatars;
  if (hadLegacyDiscordSettings) save();
  position = require('./position')({ screen, getS: () => S, W, H });
  if (app.isPackaged && loginOn() && !app.getLoginItemSettings({ args: LOGIN_ARGS }).openAtLogin) setLogin(true);   // upgrade an older startup entry
  let ignoring = true;   // what the page last asked for: true = clicks pass through, false = island takes clicks
  let gameMode = false, gameModeSource = '', registeredShortcuts = [], autoGameTimer = null, autoGameHits = 0, autoGameMisses = 0;
  let recoveryUntil = 0;
  // Native mouse hit-test survives dropped renderer cursor messages and delayed capture cleanup.
  let nativeOver = false, nativeHit = {left:170, top:0, width:180, height:44}, nativeInputAt = 0;
  const applyIgnore = () => {
    if (!win || win.isDestroyed()) return;
    const takeInput = !gameMode && (Date.now() < recoveryUntil || nativeOver);
    // A visible, expanded notch must be focusable to receive reliable Windows clicks.
    // Do not change it every timer tick: Windows may reject/lose input on repeated toggles.
    // Keep the island focusable. Flipping focusability while hovering can discard clicks.
    if (!win.isFocusable()) win.setFocusable(true);
    if (applyIgnore.lastInput !== takeInput) {
      win.setIgnoreMouseEvents(!takeInput, {forward:true});
      applyIgnore.lastInput = takeInput;
    }
  };
  let beatAt = Date.now(), rebuilding = false, lastRebuild = 0, streak = 0;
  const makeWindow = () => {
    const w = new BrowserWindow({ width: W, height: H, frame: false, transparent: true, resizable: false, focusable: true, skipTaskbar: true,
      // TOOLWINDOW behavior on Windows: keep the persistent island out of Alt+Tab / taskbar.
      ...(process.platform === 'win32' ? { type: 'toolbar' } : {}),
      alwaysOnTop: true, hasShadow: false, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false } });
    w.setAlwaysOnTop(true, 'screen-saver'); w.setIgnoreMouseEvents(true, { forward: true }); applyIgnore.lastInput = false;
    // a freshly loaded page starts with clicks passing through, like the page itself assumes
    w.webContents.on('did-finish-load', () => { if (w !== win) return; ignoring = true; applyIgnore(); lastPosKey = ''; place(); beatAt = Date.now(); w.webContents.send('nib:game-mode', gameMode); });
    w.webContents.on('render-process-gone', () => { if (w === win) rebuild('page crashed'); });
    w.on('session-end', () => { try { media.stop(); } catch {} app.quit(); });
    w.loadFile(path.join(__dirname, 'index.html')); w.once('ready-to-show', () => { if (!w.isDestroyed()) { w.setSkipTaskbar(true); w.showInactive(); w.setSkipTaskbar(true); } });
    return w;
  };
  // throw the island window away and make a fresh one: the cure for anything Windows did to it
  // (sleep, lock screen, fullscreen apps, graphics resets, display changes)
  const rebuild = why => {
    const now = Date.now(); if (rebuilding || now - lastRebuild < 8000 || streak >= 5) return;
    rebuilding = true; lastRebuild = now; streak++; console.log('[nib] rebuilding the island window:', why);
    const old = win; lastPosKey = ''; ignoring = true;
    win = makeWindow(); place(); beatAt = Date.now();
    setTimeout(() => { try { if (old && !old.isDestroyed()) old.destroy(); } catch {} rebuilding = false; }, 1500);
  };
  win = makeWindow(); place();
  // In-place repair: never destroy/recreate the existing BrowserWindow for routine input failures.
  // Don't change the renderer's state or position unless explicitly asked to open the notch.
  let lastRepair=0;
  const repairNotch = (open=false) => {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return false;
    const now=Date.now();
    if (screenSelectionActive && !open) return true;
    if (!open && now-lastRepair<15000) return true;
    lastRepair=now;
    try {
      // Repair stuck click-through/mouse and stale window z-order without creating a new island.
      ignoring=false;
      recoveryUntil=Date.now()+5000;
      win.setIgnoreMouseEvents(false); applyIgnore.lastInput = true;
      if (open) win.setFocusable(true);
      if (!win.isAlwaysOnTop()) win.setAlwaysOnTop(true,'screen-saver');
      if (!win.isVisible()) win.showInactive();
      if (open) win.moveTop();
      if (open && !win.webContents.isLoading()) { win.webContents.send('nib:repair-pointer'); }
      // Reapply the renderer's correct click-through state after it has received the repair event.
      if (!open) setTimeout(()=>{if(win && !win.isDestroyed())win.webContents.send('nib:recheck-pointer');},120);
      return true;
    } catch(e) { logCrash('in-place-repair',e); return false; }
  };
  ipcMain.on('nib:repair', () => repairNotch(true));
  const collapseExisting = () => {
     if (!win || win.isDestroyed()) return;
     recoveryUntil=0; nativeOver=false; ignoring=true;
     try { win.webContents.send('nib:collapse'); applyIgnore(); } catch(e) {logCrash('collapse-existing',e);}
   };

  const setGameMode = (on, source = 'manual') => {
    gameMode = !!on;
    gameModeSource = gameMode ? source : '';
    recoveryUntil = 0;
    nativeOver = false;
    ignoring = true;
    if (gameMode && win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('nib:collapse');
    }
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('nib:game-mode', gameMode);
    }
    applyIgnore();
    if (gameModeItem) gameModeItem.checked = gameMode;
  };
  const registerShortcuts = () => {
    registeredShortcuts.forEach(accelerator => globalShortcut.unregister(accelerator));
    registeredShortcuts = [];
    const shortcuts = [
      ['gameModeShortcut', () => setGameMode(!gameMode, 'manual')],
      ['openShortcut', () => { setGameMode(false, 'manual'); repairNotch(true); }],
      ['collapseShortcut', () => collapseExisting()]
    ];
    for (const [key, action] of shortcuts) {
      const accelerator = String(S[key] || '').trim();
      if (!accelerator) continue;
      if (globalShortcut.register(accelerator, action)) registeredShortcuts.push(accelerator);
      else console.error('[shortcuts] Could not register shortcut:', accelerator);
    }
  };
  let gameModeItem;
  const detectFullscreenWindow = () => {
    if (process.platform !== 'win32' || !S.gameModeAuto) return;
    const script = [
      'Add-Type \'using System; using System.Runtime.InteropServices; public static class NibWin { [StructLayout(LayoutKind.Sequential)] public struct R { public int L; public int T; public int Rr; public int B; } [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p); }\';',
      '$h=[NibWin]::GetForegroundWindow(); $r=New-Object NibWin+R; [uint32]$p=0; [NibWin]::GetWindowRect($h,[ref]$r)|Out-Null; [NibWin]::GetWindowThreadProcessId($h,[ref]$p)|Out-Null;',
      '[pscustomobject]@{left=$r.L;top=$r.T;right=$r.Rr;bottom=$r.B;pid=$p}|ConvertTo-Json -Compress'
    ].join(' ');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 1200, maxBuffer: 4096 }, (err, stdout) => {
      if (err || !stdout.trim() || !win || win.isDestroyed() || !S.gameModeAuto) return;
      try {
        const r = JSON.parse(stdout.trim()), own = r.pid === process.pid;
        const full = !own && screen.getAllDisplays().some(d => {
          const b = d.bounds, t = 8;
          return Math.abs(r.left - b.x) <= t && Math.abs(r.top - b.y) <= t &&
            Math.abs(r.right - (b.x + b.width)) <= t && Math.abs(r.bottom - (b.y + b.height)) <= t;
        });
        if (full) {
          autoGameMisses = 0;
          if (++autoGameHits >= 3 && (!gameMode || gameModeSource === 'auto')) setGameMode(true, 'auto');
        } else {
          autoGameHits = 0;
          if (++autoGameMisses >= 2 && gameMode && gameModeSource === 'auto') setGameMode(false, 'auto');
        }
      } catch (e) { console.error('[game-mode] fullscreen detection failed:', e.message); }
    });
  };
  if (process.platform === 'win32') autoGameTimer = setInterval(detectFullscreenWindow, 1500);

  let screenSelectionActive = false;
  const keepAlive = (repaint) => {
    if (!win || win.isDestroyed() || screenSelectionActive) return;
    const t = position.target(), c = win.getBounds();
    if (c.width !== W || c.height !== H || Math.abs(c.x - t.x) > 1 || Math.abs(c.y - t.y) > 1) place();
    if (!win.isAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver');
    if (!win.isVisible() && !screenSelectionActive) win.showInactive();
    // Do not moveTop repeatedly: it steals focus from fullscreen games and capture tools.
    applyIgnore();
    if (repaint === true) win.webContents.invalidate();
  };
  setInterval(keepAlive, 12000);
  screen.on('display-metrics-changed', () => setTimeout(() => keepAlive(true), 500));
  for (const ev of ['display-added', 'display-removed']) screen.on(ev, () => setTimeout(() => repairNotch(false), 1500));
  powerMonitor.on('resume', () => { media.reset(); setTimeout(() => repairNotch(false), 2500); });
  powerMonitor.on('unlock-screen', () => setTimeout(() => repairNotch(false), 1500));
  app.on('child-process-gone', (_, d) => { if (d.type === 'GPU') setTimeout(() => repairNotch(false), 1000); });
  app.on('before-quit', () => { try { media.stop(); } catch {} });
  // the page says "alive" every 2 seconds; if that stops, replace it
  ipcMain.on('beat', () => { beatAt = Date.now(); streak = 0; });
  setInterval(() => { if (win && !win.isDestroyed() && !screenSelectionActive && Date.now()-beatAt>30000 && !win.webContents.isLoading()) { win.webContents.send('nib:health-check'); } }, 15000);
  // the cursor is over the island but mouse events do not arrive (fullscreen apps can do this): repair, then replace
  let heals = 0, lastHeal = 0;
  ipcMain.on('input:stuck', () => {
    const now = Date.now(); if (now - lastHeal > 20000) heals = 0; lastHeal = now;
    if (++heals >= 3) heals = 0;
    repairNotch(false);
  });

  // ---- auto update (checks GitHub Releases, asks before updating)
  ipcMain.handle('updates:check', async () => {
    if (!app.isPackaged) return {ok:false,message:'Updates are available in installed builds. This source version can be updated by replacing its files.'};
    try { await autoUpdater.checkForUpdates(); return {ok:true}; }
    catch(e) { return {ok:false,message:'Update check failed: '+String(e.message||e)}; }
  });
  autoUpdater.autoDownload = false;
  autoUpdater.on('update-available', info => { send({type:'nib-update',version:info.version});
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
    gameModeItem = { label: 'Game Mode', type: 'checkbox', checked: false, click: m => setGameMode(m.checked, 'manual') },
    { label: 'Sounds', type: 'checkbox', checked: true, click: m => win.webContents.send('sound', m.checked) },
    { label: 'Check for updates', click: () => { if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {}); } },
    { label: 'Repair / open Nib notch', click: () => repairNotch(true) },
    { label: 'Repair input (same window)', click: () => repairNotch(true) },
    { label: 'Collapse stuck panel (same window)', click: collapseExisting },
    { label: 'Reset island position', click: () => resetPos() },
    { label: 'Lock island position', type: 'checkbox', checked: !!S.island.lock, click: m => { S.island.lock = m.checked; save(); win.webContents.send('settings', S); } },
    { label: 'Start with Windows', type: 'checkbox', checked: loginOn(), click: m => setLogin(m.checked) },
    { type: 'separator' },
    { label: 'Claude Code (optional)', enabled: false },
    { label: 'Connect Claude Code', click: () => run(hooks.connect) },
    { label: 'Disconnect Claude Code', click: () => run(hooks.disconnect) },
    { label: 'Ask in island before Bash and edits', type: 'checkbox', checked: true, click: m => gateOn = m.checked },
    { type: 'separator' },
    { label: 'Forget my API key', click: () => fs.rmSync(keyFile(), { force: true }) },
    { label: 'Quit', click: () => { media.stop(); app.quit(); } }
  ]));
  registerShortcuts();

  ipcMain.on('ignore', (e, b) => {
    if (!win || e.sender !== win.webContents) return;
    if (gameMode) return;
    // Never let a stale renderer event put a visible hovered notch into click-through.
    // Renderer may be stale after DXGI/fullscreen; native hit-testing is authoritative.
    // Never allow renderer cursor messages to override the main-process hit test.
    ignoring = !!b;
    applyIgnore();
  });
  ipcMain.on('nib:hitbox', (e, box) => {
    if (!win || e.sender !== win.webContents || !box) return;
    const {left,top,width,height} = box;
    if ([left,top,width,height].every(Number.isFinite) && width >= 60 && width <= W && height >= 20 && height <= H)
      nativeHit = {left,top,width,height};
  });
  ipcMain.on('focusable', (e, b) => {
    if(!win || e.sender !== win.webContents) return;
    // Renderer blur requests used to disable focus while still over the expanded notch.
    // Native pointer hit-testing has priority; keep it clickable while hovered.
    win.setFocusable(!!b || nativeOver || Date.now() < recoveryUntil);
    if (b && (nativeOver || Date.now() < recoveryUntil)) win.focus();
  });
  ipcMain.on('decide', (_, id, d) => server.decide(id, d));
  ipcMain.on('settings:open', openSettings);
  ipcMain.on('app:launch', (_, t) => launch(t));
  ipcMain.on('media:key', (_, k) => media.key(k));
  ipcMain.on('discord:key', (_, k) => { const c = S.discord && S.discord[k]; console.log('[discord]', k, 'key:', c || '(not set)'); if (!media.press(c)) media.keys(c); });
  ipcMain.handle('media:np', async () => {
    let m = await media.nowPlaying();
    if (m && spotify.connected() && m.source === 'spotify') {
      const api = await spotify.playing();
      if (api && api.title === m.title) m = { ...api, status: m.status, pos: m.pos, dur: m.dur, src: m.src, source: m.source, sourceId: m.sourceId, artUrl: m.artUrl || api.artUrl };
    } else if (!m && spotify.connected()) {
      m = await spotify.playing();
    }
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
  // Read ONLY release notes matching the version installed on this computer.
  ipcMain.handle('nib:releaseNotes', async () => {
    const version=app.getVersion(),tag='v'+version;
    const cacheFile=path.join(app.getPath('userData'),'nib-release-notes.json');
    let cache={};try{cache=JSON.parse(fs.readFileSync(cacheFile,'utf8'));}catch{}
    const stored=cache[tag];
    const https=require('https');
    const fetchRelease=()=>new Promise((resolve,reject)=>{
      const req=https.get({hostname:'api.github.com',path:'/repos/msz0/nib/releases/tags/'+encodeURIComponent(tag),headers:{'User-Agent':'Nib/'+version,'Accept':'application/vnd.github+json'},timeout:6000},res=>{
        let raw='';res.setEncoding('utf8');res.on('data',chunk=>{raw+=chunk;if(raw.length>150000)req.destroy(new Error('Response too large'));});
        res.on('end',()=>{if(res.statusCode!==200)return reject(Error('GitHub returned '+res.statusCode));
          try{const data=JSON.parse(raw);if(data.tag_name!==tag||typeof data.body!=='string')throw Error('Invalid release');resolve(data.body.slice(0,30000));}catch(e){reject(e);}});
      });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Timeout')));
    });
    try{const body=await fetchRelease();cache[tag]={body,savedAt:Date.now()};
      const limited=Object.fromEntries(Object.entries(cache).sort((a,b)=>(b[1].savedAt||0)-(a[1].savedAt||0)).slice(0,10));
      try{fs.mkdirSync(path.dirname(cacheFile),{recursive:true});fs.writeFileSync(cacheFile,JSON.stringify(limited));}catch{}
      return {version,body,source:'github'};
    }catch(e){return stored&&typeof stored.body==='string'?{version,body:stored.body,source:'cache'}:{version,body:'Release notes for '+tag+' are not available locally yet. Publish the matching GitHub release to display them here.',source:'unavailable'};}
  });

  // Browse release history (installed version and older) with version-specific notes.
  ipcMain.handle('nib:releaseHistory', async () => {
    const installed=app.getVersion();
    const cacheFile=path.join(app.getPath('userData'),'nib-release-history.json');
    let cached=[];try{const c=JSON.parse(fs.readFileSync(cacheFile,'utf8'));if(Array.isArray(c))cached=c;}catch{}
    const safeVersion=v=>/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(v||'');
    const nums=v=>v.replace(/^v/,'').split('-')[0].split('.').map(Number);
    const withinInstalled=v=>{if(!safeVersion(v))return false;const x=nums(v),y=nums(installed);for(let i=0;i<3;i++){if(x[i]<y[i])return true;if(x[i]>y[i])return false;}return true;};
    const clean=list=>list.filter(x=>x&&!x.draft&&!x.prerelease&&withinInstalled(x.tag_name)).map(x=>({version:x.tag_name.replace(/^v/,''),name:String(x.name||'Nib '+x.tag_name).slice(0,120),date:String(x.published_at||'').slice(0,10),body:String(x.body||'No release notes published.').slice(0,30000)})).slice(0,15);
    try{
      const https=require('https');
      const releases=await new Promise((resolve,reject)=>{
        const req=https.get({hostname:'api.github.com',path:'/repos/msz0/nib/releases?per_page=30',headers:{'User-Agent':'Nib/'+installed,'Accept':'application/vnd.github+json'},timeout:7000},res=>{
          let raw='';res.setEncoding('utf8');res.on('data',c=>{raw+=c;if(raw.length>1500000)req.destroy(Error('Response too large'));});
          res.on('end',()=>{if(res.statusCode!==200)return reject(Error('GitHub returned '+res.statusCode));try{const parsed=JSON.parse(raw);if(!Array.isArray(parsed))throw Error('Invalid releases');resolve(clean(parsed));}catch(e){reject(e);}});
        });req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Timeout')));
      });
      if(releases.length){try{fs.writeFileSync(cacheFile,JSON.stringify(releases));}catch{}return {installed,releases,source:'github'};}
      return {installed,releases:clean(cached.map(x=>({tag_name:'v'+x.version,name:x.name,published_at:x.date,body:x.body}))),source:'cache'};
    }catch(e){return {installed,releases:cached.filter(x=>withinInstalled('v'+x.version)).slice(0,15),source:cached.length?'cache':'unavailable'};}
  });
  ipcMain.handle('settings:get', () => ({ settings: S, catalog: CATALOG }));
  ipcMain.handle('settings:set', async (_, s) => {
    if (s && s.island) s = { ...s, island: { ...s.island, pos: S.island.pos } };   // the Settings page never overwrites where you dragged it
    const oldShortcuts = [S.gameModeShortcut, S.openShortcut, S.collapseShortcut].join('\0');
    S = { ...S, ...s };
    if ([S.gameModeShortcut, S.openShortcut, S.collapseShortcut].join('\0') !== oldShortcuts) registerShortcuts();
    if (!S.gameModeAuto && gameMode && gameModeSource === 'auto') setGameMode(false, 'auto');
    for (const a of S.custom || []) {   // no logo chosen: use the program's own icon when the target is a file
      delete a.icon;
      if (!a.logo && a.target && fs.existsSync(a.target)) { try { a.icon = (await app.getFileIcon(a.target, { size: 'large' })).resize({ width: 64, height: 64 }).toDataURL(); } catch {} }
    }
    save(); calendar.clear(); tray.setToolTip(S.name || 'Nib'); place(); win.webContents.send('settings', S); return true; });
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

  // ---- drag the island anywhere; where you drop it is remembered (and can be locked in Settings)
  let drag = null;
  const stopDrag = commit => {
    if (!drag) return; clearInterval(drag.t); drag = null;
    const p = S.island.pos; if (!commit || !p) return;
    S.island.pos = position.finalize(p.x, p.up ? p.y - position.PILL_H * position.zoom() : p.y);
    save(); place(); win.webContents.send('settings', S);
  };
  ipcMain.on('drag:start', () => {
    if (drag || S.island.lock) return;
    const c = screen.getCursorScreenPoint(), st = position.current(), at = Date.now();
    drag = { t: setInterval(() => {
      if (Date.now() - at > 60000) return stopDrag(true);   // safety: never stay stuck in drag mode
      const n = screen.getCursorScreenPoint();
      S.island.pos = { x: st.x + n.x - c.x, y: st.y + n.y - c.y, up: st.up }; place();
    }, 12) };
  });
  ipcMain.on('drag:end', () => stopDrag(true));
  const resetPos = () => { stopDrag(false); S.island.pos = null; save(); place(); win.webContents.send('settings', S); };
  ipcMain.on('pos:reset', resetPos);

  let lx = -1, ly = -1;   // cursor position drives hover, click-through and the cat's eyes
  setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds(), x=p.x-b.x, y=p.y-b.y;
    const h=nativeHit, margin=10;
    const inside = !gameMode && !screenSelectionActive && x >= h.left-margin && x <= h.left+h.width+margin && y >= h.top-margin && y <= h.top+h.height+margin;
    const expired = recoveryUntil && Date.now() >= recoveryUntil;
    if (expired) recoveryUntil = 0;
    if (inside !== nativeOver) {
      nativeOver = inside;
      ignoring = !inside;
      applyIgnore();
      // Make the panel expand even if normal cursor forwarding was interrupted.
      if (inside && !win.webContents.isDestroyed()) win.webContents.send('nib:native-hover', true);
      if (!inside && !win.webContents.isDestroyed()) win.webContents.send('nib:native-hover', false);
    } else if (expired) applyIgnore();
    if (p.x === lx && p.y === ly) return;
    lx=p.x;ly=p.y;
    win.webContents.send('cursor',x,y);
  }, 66);

  // ---- extra tools: music control (chosen player only), album art, system stats, clipboard history, keep-awake, Claude Code link
  ipcMain.handle('music:ctl', async (_, cmd) => {
    const active = await media.nowPlaying();
    const r = await media.control(cmd, active && active.sourceId);
    return r || (active && active.source === 'spotify' && spotify.connected() ? spotify.control(cmd) : false);
  });
  const artCache = new Map();
  ipcMain.handle('art:get', async (_, url) => {
    if (!/^https:\/\/[a-z0-9.-]*scdn\.co\//i.test(url || '')) return ''; if (artCache.has(url)) return artCache.get(url);
    try { const r = await fetch(url); const d = 'data:' + (r.headers.get('content-type') || 'image/jpeg') + ';base64,' + Buffer.from(await r.arrayBuffer()).toString('base64'); artCache.set(url, d); if (artCache.size > 20) artCache.delete(artCache.keys().next().value); return d; } catch { return ''; }
  });
  let prevCpu = os.cpus().map(c => c.times);
  // Non-blocking GPU telemetry. NVIDIA's supported nvidia-smi CLI supplies live hardware metrics.
  // Other vendors return null rather than fabricated temperatures or utilization.
  let gpuInfo = { temp: null, load: null, vramUsed: null, vramTotal: null, power: null, powerLimit: null, fan: null };
  const smiPath = (() => {
    const candidates = [
      'nvidia-smi.exe',
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'NVIDIA Corporation', 'NVSMI', 'nvidia-smi.exe')
    ];
    return candidates;
  })();
  let gpuBusy = false;
  const refreshGpu = () => {
    if (gpuBusy) return;
    gpuBusy = true;
    const fields = 'temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,power.limit,fan.speed';
    const finish = () => { gpuBusy = false; };
    const tryAt = n => {
      if (n >= smiPath.length) { gpuInfo = { temp:null, load:null, vramUsed:null, vramTotal:null, power:null, powerLimit:null, fan:null }; finish(); return; }
      execFile(smiPath[n], ['--query-gpu=' + fields, '--format=csv,noheader,nounits', '-i', '0'],
        { timeout: 2500, windowsHide: true, maxBuffer: 16384 }, (err, stdout) => {
          if (err || !stdout.trim()) return tryAt(n + 1);
          const a = stdout.trim().split(/\r?\n/)[0].split(',').map(x => x.trim());
          const num = s => { const v = Number(s); return s && Number.isFinite(v) ? v : null; };
          gpuInfo = { temp:num(a[0]), load:num(a[1]), vramUsed:num(a[2]), vramTotal:num(a[3]), power:num(a[4]), powerLimit:num(a[5]), fan:num(a[6]) };
          finish();
        });
    };
    tryAt(0);
  };
  refreshGpu(); const gpuTimer = setInterval(refreshGpu, 4000);
  app.on('before-quit', () => clearInterval(gpuTimer));
  ipcMain.handle('sys:get', () => {
    const cur = os.cpus().map(c => c.times); let idle = 0, total = 0;
    cur.forEach((t, i) => { const p = prevCpu[i] || t; let tot = 0; for (const k in t) tot += t[k] - p[k]; total += tot; idle += t.idle - p.idle; }); prevCpu = cur;
    return { cpu: total ? Math.round(100 * (1 - idle / total)) : 0, ram: Math.round(100 * (1 - os.freemem() / os.totalmem())), ...gpuInfo };
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
  ipcMain.handle('clip:clear', () => { clips = []; win.webContents.send('clip', clips); return true; });
  ipcMain.handle('clip:remove', (_, indices) => { if (!Array.isArray(indices)) return clips; const ids = new Set(indices.filter(n => Number.isInteger(n) && n >= 0 && n < clips.length)); clips = clips.filter((_, i) => !ids.has(i)); win.webContents.send('clip', clips); return clips; });
  ipcMain.handle('clip:export', async (_, indices) => { if (!Array.isArray(indices)) return false; const selected = indices.filter(n => Number.isInteger(n) && n >= 0 && n < clips.length).map(n => clips[n]); if (!selected.length) return false; const r = await dialog.showSaveDialog(win, { defaultPath:'Nib-clipboard.txt', filters:[{name:'Text',extensions:['txt']}] }); if(r.canceled || !r.filePath) return false; fs.writeFileSync(r.filePath, selected.join('\n\n---\n\n'), 'utf8'); return true; });
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
  app.on('will-quit', () => { globalShortcut.unregisterAll(); if (autoGameTimer) clearInterval(autoGameTimer); });
  const enc = t => safeStorage.encryptString(t), dec = b => safeStorage.decryptString(b);
  spotify = spotifyApi.create({ file: path.join(app.getPath('userData'), 'spotify.bin'), enc, dec, open: u => shell.openExternal(u), clientId: () => S.spotifyId,
    onChange: v => { if (sw && !sw.isDestroyed()) sw.webContents.send('spotify', v); win.webContents.send('spotify', v); } });
  ipcMain.handle('spotify:status', () => spotify.connected());
  ipcMain.handle('spotify:connect', () => { try { spotify.connect(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle('spotify:disconnect', () => { spotify.disconnect(); return true; });
  const {session} = require('electron');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(permission === 'media' && webContents === win.webContents));
  // Nib extras: native dialogs, short-lived overlays; never record without a user click.
  // Phone Link launcher removed. Real phone notifications require a separate opt-in phone companion.
  ipcMain.handle('extras:updates', async () => { if (!app.isPackaged) return {ok:false, message:'Update checks work in packaged installations.'}; try { await autoUpdater.checkForUpdates(); return {ok:true}; } catch(e) { return {ok:false,message:String(e.message)}; } });
  // Voice memos belong to Nib's app data rather than prompting for an export location.
  const memoDir=()=>path.join(app.getPath('userData'),'voice-memos');
  ipcMain.handle('extras:saveAudio',async (_e,bytes)=>{if(!Array.isArray(bytes)||!bytes.length||bytes.length>20*1024*1024||!bytes.every(n=>Number.isInteger(n)&&n>=0&&n<=255))return false;fs.mkdirSync(memoDir(),{recursive:true});const name='Memo-'+new Date().toISOString().replace(/[:.]/g,'-')+'.webm';fs.writeFileSync(path.join(memoDir(),name),Buffer.from(bytes));return true;});
  ipcMain.handle('extras:listAudio',()=>{try{return fs.readdirSync(memoDir()).filter(f=>/^Memo-[0-9TZ-]+\.webm$/.test(f)).sort().reverse().slice(0,30).map(name=>({name}));}catch{return [];}});
  ipcMain.handle('extras:readAudio',(_e,name)=>{if(typeof name!=='string'||!/^Memo-[0-9TZ-]+\.webm$/.test(name))return '';try{const p=path.join(memoDir(),name);if(fs.statSync(p).size>20*1024*1024)return '';return 'data:audio/webm;base64,'+fs.readFileSync(p).toString('base64');}catch{return '';}});
  ipcMain.handle('extras:exportAudio', async (_e,name)=>{if(typeof name!=='string'||!/^Memo-[0-9TZ-]+\.webm$/.test(name))return false;
    const source=path.join(memoDir(),name);if(!fs.existsSync(source))return false;
    const target=await dialog.showSaveDialog(win,{title:'Save voice memo',defaultPath:name,filters:[{name:'WebM audio',extensions:['webm']}]});
    if(target.canceled||!target.filePath)return false;
    fs.copyFileSync(source,target.filePath);return true;});
  ipcMain.handle('extras:deleteAudio',(_e,name)=>{if(typeof name!=='string'||!/^Memo-[0-9TZ-]+\.webm$/.test(name))return false;try{fs.rmSync(path.join(memoDir(),name));return true;}catch{return false;}});
  // Native live eyedropper: GDI samples the cursor pixel without freezing the desktop.
  let liveColorWindow = null, liveSampler = null, liveSample = {hex:'#000000',x:0,y:0,pickSeq:0,pickedHex:null};
  const createLiveColorWindow = () => {
    if (liveColorWindow && !liveColorWindow.isDestroyed()) { liveColorWindow.focus(); return liveColorWindow; }
    const w = new BrowserWindow({width:388,height:284,alwaysOnTop:true,autoHideMenuBar:true,resizable:false,
      title:'Nib Live HEX Picker',backgroundColor:'#10141c',webPreferences:{preload:path.join(__dirname,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
    liveColorWindow = w;
    liveSample={hex:'#000000',x:0,y:0,pickSeq:0,pickedHex:null};
    w.setMenu(null);
    w.loadFile(path.join(__dirname,'live-color.html'));
    const script = String.raw`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class NibPixel {
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
 [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
 [DllImport("gdi32.dll")] public static extern uint GetPixel(IntPtr hdc, int x, int y);
 [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
}
'@
# Track the left mouse button globally, even when a different app has focus.
# Only a NEW press emits a click; holding the button cannot spam the clipboard.
$previousDown = (([NibPixel]::GetAsyncKeyState(1) -band 0x8000) -ne 0)
while ($true) {
 $pt=New-Object NibPixel+POINT
 [void][NibPixel]::GetCursorPos([ref]$pt)
 $down = (([NibPixel]::GetAsyncKeyState(1) -band 0x8000) -ne 0)
 $justClicked = $down -and (-not $previousDown)
 $previousDown = $down
 $dc=[NibPixel]::GetDC([IntPtr]::Zero)
 try {$rgb=[NibPixel]::GetPixel($dc,$pt.X,$pt.Y)} finally {[void][NibPixel]::ReleaseDC([IntPtr]::Zero,$dc)}
 if ($rgb -ne [uint32]::MaxValue) {
   $r=$rgb -band 255; $g=($rgb -shr 8) -band 255; $b=($rgb -shr 16) -band 255
   $hex = '#{0:X2}{1:X2}{2:X2}' -f $r,$g,$b
   if ($justClicked) {
     'P,{0},{1},{2:X2}{3:X2}{4:X2}' -f $pt.X,$pt.Y,$r,$g,$b
   } else {
     'S,{0},{1},{2:X2}{3:X2}{4:X2}' -f $pt.X,$pt.Y,$r,$g,$b
   }
 }
 Start-Sleep -Milliseconds 15
}`;
    const {spawn} = require('child_process');
    try {
      liveSampler=spawn('powershell.exe',['-NoProfile','-NonInteractive','-STA','-Command',script],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      let buffer=''; liveSampler.stdout.setEncoding('utf8');
      liveSampler.stdout.on('data',chunk=>{ buffer+=chunk; let n; while((n=buffer.indexOf('\n'))!==-1){const line=buffer.slice(0,n).trim();buffer=buffer.slice(n+1);const m=line.match(/^([SP]),(-?\d+),(-?\d+),([0-9A-F]{6})$/);if(m){
        const kind=m[1],x=+m[2],y=+m[3],hex='#'+m[4];
        const bounds=w.getBounds();
        const overPicker=x>=bounds.x && x<bounds.x+bounds.width && y>=bounds.y && y<bounds.y+bounds.height;
        if(!overPicker) {
          liveSample={...liveSample,x,y,hex};
          if(kind==='P') {
            // A click locks the sampled desktop pixel until the next click.
            liveSample={...liveSample,pickSeq:liveSample.pickSeq+1,pickedHex:hex};
          }
        }
      }} if(buffer.length>4096)buffer=''; });
      liveSampler.stderr.setEncoding('utf8');
      liveSampler.stderr.on('data',chunk=>{ logCrash('eyedropper-sampler',new Error(String(chunk).trim())); });
      liveSampler.on('error',e=>logCrash('eyedropper',e));
    }catch(e){logCrash('eyedropper start',e);}
    w.on('closed',()=>{liveColorWindow=null;try{liveSampler&&liveSampler.kill();}catch{}liveSampler=null;});
    return w;
  };
  ipcMain.handle('extras:liveColor',()=>liveSample);
  // A color is never sampled from the picker itself. As the pointer moves onto its
  // controls, retain the last pixel sampled from the actual desktop/application.
  ipcMain.handle('extras:liveColorOutside',()=>liveSample);

  // OCR and drawing live in isolated, resizable tool windows — never fullscreen overlays.
  // Live desktop drawing: no screenshot and no DXGI capture.
  let liveDrawWindow = null;
  const closeLiveDraw = () => {
    if (liveDrawWindow && !liveDrawWindow.isDestroyed()) liveDrawWindow.close();
  };
  const openLiveDraw = () => {
    if (liveDrawWindow && !liveDrawWindow.isDestroyed()) {
      liveDrawWindow.show(); liveDrawWindow.focus(); return true;
    }
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    liveDrawWindow = new BrowserWindow({
      x:display.bounds.x,y:display.bounds.y,width:display.bounds.width,height:display.bounds.height,
      frame:false,transparent:true,resizable:false,alwaysOnTop:true,skipTaskbar:true,
      focusable:true,show:false,backgroundColor:'#00000000',hasShadow:false,
      webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}
    });
    const w=liveDrawWindow;
    w.setMenu(null);
    w.setAlwaysOnTop(true,'screen-saver');
    w.on('closed',()=>{if(liveDrawWindow===w) liveDrawWindow=null;});
    w.webContents.on('render-process-gone',()=>{if(!w.isDestroyed())w.destroy();});
    w.loadFile(path.join(__dirname,'live-draw.html')).then(()=>{
      if(!w.isDestroyed()){w.show();w.focus();}
    }).catch(e=>{logCrash('live-draw-load',e);if(!w.isDestroyed())w.destroy();});
    return true;
  };
  ipcMain.on('liveDraw:close',event=>{
    if(liveDrawWindow && !liveDrawWindow.isDestroyed() && event.sender===liveDrawWindow.webContents)closeLiveDraw();
  });
  // Escape from a stuck drawing overlay via system tray -> Quit, or Alt+F4.
  const toolWindows = new Map();
  const toolsWindow = mode => {
    if (mode === 'color') return createLiveColorWindow();
    const old = toolWindows.get(mode);
    if (old && !old.isDestroyed()) { old.show(); old.focus(); return old; }
    const w = new BrowserWindow({
      width: 900, height: 650, minWidth: 540, minHeight: 420,
      title: mode === 'ocr' ? 'Nib Text Extractor' : 'Nib Draw & Annotate',
      backgroundColor: '#10141c', autoHideMenuBar: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false, contextIsolation: true, sandbox: true }
    });
    toolWindows.set(mode,w);
    w.setMenu(null);
    w.on('closed', () => {
      toolWindows.delete(mode);
      if (regionSession) regionSession.finish({ok:false,canceled:true,error:'Tool closed'});
    });
    w.webContents.on('render-process-gone', (_e, details) => {
      logCrash('screen-tool-' + mode, details.reason);
      if (!w.isDestroyed()) w.destroy();
    });
    w.loadFile(path.join(__dirname,'screen-tools.html'),{query:{mode}})
      .then(() => {if (!w.isDestroyed()) w.show();})
      .catch(e => {logCrash('screen-tool-load',e); if(!w.isDestroyed())w.destroy();});
    return w;
  };
  ipcMain.handle('extras:overlay', (_,mode) => {
    if (!['draw','color','ocr'].includes(mode)) return false;
    try {if(mode==='draw') return openLiveDraw();toolsWindow(mode);return true;}catch(e){logCrash('open-screen-tool',e);return false;}
  });
  ipcMain.handle('extras:capture', async event => {
    const caller = BrowserWindow.fromWebContents(event.sender);
    if (!caller || caller.isDestroyed() || ![...toolWindows.values()].includes(caller))
      return {ok:false,error:'Invalid screen-tool window'};
    try {
      caller.hide();
      await new Promise(r => setTimeout(r,230));
      const {desktopCapturer} = require('electron');
      const display = screen.getPrimaryDisplay();
      const d = display.size;
      const sources = await Promise.race([
        desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.min(d.width,1920),height:Math.min(d.height,1080)}}),
        new Promise((_r,reject)=>setTimeout(()=>reject(new Error('Screen capture timed out')),6500))
      ]);
      const match = sources.find(x=>String(x.display_id)===String(display.id)) || sources[0];
      if(!match || match.thumbnail.isEmpty()) return {ok:false,error:'Windows returned no screenshot'};
      return {ok:true,data:match.thumbnail.toDataURL()};
    }catch(e){logCrash('screen-capture',e);return {ok:false,error:String(e.message||e)};}
    finally {if(caller && !caller.isDestroyed())caller.show();}
  });

  // Snipping Tool-style rectangular desktop capture: a short-lived isolated window,
  // visible only while the user drags a selection. No persistent fullscreen tool.
  let regionSession = null;
  ipcMain.on('screen:region-result', (event, token, data) => {
    const job = regionSession;
    if (!job || event.sender !== job.window.webContents || token !== job.token) return;
    if (data !== null && (typeof data !== 'string' ||
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 24*1024*1024)) {
      job.finish({ok:false,error:'Invalid selected screenshot'});
      return;
    }
    job.finish(data ? {ok:true,data} : {ok:false,canceled:true,error:'Selection canceled'});
  });
  ipcMain.handle('extras:captureRegion', async event => {
    const caller = BrowserWindow.fromWebContents(event.sender);
    if (!caller || caller.isDestroyed() || ![...toolWindows.values()].includes(caller))
      return {ok:false,error:'Invalid screen-tool window'};
    if (regionSession) return {ok:false,error:'Screen selection is already open'};
    let overlay = null;
    screenSelectionActive = true;
    caller.hide();
    try {
      // Allow Windows to remove the tool window before taking the screenshot.
      await new Promise(resolve=>setTimeout(resolve,260));
      const {desktopCapturer} = require('electron');
      const display = screen.getPrimaryDisplay(), bounds = display.bounds, px = display.size;
      // Keep the selection responsive on high-DPI and 4K monitors.
      const k = Math.min(1, 2560 / px.width, 1440 / px.height);
      const thumbSize = {width:Math.round(px.width*k),height:Math.round(px.height*k)};
      const sources = await Promise.race([
        desktopCapturer.getSources({types:['screen'],thumbnailSize:thumbSize}),
        new Promise((_,reject)=>setTimeout(()=>reject(new Error('Screenshot timed out')),7000))
      ]);
      const source = sources.find(s=>String(s.display_id)===String(display.id)) || sources[0];
      if (!source || source.thumbnail.isEmpty()) throw new Error('Unable to capture screen');
      const data=source.thumbnail.toDataURL();
      overlay = new BrowserWindow({
        x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height,
        frame:false,transparent:false,alwaysOnTop:true,skipTaskbar:true,
        resizable:false,movable:false,show:false,focusable:true,
        title:'Select screen area - Escape to cancel',
        webPreferences:{preload:path.join(__dirname,'preload.js'),
          contextIsolation:true,nodeIntegration:false,sandbox:true}
      });
      const token=require('crypto').randomBytes(12).toString('hex');
      const selector=overlay;
      return await new Promise((resolve)=>{
        let finished=false;
        const timeout=setTimeout(()=>finish({ok:false,error:'Screen selection timed out'}),90000);
        function finish(result){
          if(finished)return;
          finished=true;clearTimeout(timeout);regionSession=null;
          try{if(!selector.isDestroyed())selector.close();}catch{}
          if(!caller.isDestroyed()){caller.show();caller.focus();}
          // Restore the notch only after the selection overlay is gone.
          screenSelectionActive = false;
          if (win && !win.isDestroyed()) { nativeOver = false; win.webContents.send('nib:native-hover', false); applyIgnore(); }
          resolve(result);
        }
        regionSession={window:selector,token,finish};
        selector.on('closed',()=>finish({ok:false,canceled:true,error:'Selection canceled'}));
        selector.webContents.on('render-process-gone',(_,detail)=>{logCrash('region-selection',detail.reason);finish({ok:false,error:'Selection window stopped'})});
        selector.loadFile(path.join(__dirname,'screen-region.html'),{query:{token}}).then(()=>{
          if(finished || selector.isDestroyed())return;
          selector.show(); selector.focus();
          selector.webContents.send('screen:region-init', {token,data});
        }).catch(e=>{logCrash('region-selection-load',e);finish({ok:false,error:String(e.message)})});
      });
    }catch(e){
      logCrash('region-capture',e);
      if(overlay && !overlay.isDestroyed())overlay.destroy();
      if(!caller.isDestroyed()){caller.show();caller.focus();}
      screenSelectionActive = false;
      if (win && !win.isDestroyed()) { nativeOver = false; win.webContents.send('nib:native-hover', false); applyIgnore(); }
      return {ok:false,error:String(e.message||e)};
    }
  });
  // Clipboard imaging through Windows STA PowerShell, independent of Electron clipboard.readImage.
  // The helper takes a Windows clipboard image and writes it to a temporary PNG.
  const { spawn } = require('child_process');
  const readWindowsScreenshot = async (waitForNew=false, onReady=()=>{}) => {
    if(process.platform!=='win32') throw Error('Windows screen capture is required for this action.');
    const out=path.join(app.getPath('temp'),'nib-snip-'+require('crypto').randomBytes(8).toString('hex')+'.png');
    const helper=path.join(app.isPackaged ? process.resourcesPath : __dirname, 'ocr-clipboard.ps1');
    if(!fs.existsSync(helper)) throw Error('OCR helper missing: '+helper+'. Rebuild the Nib installer with extraResources.');
    const args=['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',helper,'-OutputPath',out];
    if(waitForNew) args.push('-Wait');
    try {
      await new Promise((resolve,reject)=>{
        const child=spawn('powershell.exe',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
        let done=false,readySent=false,output='',err='';
        const timer=setTimeout(()=>{child.kill();finish(new Error('Timed out waiting for a screenshot.'))},65000);
        const finish=e=>{if(done)return;done=true;clearTimeout(timer);e?reject(e):resolve()};
        child.stdout.on('data',c=>{
          output+=String(c);
          if(waitForNew && !readySent && output.includes('READY')) {
            readySent=true;
            // Start Windows Snipping Tool only after the clipboard watcher is listening.
            try { onReady(); } catch(e) { finish(e); }
          }
        });
        child.stderr.on('data',c=>{err+=String(c).slice(0,1200)});
        child.on('error',finish);
        child.on('close',code=>finish(code===0?null:new Error((err.trim()||'No screenshot found in clipboard').slice(0,350))));
      });
      const png=await fs.promises.readFile(out);
      if(!png.length||png.length>18*1024*1024)throw Error('Screenshot is empty or too large');
      return png;
    } finally {fs.promises.rm(out,{force:true}).catch(()=>{});}
  };
  ipcMain.handle('extras:startSnip', async () => ({ok:false,error:'Use Select area inside Text OCR instead.'}));
  ipcMain.handle('extras:ocrToolVisibility', (event,visible)=>{
    const w=BrowserWindow.fromWebContents(event.sender);
    if(w && toolWindows.get('ocr')===w && !w.isDestroyed()) {visible?w.show():w.hide();}
    return true;
  });
  ipcMain.handle('extras:clipboardImage', async () => ({ok:false,error:'Use Read clipboard — images are handled by Windows rather than Electron.'}));
  ipcMain.handle('extras:openOcrImage', async event => {
    const w=BrowserWindow.fromWebContents(event.sender);
    const r=await dialog.showOpenDialog(w && !w.isDestroyed()?w:win,{title:'Choose an image',properties:['openFile'],filters:[{name:'Images',extensions:['png','jpg','jpeg','bmp','webp']}]});
    if(r.canceled||!r.filePaths[0])return {ok:false,canceled:true};
    try {const b=await fs.promises.readFile(r.filePaths[0]);const result=await recognizeFileOnce(b);return {...result};}
    catch(e){return {ok:false,error:String(e.message||e)}}
  });
  const recognizeFileOnce = async buf => await recognize(buf);
  // OCR runs in the main process: no multi-megabyte Uint8Array IPC conversions.
  const findOcr = () => {
    const roots = [
      path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname,'resources'),'tesseract','tesseract.exe'),
      process.env.TESSERACT_PATH,
      path.join(process.env.ProgramFiles || 'C:\\Program Files','Tesseract-OCR','tesseract.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)','Tesseract-OCR','tesseract.exe'),
      'D:\\rbd\\tesseract\\tesseract.exe',
      'tesseract'
    ].filter(Boolean);
    return roots.find(p => p === 'tesseract' || fs.existsSync(p));
  };
  let ocrRunning = false;
  const recognize = async buf => {
    if (ocrRunning) return {ok:false,error:'OCR is already processing a screenshot.'};
    if (!Buffer.isBuffer(buf) || !buf.length || buf.length > 18*1024*1024) return {ok:false,error:'Screenshot is empty or too large.'};
    const exe = findOcr();
    if(!exe) return {ok:false,error:'Tesseract OCR is missing. Install it or copy tesseract.exe and tessdata into resources/tesseract.'};
    ocrRunning=true;
    const temp=path.join(app.getPath('temp'),'nib-ocr-'+require('crypto').randomBytes(8).toString('hex')+'.png');
    try {
      await fs.promises.writeFile(temp,buf);
      const data=exe==='tesseract'?null:path.join(path.dirname(exe),'tessdata');
      return await new Promise(resolve=>execFile(exe,[temp,'stdout','-l','eng','--psm','3'],{
        timeout:18000,windowsHide:true,maxBuffer:4*1024*1024,
        env:{...process.env,...(data&&fs.existsSync(data)?{TESSDATA_PREFIX:data}:{})}
      },(error,stdout,stderr)=>{
        if(error) resolve({ok:false,error:(error.code==='ENOENT'?'Tesseract not found. Install Tesseract OCR and restart Nib.':String(stderr||error.message)).slice(0,650)});
        else resolve({ok:true,text:String(stdout||'').trim()});
      }));
    }catch(e){ logCrash('ocr-run',e);return {ok:false,error:String(e.message||e)}; }
    finally { ocrRunning=false; fs.promises.rm(temp,{force:true}).catch(()=>{}); }
  };
  // Windows native snipping: the PowerShell STA watcher captures the next clipboard
  // image into a temporary PNG. No Electron clipboard.readImage dependency.
  let snipBusy = false;
  const ocrReply = async png => {
    const result = await recognize(png);
    return {...result, ...(result.ok ? {data:'data:image/png;base64,'+png.toString('base64')} : {})};
  };
  ipcMain.removeHandler('extras:ocrClipboard');
  ipcMain.handle('extras:ocrClipboard', async () => {
    try {return await ocrReply(await readWindowsScreenshot(false));}
    catch(e){return {ok:false,error:String(e.message||e)};}
  });
  ipcMain.handle('extras:snipAndOcr', async event => {
    if(snipBusy) return {ok:false,error:'A screenshot selection is already active.'};
    snipBusy=true;
    const w=BrowserWindow.fromWebContents(event.sender);
    const wasVisible=!!(w && !w.isDestroyed() && w.isVisible());
    let returned=false;
    const bringBack=()=>{
      if(returned || !wasVisible || !w || w.isDestroyed()) return;
      returned=true;
      try { if(w.isMinimized()) w.restore(); w.show(); w.focus(); }
      catch(e) { logCrash('ocr-window-restore',e); }
    };
    // Keep a recovery timer outside the OCR promise: selection can hang or fail.
    const recovery=setTimeout(bringBack,15000);
    try {
      // Minimize instead of hide: Windows can reliably restore minimized windows.
      if(wasVisible)w.minimize();
      const png=await readWindowsScreenshot(true, () => {
        shell.openExternal('ms-screenclip:').catch(e=>logCrash('snip-launch',e));
      });
      // Restore BEFORE Tesseract begins; slow recognition no longer hides the window.
      bringBack();
      return await ocrReply(png);
    }catch(e){
      bringBack();
      const msg=String(e.message||e);
      logCrash('snip-and-ocr',e);
      return {ok:false,error:msg.includes('No screenshot found')?'Selection canceled or no screenshot copied. Try again.':msg};
    }finally {
      clearTimeout(recovery);
      snipBusy=false;
      bringBack();
    }
  });
  ipcMain.handle('extras:ocr', async (_,bytes) => {
    if(!Array.isArray(bytes))return {ok:false,error:'Invalid image data.'};
    return recognize(Buffer.from(bytes));
  });
  ipcMain.handle('extras:copyHex', async (_,v) => {
    if(typeof v!=='string' || !/^#[0-9a-fA-F]{6}$/.test(v)) return {ok:false,error:'Invalid HEX value'};
    try {
      // Electron clipboard writes are synchronous; do not incorrectly compare a Promise.
      await Promise.resolve(clipboard.writeText(v.toUpperCase(), 'clipboard'));
      return {ok:true};
    } catch(e) {logCrash('color-copy',e);return {ok:false,error:String(e.message||e)};}
  });
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
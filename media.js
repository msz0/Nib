// One persistent PowerShell. Play/Pause/Next/Prev and "now playing" talk ONLY to the player you chose (Spotify by default),
// through that app's own Windows media session, so browsers (Netflix, YouTube...) are never touched.
const { spawn } = require('child_process');
const INIT = [
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
  `Add-Type -Namespace W -Name K -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e); [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint c, uint t);'`,
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  'function NzKey($v){[W.K]::keybd_event($v,0,0,[UIntPtr]::Zero);[W.K]::keybd_event($v,0,2,[UIntPtr]::Zero)}',
  'function NzSend($k){[System.Windows.Forms.SendKeys]::SendWait($k)}',
  'function NzCombo($m,$v,$e){foreach($x in $m){$f=0;if($x -ge 91 -and $x -le 92){$f=1};[W.K]::keybd_event($x,[byte][W.K]::MapVirtualKey($x,0),$f,[UIntPtr]::Zero)};Start-Sleep -Milliseconds 15;$f=0;if($e -eq 1){$f=1};$sc=[byte][W.K]::MapVirtualKey($v,0);[W.K]::keybd_event($v,$sc,$f,[UIntPtr]::Zero);Start-Sleep -Milliseconds 60;[W.K]::keybd_event($v,$sc,($f -bor 2),[UIntPtr]::Zero);foreach($x in $m){$f=2;if($x -ge 91 -and $x -le 92){$f=3};[W.K]::keybd_event($x,[byte][W.K]::MapVirtualKey($x,0),$f,[UIntPtr]::Zero)}}',
  "$at=([System.WindowsRuntimeSystemExtensions].GetMethods()|?{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'})[0]",
  'function NzAw($x,$r){$n=$at.MakeGenericMethod($r).Invoke($null,@($x));$n.Wait(-1)|Out-Null;$n.Result}',
  'try{[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]|Out-Null;$m=NzAw ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])}catch{}',
  'function NzSess($pat){foreach($x in $m.GetSessions()){if($x.SourceAppUserModelId -match $pat){return $x}}}',
  "function NzMedia($pat){try{$s=NzSess $pat;if(!$s){'-';return};$i=NzAw ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]);$t=$s.GetTimelineProperties();$st=[string]$s.GetPlaybackInfo().PlaybackStatus;$p=$t.Position.TotalSeconds;if($st -eq 'Playing'){$p+=([DateTimeOffset]::UtcNow-$t.LastUpdatedTime).TotalSeconds};ConvertTo-Json -Compress @{t=$i.Title;a=$i.Artist;s=$st;p=[math]::Round($p,1);d=[math]::Round(($t.EndTime-$t.StartTime).TotalSeconds,1);src=$s.SourceAppUserModelId}}catch{'-'}}",
  "function NzCtl($pat,$c){try{$s=NzSess $pat;if(!$s){'-';return};if($c -eq 'play'){$r=NzAw ($s.TryTogglePlayPauseAsync()) ([bool])}elseif($c -eq 'next'){$r=NzAw ($s.TrySkipNextAsync()) ([bool])}else{$r=NzAw ($s.TrySkipPreviousAsync()) ([bool])};'ok'}catch{'-'}}",
  "function NzTitle{$p=Get-Process Spotify -ErrorAction SilentlyContinue|Where-Object{$_.MainWindowTitle}|Select-Object -First 1;if($p){$p.MainWindowTitle}else{'-'}}"
];
const VK = { mute: 173, vdn: 174, vup: 175 };   // system volume keys only (never play/pause)
let ps = null, fails = 0; const q = [];
const drain = () => q.splice(0).forEach(w => w(null));
const reset = () => { try { ps && ps.kill(); } catch {} ps = null; drain(); fails = 0; };   // also used after sleep
function start() {
  try { ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true }); } catch { ps = null; return; }
  ps.on('error', () => { ps = null; drain(); }); ps.on('exit', () => { ps = null; drain(); }); ps.stdin.on('error', () => {}); ps.stderr.on('data', () => {});
  let b = ''; ps.stdout.setEncoding('utf8');
  ps.stdout.on('data', d => { b += d; let i; while ((i = b.indexOf('\n')) >= 0) { const l = b.slice(0, i).trim(); b = b.slice(i + 1); const w = q.shift(); if (w) w(l); } });
  INIT.forEach(l => ps.stdin.write(l + '\n'));
}
const run = l => { if (!ps) start(); if (ps) ps.stdin.write(l + '\n'); };
const key = n => { if (VK[n]) run('NzKey ' + VK[n]); };
const safe = p => /^[A-Za-z0-9 ._-]{1,30}$/.test(p || '') ? p : 'Spotify';
// Full key combinations ("Ctrl+Shift+M", "Alt+F13", "Win+Num5"...). Names match what Settings > Record produces.
const NAMES = (() => {
  const m = {};
  for (let c = 65; c <= 90; c++) m[String.fromCharCode(c).toLowerCase()] = [c, 0];
  for (let d = 0; d <= 9; d++) { m[String(d)] = [48 + d, 0]; m['num' + d] = [96 + d, 0]; }
  for (let f = 1; f <= 24; f++) m['f' + f] = [111 + f, 0];
  Object.assign(m, { space: [32, 0], enter: [13, 0], numenter: [13, 1], tab: [9, 0], backspace: [8, 0], insert: [45, 1], delete: [46, 1], home: [36, 1], end: [35, 1],
    pageup: [33, 1], pagedown: [34, 1], left: [37, 1], up: [38, 1], right: [39, 1], down: [40, 1], '`': [192, 0], '-': [189, 0], '=': [187, 0], '[': [219, 0],
    ']': [221, 0], '\\': [220, 0], ';': [186, 0], "'": [222, 0], ',': [188, 0], '.': [190, 0], '/': [191, 0], capslock: [20, 0], scrolllock: [145, 0], pause: [19, 0],
    printscreen: [44, 1], numadd: [107, 0], numsub: [109, 0], nummul: [106, 0], numdiv: [111, 1], numdec: [110, 0],
    esc: [27, 0], escape: [27, 0], return: [13, 0], del: [46, 1], ins: [45, 1], pgup: [33, 1], pgdn: [34, 1] });
  return m;
})();
const MODS = { ctrl: 17, control: 17, shift: 16, alt: 18, win: 91, windows: 91, meta: 91, cmd: 91, super: 91 };
function comboCmd(spec) {   // -> PowerShell line, or null when it is not a modifiers+one-key combo
  if (typeof spec !== 'string' || !/^[\x20-\x7e]{1,40}$/.test(spec)) return null;
  const mods = [], keys = [];
  for (const raw of spec.split('+')) {
    const t = raw.trim().toLowerCase(); if (!t) continue;
    if (MODS[t]) { if (!mods.includes(MODS[t])) mods.push(MODS[t]); } else if (NAMES[t]) keys.push(NAMES[t]); else return null;
  }
  if (keys.length !== 1) return null;
  return `NzCombo @(${mods.join(',')}) ${keys[0][0]} ${keys[0][1]}`;
}
function press(spec) { const c = comboCmd(spec); if (!c) return false; run(c); return true; }
function keys(combo) {   // "Ctrl+Shift+M" -> SendKeys "^+m"
  if (!/^[A-Za-z0-9+ ]{1,40}$/.test(combo || '')) return false;
  const p = combo.split('+').map(s => s.trim()).filter(Boolean), k = p.pop(); if (!k) return false;
  const mod = p.map(m => ({ ctrl: '^', shift: '+', alt: '%' })[m.toLowerCase()] || '').join('');
  const kk = /^f\d{1,2}$/i.test(k) ? '{' + k.toUpperCase() + '}' : k.length === 1 ? k.toLowerCase() : '{' + k.toUpperCase() + '}';
  run(`NzSend '${mod}${kk}'`); return true;
}
const ask1 = cmd => new Promise(res => {
  if (!ps) start(); if (!ps) return res(null);
  let done = false;
  const w = l => { if (done) return; done = true; clearTimeout(t); if (l !== null) fails = 0; res(l); };   // a late answer still uses up its own slot, so answers never get mixed up
  const t = setTimeout(() => { if (done) return; done = true; res(null); if (++fails >= 2) reset(); }, 5000);   // two misses in a row: the helper is stuck, start a fresh one
  q.push(w); ps.stdin.write(cmd + '\n');
});
async function nowPlaying(player) {   // {title, artist, status, pos(sec), dur, src} or null
  const pat = safe(player), r = await ask1(`NzMedia '${pat}'`);
  if (r && r !== '-') { try { const j = JSON.parse(r); if (j.t) return { title: j.t, artist: j.a || '', status: j.s, pos: j.p || 0, dur: j.d || 0, src: j.src || '' }; } catch {} }
  if (!/spotify/i.test(pat)) return null;
  const n = await ask1('NzTitle'); if (!n || n === '-') return null;   // fallback: Spotify's window title
  const m = n.match(/^(.*?) - (.*)$/);
  return /^spotify/i.test(n) ? { title: 'Spotify', artist: '', status: 'Paused', pos: 0, dur: 0, src: 'Spotify' }
    : { title: m ? m[2] : n, artist: m ? m[1] : '', status: 'Playing', pos: 0, dur: 0, src: 'Spotify', nopos: true };
}
const control = (cmd, player) => ['play', 'next', 'prev'].includes(cmd) ? ask1(`NzCtl '${safe(player)}' ${cmd}`) : Promise.resolve(null);
module.exports = { key, keys, press, comboCmd, reset, nowPlaying, control, stop: () => { try { ps && ps.kill(); } catch {} } };
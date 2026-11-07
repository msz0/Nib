// One persistent PowerShell bridge to Windows SMTC. Playback commands and now-playing data
// use the detected media session, without stealing focus or sending keys to other apps.
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
  'function NzPat($pat){$p=(([string]$pat).ToLowerInvariant() -replace "\\.exe$","");$a=@($p);if($p -match "^(chrome|googlechrome)$"){$a+=@("chrome","googlechrome")};if($p -match "^(edge|msedge|microsoftedge)$"){$a+=@("edge","msedge","microsoftedge")};if($p -match "^(firefox|mozilla\\.firefox)$"){$a+=@("firefox","mozilla.firefox")};if($p -match "^(brave|bravebrowser)$"){$a+=@("brave","bravebrowser")};if($p -match "^opera$"){$a+=@("opera")};if($p -match "^vivaldi$"){$a+=@("vivaldi")};if($p -match "^arc$"){$a+=@("arc")};if($p -match "^spotify$"){$a+=@("spotify")};$a}',
  'function NzSess($pat){if(!$m){return $null};$a=NzPat $pat;foreach($x in $m.GetSessions()){ $id=([string]$x.SourceAppUserModelId).ToLowerInvariant(); foreach($p in $a){if($id.Contains($p)){return $x}}};$null}',
  "function NzMedia($pat){try{$s=NzSess $pat;if(!$s){'-';return};$i=NzAw ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]);$t=$s.GetTimelineProperties();$st=[string]$s.GetPlaybackInfo().PlaybackStatus;$p=[math]::Max(0,$t.Position.TotalSeconds);if($st -eq 'Playing'){$p+=([DateTimeOffset]::UtcNow-$t.LastUpdatedTime).TotalSeconds};$d=[math]::Max(0,($t.EndTime-$t.StartTime).TotalSeconds);if(!$i.Title){'-';return};ConvertTo-Json -Compress @{t=[string]$i.Title;a=[string]$i.Artist;s=$st;p=[math]::Round($p,1);d=[math]::Round($d,1);src=[string]$s.SourceAppUserModelId}}catch{'-'}}",
  "function NzThumb($i){try{if(!$i.Thumbnail){return ''};$st=NzAw ($i.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType]);$r=[Activator]::CreateInstance([Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime],@($st));$n=NzAw ($r.LoadAsync([uint32]1048576)) ([uint32]);if($n -le 0){return ''};$b=New-Object byte[] $n;$r.ReadBytes($b);$mime='image/jpeg';if($n -ge 8 -and $b[0] -eq 137 -and $b[1] -eq 80 -and $b[2] -eq 78 -and $b[3] -eq 71){$mime='image/png'}elseif($n -ge 12 -and [Text.Encoding]::ASCII.GetString($b,0,4) -eq 'RIFF' -and [Text.Encoding]::ASCII.GetString($b,8,4) -eq 'WEBP'){$mime='image/webp'}elseif($n -ge 6 -and [Text.Encoding]::ASCII.GetString($b,0,3) -eq 'GIF'){$mime='image/gif'};[Convert]::ToBase64String($b)+'|'+$mime}catch{''}}",
  "function NzMediaAll{$out=@();if(!$m){'-';return};foreach($s in $m.GetSessions()){try{$i=NzAw ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]);$t=$s.GetTimelineProperties();$st=[string]$s.GetPlaybackInfo().PlaybackStatus;$p=[math]::Max(0,$t.Position.TotalSeconds);if($st -eq 'Playing'){$p+=([DateTimeOffset]::UtcNow-$t.LastUpdatedTime).TotalSeconds};$d=[math]::Max(0,($t.EndTime-$t.StartTime).TotalSeconds);if($i.Title){$th=NzThumb $i;$parts=$th -split '\\|',2;$out+=[pscustomobject]@{t=[string]$i.Title;a=[string]$i.Artist;s=$st;p=[math]::Round($p,1);d=[math]::Round($d,1);src=[string]$s.SourceAppUserModelId;art=$parts[0];mime=$parts[1]}}}catch{}};if($out.Count){$out|ConvertTo-Json -Compress}else{'-'}}",
  "function NzCtl($pat,$c){try{$s=$null;foreach($x in $m.GetSessions()){if(([string]$x.SourceAppUserModelId) -eq $pat){$s=$x;break}};if(!$s){$s=NzSess $pat};if(!$s){'-';return};$r=$false;if($c -eq 'play'){$r=NzAw ($s.TryTogglePlayPauseAsync()) ([bool])}elseif($c -eq 'next'){$r=NzAw ($s.TrySkipNextAsync()) ([bool])}elseif($c -eq 'prev'){$r=NzAw ($s.TrySkipPreviousAsync()) ([bool])};if($r){'ok'}else{'-'}}catch{'-'}}",
  "function NzSeek($pat,$p){try{$s=$null;foreach($x in $m.GetSessions()){if(([string]$x.SourceAppUserModelId) -eq $pat){$s=$x;break}};if(!$s){'-';return};$r=NzAw ($s.TryChangePlaybackPositionAsync([TimeSpan]::FromSeconds([double]$p))) ([bool]);if($r){'ok'}else{'-'}}catch{'-'}}",
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
const sourceFor = src => /spotify/i.test(src || '') ? 'spotify' : /edge|msedge/i.test(src || '') ? 'msedge' : /firefox/i.test(src || '') ? 'firefox' : /chrome/i.test(src || '') ? 'chrome' : 'other';
const playerLabel = source => ({ spotify: 'Spotify', chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox' }[source] || 'Media player');
const normalize = j => j && j.t && ['Playing', 'Paused', 'Stopped', 'Opened'].includes(j.s)
  ? { title: j.t, artist: j.a || '', status: j.s === 'Playing' ? 'Playing' : 'Paused', pos: Math.max(0, Number(j.p) || 0), dur: Math.max(0, Number(j.d) || 0), src: j.src || '', source: sourceFor(j.src), sourceId: j.src || '', artUrl: j.art && j.mime ? `data:${j.mime};base64,${j.art}` : '' }
  : null;
async function nowPlaying(preferredSourceId) {   // {title, artist, status, pos(sec), dur, src} or null
  const r = await ask1('NzMediaAll');
  if (r && r !== '-') {
    try {
      const list = JSON.parse(r);
      const sessions = (Array.isArray(list) ? list : [list]).map(normalize).filter(Boolean);
      if (sessions.length) return (preferredSourceId && sessions.find(item => item.sourceId === preferredSourceId))
        || sessions.find(item => item.status === 'Playing') || sessions[0];
    } catch {}
  }
  const n = await ask1('NzTitle'); if (!n || n === '-') return null;   // fallback: Spotify's window title
  const m = n.match(/^(.*?) - (.*)$/);
  return /^spotify/i.test(n) ? { title: 'Spotify', artist: '', status: 'Paused', pos: 0, dur: 0, src: 'Spotify', source: 'spotify' }
    : { title: m ? m[2] : n, artist: m ? m[1] : '', status: 'Playing', pos: 0, dur: 0, src: 'Spotify', source: 'spotify', nopos: true };
}
async function players() {
  const r = await ask1('NzMediaAll');
  if (!r || r === '-') return [];
  try {
    const list = JSON.parse(r);
    return (Array.isArray(list) ? list : [list]).map(normalize).filter(Boolean).map(item => ({
      sourceId: item.sourceId,
      source: item.source,
      label: playerLabel(item.source),
      title: item.title,
      artist: item.artist,
      status: item.status
    }));
  } catch {
    return [];
  }
}
const control = async (cmd, player) => {
  if (!['play', 'next', 'prev'].includes(cmd)) return false;
  const active = player || (await nowPlaying())?.sourceId;
  if (!active) return false;
  const quoted = String(active).replace(/'/g, "''");
  return (await ask1(`NzCtl '${quoted}' ${cmd}`)) === 'ok';
};
const seek = async (seconds, player) => {
  const active = player || (await nowPlaying())?.sourceId;
  if (!active || !Number.isFinite(seconds)) return false;
  const quoted = String(active).replace(/'/g, "''");
  return (await ask1(`NzSeek '${quoted}' ${Math.max(0, seconds)}`)) === 'ok';
};
module.exports = { key, keys, press, comboCmd, reset, nowPlaying, players, control, seek, stop: () => { try { ps && ps.kill(); } catch {} } };
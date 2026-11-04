// One persistent PowerShell. Play/Pause/Next/Prev and "now playing" talk ONLY to the player you chose (Spotify by default),
// through that app's own Windows media session, so browsers (Netflix, YouTube...) are never touched.
const { spawn } = require('child_process');
const INIT = [
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
  `Add-Type -Namespace W -Name K -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e);'`,
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  'function NzKey($v){[W.K]::keybd_event($v,0,0,[UIntPtr]::Zero);[W.K]::keybd_event($v,0,2,[UIntPtr]::Zero)}',
  'function NzSend($k){[System.Windows.Forms.SendKeys]::SendWait($k)}',
  "$at=([System.WindowsRuntimeSystemExtensions].GetMethods()|?{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'})[0]",
  'function NzAw($x,$r){$n=$at.MakeGenericMethod($r).Invoke($null,@($x));$n.Wait(-1)|Out-Null;$n.Result}',
  'try{[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]|Out-Null;$m=NzAw ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])}catch{}',
  'function NzSess($pat){foreach($x in $m.GetSessions()){if($x.SourceAppUserModelId -match $pat){return $x}}}',
  "function NzMedia($pat){try{$s=NzSess $pat;if(!$s){'-';return};$i=NzAw ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]);$t=$s.GetTimelineProperties();$st=[string]$s.GetPlaybackInfo().PlaybackStatus;$p=$t.Position.TotalSeconds;if($st -eq 'Playing'){$p+=([DateTimeOffset]::UtcNow-$t.LastUpdatedTime).TotalSeconds};ConvertTo-Json -Compress @{t=$i.Title;a=$i.Artist;s=$st;p=[math]::Round($p,1);d=[math]::Round(($t.EndTime-$t.StartTime).TotalSeconds,1);src=$s.SourceAppUserModelId}}catch{'-'}}",
  "function NzCtl($pat,$c){try{$s=NzSess $pat;if(!$s){'-';return};if($c -eq 'play'){$r=NzAw ($s.TryTogglePlayPauseAsync()) ([bool])}elseif($c -eq 'next'){$r=NzAw ($s.TrySkipNextAsync()) ([bool])}else{$r=NzAw ($s.TrySkipPreviousAsync()) ([bool])};'ok'}catch{'-'}}",
  "function NzTitle{$p=Get-Process Spotify -ErrorAction SilentlyContinue|Where-Object{$_.MainWindowTitle}|Select-Object -First 1;if($p){$p.MainWindowTitle}else{'-'}}"
];
const VK = { mute: 173, vdn: 174, vup: 175 };   // system volume keys only (never play/pause)
let ps = null; const q = [];
function start() {
  try { ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true }); } catch { ps = null; return; }
  ps.on('error', () => ps = null); ps.on('exit', () => ps = null); ps.stdin.on('error', () => {}); ps.stderr.on('data', () => {});
  let b = ''; ps.stdout.setEncoding('utf8');
  ps.stdout.on('data', d => { b += d; let i; while ((i = b.indexOf('\n')) >= 0) { const l = b.slice(0, i).trim(); b = b.slice(i + 1); const w = q.shift(); if (w) w(l); } });
  INIT.forEach(l => ps.stdin.write(l + '\n'));
}
const run = l => { if (!ps) start(); if (ps) ps.stdin.write(l + '\n'); };
const key = n => { if (VK[n]) run('NzKey ' + VK[n]); };
const safe = p => /^[A-Za-z0-9 ._-]{1,30}$/.test(p || '') ? p : 'Spotify';
function keys(combo) {   // "Ctrl+Shift+M" -> SendKeys "^+m"
  if (!/^[A-Za-z0-9+ ]{1,40}$/.test(combo || '')) return false;
  const p = combo.split('+').map(s => s.trim()).filter(Boolean), k = p.pop(); if (!k) return false;
  const mod = p.map(m => ({ ctrl: '^', shift: '+', alt: '%' })[m.toLowerCase()] || '').join('');
  const kk = /^f\d{1,2}$/i.test(k) ? '{' + k.toUpperCase() + '}' : k.length === 1 ? k.toLowerCase() : '{' + k.toUpperCase() + '}';
  run(`NzSend '${mod}${kk}'`); return true;
}
const ask1 = cmd => new Promise(res => {
  if (!ps) start(); if (!ps) return res(null);
  const w = l => { clearTimeout(t); res(l); };
  const t = setTimeout(() => { const i = q.indexOf(w); if (i >= 0) q.splice(i, 1); res(null); }, 3500);
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
module.exports = { key, keys, nowPlaying, control, stop: () => { try { ps && ps.kill(); } catch {} } };

// File sorting with collision-safe moves and undo.
const fs = require('fs'), path = require('path');
const CATS = { Images: 'jpg jpeg png gif webp bmp svg heic tif tiff ico avif', Documents: 'pdf doc docx txt rtf odt xls xlsx csv ppt pptx md epub',
  Videos: 'mp4 mkv mov avi webm wmv m4v', Audio: 'mp3 wav flac m4a aac ogg wma', Archives: 'zip rar 7z tar gz bz2 iso',
  Installers: 'exe msi msix appx', Code: 'js ts py java c cpp cs go rs html css json xml sh bat ps1 sql ipynb' };
const EXT = {}; for (const [k, v] of Object.entries(CATS)) v.split(' ').forEach(e => EXT[e] = k);
const cat = f => EXT[path.extname(f).slice(1).toLowerCase()] || 'Other';
const log = [];
function uniq(dir, name) {
  let p = path.join(dir, name); if (!fs.existsSync(p)) return p;
  const { name: n, ext } = path.parse(name);
  for (let i = 1; ; i++) { p = path.join(dir, `${n} (${i})${ext}`); if (!fs.existsSync(p)) return p; }
}
function mv(a, b) {
  try { fs.renameSync(a, b); } catch (e) { if (e.code !== 'EXDEV') throw e; fs.cpSync(a, b, { recursive: true }); fs.rmSync(a, { recursive: true, force: true }); }
}
function move(paths, destFor) {
  const batch = []; let failed = 0;
  for (const src of paths) {
    try {
      const dir = destFor(src); fs.mkdirSync(dir, { recursive: true });
      if (path.resolve(dir) === path.resolve(path.dirname(src))) continue;
      const dst = uniq(dir, path.basename(src)); mv(src, dst); batch.push([src, dst]);
    } catch { failed++; }
  }
  if (batch.length) { log.push(batch); if (log.length > 20) log.shift(); }
  return { moved: batch.length, failed };
}
const toFolder = (paths, folder) => move(paths, () => folder);
const byType = (paths, base) => move(paths, s => path.join(base, cat(s)));
function tidy(dir) {  // sort loose files in a folder (skips folders, partial downloads, and anything touched in the last 2 minutes)
  const now = Date.now();
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile() && !/\.(crdownload|part|tmp|download)$/i.test(d.name) && now - fs.statSync(path.join(dir, d.name)).mtimeMs > 120000)
    .map(d => path.join(dir, d.name));
  return byType(files, dir);
}
function undo() {
  const b = log.pop(); let restored = 0; if (!b) return { restored };
  for (const [src, dst] of b.reverse()) { try { if (fs.existsSync(dst)) { mv(dst, uniq(path.dirname(src), path.basename(src))); restored++; } } catch {} }
  return { restored };
}
module.exports = { toFolder, byType, tidy, undo, cat };

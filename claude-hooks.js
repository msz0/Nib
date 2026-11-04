// Optional: connect/disconnect Claude Code by editing ~/.claude/settings.json (a backup is saved next to it).
const fs = require('fs'), path = require('path'), os = require('os');
const MARK = '127.0.0.1:47821/hook';
const CMD = 'curl -s -m 28 -X POST -H "Content-Type: application/json" --data-binary @- http://' + MARK + ' || exit 0';
const EVENTS = [['UserPromptSubmit'], ['PreToolUse', '*'], ['PostToolUse', '*'], ['Notification'], ['Stop']];
const file = () => path.join(os.homedir(), '.claude', 'settings.json');

function apply(remove) {
  const f = file();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  let s = {};
  if (fs.existsSync(f)) { fs.copyFileSync(f, f + '.nib-backup'); s = JSON.parse(fs.readFileSync(f, 'utf8') || '{}'); }
  s.hooks = s.hooks || {};
  for (const [ev, m] of EVENTS) {
    const list = (s.hooks[ev] || []).filter(g => !JSON.stringify(g).includes(MARK));
    if (!remove) { const g = { hooks: [{ type: 'command', command: CMD, timeout: 30 }] }; if (m) g.matcher = m; list.push(g); }
    if (list.length) s.hooks[ev] = list; else delete s.hooks[ev];
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  fs.writeFileSync(f, JSON.stringify(s, null, 2));
  return f;
}
const isConnected = () => { try { return fs.readFileSync(file(), 'utf8').includes(MARK); } catch { return false; } };
module.exports = { isConnected, connect: () => apply(false), disconnect: () => apply(true), file };

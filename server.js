// Local event server on 127.0.0.1. Accepts Claude Code hook JSON (optional) or simple {type:...} events.
const http = require('http');
const MAP = { UserPromptSubmit: 'prompt', PreToolUse: 'tool', PostToolUse: 'tool-done', Notification: 'notify', Stop: 'stop' };

function startServer({ send, shouldGate = () => false, onGet = () => false, port = 47821, timeout = 25000 }) {
  let seq = 0;
  const pending = new Map();
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') { if (onGet(req, res)) return; res.writeHead(200); return res.end('nib'); }
    let b = ''; req.on('data', d => b += d);
    req.on('end', () => {
      let i; try { i = JSON.parse(b || '{}'); } catch { res.writeHead(400); return res.end(); }
      const fromHook = !!i.hook_event_name;
      const e = fromHook
        ? { type: MAP[i.hook_event_name] || 'other', tool: i.tool_name, input: i.tool_input, message: i.message }
        : i;
      const gate = e.type === 'tool' && (fromHook ? shouldGate(e.tool) : !!e.gate);
      if (!gate) { send(e); res.writeHead(204); return res.end(); }
      const id = ++seq;
      const reply = d => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(fromHook
          ? { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: d,
              permissionDecisionReason: d === 'ask' ? 'No answer from Nib' : 'Decided in Nib' } }
          : { decision: d }));
      };
      const t = setTimeout(() => { if (pending.delete(id)) { reply('ask'); send({ type: 'resolved', id }); } }, timeout);
      pending.set(id, { reply, t });
      res.on('close', () => { if (pending.delete(id)) { clearTimeout(t); send({ type: 'resolved', id }); } });
      send({ ...e, gate: true, id });
    });
  });
  server.decide = (id, d) => { const p = pending.get(id); if (!p) return; pending.delete(id); clearTimeout(p.t); p.reply(d); };
  server.listen(port, '127.0.0.1');
  return server;
}
module.exports = { startServer };

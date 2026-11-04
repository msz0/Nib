// Try the Claude Code behaviour without Claude Code: start Nib, then run `node demo.js`
const post = b => fetch('http://127.0.0.1:47821/event', { method: 'POST', body: JSON.stringify(b) }).then(r => r.text());
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await post({ type: 'prompt' }); await wait(1500);
  await post({ type: 'tool', tool: 'Read', input: { file_path: 'C:\\proj\\src\\app.js' } }); await wait(2000);
  await post({ type: 'tool', tool: 'Grep', input: { pattern: 'TODO' } }); await wait(2000);
  console.log('Click Allow or Deny on the island...');
  console.log('Decision:', await post({ type: 'tool', tool: 'Bash', input: { command: 'npm test' }, gate: true }));
  await post({ type: 'tool-done' }); await wait(1500);
  await post({ type: 'stop' });
})();

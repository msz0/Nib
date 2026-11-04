// Optional chat with Nib using your own Anthropic API key (separate from a claude.ai subscription).
const BASE = process.env.NIB_API_URL || 'https://api.anthropic.com';
const MODEL = process.env.NIB_MODEL || 'claude-haiku-5-5';
async function ask(key, messages, name = 'Nib') {
  if (!key) throw new Error('No API key saved');
  const r = await fetch(BASE + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, messages,
      system: 'You are ' + name + ', a tiny friendly cat who lives in a desktop island. Reply in at most three short sentences, plain text, no markdown.' })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim() || '...';
}
module.exports = { ask };

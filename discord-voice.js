const INTENTS = 1 | 2 | 128;
const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';
const SNOWFLAKE = /^\d{17,20}$/;

const userAvatar = user => {
  const id = String(user && user.id || '');
  if (!SNOWFLAKE.test(id)) return '';
  const hash = String(user.avatar || '');
  if (/^(a_)?[a-f0-9]{16,64}$/i.test(hash)) {
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.${hash.startsWith('a_') ? 'gif' : 'png'}?size=64`;
  }
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`;
};

function create({ onChange }) {
  let socket = null, token = '', userId = '', stopped = true;
  let heartbeatTimer = null, reconnectTimer = null, joinTimer = null;
  let heartbeatInterval = 0, heartbeatAck = true, sequence = null, reconnects = 0;
  let status = 'Disconnected', error = '', active = null, lastJoin = null;
  const members = new Map(), voices = new Map();
  const voiceKey = (guildId, id) => `${guildId}:${id}`;

  const avatarFor = userAvatar;
  const memberInfo = m => {
    const user = m && (m.user || m);
    if (!user || !SNOWFLAKE.test(String(user.id || ''))) return null;
    return {
      id: String(user.id),
      name: String(m.nick || user.global_name || user.username || 'Discord user').slice(0, 80),
      avatar: avatarFor(user)
    };
  };
  const makeState = () => {
    let users = [];
    if (active) {
      users = [...voices.values()]
        .filter(v => v.guildId === active.guildId && v.channelId === active.channelId && v.userId !== userId)
        .map(v => members.get(v.userId) || { id: v.userId, name: 'Discord user', avatar: avatarFor({ id: v.userId }) })
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return {
      status, error, connected: status === 'Connected',
      inVoice: !!active,
      users,
      lastJoin: lastJoin ? { ...lastJoin } : null
    };
  };
  const publish = () => { if (typeof onChange === 'function') onChange(makeState()); };
  const setStatus = (next, message = '') => { status = next; error = message; publish(); };
  const clearVolatile = () => {
    if (joinTimer) clearTimeout(joinTimer);
    joinTimer = null; lastJoin = null; active = null;
    members.clear(); voices.clear();
  };
  const send = payload => {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };
  const closeSocket = () => {
    const current = socket;
    if (current && current.readyState < WebSocket.CLOSING) current.close();
    else if (current) socket = null;
  };
  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    reconnects++;
    const delay = Math.min(30000, 1000 * (2 ** Math.min(reconnects - 1, 5)));
    setStatus('Reconnecting');
    reconnectTimer = setTimeout(() => { reconnectTimer = null; open(); }, delay);
    if (reconnectTimer.unref) reconnectTimer.unref();
  };
  const resetHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };
  const heartbeat = () => {
    if (!heartbeatAck) {
      closeSocket();
      return;
    }
    heartbeatAck = false;
    send({ op: 1, d: sequence });
  };
  const setLastJoin = user => {
    if (joinTimer) clearTimeout(joinTimer);
    lastJoin = user;
    joinTimer = setTimeout(() => { lastJoin = null; joinTimer = null; publish(); }, 6500);
    if (joinTimer.unref) joinTimer.unref();
  };
  const addVoice = (guildId, data, initial = false) => {
    const id = String(data.user_id || (data.member && data.member.user && data.member.user.id) || '');
    if (!SNOWFLAKE.test(id)) return;
    const key = voiceKey(guildId, id), previous = voices.get(key);
    const channelId = data.channel_id ? String(data.channel_id) : '';
    const person = memberInfo(data.member);
    if (person) members.set(id, person);
    if (channelId) voices.set(key, { guildId, userId: id, channelId });
    else voices.delete(key);
    if (!channelId && ![...voices.values()].some(v => v.userId === id)) members.delete(id);

    if (id === userId) {
      if (channelId) {
        const moved = !active || active.guildId !== guildId || active.channelId !== channelId;
        if (moved) { active = { guildId, channelId }; lastJoin = null; }
      } else if (active && active.guildId === guildId && (!previous || active.channelId === previous.channelId)) {
        active = null; lastJoin = null;
      }
    } else if (!initial && active && active.guildId === guildId && active.channelId === channelId &&
      channelId && (!previous || previous.channelId !== channelId)) {
      const joining = members.get(id) || { id, name: 'Discord user', avatar: avatarFor({ id }) };
      setLastJoin(joining);
    }
    publish();
  };
  const addGuild = data => {
    const guildId = String(data.id || '');
    if (!SNOWFLAKE.test(guildId)) return;
    const voiceStates = Array.isArray(data.voice_states) ? data.voice_states : [];
    const activeIds = new Set(voiceStates.map(v => String(v.user_id || '')));
    for (const m of data.members || []) {
      const person = memberInfo(m);
      if (person && activeIds.has(person.id)) members.set(person.id, person);
    }
    for (const voiceState of voiceStates) addVoice(guildId, voiceState, true);
    publish();
  };
  const handle = packet => {
    if (!packet || typeof packet !== 'object') return;
    if (Number.isInteger(packet.s)) sequence = packet.s;
    if (packet.op === 10) {
      heartbeatInterval = Number(packet.d && packet.d.heartbeat_interval) || 45000;
      resetHeartbeat();
      heartbeatAck = true;
      send({ op: 2, d: { token, intents: INTENTS, properties: { os: 'windows', browser: 'Nib', device: 'Nib' } } });
      heartbeatTimer = setInterval(heartbeat, heartbeatInterval);
      if (heartbeatTimer.unref) heartbeatTimer.unref();
      return;
    }
    if (packet.op === 1) { send({ op: 1, d: sequence }); return; }
    if (packet.op === 11) { heartbeatAck = true; return; }
    if (packet.op === 7 || packet.op === 9) { closeSocket(); return; }
    if (packet.op !== 0) return;
    const d = packet.d || {};
    if (packet.t === 'READY') {
      reconnects = 0;
      setStatus('Connected');
    } else if (packet.t === 'GUILD_CREATE') {
      addGuild(d);
    } else if (packet.t === 'GUILD_DELETE') {
      const guildId = String(d.id || '');
      const affected = new Set();
      for (const [key, voice] of [...voices]) if (voice.guildId === guildId) {
        voices.delete(key); affected.add(voice.userId);
      }
      for (const id of affected) if (![...voices.values()].some(v => v.userId === id)) members.delete(id);
      if (active && active.guildId === guildId) { active = null; lastJoin = null; }
      publish();
    } else if (packet.t === 'VOICE_STATE_UPDATE') {
      addVoice(String(d.guild_id || ''), d);
    } else if (packet.t === 'GUILD_MEMBER_UPDATE' || packet.t === 'GUILD_MEMBER_ADD') {
      const person = memberInfo(d);
      if (person && [...voices.values()].some(v => v.userId === person.id)) {
        members.set(person.id, person);
        publish();
      }
    } else if (packet.t === 'GUILD_MEMBER_REMOVE') {
      const id = String(d.user && d.user.id || '');
      if (id) {
        voices.delete(voiceKey(String(d.guild_id || ''), id));
        if (![...voices.values()].some(v => v.userId === id)) members.delete(id);
        if (id === userId && active && active.guildId === String(d.guild_id || '')) { active = null; lastJoin = null; }
        publish();
      }
    }
  };
  const open = () => {
    if (stopped || !token || !userId) return;
    setStatus('Connecting');
    try {
      const current = new WebSocket(GATEWAY);
      socket = current;
      current.addEventListener('message', event => {
        if (current !== socket) return;
        try { handle(JSON.parse(String(event.data))); }
        catch { setStatus('Error', 'Discord sent an unreadable gateway event.'); }
      });
      current.addEventListener('error', () => {
        if (current === socket) setStatus('Reconnecting', 'Connection to Discord failed; retrying.');
      });
      current.addEventListener('close', event => {
        if (current !== socket) return;
        socket = null; resetHeartbeat();
        if ([4004, 4013, 4014].includes(event.code)) {
          stopped = true;
          token = '';
          clearVolatile();
          setStatus('Error', event.code === 4004 ? 'Discord rejected the bot token.' : 'Discord rejected the bot intents. Check the Bot settings and privileged intent setup.');
          return;
        }
        clearVolatile();
        scheduleReconnect();
      });
    } catch {
      setStatus('Error', 'Could not open a Discord Gateway connection.');
      scheduleReconnect();
    }
  };
  const start = (credentials, id) => {
    stop();
    if (typeof credentials !== 'string' || credentials.length < 20 || credentials.length > 512) throw new Error('Enter a valid Discord bot token.');
    if (!SNOWFLAKE.test(String(id || ''))) throw new Error('Enter your Discord user ID (17–20 digits).');
    token = credentials; userId = String(id); stopped = false; reconnects = 0;
    clearVolatile(); open();
  };
  const stop = () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null; resetHeartbeat(); closeSocket(); token = '';
    clearVolatile(); setStatus('Disconnected');
  };
  const fail = message => {
    stopped = true; token = ''; closeSocket(); resetHeartbeat(); clearVolatile();
    setStatus('Error', String(message || 'Discord connection failed.'));
  };
  return { start, stop, status: makeState, fail, refresh: publish, validateUserId: id => SNOWFLAKE.test(String(id || '')) };
}

module.exports = { create, userAvatar };

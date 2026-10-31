// Multi-user bridge: app connects to  ws://HOST:PORT/?user=TIKTOK_USERNAME
// Server then joins that user's TikTok Live and forwards gifts/likes/comments.
const http = require('http');
const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');

const PORT = process.env.PORT || 8080;
const MAX_CLIENTS = 25;

const server = http.createServer((req, res) => { res.writeHead(200); res.end('TikTok bridge OK'); });
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const send = o => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); };
  const url = new URL(req.url, 'http://localhost');
  const user = (url.searchParams.get('user') || '').replace(/^@/, '').trim();

  if (!user) { send({ type: 'status', msg: 'Username missing' }); return ws.close(); }
  if (wss.clients.size > MAX_CLIENTS) { send({ type: 'status', msg: 'Server busy' }); return ws.close(); }

  // user=mock -> fake events for testing the bridge itself
  if (user === 'mock') {
    send({ type: 'status', msg: 'Mock events' });
    const names = ['ali', 'sara', 'ahmed', 'zain'];
    const pick = () => names[Math.floor(Math.random() * names.length)];
    const t1 = setInterval(() => send({ type: 'chat', user: pick(), comment: Math.random() < 0.5 ? '1' : '2' }), 1500);
    const t2 = setInterval(() => send({ type: 'like', user: pick(), count: 1 + Math.floor(Math.random() * 10) }), 400);
    const t3 = setInterval(() => send({ type: 'gift', user: pick(), gift: 'Rose', diamonds: [1, 5, 30, 100][Math.floor(Math.random() * 4)] }), 3000);
    ws.on('close', () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); });
    return;
  }

  const tk = new WebcastPushConnection(user);
  tk.connect()
    .then(() => send({ type: 'status', msg: 'Connected to @' + user }))
    .catch(e => { send({ type: 'status', msg: 'Failed: ' + (e.message || e) + ' (user live hai?)' }); ws.close(); });

  tk.on('chat', d => send({ type: 'chat', user: d.uniqueId, comment: d.comment }));
  tk.on('like', d => send({ type: 'like', user: d.uniqueId, count: d.likeCount }));
  tk.on('gift', d => {
    if (d.giftType === 1 && !d.repeatEnd) return;   // streak still running
    send({ type: 'gift', user: d.uniqueId, gift: d.giftName, diamonds: (d.diamondCount || 0) * (d.repeatCount || 1) });
  });
  tk.on('disconnected', () => { send({ type: 'status', msg: 'Live ended' }); ws.close(); });

  ws.on('close', () => { try { tk.disconnect(); } catch (e) {} });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Bridge running on port ' + PORT);
  const nets = require('os').networkInterfaces();
  for (const n of Object.values(nets)) for (const i of n)
    if (i.family === 'IPv4' && !i.internal) console.log('Phone app ke Server field mein:  ws://' + i.address + ':' + PORT);
});

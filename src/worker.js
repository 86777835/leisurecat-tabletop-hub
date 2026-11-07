// 桌游小助手总入口：静态页面 + 两个接口
//   /api/pick     AI 帮忙选游戏（DeepSeek，不行就用 Workers AI 上的 Qwen）
//   /api/reviews  各助手站终局后的玩家评分与评论（存在 Reviews Durable Object 里）
import { DurableObject } from 'cloudflare:workers';
import GAMES from '../public/games.json';

const KEYS = new Set(GAMES.map(g => g.key));
const HOST_OK = /^https:\/\/([a-z0-9-]+\.)?leisurecat\.cloud$|^http:\/\/localhost(:\d+)?$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/reviews')) return reviews(req, env, url);
    if (url.pathname === '/api/ask' && req.method === 'POST') return ask(req, env);
    if (url.pathname === '/api/pick' && req.method === 'POST') return pick(req, env);
    return new Response('Not found', { status: 404 });
  }
};

// Only service bindings: this endpoint never calls a model or public site.
const ASK_BINDINGS = {
  pgh: 'ASK_PGH', bham: 'ASK_BHAM', odin: 'ASK_ODIN', tl: 'ASK_TL',
  arnak: 'ASK_ARNAK', botc: 'ASK_BOTC', avalon: 'ASK_AVALON',
  'dune-imperium': 'ASK_DUNE', 'dune-uprising': 'ASK_DUNE', 'ark-nova': 'ASK_ARK',
  'sakura-arms': 'ASK_SAKURA'
};
async function ask(req, env) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: '请求必须是 JSON 格式' }, { status: 400 }); }
  const game = GAMES.find(g => g.key === body?.game && g.url);
  if (!game) return Response.json({ error: '这款游戏没有已收录的规则助手，请选择有助手的游戏' }, { status: 400 });
  let messages = body.messages;
  if (game.key.startsWith('dune-')) {
    if (!Array.isArray(messages) || !messages.length || messages.at(-1)?.role !== 'user' || typeof messages.at(-1).content !== 'string')
      return Response.json({ error: '问题格式不对，最后一条必须是用户问题' }, { status: 400 });
    const version = game.key === 'dune-imperium' ? '基础版' : '起义';
    messages = messages.map((m, i) => i === messages.length - 1 ? { ...m, content: `（版本：${version}）${m.content}` } : m);
  }
  const service = env[ASK_BINDINGS[game.key]];
  if (!service) return Response.json({ error: '规则助手服务尚未连接，请稍后再试' }, { status: 503 });
  const headers = new Headers({ 'content-type': 'application/json' });
  const ip = req.headers.get('cf-connecting-ip');
  if (ip) headers.set('cf-connecting-ip', ip);
  try {
    return await service.fetch(new Request('https://rules.internal/api/chat', {
      method: 'POST', headers, body: JSON.stringify({ messages }), signal: req.signal
    }));
  } catch {
    return Response.json({ error: '规则助手连接失败，请稍后再试' }, { status: 503 });
  }
}

// ---------- reviews ----------
// Any of our sites may post and read, so answer CORS for *.leisurecat.cloud.
function cors(req, res) {
  const o = req.headers.get('origin');
  if (o && HOST_OK.test(o)) {
    res = new Response(res.body, res);   // responses from the Durable Object have read-only headers
    res.headers.set('access-control-allow-origin', o);
    res.headers.set('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.headers.set('access-control-allow-headers', 'content-type');
    res.headers.set('vary', 'origin');
  }
  return res;
}

async function reviews(req, env, url) {
  if (req.method === 'OPTIONS') return cors(req, new Response(null, { status: 204 }));
  const db = env.REVIEWS.get(env.REVIEWS.idFromName('all'));
  if (req.method === 'GET') {
    const game = url.searchParams.get('game');
    if (game && !KEYS.has(game)) return cors(req, Response.json({ error: '没有这款游戏' }, { status: 404 }));
    return cors(req, await db.fetch('https://reviews/' + (game ? 'list?game=' + game : 'summary')));
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { success } = await env.REVIEW_LIMIT.limit({ key: req.headers.get('cf-connecting-ip') || 'local' });
  if (!success) return cors(req, Response.json({ error: '提交得有点快，请过一分钟再试' }, { status: 429 }));
  let b;
  try { b = await req.json(); } catch { b = null; }
  const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
  const r = b && { game: b.game, stars: b.stars, name: clean(b.name, 20), text: clean(b.text, 300), room: clean(b.room, 8) };
  if (!r || !KEYS.has(r.game) || !Number.isInteger(r.stars) || r.stars < 1 || r.stars > 5 || !r.name)
    return cors(req, Response.json({ error: '评价格式不对，请刷新页面再试' }, { status: 400 }));
  return cors(req, await db.fetch('https://reviews/add', { method: 'POST', body: JSON.stringify(r) }));
}

// One object holds every review (small volume): a SQLite table.
export class Reviews extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS r (game TEXT, room TEXT, name TEXT, stars INTEGER, text TEXT, at INTEGER,
      PRIMARY KEY (game, room, name))`);
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/add') {
      const r = await req.json();
      // one review per player per game record (same room + name): a second post replaces the first
      this.sql.exec('INSERT OR REPLACE INTO r VALUES (?,?,?,?,?,?)', r.game, r.room, r.name, r.stars, r.text, Date.now());
      return Response.json({ ok: true, ...this.stat(r.game) });
    }
    if (url.pathname === '/list') {
      const game = url.searchParams.get('game');
      const items = this.sql.exec('SELECT name, stars, text, at FROM r WHERE game = ? ORDER BY at DESC LIMIT 50', game).toArray();
      return Response.json({ ...this.stat(game), items });
    }
    const out = {};
    for (const row of this.sql.exec('SELECT game, AVG(stars) a, COUNT(*) n FROM r GROUP BY game')) out[row.game] = { avg: Math.round(row.a * 10) / 10, count: row.n };
    return Response.json(out);
  }
  stat(game) {
    const dist = [0, 0, 0, 0, 0];
    let n = 0, sum = 0;
    for (const row of this.sql.exec('SELECT stars, COUNT(*) c FROM r WHERE game = ? GROUP BY stars', game)) { dist[row.stars - 1] = row.c; n += row.c; sum += row.stars * row.c; }
    return { avg: n ? Math.round(sum / n * 10) / 10 : 0, count: n, dist };
  }
}

// ---------- AI pick ----------
// Same order as the rules assistants: DeepSeek V4.1 Flash first, Qwen on Workers AI when DeepSeek is busy or has no key.
const PICK_MODELS = ['deepseek-flash', '@cf/qwen/qwen3.8-27b'];
const PICK_TIMEOUT_MS = 12000;
const PICK_SYSTEM = `你是桌游推荐助手。玩家会描述这局的情况（几个人、想玩多久、喜欢什么），你只能从下面的游戏里挑。
给每款游戏打 0–100 的推荐指数，挑出最合适的一款，并用一句中文说明理由（不超过 40 字，要具体到玩家说的情况）。
人数不在游戏支持范围内的，推荐指数不超过 20。
只输出 JSON，格式：{"pick":"游戏key","scores":{"游戏key":数字,...},"reason":"理由"}

游戏列表：
${GAMES.map(g => `- key=${g.key}｜${g.zh}（${g.en}）｜${g.players[0]}–${g.players[1]} 人｜${g.time[0]}–${g.time[1]} 分钟｜重度 ${g.weight}｜${g.tags.join('、')}｜${g.intro}`).join('\n')}`;

async function pick(req, env) {
  const { success } = await env.PICK_LIMIT.limit({ key: req.headers.get('cf-connecting-ip') || 'local' });
  if (!success) return Response.json({ error: '问得有点快，请过一分钟再问' }, { status: 429 });
  let text;
  try { text = String((await req.json()).text || '').trim(); } catch { text = ''; }
  if (!text || text.length > 300) return Response.json({ error: '先说说这局的情况（300 字以内）' }, { status: 400 });
  const messages = [{ role: 'system', content: PICK_SYSTEM }, { role: 'user', content: text }];
  for (const model of PICK_MODELS) {
    if (!model.startsWith('@cf/') && !env.DEEPSEEK_API_KEY) { console.log('pick: no DeepSeek key, skipped', model); continue; }
    try {
      const raw = await withTimeout(model.startsWith('@cf/')
        ? env.AI.run(model, { messages, max_tokens: 500, temperature: 0.4, chat_template_kwargs: { enable_thinking: false } }).then(r => r.response ?? r.choices?.[0]?.message?.content)
        : fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
            body: JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.4, thinking: { type: 'disabled' }, response_format: { type: 'json_object' } })
          }).then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); return (await r.json()).choices[0].message.content; }));
      const out = parsePick(typeof raw === 'string' ? raw : JSON.stringify(raw));
      if (!out) { console.log('pick: unusable answer', model, String(raw).slice(0, 300)); continue; }
      if (model !== PICK_MODELS[0]) console.log('pick: answered by', model);
      return Response.json(out);
    } catch (e) {
      console.log('pick: model failed', model, String(e).slice(0, 300));
    }
  }
  return Response.json({ error: 'AI 暂时没空，先用条件筛选试试' }, { status: 502 });
}

const withTimeout = (p, ms = PICK_TIMEOUT_MS) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

// The answer must name one of our games; scores are clamped to 0–100. Anything else counts as a failed answer.
function parsePick(s) {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j;
  try { j = JSON.parse(m[0]); } catch { return null; }
  if (!KEYS.has(j.pick) || typeof j.reason !== 'string') return null;
  const scores = {};
  for (const k of KEYS) { const v = Number(j.scores?.[k]); scores[k] = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0; }
  return { pick: j.pick, scores, reason: j.reason.slice(0, 80) };
}

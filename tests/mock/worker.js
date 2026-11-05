const event = j => `data: ${JSON.stringify(j)}\n\n`;
const delta = content => event({ choices: [{ delta: { content } }] });
export default {
  async fetch(req, env) {
    if (new URL(req.url).pathname !== '/api/chat') return new Response('wrong path', { status: 404 });
    const { messages } = await req.json();
    const question = messages.at(-1).content;
    for (const status of [429, 503]) if (question.includes(`mock${status}`))
      return Response.json({ error: `模拟下游错误 ${status}` }, { status, headers: { 'x-mock-status': String(status) } });
    const info = JSON.stringify({ game: env.GAME, question, messages, ip: req.headers.get('cf-connecting-ip') });
    const enc = new TextEncoder();
    const body = new ReadableStream({
      async start(c) {
        if (question.includes('mocktimeout')) { await new Promise(r => setTimeout(r, 31000)); c.close(); return; }
        if (question.includes('mockreset')) {
          c.enqueue(enc.encode(delta('这段旧回答必须消失')));
          await new Promise(r => setTimeout(r, 250));
          c.enqueue(enc.encode(event({ reset: 'mock-model-hidden' })));
        }
        if (question.includes('mockerror')) { c.enqueue(enc.encode(event({ error: '模拟流内错误' }))); c.close(); return; }
        c.enqueue(enc.encode(delta(info)));
        if (!question.includes('mockdrop')) c.enqueue(enc.encode('data: [DONE]\n\n'));
        c.close();
      }
    });
    return new Response(body, { headers: { 'content-type': 'text/event-stream', 'x-mock': env.GAME } });
  }
};

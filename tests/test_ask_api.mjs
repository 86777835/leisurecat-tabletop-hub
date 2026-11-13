import assert from 'node:assert/strict';
const base = 'http://localhost:8811';
const post = body => fetch(base + '/api/ask', {method:'POST', headers:{'content-type':'application/json','cf-connecting-ip':'203.0.113.19'},body:JSON.stringify(body)});
for (const game of ['bad', 'wingspan', '__proto__', null]) { const r = await post({game}); assert.equal(r.status,400); assert.match((await r.json()).error,/规则助手/); }
for (const game of ['pgh','bham','odin','tl','arnak','botc','avalon','dune-imperium','dune-uprising','ark-nova','sakura-arms','castles-of-burgundy','flip7','seti','gwt-new-zealand']) {
 const messages = [{role:'user',content:'之前的问题'},{role:'assistant',content:'之前的回答'},{role:'user',content:'现在的问题',extra:'preserved'}];
 const r = await post({game,messages}); assert.equal(r.status,200);
 const raw = await r.text(); const data = JSON.parse(JSON.parse(raw.split('\n')[0].slice(6)).choices[0].delta.content);
 assert.equal(data.ip,'203.0.113.19'); assert.equal(data.game,game.startsWith('dune-')?'dune':game);
 const expected = structuredClone(messages);
 if(game.startsWith('dune-')) expected.at(-1).content = `（版本：${game === 'dune-imperium'?'基础版':'起义'}）现在的问题`;
 assert.deepEqual(data.messages,expected);
}
for (const status of [429,503]) { const r=await post({game:'pgh',messages:[{role:'user',content:`mock${status}`}]}); assert.equal(r.status,status);assert.equal(r.headers.get('x-mock-status'),String(status));assert.deepEqual(await r.json(),{error:`模拟下游错误 ${status}`}); }
console.log('PASS API：非法 game、九游戏绑定、IP、消息保真、两版前缀、429/503 原样透传');

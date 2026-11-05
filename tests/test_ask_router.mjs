import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchGames, routeQuestion } from '../public/ask-router.js';
const games = JSON.parse(readFileSync(new URL('../public/games.json', import.meta.url)));
const samples = {
 pgh: ['匹兹堡贷款', '重型火车', '皇冠明珠'], bham: ['伯明翰贷款', '商人啤酒', '农场酿酒厂'],
 odin: ['奥丁', '维京', '庭之惩罚'], tl: ['惨剧', '剧作家', '轮回'], arnak: ['阿纳克', '神像槽', '恐惧卡'],
 botc: ['血染', '说书人', '魔典'], avalon: ['阿瓦隆', '梅林', '派西维尔'],
 'dune-imperium': ['沙丘基础版', '沙丘帝国原版', 'Dune base'], 'dune-uprising': ['起义', '沙虫', 'Dune Uprising'],
 'ark-nova': ['方舟动物园怎么开局', '保护点数怎么换算', '海洋世界换哪些牌']
};
for (const [key, qs] of Object.entries(samples)) for (const q of qs) assert.deepEqual(matchGames(q, games), [key], q);
for (const q of ['工业革命运河时代怎么结束', '工业革命', '运河']) assert.deepEqual(matchGames(q, games), ['pgh', 'bham']);
for (const q of ['回合', '计分', '领袖', '角色', '刺客', '随便问问']) assert.deepEqual(matchGames(q, games), []);
assert.deepEqual(matchGames('沙丘', games), ['dune-imperium', 'dune-uprising']);
assert.deepEqual(matchGames('梅林和说书人', games), ['botc', 'avalon']);
assert.equal(routeQuestion('那怎么计分', games, 'odin').key, 'odin');
assert.equal(routeQuestion('梅林呢', games, 'odin').key, 'avalon');
assert.equal(routeQuestion('如何计分', games).keys.length, games.filter(g => g.url).length);
for (const g of games.filter(g => !g.url)) for (const q of [g.zh, g.en.toLowerCase()]) assert.equal(routeQuestion(q, games, 'pgh').kind, 'unavailable', q);
assert.deepEqual(matchGames('grassroots', games), []);
console.log(`PASS 路由：${Object.values(samples).flat().length} 个专属样例、共享词、追问、版本、${games.filter(g => !g.url).length} 款未收录中英文名`);

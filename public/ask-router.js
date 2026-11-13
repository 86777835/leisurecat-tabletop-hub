// Exclusive terms from each site's tools/讲解稿.md and tools/faq.json.
export const ALIASES = {
  pgh: ['匹兹堡', 'pittsburgh', '石油城', '重型火车', '皇冠明珠'],
  bham: ['伯明翰', 'birmingham', '商人啤酒', '农场酿酒厂'],
  odin: ['奥丁', 'odin', '维京', '庭之广场', '庭之惩罚'],
  tl: ['惨剧', 'tragedy looper', '剧作家', '轮回', '不安限度'],
  arnak: ['阿纳克', 'arnak', '神像槽', '恐惧卡'],
  botc: ['血染', 'clocktower', '说书人', '魔典', '幽灵票', '暗流涌动'],
  avalon: ['阿瓦隆', 'avalon', '梅林', '派西维尔', '湖中仙女'],
  'dune-imperium': ['沙丘基础版', '沙丘帝国基础版', 'dune base'],
  'dune-uprising': ['起义', 'uprising', '沙虫'],
  'ark-nova': ['方舟', 'ark nova', '魅力', '保护点数', '保护项目', '海洋世界', '饲养区'],
  'sakura-arms': ['散樱', '乱武', 'sakura arms', 'furuyoni', 'ふるよに', '眼前构筑', '樱花结晶', '畏缩', '三拾一捨'],
  'castles-of-burgundy': ['勃艮第', '勃根地', '勃艮地', 'burgundy', '公国版图', '补给区', '修道院', '银矿', '盾徽', '3bd'],
  flip7: ['7连翻', '七连翻', '翻转7', '翻7', 'flip 7', 'flip7', '连翻三张', '卷土重来', '不许动', '冤家路窄'],
  seti: ['星空觅迹', 'seti', '群星计画', 'space agencies', '探寻地外文明', '外星生物', '奥陌陌', '半人马族', '太阳系公转', '着陆器', '金色计分板块'],
  'gwt-new-zealand': ['新西兰开拓史', '大西部开拓者', '新西兰', '运羊', '剪羊毛', '剃毛', '港务长', '罗姆尼羊', 'gwt nz', 'great western trail new zealand']
};
const normalize = s => s.toLowerCase().replace(/[：:·–—()（）]/g, ' ').replace(/\s+/g, ' ').trim();
function contains(text, term) {
  const t = normalize(term);
  if (/^[a-z0-9 ]+$/.test(t)) return new RegExp(`(?<![a-z0-9])${t}(?![a-z0-9])`).test(text);
  return text.includes(t);
}
export function matchGames(question, games) {
  const text = normalize(question);
  const hits = new Set();
  for (const g of games) {
    if (g.key.startsWith('dune-')) continue;
    const names = [g.zh, g.en, ...(!g.url ? g.zh.split(/[（）]/).filter(Boolean) : ALIASES[g.key] || [])];
    if (names.some(t => contains(text, t))) hits.add(g.key);
  }
  const dune = /沙丘|\bdune\b/.test(text);
  const base = dune && /基础|原版|\bbase\b/.test(text);
  const uprising = ALIASES['dune-uprising'].some(t => contains(text, t));
  if (base) hits.add('dune-imperium');
  if (uprising) hits.add('dune-uprising');
  if (dune && !base && !uprising) { hits.add('dune-imperium'); hits.add('dune-uprising'); }
  // Shared series terms narrow candidates, never select a single title.
  if (!hits.size && /工业革命|运河|\bbrass\b/.test(text)) { hits.add('pgh'); hits.add('bham'); }
  return games.filter(g => hits.has(g.key)).map(g => g.key);
}
export function routeQuestion(question, games, current = null) {
  const hits = matchGames(question, games);
  const unavailable = hits.filter(k => !games.find(g => g.key === k).url);
  if (unavailable.length) return { kind: 'unavailable', keys: unavailable };
  if (hits.length === 1) return { kind: 'send', key: hits[0] };
  if (!hits.length && current) return { kind: 'send', key: current };
  return { kind: 'choose', keys: hits.length ? hits : games.filter(g => g.url).map(g => g.key) };
}

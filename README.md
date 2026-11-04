<div align="center">

# 桌游小助手

**线下开局、计分、规则问答，一桌人扫码同步**

所有桌游助手的总入口：用立体转盘选游戏，旁边配了“帮我选游戏”“定先后手”两个通用工具，还能看玩家评价。

**[立即使用 → boardgame.leisurecat.cloud](https://boardgame.leisurecat.cloud)**

<img src="预览_手机.png" width="260" alt="首页"> <img src="预览_电脑.png" width="420" alt="首页（电脑）">

</div>

---

## 已有的助手

| 游戏 | 地址 | 代码 |
|---|---|---|
| 工业革命：匹兹堡 | https://pgh.leisurecat.cloud | [brass-pittsburgh-helper](https://github.com/86777835/brass-pittsburgh-helper) |
| 工业革命：伯明翰 | https://bham.leisurecat.cloud | [brass-birmingham-helper](https://github.com/86777835/brass-birmingham-helper) |
| 奥丁的盛宴 | https://odin.leisurecat.cloud | [feast-for-odin-helper](https://github.com/86777835/feast-for-odin-helper) |
| 惨剧轮回 · 剧作家助手 | https://tl.leisurecat.cloud | [tragedy-looper-helper](https://github.com/86777835/tragedy-looper-helper) |

| 血染钟楼 | https://botc.leisurecat.cloud | [blood-on-the-clocktower-helper](https://github.com/86777835/blood-on-the-clocktower-helper) |

## 功能

- **立体转盘**：各游戏的官方盒封面做成立体盒子，摆在转盘上。左右滑动（电脑上可用方向键或滚轮）转动转盘，轻触正中的盒子，封面放大并虚化，然后进入对应的助手。
- **帮我选游戏**（右上角）：游戏库共 26 款，数据来自 BGG，有助手的可以直接进入。
  - 按条件选：选人数、时长、难度、类型，每款游戏得到一个 0–99 的推荐指数。
  - 随便来一个：随机抽一款。
  - 问 AI：用一句话描述这局的情况，AI 按推荐指数展示列表，首选默认展开。
  - 按条件直接展示列表，人数和助手范围为硬条件，其余条件影响推荐指数；只有随机使用抽盲盒动画。
- **定先后手**（左上角）：任何桌游都能用。
  - 手指轮盘：每人一根手指按住屏幕，人齐后按住 1.5 秒，光圈轮转，最后显示 1、2、3…
  - 随机排序：填好名字，像从袋子里摸棋子一样，一个个抽出顺序。
- **玩家评价**：每个助手的结算页都能给游戏打 1–5 星并写评论。首页游戏名下显示平均分和评价数，点开能看到星级分布和全部评论。
- **海报**：`海报/` 里有带二维码的总入口海报，2480×3720 高清版和手机版。源文件在 `海报/源文件/poster.html`。

## 技术实现

纯静态页面 + Cloudflare Worker，没有构建步骤，没有框架。

| 部分 | 说明 |
|---|---|
| `public/index.html` | 转盘首页：CSS 3D 盒子和转盘，拖动带惯性，进入时有放大虚化过渡 |
| `public/games.json` | 游戏库。带 `url` 的是有助手的游戏，会出现在转盘上；`box` 是真实盒子尺寸（cm） |
| `public/picker.js` | 帮我选游戏：推荐指数算法、抽盲盒动画 |
| `public/order.js` | 定先后手：多点触控的手指轮盘、袋子抽签 |
| `public/reviews.js` | 评价列表 |
| `src/worker.js` | `/api/reviews`：评价存在 `Reviews` Durable Object（SQLite）里，允许 `*.leisurecat.cloud` 跨域；`/api/pick`：AI 选游戏，先用 DeepSeek，不行再用 Workers AI 上的 Qwen，回答只能是游戏库里的游戏 |

### 评价接口

```
POST /api/reviews   { game, stars: 1-5, name, text, room }   同一局同一玩家再次提交会覆盖
GET  /api/reviews?game=pgh                                  → { avg, count, dist[5], items[] }
GET  /api/reviews                                           → { pgh: { avg, count }, ... }
```

## 本地开发与部署

```bash
wrangler dev --port 8811     # 本地运行
wrangler deploy              # 部署
```

AI 选游戏要用 DeepSeek 时，运行 `wrangler secret put DEEPSEEK_API_KEY --name leisurecat-tabletop-hub` 填入密钥。没有密钥时只用 Workers AI。

## 测试

需要本机装有 Chrome，并执行 `npm i playwright-core`。

```bash
node tests/test_turntable.mjs http://localhost:8811/   # 转盘：滑动、方向键、点侧边、循环、进入、返回（不写数据，也可以对线上跑）
node tests/test_tools.mjs     http://localhost:8811/   # 评价、选游戏（AI 用模拟返回）、袋子抽签、三指轮盘（只能对本地跑，会写测试评价）
```

整个系列的约定和待办见 [docs/系列交接说明.md](docs/系列交接说明.md)。

## 声明

- 这是非官方的玩家工具，不提供游戏本体。
- 游戏名称、规则和游戏盒封面的权利归各原出版方所有；背景插画为原创生成。

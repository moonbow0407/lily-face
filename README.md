# 捏捏莉莉

《鸣潮》莉莉的捏脸小网页：戳脸、单手 / 双手拉脸、捧脸，还有一首歌的音游。
three.js + MMD（PMX）模型，Vite 构建，Cloudflare Pages 部署。

和 [捏捏达妮娅](https://github.com/moonbow0407/daniya-face) 是同一套引擎的姊妹项目，两个仓库各自独立维护。
玩法和动效参考了 [菲比捏脸模拟器](https://phoebe-face-lab.vercel.app/)。

## 玩法

| 工具 | 操作 |
| --- | --- |
| 戳脸 | 点脸颊：闭眼笑一下，笑容停一会儿；连戳会越来越为难，戳太多会生气冒 💢 |
| 单手拉脸 | 按住脸颊往外拖：闭眼笑；偶尔是嫌弃生气的半眼 + 💢 |
| 双手拉脸 | 闭眼笑；偶尔笑着张嘴 |
| 捧脸 | 按住：先惊讶 → 害羞 → 闭眼陶醉（偶尔是星星眼）；按住画圈是揉脸，揉久了会晕（星星眼 + 乱线团）；松手眯眼一笑 |
| 音游 | 《しゅわしゅわハニーレモン350ml》：圆音符点一下（捏一下），长条按住（捏住）到尾巴松手；支持空格 / D / F / J / K |

拉久了松手会鼓嘴生闷气。滚轮 / 双指捏合缩放，左上角可以开关音效。

## 本地运行

素材有版权，**不在仓库里**，需要自己准备好放到对应位置：

| 文件 | 说明 |
| --- | --- |
| `public/models/lily/lily.pmx`（及 `tex/` 贴图） | 鸣潮_莉莉0.5 by 1010浣（模之屋）。禁止二次配布，请遵守模型附带的使用说明 |
| `public/music/honey-lemon-350ml.mp3` | 音游免费 BGM《しゅわしゅわハニーレモン350ml》（しゃろう / DOVA-SYNDROME） |
| `public/sfx/pull-tension.wav`、`pull-rub.wav`、`pull-release.wav` | 拉脸音效采样；缺了拉脸就不出声，其它不受影响 |
| `public/finale-lily.jpg` | 音游结算图 |

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

换模型或改了骨骼后，在 `npm run dev` 下打开 `http://localhost:5173/?bake`，烘焙完会自动写入 `src/characters/lily/hairRest.json`（头发的静止姿势）。

部署：`./deploy.ps1`（预览）或 `./deploy.ps1 -Prod`（正式）。本地构建后上传到 Cloudflare Pages，模型等素材随 `dist` 一起上传；项目名取 `site.json`。

## 技术

- Vite + three.js 0.170（MMDLoader 读 PMX 模型，OutlineEffect 描边）
- 脸颊形变全在 GPU 着色器里（`src/rig/`）：戳的冲击场、拉扯的软垫场、回弹弹簧，只作用在脸部皮肤；眼睛、睫毛跟着戳一起凹；垂在脸颊前的前发只在快穿模时被推开
- 表情 = 模型自带的表情 morph 组合：引擎算通用的情绪信号（`src/expression/signals.js`），莉莉的表情表（`src/characters/lily/expressions.js`）把信号换成表情；💢、乱线团这类漫画符号是模型自带的顶点表情，缩小、挪到头边并重新上色（`src/rig/vertexSymbols.js`）
- 头发的静止姿势是离线跑一次物理烘焙出来的（`hairRest.json`），运行时不开物理，不穿模、不飘
- 音效：拉脸用采样，其它用 Web Audio 现场合成（`src/audio/sfx.js`）
- 音游：`src/rhythm/`，谱面在 `src/rhythm/charts/`

### 目录结构

```
src/
  main.js            入口：加载 → 装配 → 主循环
  characters/lily/   莉莉的配置：model 模型层 / personality + expressions 性格层 / presentation + theme 呈现层
  core/              渲染舞台与镜头、加载界面与模型加载、模型准备、骨骼姿势
  rig/               参考坐标校准、形变 uniform、着色器、弹簧、点击检测、漫画符号
  interaction/       指针 / 键盘输入、交互状态、拉扯物理
  expression/        情绪信号、表情驱动（语义名 → morph）、头部动作与眨眼
  rhythm/            音游判定、界面、播放器、charts/ 谱面
  audio/  ui/        音效；工具栏、主题与样式
```

站点级设置（左上角链接、部署项目名、统计）在 `site.json`。

## 致谢与版权

- 玩法、脸部形变公式、音游谱面与拉脸音效参考 / 来自 [phoebe-face-lab](https://phoebe-face-lab.vercel.app/)
- 角色版权归库洛游戏所有，模型版权归 1010浣 所有；本项目仅为同人爱好，不作商用
- 音游 BGM：《しゅわしゅわハニーレモン350ml》© しゃろう（[OpenTracks / DOVA-SYNDROME](https://opentracks.com/bgm/detail/14621) 免费素材）

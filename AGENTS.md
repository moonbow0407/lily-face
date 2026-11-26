# AGENTS.md

给编码 agent 的项目说明（任何模型、任何工具通用）。

## 项目

捏捏莉莉：《鸣潮》莉莉的捏脸网页。three.js + MMD（PMX）模型，戳脸、拉脸、捧脸、音游。Vite 构建，Cloudflare Pages 部署。
和捏捏达妮娅（daniya-face）是同一套引擎的姊妹项目，两个仓库独立维护，引擎代码目前各自一份。
模型、音乐、图片等素材有版权，不在仓库里（见 README 的"本地运行"）。

## 常用命令

```bash
npm install
npm run dev                      # 开发服务器 http://localhost:5173
npm run build                    # 构建到 dist/
```

## 目录

- `src/characters/lily/`：莉莉的配置（模型层 / 性格层 / 呈现层）
- `src/` 其它目录是引擎（与角色无关），结构见 README 的"目录结构"
- `site.json`：站点设置（默认角色、左上角链接、部署项目名、统计 token）

## 约定

- 代码注释和文档用中文。
- 单个源文件尽量不超过 ~300 行；角色专属的名字（材质、骨骼、表情名）只能出现在 `src/characters/` 里。
- 改完运行 `npm run build`，并在浏览器里确认效果。
- 提交、推送、部署只在用户要求时做。

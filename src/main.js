/*
 * 入口：选角色 → 加载模型 → 装配各模块 → 预热 → 主循环。
 * 目录：
 *   characters/  角色配置：model 模型层 / personality 性格层 / presentation 呈现层
 *   core/        渲染舞台、加载、模型准备、骨骼姿势
 *   rig/         脸颊形变（参考坐标、uniform、着色器、弹簧、点击检测、漫画符号）
 *   interaction/ 输入、交互状态、拉扯物理
 *   expression/  情绪信号、表情驱动、头部动作、眨眼（表情表本身在角色的 personality 里）
 *   rhythm/      音游（判定、界面、播放器、谱面）
 *   audio/ ui/   音效；工具栏、主题与样式
 */
import * as THREE from 'three';
import { pickCharacter } from './characters/index.js';
import { createStage } from './core/stage.js';
import { createLoadingScreen, applyCharacterText, loadModel, loadAmmo } from './core/loading.js';
import { prepareModel } from './core/model.js';
import { setupPose } from './core/pose.js';
import { configureRig, uniforms } from './rig/uniforms.js';
import { calib } from './rig/calibration.js';
import { PokeField } from './rig/springs.js';
import { createInteractionState } from './interaction/state.js';
import { createInput } from './interaction/input.js';
import { updatePull } from './interaction/pull.js';
import { usedMorphNames } from './expression/morphs.js';
import { createFace, prepareSymbols } from './expression/face.js';
import { createRhythm, NO_RHYTHM } from './rhythm/index.js';
import { Sfx } from './audio/sfx.js';
import { setupToolbar } from './ui/toolbar.js';
import { applyTheme } from './ui/theme.js';
import { setupSiteLinks, setupPortals, setupAnalytics } from './ui/site.js';

const cfg = pickCharacter();
const { model: modelCfg, personality, presentation } = cfg;
const BAKE = new URLSearchParams(location.search).has('bake');
const app = document.querySelector('#app');

setupSiteLinks();
setupPortals(app);
setupAnalytics();
applyCharacterText(presentation);
applyTheme(presentation.theme);
configureRig(modelCfg);
const loading = createLoadingScreen(app);
const stage = createStage(document.querySelector('#stage'), modelCfg.camera, presentation.outline);

// ---------- 加载 ----------
let mesh, uvMorphData;
try {
  let texturesReady;
  [{ mesh, uvMorphData, texturesReady }] = await Promise.all([
    loadModel({
      url: modelCfg.file, sizeHint: modelCfg.bytes, texDir: modelCfg.texDir, progress: loading.progress,
      keepMorphs: usedMorphNames(modelCfg),
    }),
    BAKE ? loadAmmo() : null,
  ]);
  loading.setLabel(presentation.text.textures);
  await texturesReady;
  loading.progress.tex = 1;
} catch (err) {
  console.error(err);
  loading.setLabel(presentation.text.failed);
  throw err;
}
loading.setLabel(presentation.text.preparing);

// ---------- 装配 ----------
const model = prepareModel({ mesh, uvMorphData, scene: stage.scene, materials: modelCfg.materials });
const pose = await setupPose({
  mesh, bones: modelCfg.bones, hairRest: modelCfg.hairRest, bake: BAKE,
  onBakeProgress: (f) => { loading.progress.prep = 0.6 * f; },
});
mesh.updateMatrixWorld(true);
// 开发服务器上烘焙完直接写回角色目录的 hairRest.json（见 vite.config.js）
if (BAKE && import.meta.env.DEV) {
  // 写文件会触发开发服务器整页刷新：先去掉地址里的 ?bake，免得刷新后又烘焙一遍、循环写入
  const url = new URL(location.href);
  url.searchParams.delete('bake');
  history.replaceState(null, '', url);
  fetch(`/__port/hair-rest?char=${cfg.id}`, { method: 'POST', body: window.__bakedHairRest })
    .then((r) => r.text().then((t) => (r.ok ? console.info(`[bake] 已写入 src/characters/${cfg.id}/hairRest.json（${t}）`) : Promise.reject(t))))
    .catch((e) => console.error(`[bake] 写入失败，请手动复制 window.__bakedHairRest：${e}`))
    .finally(() => { window.__bakeDone = true; });
}

const sfx = new Sfx(cfg.id);
const s = createInteractionState(personality);
const pokes = new PokeField();
const symbols = prepareSymbols(mesh, modelCfg.materials.symbol, personality.eggs);
const debug = { morphs: null, egg: null, roll: null }; // 调试：直接指定表情（语义名）/ 彩蛋 / 变体随机数
const ctx = { cfg, app, stage, mesh, model, pose, s, pokes, sfx, symbols, debug, rhythm: null };

const { rhythmButton } = setupToolbar({ sfx, s, actions: personality.actions });
const input = createInput(ctx);
const updateFace = createFace(ctx);

// 音游轨道起点：右脸颊外侧（画面右侧）。绑定姿态坐标 → 跟着头动 → 投影到屏幕
const _anchor = new THREE.Vector3();
const rhythmCfg = personality.actions.rhythm;
ctx.rhythm = !rhythmCfg ? NO_RHYTHM : createRhythm({
  root: app,
  button: rhythmButton,
  song: rhythmCfg.song,
  hint: rhythmCfg.hint,
  storagePrefix: cfg.id,
  images: presentation.images,
  anchor() {
    _anchor.copy(model.rhythmPoint()).project(stage.camera);
    const r = stage.stageEl.getBoundingClientRect();
    return { x: r.left + ((_anchor.x + 1) / 2) * r.width, y: r.top + ((1 - _anchor.y) / 2) * r.height };
  },
  sfx,
  onToggle(on) {
    input.endHold(false);
    sfx.quiet = on; // 音游进行中关闭常规揉捏音效，改由音游打击反馈出声
    if (on) { s.modeBeforeRhythm = s.mode; s.mode = 'off'; } else s.mode = s.modeBeforeRhythm;
  },
  onHoldBroken() { input.endHold(false); },
});
const rhythm = ctx.rhythm;

// ---------- 主循环 ----------
function step(dt) {
  const now = performance.now();
  stage.update(dt);
  pokes.update(dt);
  const r = updatePull(s, { dt, now, rhythmActive: rhythm.active, sfx });
  pose.resetPose();
  updateFace({ dt, now, r, rhythmActive: rhythm.active });
  pose.helper.update(Math.min(dt, 1 / 20));
  rhythm.tick();
}

// 预热：编译着色器、让姿势稳定下来，再淡入，避免用户看到"搭骨架"的过程
try { await stage.renderer.compileAsync(stage.scene, stage.camera); } catch (err) { console.warn('[webgl] compileAsync fallback:', err); }
for (let i = 0; i < 20; i++) {
  step(1 / 60);
  if (i % 5 === 0) { loading.progress.prep = 0.6 + (0.4 * i) / 20; await new Promise((r) => requestAnimationFrame(r)); }
}
stage.render();
await loading.finish();

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  step(dt);
  input.updateHoverCursor();
  stage.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 调试用（控制台 window.__face）
window.__face = {
  cfg, mesh, uniforms, calib, pokes, bone: pose.bone, zoom: stage.zoom, uvMorphs: model.uvMorphs, sfx, debug,
  renderer: stage.renderer, outline: stage.outline, scene: stage.scene, camera: stage.camera, rhythm, hitFace: input.hitFace,
  /** 手动推进 n 帧（每帧 dt 秒），用于在后台标签页里做可重复的检查 */
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) step(dt); },
  get state() { return { holdId: s.holdId, pullSides: s.pullSides, pulling: s.pulling, mode: s.mode, delta: s.delta.length(), target: s.target.length() / calib.faceWidth }; },
};
window[`__${cfg.id}`] = window.__face;

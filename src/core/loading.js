import * as THREE from 'three';
import { MMDLoader } from 'three/examples/jsm/loaders/MMDLoader.js';

/**
 * 加载界面 + 模型加载。
 * 进度 = 模型 55% + 贴图 35% + 准备（编译、预热）10%；进度条只往前走、平滑追赶。
 */
export function createLoadingScreen(app) {
  const fill = document.querySelector('#loader-fill');
  const pct = document.querySelector('#loader-pct');
  const label = document.querySelector('#loader-label');
  const progress = { pmx: 0, tex: 0, prep: 0, shown: 0 };
  const target = () => progress.pmx * 0.55 + progress.tex * 0.35 + progress.prep * 0.1;

  (function tick() {
    if (app.dataset.state === 'ready') return;
    progress.shown += (target() - progress.shown) * 0.12;
    const p = Math.min(progress.shown, 0.999);
    fill.style.transform = `scaleX(${p})`;
    pct.textContent = `${Math.floor(p * 100)}%`;
    requestAnimationFrame(tick);
  })();

  return {
    progress,
    setLabel(text) { label.textContent = text; },
    async finish() {
      progress.prep = 1;
      progress.shown = 1;
      fill.style.transform = 'scaleX(1)';
      pct.textContent = '100%';
      await new Promise((r) => setTimeout(r, 180));
      app.dataset.state = 'ready';
    },
  };
}

/** 套用角色呈现层的文案和加载图 */
export function applyCharacterText(presentation) {
  const { text, images, name } = presentation;
  document.title = text.title;
  document.querySelector('#loader-label').textContent = text.loading;
  const img = document.querySelector('#loader img');
  if (img && images.loading) { img.src = images.loading; img.alt = name ?? ''; img.hidden = false; }
}

// 物理引擎只在 ?bake 时用（给头发烘焙自然垂落的姿势），动态加载、与模型并行
export function loadAmmo() {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/ammo/ammo.wasm.js';
    s.onload = () => window.Ammo().then((lib) => { window.Ammo = lib; resolve(); }, reject);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/**
 * 加载 PMX 模型和贴图。
 * keepMorphs：只保留实际用到的顶点表情（null = 全留，工作台用）。模型往往带一两百个 morph，过滤后
 * 移动端 WebGL 显存与内存占用可降低约 85%（达妮娅 ~330MB → ~49MB）。
 * texDir：贴图目录在磁盘上的真实名字（大小写敏感，探测脚本写进 model.js）。
 * 返回 mesh 和 UV 表情数据（漫画符号用，MMDLoader 本身不支持）。
 */
export async function loadModel({ url, sizeHint, keepMorphs, progress, texDir = 'tex' }) {
  const manager = new THREE.LoadingManager();
  // 模型里贴图路径大小写、斜杠混用（TEX/Tex/tex、反斜杠）；服务器区分大小写，统一成磁盘上的真实目录名
  const lower = `/${texDir.toLowerCase()}/`;
  manager.setURLModifier((u) => {
    u = u.replace(/\\/g, '/');
    const i = u.toLowerCase().lastIndexOf(lower);
    return i < 0 ? u : `${u.slice(0, i)}/${texDir}/${u.slice(i + lower.length)}`;
  });
  // 贴图 404 时开发服务器会返回 index.html（模型只剩描边、控制台却没有报错），这里明确报出来
  manager.onError = (u) => console.error(`[贴图] 加载失败：${u}（核对 public/ 下的文件名和大小写）`);
  manager.onProgress = (u, loaded, total) => { if (!u.endsWith('.pmx')) progress.tex = loaded / total; };
  const texturesReady = new Promise((resolve) => { manager.onLoad = resolve; });

  const result = await new Promise((resolve, reject) => {
    const loader = new MMDLoader(manager);
    loader.loadPMX(url, (data) => {
      try {
        const uvMorphData = data.morphs.filter((m) => m.type === 3);
        data.morphs = data.morphs.filter((m) => m.type === 1 && (!keepMorphs || keepMorphs.has(m.name)));
        data.metadata.morphCount = data.morphs.length;
        const mesh = loader.meshBuilder.setCrossOrigin(loader.crossOrigin).build(data, THREE.LoaderUtils.extractUrlBase(url));
        resolve({ mesh, uvMorphData });
      } catch (err) { reject(err); }
    }, (e) => { progress.pmx = Math.min(1, e.loaded / (e.total || sizeHint)); }, reject);
  });
  progress.pmx = 1;
  return { ...result, texturesReady };
}

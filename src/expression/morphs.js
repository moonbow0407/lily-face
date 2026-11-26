import * as THREE from 'three';

const { clamp, damp } = THREE.MathUtils;

/** 模型层配置里所有要保留的顶点表情名（加载时过滤掉其它 morph，省显存） */
export function usedMorphNames(model) {
  return new Set([...Object.values(model.morphs ?? {}).filter(Boolean), ...(model.symbolSpots ?? [])]);
}

/**
 * 表情驱动：表情配方给出"语义名 → 目标值"，这里换成模型的 morph 名并平滑跟随。
 * 语义名在模型层配置 morphs 里映射；模型没有的表情自动忽略。
 */
export class MorphDriver {
  /** instant：不做平滑的语义名（半开半合时难看的表情，过渡由表情表自己控制，见 model.instantMorphs） */
  constructor(mesh, names, instant = []) {
    this.instant = new Set(['blink', ...instant]);
    this.dict = mesh.morphTargetDictionary;
    this.infl = mesh.morphTargetInfluences;
    this.names = names; // 语义名 → morph 名
    this.shown = new Map(); // 语义名 → 当前显示值
  }

  /** 当前显示值（语义名） */
  get(key) { return this.shown.get(key) ?? 0; }

  /** 直接设置某个 morph（不平滑，按模型里的名字），用于符号位置等开关量 */
  setRaw(name, v) {
    if (name in this.dict) this.infl[this.dict[name]] = v;
  }

  apply(targets, dt) {
    for (const k of Object.keys(targets)) if (!this.shown.has(k)) this.shown.set(k, 0);
    for (const [k, v] of this.shown) {
      const name = this.names[k];
      if (!name || !(name in this.dict)) continue;
      const t = clamp(targets[k] ?? 0, 0, 1.25);
      // 眨眼等直接用目标值；其它表情 ~60ms 跟随，避免跳变
      const next = this.instant.has(k) ? t : damp(v, t, t > v ? 22 : 14, dt);
      this.shown.set(k, next);
      this.infl[this.dict[name]] = next;
    }
  }
}

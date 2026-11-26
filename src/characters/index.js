/*
 * 角色注册表。通过 ?char=<id> 选择角色，默认是 site.json 的 defaultCharacter。
 */
import site from '../../site.json';
import lily from './lily/index.js';

export const CHARACTERS = { lily };
export const DEFAULT_CHARACTER = site.defaultCharacter;

/** 引擎默认值：角色配置里没写的项用这些（反应都是"没有"的保守值，文案是通用的） */
export const DEFAULT_BEHAVIOR = { cup: { shy: [0.5, 1.6], enjoy: [2.0, 3.2] }, dizzy: false, afterglow: false, sulk: false };
const DEFAULT_TEXT = {
  loading: '加载中…',
  textures: '正在加载贴图…',
  preparing: '马上就好…',
  failed: '加载失败，请刷新重试',
};

export function pickCharacter(search = location.search) {
  const id = new URLSearchParams(search).get('char');
  const c = CHARACTERS[id] ?? CHARACTERS[DEFAULT_CHARACTER];
  const p = c.personality;
  const v = c.presentation ?? {};
  const actionIds = Object.keys(p.actions ?? {});
  return {
    ...c,
    personality: {
      ...p,
      actions: p.actions ?? {},
      defaultAction: actionIds.includes(p.defaultAction) ? p.defaultAction : actionIds.find((a) => a !== 'rhythm') ?? null,
      behavior: { ...DEFAULT_BEHAVIOR, ...p.behavior },
      expressions: p.expressions ?? (() => {}),
      eggs: { chance: 0, list: [], tint: [0.24, 0.5, 0.84], ...p.eggs },
    },
    presentation: {
      ...v,
      text: { title: v.name ?? c.id, ...DEFAULT_TEXT, ...v.text },
      images: { ...v.images },
    },
  };
}

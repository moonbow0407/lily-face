/**
 * 莉莉的表情表：每个动作一个招牌表情 + 一个变体（p.roll >= 0.7 走变体）。
 * 这个模型的嘴型很淡，表情主要靠眯眼和漫画符号（💢，画风统一成达妮娅汗滴那样，见 model.js 的 vertexSymbols）。
 * 脸红和达妮娅一样只靠引擎（拉久了、捧着时脸颊自然泛红），不再叠加模型的「照れ」，否则太夸张。
 *
 *   动作      招牌                         变体
 *   戳        眯眼微笑；连戳时眉头渐渐为难   连戳 5 下以上：生气（半眼 + 鼓嘴 + 💢）
 *   单手拉    眯眼微笑（同达妮娅）          半眼嫌弃 + 💢
 *   双手拉    眯眼微笑（同达妮娅）          眯眼微笑 + 张嘴笑
 *   捧        害羞 → 闭眼陶醉（同达妮娅）   害羞 → 星星眼
 *   揉        眯眼微笑（同达妮娅）
 *   揉晕      星星眼 + 乱线团彩蛋（同达妮娅的眩晕彩蛋）
 *   音游      点按 = 单手捏一下，长按 = 单手捏住，都是单手拉的眯眼笑；不会生气、不出变体
 *   捧完松手  眯眼笑；拉久了松手：鼓嘴半眼
 */
export default function lilyExpressions(p, add) {
  const { h, open } = p;
  const variant = p.roll >= 0.7 && !p.rhythmActive; // 音游里节奏快，只用招牌

  // ---- 物理反应：眨眼带眉、被拉一侧嘴角拉开、被托住嘴被挤 ----
  add('browDown', p.blink * 0.14);
  add('mouthWideL', p.left * 0.54);
  add('mouthWideR', p.right * 0.54);
  add('mouthNarrow', 0.6 * p.es.mouth * (1 - 0.72 * h));
  add('mouthForward', 0.4 * p.es.mouth * (1 - 0.5 * h));

  // 眼部表情乘 open，免得和眨眼叠在一起变形
  const eye = (k, v) => add(k, v * open);
  // 眯眼笑统一收集，最后一次性处理（见文件末尾）
  let smile = 0;
  const wantSmile = (v) => { smile = Math.max(smile, v); };

  // ---- 戳：微笑；戳多了生气 ----
  const pf = p.pokeFace;
  const [smileR, smileL] = p.pokes.smiles;
  // 戳完的余韵，约 2~3 秒淡完；音游里点得密，只用短的 pokeFace（同达妮娅），不然整局都闭着眼
  const after = p.rhythmActive ? 0 : p.pokeAfter * (1 - pf);
  if (p.combo >= 5 && !p.rhythmActive) {
    const mad = Math.max(pf, after);
    add('angryMark', mad);
    eye('eyeHalf', 0.85 * mad);
    add('pout', 0.9 * mad);
    add('browTrouble', 0.6 * mad);
  } else {
    const fret = Math.min(1, Math.max(0, p.combo - 1) / 3); // 连戳 2~4 下：笑着但眉头越来越为难
    wantSmile(Math.min(1, 0.9 * pf + 1.6 * after)); // 笑容停留一会儿再睁眼
    add('mouthCornerUpR', 0.8 * smileR + 0.4 * Math.max(pf, after));
    add('mouthCornerUpL', 0.8 * smileL + 0.4 * Math.max(pf, after));
    add('browTrouble', 0.45 * fret * Math.max(pf, after));
  }

  // ---- 单手拉：招牌同达妮娅（眯眼笑）；变体：嫌弃生气 ----
  const single = p.pullSides === 1 ? h : 0; // 音游长按也是单手捏，同样的表情
  if (single) {
    if (variant) {
      add('angryMark', single);
      eye('eyeHalf', 0.85 * single);
      add('pout', 0.8 * single);
      add('browTrouble', 0.5 * single);
    } else {
      wantSmile(0.9 * single);
      add(p.right ? 'browTroubleR' : 'browTroubleL', 0.045 * single); // 同达妮娅：被拉一侧眉头极轻地一皱
    }
  }

  // ---- 双手拉：招牌同达妮娅（眯眼笑）；变体再张嘴笑 ----
  const double = p.pullSides === 2 ? h : 0;
  if (double) {
    wantSmile(double);
    if (variant) add('mouthOpen', 0.5 * double);
  }

  // ---- 捧：刚捧住（惊讶）→ 害羞 → 享受；招牌同达妮娅（闭眼陶醉），变体是星星眼 ----
  const calm = 1 - p.dizzy;
  eye('eyeSurprise', 0.5 * p.es.surprise * (1 - h));
  add('browUp', 0.1 * p.es.surprise * (1 - h));
  add('browTrouble', 0.3 * p.shy);
  eye('eyeHalf', 0.2 * p.shy);
  if (variant) {
    add('starEyes', p.enjoy * calm);
    add('mouthOpen', 0.25 * p.enjoy);
    add('mouthCornerUp', 0.4 * p.enjoy);
  } else {
    wantSmile(0.9 * p.enjoy * calm);
    add('mouthCornerUp', 0.35 * p.enjoy);
  }

  // 揉着：眯眼微笑（同达妮娅）
  const rubbing = Math.min(1, p.rub * 2.5) * calm;
  wantSmile(rubbing);
  add('mouthCornerUp', 0.5 * rubbing);

  // 揉晕了：星星眼 + 头边的乱线团（眩晕彩蛋），眉毛为难、嘴微张
  add('starEyes', p.dizzy);
  add('dizzyMark', p.dizzy);
  add('browTrouble', 0.6 * p.dizzy);
  add(variant ? 'mouthO' : 'mouthOpen', 0.45 * p.dizzy);

  // 捧完松手：眯眼笑
  wantSmile(0.9 * p.afterglow);
  add('mouthCornerUp', 0.5 * p.afterglow);

  // 拉久了松手：鼓嘴、半眼
  add('pout', 0.9 * p.sulk);
  eye('eyeHalf', 0.5 * p.sulk);

  // 眯眼笑：这个模型的「笑い」半开半合时眼珠会从睫毛下露出来，所以只用 0 / 1（model.instantMorphs）；
  // 切换前先用普通眨眼把眼睛合上，合上的那一刻换成「笑い」，看起来就是"闭上眼睛笑"；
  // 眨眼只放在睁眼那一侧，和「笑い」叠在一起睫毛会变形
  const smiling = smile >= 0.5;
  add('eyeSmile', smiling ? 1 : 0);
  if (!smiling) add('blink', Math.max(0, (smile - 0.36) / 0.14 - p.blink));

  if (p.egg) for (const [k, v] of Object.entries(p.egg.morphs ?? {})) add(k, v * p.eggFade);
}

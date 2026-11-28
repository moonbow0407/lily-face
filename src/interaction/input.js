import * as THREE from 'three';
import { calib, toRef, vecToRef } from '../rig/calibration.js';
import { ZOOM_MIN, ZOOM_MAX } from '../core/stage.js';
import { RHYTHM_HOLD_RAW, pullLimit } from './pull.js';

const { clamp, smoothstep } = THREE.MathUtils;
const RHYTHM_KEYS = new Set(['Space', 'KeyD', 'KeyF', 'KeyJ', 'KeyK']);

/**
 * 指针 / 键盘 / 双指缩放输入 → 交互状态。
 * ctx: { app, stage, model, pose, s, pokes, sfx, symbols, rhythm }；rhythm 在创建后才赋值，用时再取。
 */
export function createInput(ctx) {
  const { app, stage, model, pose, s, pokes, sfx, symbols } = ctx;
  const { stageEl, renderer, camera, zoom } = stage;
  const PT = () => calib.faceWidth;
  const rhythm = () => ctx.rhythm;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function rayFrom(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray;
  }

  function hitFace(e) {
    const hit = model.faceHit.raycast(rayFrom(e));
    if (!hit) return null;
    const ref = toRef(hit.local);
    // 只接受脸颊附近（参考站的有效区域）
    if (Math.abs(ref.x) > 1.13 || ref.y < 16.65 || ref.y > 17.46 || ref.z < -0.09) return null;
    return { ...hit, ref };
  }

  /** 戳一下：冲击点限制在脸颊肉上 */
  function poke({ x, y, z }, strength) {
    const now = performance.now();
    s.pokeCombo = now - s.lastPokeAt < 700 ? s.pokeCombo + 1 : 1;
    s.lastPokeAt = now;
    s.roll = Math.random();
    s.pokeUntil = now + 550;
    pokes.tap(new THREE.Vector3((Math.sign(x) || 1) * clamp(Math.abs(x), 0.3, 0.82), clamp(y, 16.87, 17.3), z), strength);
  }
  /** 拉脸：抓取点固定在脸颊肉上，只取高度 */
  const grabCheek = ({ x, y }) => s.grab.set(x < 0 ? -0.55 : 0.55, clamp(y, 16.88, 17), 0.24);
  const rhythmHoldTarget = () => s.target.set(Math.sign(s.grab.x) * PT() * s.limits.rhythm * Math.tanh(RHYTHM_HOLD_RAW / 0.1), 0, 0);

  /** 音游点按的动作（角色配置 actions.rhythm.tap）：'poke' 戳（默认）/ 'single' 单手捏一下；长按总是单手拉住 */
  const rhythmCfg = ctx.cfg.personality.actions.rhythm ?? {};
  const rhythmAct = (act) => (act === 'poke' && rhythmCfg.tap === 'single' ? 'pinch' : act);

  /**
   * 捏一下：不按住，给被捏的一侧一个向外的冲量，靠松手的弹簧自己弹回；表情借用戳的短反应（音游里交互音效静音，只有打击音）。
   * 冲量控制在峰值约 3.5% 脸宽，不超过前发的余量（hairAvoid.slack），否则前发会跟着一进一出地闪；
   * 也不叠加松手的"啵"抖动（速度太快，脸颊会在发丝前后来回穿）
   */
  function pinchTap(ref) {
    if (s.holdId !== null) return;
    s.pullSides = 1;
    grabCheek(ref);
    const sx = Math.sign(s.grab.x);
    s.releaseDir.set(sx, 0, 0);
    s.vel.set(sx * PT() * 1.1, 0, 0);
    s.jiggle.armed = false;
    s.pokeUntil = performance.now() + 550;
    s.roll = Math.random();
  }

  // 双指捏合缩放（手机）
  const touches = new Map();
  let pinchStart = null;
  const pinchDistance = () => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  stageEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && s.holdId === null) { pinchStart = { d: pinchDistance(), z: zoom.target }; return; }
    }
    if (!e.isPrimary || e.button !== 0 || s.holdId !== null || pinchStart) return;
    sfx.unlock();
    const rh = rhythm();
    // 音游中不看点在哪，统一作用在右脸颊（参考站同款）
    const hit = rh.active ? model.rhythmHit() : hitFace(e);
    if (!hit) return;
    e.preventDefault();
    const { x, y, z } = hit.ref;

    let act = s.mode;
    if (rh.active) {
      // 音游：按下是否对上音符，决定这一下是"戳"还是"拉住"；没对上就只轻轻碰一下
      if (!rh.playing) return;
      act = rh.press(e);
      if (act !== 'single') touchRing(e);
      if (!act) { pokes.tap(hit.ref.clone(), 0.55); return; }
      act = rhythmAct(act);
      if (act === 'pinch') { pinchTap(hit.ref); return; }
    }

    if (act === 'poke') {
      if (Math.abs(x) < 0.16 && !rh.active) return; // 鼻梁正中不算
      poke(hit.ref, rh.active ? 1.5 : 1);
      sfx.poke(x < 0 ? -1 : 1); // x<0 是角色右脸 = 画面左侧
      return;
    }
    if (act !== 'single' && act !== 'double' && act !== 'cup') return;

    s.holdId = e.pointerId;
    s.roll = Math.random();
    s.pullSides = act === 'cup' ? 0 : act === 'single' ? 1 : 2;
    s.cupHeld = act === 'cup';
    if (s.cupHeld) { sfx.cupPress(); s.cupTime = 0; s.rubEnergy = 0; s.rubLevel = 0; s.lastRubPx.set(e.clientX, e.clientY); }
    s.jiggle.armed = false;
    // 音游里的长按：一按下就算在拉（不等拖动），也不出彩蛋；清掉上一记戳脸的残留表情
    s.pulling = rh.active; s.egg = null;
    if (rh.active) s.pokeUntil = -Infinity;
    try { stageEl.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
    s.pressPx.set(e.clientX, e.clientY);
    // 捧脸：就在按下的位置轻推
    if (s.cupHeld) s.grab.set(x, y, z); else grabCheek(hit.ref);
    if (!rh.active) { s.delta.set(0, 0, 0); s.vel.set(0, 0, 0); }
    // 音游长按即使原地按住不拖动，也自动向外拉开脸颊，触发表情与回弹
    if (rh.active) rhythmHoldTarget(); else s.target.set(0, 0, 0);
    camera.getWorldDirection(s.dragPlane.normal);
    s.dragPlane.setFromNormalAndCoplanarPoint(s.dragPlane.normal, hit.point);
    s.dragStart.copy(hit.point);
    // 音游里手指不在脸上：拖动从手指按下的位置算起（参考站同款）
    if (rh.active) rayFrom(e).intersectPlane(s.dragPlane, s.dragStart);
    stageEl.dataset.cursor = 'grabbing';
  });

  const _p = new THREE.Vector3();
  stageEl.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchStart && touches.size === 2) {
        zoom.target = clamp(pinchStart.z + Math.log2(pinchDistance() / pinchStart.d) * 0.7, ZOOM_MIN, ZOOM_MAX);
        return;
      }
    }
    if (e.pointerType === 'mouse') s.hoverEvent = e;
    if (e.pointerId !== s.holdId) return;
    const rh = rhythm();
    if (rh.active) rh.drag(e);
    if (!rayFrom(e).intersectPlane(s.dragPlane, _p)) return;
    const { target, grab } = s;
    vecToRef(pose.worldDeltaToBind(_p.sub(s.dragStart)), target);
    if (s.cupHeld) {
      // 捧着脸时拖动 = 揉脸：脸颊跟着手轻轻推，揉得越快越"揉"
      s.rubInput += Math.hypot(e.clientX - s.lastRubPx.x, e.clientY - s.lastRubPx.y);
      s.lastRubPx.set(e.clientX, e.clientY);
      target.y *= 0.55;
      const a = target.length(), limit = PT() * s.limits.cup;
      if (a > 0) target.multiplyScalar((limit * Math.tanh(a / (PT() * 0.14))) / a);
      return;
    }
    const px = Math.hypot(e.clientX - s.pressPx.x, e.clientY - s.pressPx.y);
    const sx = Math.sign(grab.x);
    if (rh.active) target.x = sx * Math.abs(target.x); // 音游里往哪边拖都算拉开
    const out = sx * target.x;
    if (out < -Math.abs(target.y)) { target.set(0, 0, 0); return; } // 往里推不算
    target.x = sx * Math.max(0, out);
    target.z = Math.max(0, target.z);
    target.y *= rh.active ? 1.12 : 0.65;
    if (rh.active) target.x += sx * Math.abs(target.y) * 0.36;
    target.multiplyScalar(smoothstep(px, 3, 8)); // 几像素的死区，防手抖
    if (rh.active) target.x += sx * PT() * RHYTHM_HOLD_RAW; // 音游长按叠加基础自动拉力，避免微抖把目标清零
    const a = target.length();
    const limit = PT() * pullLimit(s, rh.active);
    if (a > 1e-4 && !s.pulling) {
      s.pulling = true;
      const { list, chance } = symbols;
      s.egg = list.length && Math.random() < chance ? list[Math.floor(Math.random() * list.length)] : null;
      if (s.egg) sfx.drip(0.16);
    }
    if (a > 0) target.multiplyScalar((limit * Math.tanh(a / (PT() * (rh.active ? 0.1 : 0.115)))) / a); // 橡皮筋
  });

  /** 结束按住（松手，或音游里长按被判失败时强制结束）。ok = 正常抬起 */
  function endHold(ok, ts = performance.now()) {
    if (s.holdId === null) return;
    const id = s.holdId;
    s.holdId = null;
    s.keyHoldCode = null;
    if (rhythm()?.active) rhythm().release(ok, ts);
    try { if (stageEl.hasPointerCapture(id)) stageEl.releasePointerCapture(id); } catch { /* 合成事件 */ }
    if (s.cupHeld) {
      if (ok) sfx.cupRelease();
      sfx.cupRub(0);
      // 捧了一会儿再松手：嘿嘿地笑一下
      const ag = s.behavior.afterglow;
      if (ag && s.cupTime > ag.minHold && s.dizzyUntil < performance.now()) s.afterglow = 1;
      if (s.dizzyUntil > performance.now()) s.dizzyUntil = performance.now() + 1100;
    }
    s.cupHeld = false;
    stageEl.dataset.cursor = '';
    if (s.pullSides) sfx.pullRelease(ok);
    if (ok && s.pulling && s.pullSides) {
      // 准备松手后的抖动；轻轻一拉就松手时，额外给一个"弹"的冲量
      const v = s.delta.lengthSq() > s.target.lengthSq() ? s.delta : s.target;
      const t = v.length() / PT();
      s.jiggle.armed = t > 0.002;
      s.releaseDir.copy(v).normalize();
      const n = smoothstep(t, 0, 0.009) * (1 - smoothstep(t, 0.016, 0.052));
      if (n > 0) {
        const r = 0.72 * PT() * n;
        s.vel.addScaledVector(s.releaseDir, Math.min(0, -r - s.vel.dot(s.releaseDir)));
      }
    }
    s.holdStart = null; s.pulling = false; s.egg = null;
    s.target.set(0, 0, 0);
  }

  function release(e) {
    if (touches.delete(e.pointerId) && touches.size < 2) pinchStart = null;
    if (e.pointerId !== s.holdId) return;
    endHold(e.type === 'pointerup', e.timeStamp);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stageEl.addEventListener(type, release);

  /** 音游点击时的小圆圈反馈 */
  function touchRing(e) {
    const ring = document.createElement('i');
    ring.className = 'rhythm-touch';
    ring.style.left = `${e.clientX}px`;
    ring.style.top = `${e.clientY}px`;
    app.append(ring);
    ring.animate([{ opacity: 0.9, transform: 'scale(.55)' }, { opacity: 0, transform: 'scale(1.55)' }], { duration: 210, easing: 'ease-out' }).onfinish = () => ring.remove();
  }

  // 音游键盘支持：空格 / D / F / J / K 均可点按与长按
  window.addEventListener('keydown', (e) => {
    const rh = rhythm();
    if (!rh.active || !RHYTHM_KEYS.has(e.code)) return;
    // 只要在音游模式里就先拦下默认行为（含长按 repeat 与加载中），防止空格触发带焦点的按钮点击或滚屏
    e.preventDefault();
    if (!rh.playing || e.repeat || s.holdId !== null) return;
    sfx.ensureContext();
    const hit = model.rhythmHit();
    const pressed = rh.press(e);
    if (!pressed) { pokes.tap(hit.ref.clone(), 0.55); return; }
    const act = rhythmAct(pressed);
    if (act === 'poke') { poke(hit.ref, 1.5); return; }
    if (act === 'pinch') { pinchTap(hit.ref); return; }
    s.keyHoldCode = e.code;
    s.holdId = 'key';
    s.pullSides = 1;
    s.cupHeld = false;
    s.jiggle.armed = false;
    s.pulling = true; s.egg = null;
    s.pokeUntil = -Infinity;
    grabCheek(hit.ref);
    rhythmHoldTarget();
  });
  window.addEventListener('keyup', (e) => {
    const rh = rhythm();
    if (rh.active && RHYTHM_KEYS.has(e.code)) e.preventDefault();
    if (s.keyHoldCode && e.code === s.keyHoldCode) {
      s.keyHoldCode = null;
      if (s.holdId === 'key') endHold(true, e.timeStamp);
    }
  });

  return {
    endHold,
    hitFace,
    /** 每帧：鼠标悬停在脸上时换光标 */
    updateHoverCursor() {
      if (!s.hoverEvent || s.holdId !== null) return;
      const hit = hitFace(s.hoverEvent);
      stageEl.dataset.cursor = rhythm().active ? 'poke' : hit ? (s.mode === 'poke' ? 'poke' : 'grab') : '';
      s.hoverEvent = null;
    },
  };
}

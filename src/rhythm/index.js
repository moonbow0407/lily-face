/**
 * 音游引擎（标准音游时钟 + 简单易上手手感）：
 * - 歌曲用 Web Audio 精确调度（songPlayer.js），界面在 view.js，这里只管状态和判定。
 * - 判定分级：PERFECT（±80ms）/ GOOD（±175ms）/ MISS，长按松手窗口更宽松（±110ms / ±250ms）。
 * - 判定圈随节拍脉动、轨道上显示节拍刻度、实时弹出判定文字与准确度，
 *   并提供 ±150ms 音频延迟微调（适配蓝牙耳机等高延迟设备）。
 */
import { WebAudioSongPlayer } from './songPlayer.js';
import { createRhythmView } from './view.js';

const PERFECT_WINDOW = 0.080;
const GOOD_WINDOW = 0.175;
const EARLY_IGNORE = 0.250; // 超过 250ms 提前按不算错，仅轻戳脸颊
const RELEASE_PERFECT = 0.110;
const RELEASE_GOOD = 0.250;

/**
 * @param {object} o
 * @param {HTMLElement} o.root
 * @param {HTMLButtonElement} o.button
 * @param {object} o.song 歌曲 + 谱面（见 charts/*.js 的默认导出）
 * @param {string} [o.hint] 开场提示文字
 * @param {string} o.storagePrefix localStorage 键前缀
 * @param {{finale:string, finaleAlt:string}} o.images 结算图
 * @param {() => {x:number,y:number}} o.anchor 脸颊点在屏幕上的位置（CSS 像素）
 * @param {import('../audio/sfx.js').Sfx} o.sfx
 * @param {(active:boolean) => void} o.onToggle 进入/退出音游
 * @param {() => void} o.onHoldBroken 长按音符被判失败时强制松手
 */
export function createRhythm({ root, button, song, hint, storagePrefix, images, anchor, sfx, onToggle, onHoldBroken }) {
  const chart = song.notes;
  const view = createRhythmView({ root, finaleImage: images.finale, finaleAlt: images.finaleAlt, hintText: hint });
  const player = new WebAudioSongPlayer(song.url, () => sfx.ensureContext(), song.end);

  // 音频延迟微调，按设备记住
  const syncKey = `${storagePrefix}.rhythm-sync-ms`;
  let sync = 0;
  try {
    const v = Number(localStorage.getItem(syncKey));
    if (Number.isFinite(v)) sync = Math.max(-150, Math.min(150, v));
  } catch { /* ignore */ }
  view.renderSync(sync);
  view.hud.addEventListener('pointerdown', (e) => e.stopPropagation());
  view.hud.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-sync]');
    if (!btn) return;
    e.stopPropagation();
    sync = Math.max(-150, Math.min(150, sync + Number(btn.dataset.sync)));
    try { localStorage.setItem(syncKey, String(sync)); } catch { /* ignore */ }
    view.renderSync(sync);
    sfx.tick();
    btn.blur();
  });

  const T = (ts) => player.time(ts) - sync / 1000;

  let active = false, playing = false;
  let next = 0;
  let holding = false;
  let pressGrade = 'perfect';
  let streak = 0;
  const stats = { perfect: 0, good: 0, miss: 0, best: 0 };
  let lastBeatIdx = -999;

  function accuracy() {
    const total = stats.perfect + stats.good + stats.miss;
    if (!total) return 100;
    return ((stats.perfect + stats.good * 0.7) / total) * 100;
  }

  /** 结算当前音符：grade = 'perfect' | 'good' | 'miss' */
  function judge(grade, kind = 'tap') {
    if (grade === 'miss') {
      streak = 0;
      stats.miss++;
      sfx.rhythmHit('miss');
    } else {
      streak++;
      stats[grade]++;
      stats.best = Math.max(stats.best, streak);
      view.burst(kind, grade === 'perfect');
      sfx.rhythmHit(kind, grade);
    }
    view.showJudge(grade);
    view.renderHud(accuracy(), streak);
    view.setFollowing(false);
    next++;
    holding = false;
  }

  function resetRun() {
    next = 0; streak = 0; holding = false; lastBeatIdx = -999;
    Object.assign(stats, { perfect: 0, good: 0, miss: 0, best: 0 });
    view.reset();
    view.renderHud(accuracy(), streak);
  }

  function startSong() {
    resetRun();
    view.screen('loading');
    view.loadProgress(0);
    player.load({
      onProgress: (p) => view.loadProgress(p),
      onReady: () => {
        if (!active) return;
        view.screen('playing');
        playing = true;
        player.begin();
      },
      onEnded: () => finish(),
      onError: () => {
        player.stop();
        playing = false;
        view.screen('error');
        if (holding) onHoldBroken();
        resetRun();
      },
    });
  }

  function finish() {
    if (!active) return;
    playing = false;
    player.stop();
    if (holding) onHoldBroken();
    while (next < chart.length) judge('miss');
    const acc = accuracy();
    const ap = stats.miss === 0 && stats.good === 0;
    const fc = stats.miss === 0;
    const rank = ap || (fc && acc >= 98) ? 'S+' : acc >= 95 ? 'S' : acc >= 88 ? 'A' : acc >= 75 ? 'B' : 'C';
    view.showFinale({ rank, ap, fc, acc, stats, total: chart.length, credit: song.credit });
  }

  function stop() {
    if (holding) onHoldBroken();
    active = false; playing = false; holding = false;
    player.stop();
    view.screen('off');
    resetRun();
    button.setAttribute('aria-pressed', 'false');
    document.body.classList.remove('rhythm-playing');
    onToggle(false);
  }

  button.addEventListener('click', () => {
    button.blur(); // 避免按钮留着焦点，音游中按/长按空格时误触发按钮点击而退出
    if (active) { stop(); return; }
    sfx.ensureContext();
    active = true;
    button.setAttribute('aria-pressed', 'true');
    document.body.classList.add('rhythm-playing');
    onToggle(true);
    startSong();
  });
  view.retryBtn.addEventListener('click', () => { view.retryBtn.blur(); startSong(); });
  view.finale.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    const act = btn?.dataset.act;
    btn?.blur();
    if (act === 'again') startSong();
    else if (act === 'exit') stop();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && active && playing) stop(); });

  return {
    get active() { return active; },
    get playing() { return playing; },

    /** 每帧：自动判漏、节拍脉动、摆放轨道刻度与音符 */
    tick() {
      if (!playing) return;
      const now = T();
      if (now >= Math.min(song.end, player.duration - 0.1)) { finish(); return; }

      // 判定超时漏掉的音符
      while (next < chart.length) {
        const n = chart[next];
        const due = holding ? n.until + RELEASE_GOOD : n.at + GOOD_WINDOW;
        if (now <= due) break;
        const wasHolding = holding;
        judge('miss');
        if (wasHolding) onHoldBroken();
      }

      // 判定圈节拍脉动，增强音乐卡点直觉
      const beatIdx = Math.floor((now - song.beatOffset) / song.beatSec);
      if (beatIdx >= 0 && beatIdx !== lastBeatIdx) {
        lastBeatIdx = beatIdx;
        if (!holding) view.pulseBeat();
      }

      view.renderTrack({ now, anchor: anchor(), song, next, holding });
    },

    /** 按下：返回 'poke' / 'single'（命中的音符类型），没对上返回 null */
    press(e) {
      if (!playing || holding) return null;
      const t = T(e?.timeStamp ?? performance.now());
      while (next < chart.length && t > chart[next].at + GOOD_WINDOW) judge('miss');
      const n = chart[next];
      if (!n) return null;
      const absErr = Math.abs(t - n.at);
      if (absErr > EARLY_IGNORE) return null;
      if (absErr > GOOD_WINDOW) return null; // 太早不扣连击，轻戳一下
      const grade = absErr <= PERFECT_WINDOW ? 'perfect' : 'good';
      if (n.move === 'poke') {
        judge(grade, 'tap');
        return 'poke';
      }
      holding = true;
      pressGrade = grade;
      view.setFollowing(true, e);
      view.burst('hold', grade === 'perfect');
      sfx.rhythmHit('hold', grade);
      return 'single';
    },

    drag(e) { if (holding && view.dotVisible) view.moveDot(e); },

    /** 松手：ok = 正常抬起（不是被打断） */
    release(ok, ts = performance.now()) {
      if (!active || !holding) return;
      const n = chart[next];
      if (!n) { holding = false; return; }
      const absErr = Math.abs(T(ts) - n.until);
      if (!ok || absErr > RELEASE_GOOD) {
        judge('miss');
        return;
      }
      const relGrade = absErr <= RELEASE_PERFECT ? 'perfect' : 'good';
      const finalGrade = pressGrade === 'perfect' && relGrade === 'perfect' ? 'perfect' : 'good';
      judge(finalGrade, 'release');
    },

    exit: stop,
    get debug() { return { time: T(), next, stats: { ...stats }, streak, sync, chart, finish }; },
  };
}

/** 角色没开放音游时的替身：永远不在音游中 */
export const NO_RHYTHM = Object.freeze({
  active: false,
  playing: false,
  tick() {},
  press() { return null; },
  drag() {},
  release() {},
  exit() {},
});

'use strict';
// 자동 플레이어 로봇 — v400 實戰
//
// domshim이 부팅한 진짜 게임을 사람처럼 조작한다: 버튼을 클릭하고, 키를 누르고,
// 모달 관문을 통과하고, 회수창·도전에서 결정을 내린다. 게임 내부 함수를 직접 부르지 않는다
// (IIFE 밖에서 접근할 수 없기도 하고, 플레이어가 실제로 지나는 표면만 밟는 것이 목적이다).
//
// 모든 예외는 수집되고, 매 걸음마다 상태 불변식을 검사한다.

const { boot } = require('./domshim.js');

const SAVE_KEY = 'reinforce_sword_v1';

function createPlayer(opts) {
  opts = opts || {};
  const env = boot(Object.assign({ tolerateBootError: true }, opts));
  const doc = env.doc;
  const policy = Object.assign({
    sellAt: 5,            // 이 강화도에 이르면 판다
    rescue: 'take',       // take | gamble | release | ignore
    challenge: 'auto',    // auto(이길 수 있으면 벤다) | slay | flee | stalemate
    tickMs: 900,          // 한 걸음의 가상 시간
  }, opts.policy || {});

  const trace = [];
  const seenGates = new Set();
  let stockedGen = -1;   // 등정 보급을 검 한 자루당 1회로 제한
  const note = (what, extra) => trace.push(extra === undefined ? what : what + ':' + extra);

  const $ = (id) => doc.getElementById(id);
  const active = (id) => { const el = $(id); return !!el && el.classList.contains('active'); };
  const visible = (id) => {
    const el = $(id);
    if (!el) return false;
    if (el.style.display === 'none') return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (n.style && n.style.display === 'none') return false;
    }
    return true;
  };

  // 세이브는 후반에 100KB를 넘어간다 — 매 걸음 파싱하면 하니스가 게임보다 무거워진다.
  // 원문 문자열이 바뀌지 않았으면 파싱 결과를 재사용한다.
  let _rawCache = null, _objCache = null;
  function state() {
    const raw = env.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    if (raw === _rawCache) return _objCache;
    try { _objCache = JSON.parse(raw); _rawCache = raw; return _objCache; }
    catch (e) { env.record(e, 'save-parse'); return null; }
  }

  function tick(ms) { env.clock.advance(ms === undefined ? policy.tickMs : ms, env.record); }

  function click(idOrEl, label) {
    const el = typeof idOrEl === 'string' ? $(idOrEl) : idOrEl;
    if (!el) { note('missing', String(idOrEl)); return false; }
    if (el.disabled) { note('disabled', label || String(idOrEl)); return false; }
    try { el.click(); } catch (e) { env.record(e, 'click:' + (label || idOrEl)); return false; }
    note(label || String(idOrEl));
    return true;
  }

  // opts.repeat: 브라우저 auto-repeat (손가락을 누르고 있을 때 첫 이벤트 이후 전부 true)
  function key(k, opts2) {
    const ev = env.win._makeEvent('keydown',
      { key: k, code: k === ' ' ? 'Space' : k, bubbles: true, repeat: !!(opts2 && opts2.repeat) });
    ev.target = doc.body;
    try { doc.dispatchEvent(ev); } catch (e) { env.record(e, 'key:' + k); }
  }

  // ---- 관문: 반드시 통과해야 진행되는 오버레이/모달 --------------------------
  function resolveGates() {
    let acted = false;

    if (active('gameover-overlay')) {
      seenGates.add('gameover');
      click('gameover-restart', 'gameover-restart'); tick(400); acted = true;
    }
    if (active('form-select-modal')) {
      seenGates.add('form-select');
      const cards = doc.querySelectorAll('.form-card');
      if (cards.length) { click(cards[0], 'form-card'); tick(400); acted = true; }
      else { note('form-cards-empty'); }
    }
    if (active('name-modal')) {
      seenGates.add('name-modal');
      click('name-confirm', 'name-confirm'); tick(400); acted = true;
    }
    // 그 외 열려 있는 모달은 닫는다 (플레이 흐름을 막지 않도록)
    const open = doc.querySelectorAll('.modal.active');
    for (const m of open) {
      if (['form-select-modal', 'name-modal'].includes(m.id)) continue;
      const close = m.querySelector('[data-close]');
      if (close) { click(close, 'close:' + m.id); acted = true; }
      else { m.classList.remove('active'); note('force-close', m.id); acted = true; }
    }
    return acted;
  }

  // ---- 회수창 -------------------------------------------------------------
  function handleVoid() {
    seenGates.add('void');
    if (policy.rescue === 'ignore') { tick(6000); return; }
    if (policy.rescue === 'gamble') { if (click('rescue-gamble', 'gamble')) { tick(1200); return; } }
    if (policy.rescue === 'release') { if (click('rescue-release', 'release')) { tick(1200); return; } }
    if (!click('rescue-circle', 'rescue')) tick(6000);
    else tick(1200);
  }

  // ---- 도전 --------------------------------------------------------------
  function handleChallenge() {
    seenGates.add('challenge');
    const s = state();
    const strengthTxt = ($('shadow-strength') && $('shadow-strength').textContent) || '';
    let mode = policy.challenge;
    if (mode === 'auto') {
      const m = strengthTxt.match(/(\d+)/);
      const foe = m ? parseInt(m[1], 10) : 99;
      mode = (s && s.level >= foe) ? 'slay' : 'flee';
    }
    const btn = mode === 'slay' ? 'btn-slay' : (mode === 'stalemate' ? 'btn-stalemate' : 'btn-flee');
    if (!click(btn, mode)) click('btn-flee', 'flee-fallback');
    tick(1500);
  }

  // ---- 등정(登頂) — 정점까지 밀어 올리는 보급 ------------------------------
  // 맨 곡선으로는 도(+15)에 사실상 이를 수 없다 (풍동 실측 ~580만 조각). 방지권·영석을
  // 갖춰야 실전 등정로가 열린다 — 도 의식·엔딩·전당 경로를 실제로 실행시키기 위한 정책.
  function stockUp() {
    const s = state();
    if (!s || !s.hasSword || s.level !== 0) return false;   // 조합소는 +0 에서만 입장
    if (!click('btn-forge', 'forge')) return false;
    tick(150);
    const buy = (recipe, times) => {
      for (let i = 0; i < times; i++) {
        const b = doc.querySelector('[data-recipe="' + recipe + '"]');
        if (!b || b.disabled) break;
        try { b.click(); } catch (e) { env.record(e, 'buy:' + recipe); break; }
        tick(40);
      }
    };
    buy('protection10', policy.stockProtect10 || 0);
    buy('protection', policy.stockProtect || 0);
    buy('spiritstone', policy.stockSpirit || 0);
    buy('whetstone', policy.stockWhet || 0);
    resolveGates();
    tick(150);
    return true;
  }

  // 위험 구간에서 보유한 보호 수단을 무장한다 (사용자가 실제로 누르는 토글 그대로).
  function armDefenses() {
    const failTxt = ($('odds-fail') && $('odds-fail').textContent) || '';
    if (!/파괴/.test(failTxt)) return;
    const spirit = $('spirit-check');
    if (spirit && !spirit.disabled && !spirit.checked) { try { spirit.click(); } catch (e) {} return; }
    const protect = $('protect-check');
    if (protect && !protect.disabled && !protect.checked) { try { protect.click(); } catch (e) {} }
  }

  // ---- 한 걸음 -----------------------------------------------------------
  function step() {
    resolveGates();

    if (active('void') || visible('void') && $('void').classList.contains('active')) { handleVoid(); return 'void'; }
    if (active('challenge')) { handleChallenge(); return 'challenge'; }

    const s = state();
    if (!s) { tick(); return 'nostate'; }

    // 팔 수 있고 목표 강화도에 이르렀으면 판다
    const sealBtn = $('btn-seal-direct');
    if (s.hasSword && s.level >= policy.sellAt && sealBtn && !sealBtn.disabled) {
      click(sealBtn, 'sell'); tick(1200); resolveGates(); return 'sell';
    }

    // 검이 없으면 새로 빚거나 융검/재련
    if (!s.hasSword) {
      const eb = $('btn-enhance');
      if (eb && !eb.disabled) { click(eb, 'newsword'); tick(600); return 'newsword'; }
      const fb = $('btn-fusion');
      if (fb && !fb.disabled && fb.style.display !== 'none') { click(fb, 'fusion-open'); tick(400); resolveGates(); return 'fusion'; }
      tick(); return 'stuck';
    }

    if (policy.climb) {
      // 보급은 검 한 자루당 한 번, 자금이 있을 때만 (보급 루프에 갇히지 않게)
      if (s.level === 0 && s.swordGeneration !== stockedGen && s.shards >= (policy.stockMin || 300)) {
        stockedGen = s.swordGeneration;
        if (stockUp()) return 'stock';
      }
      armDefenses();
    }

    const eb = $('btn-enhance');
    if (eb && !eb.disabled) { click(eb, 'enhance'); tick(); return 'enhance'; }
    tick();
    return 'idle';
  }

  function run(steps, opts2) {
    const every = (opts2 && opts2.checkEvery) || 5;
    const kinds = {};
    for (let i = 0; i < steps; i++) {
      const k = step();
      kinds[k] = (kinds[k] || 0) + 1;
      if (i % every === 0 || i === steps - 1) {
        const bad = checkInvariants(state(), env);
        if (bad) { env.errors.push({ where: 'invariant@step' + i, message: bad, stack: '' }); break; }
      }
    }
    return kinds;
  }

  return { env, doc, $, active, visible, state, tick, click, key, step, run, trace, seenGates, policy, stockUp, armDefenses, closeModals: resolveGates };
}

// ---- 상태 불변식 ---------------------------------------------------------
const NUM_KEYS = ['level', 'shards', 'protections', 'bestLevel', 'totalDestroyed', 'totalSlain',
  'whetstones', 'spiritstones', 'swordGeneration'];

function deepFindBad(obj, pathStr, out, depth) {
  if (depth > 6 || out.length > 4) return;
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) out.push(pathStr + ' = ' + obj);
    return;
  }
  if (Array.isArray(obj)) { obj.forEach((v, i) => deepFindBad(v, pathStr + '[' + i + ']', out, depth + 1)); return; }
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) deepFindBad(obj[k], pathStr + '.' + k, out, depth + 1);
  }
}

function checkInvariants(s, env) {
  if (!s) return '세이브를 읽을 수 없음';
  for (const k of NUM_KEYS) {
    if (s[k] === undefined) continue;
    if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) return k + ' 가 수가 아님: ' + JSON.stringify(s[k]);
    if (s[k] < 0) return k + ' 가 음수: ' + s[k];
  }
  if (s.level > 15) return 'level 이 MAX_LEVEL 초과: ' + s.level;
  if (s.bestLevel > 15) return 'bestLevel 이 MAX_LEVEL 초과: ' + s.bestLevel;
  if (s.hasSword && !s.currentSword) return '검이 있는데 currentSword 가 없음';
  if (s.currentSword) {
    if (!Array.isArray(s.currentSword.inscriptions)) return 'inscriptions 가 배열이 아님';
    const soul = s.currentSword.soul;
    if (typeof soul !== 'number' || !Number.isFinite(soul) || soul < 0 || soul > 100) return 'soul 범위 이탈: ' + soul;
  }
  if (!Array.isArray(s.sealedSwords)) return 'sealedSwords 가 배열이 아님';
  if (!Array.isArray(s.fallenSwords || [])) return 'fallenSwords 가 배열이 아님';
  if ((s.fallenSwords || []).length > 30) return '검총 상한 초과: ' + s.fallenSwords.length;
  if ((s.enshrined || []).length > 3) return '전당 상한 초과: ' + s.enshrined.length;
  const bad = [];
  deepFindBad(s, 'state', bad, 0);
  if (bad.length) return '비유한 수 발견 — ' + bad.join(', ');
  return null;
}

module.exports = { createPlayer, checkInvariants, SAVE_KEY };

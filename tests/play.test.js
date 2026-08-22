'use strict';
// v400 實戰(실전) — 실행 관문
//
// 다른 다섯 테스트 파일은 게임의 *조각*을 검증한다: 순수 함수(pure), 격리 추출 함수(logic),
// 소스 텍스트 패턴(integrity), 정규화 동작(load), 재구현 모델(simulation).
// **게임 자체를 실행하는 것은 이 파일뿐이다.**
//
// 여기서만 볼 수 있는 것: 부팅 예외 · 렌더 예외 · 모달 교착 · 이벤트 배선 누락 ·
// 상태 붕괴 · 누수 · 손상 세이브의 실제 관통. 정적 검사로는 구조적으로 도달할 수 없다.

const { test } = require('node:test');
const assert = require('node:assert');
const { boot } = require('./domshim.js');
const { createPlayer, checkInvariants } = require('./player.js');

const SAVE_KEY = 'reinforce_sword_v1';

function firstErrors(env, n) {
  return env.errors.slice(0, n || 3)
    .map(e => e.where + ' | ' + e.message + ' | ' + String(e.stack || '').split('\n')[1])
    .join('\n');
}

function closeModals(p) {
  p.doc.querySelectorAll('.modal.active').forEach(m => {
    const c = m.querySelector('[data-close]');
    if (c) { try { c.click(); } catch (e) { /* 수집은 env.errors 가 한다 */ } }
    else m.classList.remove('active');
  });
}

// ---------------------------------------------------------------------------
test('부팅: 게임 IIFE 전체가 예외 없이 실행된다', () => {
  const env = boot({ tolerateBootError: true });
  assert.strictEqual(env.errors.length, 0, '부팅 중 예외:\n' + firstErrors(env, 5));

  // 첫 렌더가 실제로 화면을 채웠는가 (부팅만 하고 아무것도 안 그리는 상태 방지)
  const enhance = env.doc.getElementById('btn-enhance');
  assert.ok(enhance, '강화 버튼이 없다');
  assert.match(enhance.textContent, /강/, '강화 버튼이 그려지지 않았다: ' + JSON.stringify(enhance.textContent));

  // 세이브가 기록되고 파싱 가능해야 한다
  const raw = env.localStorage.getItem(SAVE_KEY);
  assert.ok(raw, '부팅 후 세이브가 기록되지 않았다');
  const s = JSON.parse(raw);
  assert.strictEqual(s.level, 0);
  assert.strictEqual(s.hasSword, true);

  // 부팅 시 등록되는 상시 타이머 (checkGameOver 등) 가 실제로 살아 있어야 한다
  assert.ok(env.clock.pending() > 5, '부팅 타이머가 등록되지 않았다: ' + env.clock.pending());

  // 기본값 규율: 간결 모드는 기본 ON (v387)
  assert.ok(env.doc.body.classList.contains('simple-mode'), '간결 모드가 기본 ON 이 아니다');
});

// ---------------------------------------------------------------------------
test('첫 진입: 인트로 → 도움말 → 플레이 가능 상태로 이어진다', () => {
  const p = createPlayer({ seed: 4 });
  p.tick(6000);   // 인트로 페이드(2.8s) + 도움말 자동 오픈
  assert.ok(p.active('help-modal'), '첫 진입에서 도움말이 열리지 않았다');

  const close = p.$('help-modal').querySelector('[data-close]');
  assert.ok(close, '도움말에 닫기 경로가 없다 — 첫 진입이 교착된다');
  close.click();
  p.tick(300);
  assert.ok(!p.active('help-modal'), '도움말이 닫히지 않았다');

  // 닫은 뒤 실제로 강화가 되는가
  const before = p.state().level;
  p.click('btn-enhance', 'enhance');
  p.tick(1200);
  assert.ok(p.state().level > before, '첫 강화(+0→+1, 성공률 100%)가 반영되지 않았다');
  assert.strictEqual(p.env.errors.length, 0, firstErrors(p.env, 5));
});

// ---------------------------------------------------------------------------
test('장기 자동 플레이: 예외 0 · 상태 불변식 유지', () => {
  const runs = [
    { seed: 1, policy: { sellAt: 5, rescue: 'take', challenge: 'auto' } },
    { seed: 42, policy: { sellAt: 8, rescue: 'gamble', challenge: 'slay' } },
    { seed: 777, policy: { sellAt: 3, rescue: 'release', challenge: 'flee' } },
  ];
  for (const r of runs) {
    const p = createPlayer(r);
    p.tick(4000);
    closeModals(p);
    const kinds = p.run(220);
    const s = p.state();

    assert.strictEqual(p.env.errors.length, 0,
      'seed ' + r.seed + ' 플레이 중 예외:\n' + firstErrors(p.env, 5));
    assert.strictEqual(checkInvariants(s, p.env), null, 'seed ' + r.seed + ' 불변식 위반');

    // 로봇이 실제로 게임을 진행시켰는가 (아무것도 못 하고 220걸음을 흘려보낸 상태 방지)
    assert.ok((kinds.enhance || 0) > 30, 'seed ' + r.seed + ' 강화가 거의 일어나지 않았다: ' + JSON.stringify(kinds));
    assert.ok(s.stats.enhanceAttempts > 30, '강화 시도 통계가 누적되지 않았다');
  }
});

// ---------------------------------------------------------------------------
test('메뉴: 전 항목이 예외 없이 열린다 (신규 · 베테랑 두 상태)', () => {
  for (const veteran of [false, true]) {
    const p = createPlayer({ seed: 5 });
    p.tick(4000);
    closeModals(p);
    if (veteran) { p.run(200); closeModals(p); }

    const ids = p.doc.querySelectorAll('#menu-drop button').map(b => b.id).filter(Boolean)
      .concat(p.doc.querySelectorAll('#footer button').map(b => b.id).filter(Boolean));
    assert.ok(ids.length > 40, '메뉴 항목을 찾지 못했다: ' + ids.length);

    for (const id of ids) {
      if (id === 'btn-reset') continue;          // location.reload() — 하니스에서 의미 없음
      const before = p.env.errors.length;
      p.click(id, 'menu:' + id);
      p.tick(250);
      assert.strictEqual(p.env.errors.length, before,
        (veteran ? '베테랑' : '신규') + ' 상태에서 ' + id + ' 가 예외를 던졌다:\n' + firstErrors(p.env, 3));
      closeModals(p);
      p.tick(150);
    }
  }
});

// ---------------------------------------------------------------------------
test('회수창: 세 길(줍기 · 도박 · 방하)이 실제로 동작한다', () => {
  // 파괴가 일어나야 회수창이 뜬다 — 팔지 않고 계속 강화해 파괴 구간으로 밀어 넣는다.
  function reachVoid(seed, rescue) {
    // 먼저 낮은 강화도에서 팔아 조각을 모으고(파괴 구간을 버틸 자금), 그 다음 팔지 않고 밀어붙인다.
    const p = createPlayer({ seed, policy: { sellAt: 4, rescue, challenge: 'flee' } });
    p.tick(4000);
    closeModals(p);
    p.run(160);
    p.policy.sellAt = 99;
    for (let i = 0; i < 400; i++) {
      p.step();
      if (p.active('void')) return p;
      const s = p.state();
      if (s && s.hasSword && s.shards < 60) p.policy.sellAt = 4;   // 자금이 마르면 다시 벌어온다
      else if (s && s.level >= 5) p.policy.sellAt = 99;
    }
    return null;
  }

  for (const mode of ['take', 'gamble', 'release']) {
    const p = reachVoid(9, mode);
    assert.ok(p, mode + ': 400걸음 안에 검이 부서지지 않았다 (파괴 구간에 닿지 못함)');

    const before = p.state();
    assert.strictEqual(before.hasSword, false, '회수창인데 검이 남아 있다');

    const btn = mode === 'take' ? 'rescue-circle' : (mode === 'gamble' ? 'rescue-gamble' : 'rescue-release');
    assert.ok(p.$(btn), mode + ': 버튼 ' + btn + ' 가 없다');
    p.click(btn, mode);
    p.tick(1500);

    const after = p.state();
    assert.strictEqual(p.env.errors.length, 0, mode + ' 중 예외:\n' + firstErrors(p.env, 3));
    assert.ok(!p.active('void'), mode + ' 이후에도 회수창이 닫히지 않았다 — 교착');

    if (mode === 'release') {
      // v378 放下 — 보상 0이 이 길의 전부. 실패로 집계하지 않는다.
      assert.strictEqual(after.shards, before.shards, '방하가 조각을 주었다 — 보상 0 규율 위반');
      assert.strictEqual(after.stats.rescueFailed || 0, before.stats.rescueFailed || 0,
        '방하가 회수 실패로 집계되었다 — 실패가 아니다');
      assert.ok((after.stats.released || 0) > (before.stats.released || 0), '방하 통계가 오르지 않았다');
    }
    if (mode === 'take') {
      assert.ok(after.shards > before.shards, '줍기가 조각을 주지 않았다');
    }
    // 어느 길이든 무덤이 하나 생기고 회수 결과가 확정되어야 한다 (v373 검총)
    const graves = after.fallenSwords || [];
    assert.ok(graves.length > 0, mode + ': 검총에 무덤이 생기지 않았다');
    assert.notStrictEqual(graves[graves.length - 1].rescued, null,
      mode + ': 마지막 무덤의 회수 결과가 확정되지 않았다 (null 고착)');
  }
});

// ---------------------------------------------------------------------------
test('검없음 차원: 파괴 후 새 검 빚기로 흐름이 이어진다 (v389 부활 차원)', () => {
  const p = createPlayer({ seed: 9, policy: { sellAt: 4, rescue: 'release', challenge: 'flee' } });
  p.tick(4000);
  closeModals(p);
  p.run(160);                 // 조각 확보
  p.policy.sellAt = 99;       // 팔지 않고 파괴 구간으로

  // 파괴 직후에는 회수창이 아직 안 떴을 수 있다 (v368 350ms 갭 + v98 刹那 충전 지연).
  // 갭 중에는 voidPending 이 모든 행동을 막는 것이 **정상**이므로, 회수창이 실제로
  // 해소되었다는 게임 측 신호(마지막 무덤의 rescued 확정)를 기다린다.
  const voidSettled = (s) => {
    const g = (s.fallenSwords || [])[(s.fallenSwords || []).length - 1];
    return !!g && g.rescued !== null && g.rescued !== undefined;
  };
  let reached = false;
  for (let i = 0; i < 500 && !reached; i++) {
    p.step();
    const s = p.state();
    if (s && !s.hasSword && !p.active('void') && voidSettled(s)) reached = true;
    else if (s && s.hasSword && s.shards < 60) p.policy.sellAt = 4;
    else if (s && s.level >= 5) p.policy.sellAt = 99;
  }
  assert.ok(reached, '500걸음 안에 검없음 상태에 닿지 못했다');

  const before = p.state();
  const btn = p.$('btn-enhance');
  assert.strictEqual(btn.dataset.mode, 'newsword',
    '검없음인데 강화 버튼이 새 검 모드로 바뀌지 않았다: ' + btn.dataset.mode);
  assert.ok(!btn.disabled || before.shards < 50,
    '조각이 충분한데 새 검 빚기가 비활성이다 (조각 ' + before.shards + ')');

  if (!btn.disabled) {
    btn.click();
    p.tick(1200);
    closeModals(p);
    const after = p.state();
    assert.strictEqual(after.hasSword, true, '새 검 빚기를 눌렀는데 검이 생기지 않았다');
    assert.ok(after.shards < before.shards, '새 검이 조각을 소모하지 않았다');
  }
  assert.strictEqual(p.env.errors.length, 0, firstErrors(p.env, 3));
});

// ---------------------------------------------------------------------------
test('손상 세이브: 적대적 값으로 부팅해도 살아남고 XSS가 관통하지 않는다', () => {
  const XSS = '<img src=x onerror="__pwn=1"><svg onload="__pwn=1"></svg>';
  const hostile = {
    level: 999, shards: -1e9, protections: 'NaN', hasSword: true, bestLevel: 999,
    totalDestroyed: 'x', totalSlain: null, whetstones: [], spiritstones: {},
    sealedSwords: [
      { level: 99, form: '<script>__pwn=1</script>', inscriptions: [XSS, 42, null],
        name: XSS, verse: [XSS], soul: 500, slainCount: -3,
        oath: { key: XSS, name: XSS, broken: 'yes' }, reforgedFrom: XSS, birthStatement: XSS },
      null, 'garbage', 7,
    ],
    enshrined: [{ level: 'x', name: XSS, inscriptions: XSS }],
    fallenSwords: [{ level: 1e9, form: 'ZZZ', soul: 9999, name: XSS, rescued: 'maybe', released: 'no' }],
    nemesis: { name: XSS, origin: 'nope', typeKey: 'nope', strength: 9999, wins: -5 },
    nemesesArchive: [{ name: XSS, origin: XSS, strength: 'x' }],
    currentSword: { enhanceAttempts: -1, slainCount: 'x', inscriptions: XSS, form: 'BAD',
      soul: -100, levelHistory: 'nope', scars: null },
    stats: { enhanceAttempts: '9', sealed: {}, defeats: [] },
    settings: { simpleMode: 'yes', reduceMotion: 1 },
    eras: 'nope', guardianIdx: 999, recentLog: 'nope',
  };

  const p = createPlayer({ seed: 3, storage: { [SAVE_KEY]: JSON.stringify(hostile) } });
  assert.strictEqual(p.env.errors.length, 0, '손상 세이브 부팅에서 예외:\n' + firstErrors(p.env, 5));
  // 게임 자신의 인라인 <script> 는 body 안에 있다 — 기준선을 잡고 *증가분*만 본다.
  const baseScripts = p.doc.body.querySelectorAll('script').length;
  p.tick(4000);
  closeModals(p);

  // 정규화가 실제로 적용되었는가 (격리 테스트가 아니라 진짜 부팅 경로에서)
  const s = p.state();
  assert.strictEqual(checkInvariants(s, p.env), null, '손상 세이브가 정규화되지 않았다');

  // 모든 모달을 열어 오염된 값이 렌더를 통과하게 한다
  const ids = p.doc.querySelectorAll('#menu-drop button').map(b => b.id).filter(Boolean)
    .concat(p.doc.querySelectorAll('#footer button').map(b => b.id).filter(Boolean));
  for (const id of ids) {
    if (id === 'btn-reset') continue;
    p.click(id, 'hostile:' + id);
    p.tick(200);
    closeModals(p);
  }
  p.run(60);

  assert.strictEqual(p.env.errors.length, 0, '손상 세이브 순회 중 예외:\n' + firstErrors(p.env, 5));

  // XSS: 주입 문자열이 요소로 파싱되어 트리에 들어가면 안 된다.
  const injected = p.doc.body.querySelectorAll('img[onerror], svg[onload]');
  assert.strictEqual(injected.length, 0,
    '주입된 마크업이 DOM 요소로 살아났다: ' + injected.map(e => e.tagName).join(','));
  assert.strictEqual(p.doc.body.querySelectorAll('script').length, baseScripts,
    '오염된 값에서 <script> 요소가 새로 생겼다');
  // (stripTags 는 태그만 벗기고 잔여 문자열은 무해한 텍스트로 남긴다 — 그것이 의도다.)
  assert.strictEqual(p.env.sandbox.__pwn, undefined, 'XSS 페이로드가 실행되었다');
});

// ---------------------------------------------------------------------------
test('누수 없음: 장기 실행 후 DOM 노드와 타이머가 유계로 유지된다', () => {
  const p = createPlayer({ seed: 21, policy: { sellAt: 6, rescue: 'take', challenge: 'auto' } });
  p.tick(4000);
  closeModals(p);

  const countNodes = () => {
    let n = 0;
    const walk = (node) => { n++; node.childNodes.forEach(walk); };
    walk(p.doc.body);
    return n;
  };

  // 액션 직후의 스냅샷은 연출 입자·컷씬의 단명 타이머로 크게 튄다 (시각대에 따라 활성 연출이
  // 달라 KST 88 vs UTC 269 까지 벌어졌다). 누수는 *가라앉은 뒤에도 남는 것*이므로 정지 후 잰다.
  const settle = () => { p.tick(8000); return { nodes: countNodes(), timers: p.env.clock.pending() }; };

  p.run(120);
  const base = settle();

  p.run(400);
  const now = settle();

  assert.strictEqual(p.env.errors.length, 0, firstErrors(p.env, 3));
  // 연출 입자·오버레이는 자동 정리되어야 한다. 안정 상태가 불어나면 누수다.
  assert.ok(now.nodes < base.nodes * 2, 'DOM 노드가 누적된다: ' + base.nodes + ' → ' + now.nodes);
  assert.ok(now.timers < base.timers * 2 + 20,
    '타이머가 누적된다 (정지 후 기준): ' + base.timers + ' → ' + now.timers);
});

// ---------------------------------------------------------------------------
test('도전 중: 아래 행동 버튼이 잠기고, 해결되면 진짜 조건으로 되돌아온다', () => {
  // #challenge 는 #stage 만 덮는다 — 그 아래 #actions 의 강화·팔기·융검은 화면에 그대로 남는다.
  // 잠그지 않으면 평소 라벨 그대로 활성인데 누르면 조용히 무시된다 (표시 ≠ 실제).
  const p = createPlayer({ seed: 3, policy: { sellAt: 99, rescue: 'take', challenge: 'auto' } });
  p.tick(4000);
  closeModals(p);

  let hit = false;
  for (let i = 0; i < 600 && !hit; i++) {
    p.step();
    const s = p.state();
    if (p.active('challenge') && s && s.level >= 5) hit = true;
  }
  assert.ok(hit, '600걸음 안에 +5 이상에서 도전을 만나지 못했다');

  for (const id of ['btn-enhance', 'btn-seal-direct', 'btn-fusion']) {
    const b = p.$(id);
    assert.ok(b, id + ' 없음');
    assert.strictEqual(b.disabled, true, '도전 중인데 ' + id + ' 가 활성이다 (눌러도 무반응)');
    assert.match(b.title || '', /대치 중/, id + ' 에 잠긴 사유가 없다');
  }

  // 눌러도 상태가 변하지 않아야 한다 (잠금이 실제로 작동하는지)
  const before = p.state();
  p.$('btn-enhance').click();
  p.tick(600);
  const mid = p.state();
  assert.strictEqual(mid.level, before.level, '잠금 중 강화가 실행됐다');
  assert.strictEqual(mid.shards, before.shards, '잠금 중 조각이 소모됐다');

  // 물러나면 각 버튼의 진짜 조건으로 복원되어야 한다
  p.click('btn-flee', 'flee');
  p.tick(2000);
  assert.ok(!p.active('challenge'), '도망 후에도 도전이 남아 있다');
  const eb = p.$('btn-enhance');
  const after = p.state();
  if (after.hasSword && after.shards > 0) {
    assert.strictEqual(eb.disabled, false, '도전이 끝났는데 강화가 잠긴 채 남았다 (영구 잠금)');
    const b2 = p.state();
    eb.click();
    p.tick(1200);
    assert.notStrictEqual(p.state().shards, b2.shards, '해제 후 강화가 실제로 동작하지 않는다');
  }
  assert.strictEqual(p.env.errors.length, 0, firstErrors(p.env, 3));
});

// ---------------------------------------------------------------------------
test('정점: 도(+15) 도달 → 엔딩 → 봉인 의식이 예외 없이 완주한다', () => {
  // 맨 곡선으로는 정직한 등정이 사실상 불가능하다 (풍동 실측 + 이 하니스로 재확인: 조각 9,000 ·
  // 방지권 300 을 쏟아도 +12 에서 멈춘다). 정점의 *코드 경로* — 엔딩 컷씬 · 도 의식 · 일생시 ·
  // 검명 · 始祖 — 를 실행시키기 위해 +14 검을 심고 마지막 한 걸음만 실제로 올린다.
  const seeded = {
    level: 14, shards: 200000, protections: 500, spiritstones: 900,
    hasSword: true, bestLevel: 14, swordGeneration: 12,
    currentSword: {
      enhanceAttempts: 40, slainCount: 6, inscriptions: ['백련', '강체'], form: '직',
      soul: 70, startLevel: 0, levelHistory: [0, 5, 10, 14], scars: 2,
    },
    sealedSwords: [], stats: {},
  };
  const p = createPlayer({
    seed: 5, storage: { [SAVE_KEY]: JSON.stringify(seeded) },
    policy: { sellAt: 99, rescue: 'take', challenge: 'auto', climb: true, stockMin: 1e9 },
  });
  p.tick(4000);
  closeModals(p);

  let reached = false;
  for (let i = 0; i < 1500 && !reached; i++) {
    p.step();
    const s = p.state();
    if (s && s.level >= 15) reached = true;
  }
  assert.ok(reached, '심어둔 +14 검으로도 1500걸음 안에 도에 이르지 못했다');
  assert.strictEqual(p.env.errors.length, 0, '정점 도달 중 예외:\n' + firstErrors(p.env, 5));

  const atWay = p.state();
  assert.ok((atWay.currentSword.inscriptions || []).includes('도'), '도 명문이 새겨지지 않았다');
  assert.strictEqual(atWay.endingShown, true, '엔딩 컷씬이 발동하지 않았다');

  // 엔딩(14초)이 스스로 닫혀야 한다 — 닫히지 않으면 화면이 영구히 덮인다
  p.tick(20000);
  closeModals(p);
  assert.ok(!p.active('ending-overlay'), '엔딩 오버레이가 스스로 닫히지 않았다');

  // 남은 도전을 정리한 뒤 봉인 (도 검 매각 = 의식 컷씬 + 일생시 + 검명)
  for (let i = 0; i < 30 && p.active('challenge'); i++) p.step();
  const sealBtn = p.$('btn-seal-direct');
  assert.strictEqual(sealBtn.disabled, false, '정점 검을 팔 수 없다');
  sealBtn.click();
  p.tick(1000);
  if (p.active('name-modal')) { p.click('name-confirm', 'name-confirm'); p.tick(2000); }
  p.tick(20000);
  closeModals(p);
  p.tick(2000);

  const after = p.state();
  assert.strictEqual(p.env.errors.length, 0, '정점 봉인 중 예외:\n' + firstErrors(p.env, 5));
  assert.strictEqual(after.sealedSwords.length, 1, '정점 검이 계보에 남지 않았다');
  assert.ok(after.stats.wayReached >= 1, '도 도달 통계가 오르지 않았다');
  assert.strictEqual(after.firstWayReached, true, '始祖(첫 도) 표식이 서지 않았다');

  const sw = after.sealedSwords[0];
  assert.ok((sw.inscriptions || []).includes('도'), '봉인 기록에 도 명문이 없다');
  assert.strictEqual((sw.verse || []).length, 4, '일생시 4행이 생성되지 않았다: ' + JSON.stringify(sw.verse));
  assert.ok(sw.name && sw.name.length > 0, '검명이 붙지 않았다');

  // 봉인 후 새 검이 이어져야 한다 (흐름 단절 방지)
  assert.strictEqual(after.hasSword, true, '정점 봉인 후 새 검이 이어지지 않았다');
});

// ---------------------------------------------------------------------------
test('소독 전수: 세이브의 모든 문자열을 오염시켜도 어떤 모달도 위험 요소를 만들지 않는다', () => {
  // 필드를 열거하는 방식은 새로 붙는 컬렉션을 놓친다 — 실제로 탁본(v136)·최근 일지(v75)가
  // 그렇게 소독 대칭에서 빠져 있었다. 여기서는 진짜 플레이로 만든 세이브의 *모든* 문자열을
  // 페이로드로 바꾼 뒤 전 모달을 순회한다. 앞으로 어떤 컬렉션이 추가돼도 이 관문에 걸린다.
  const PAY = '<img src=x onerror="globalThis.__pwn=1"><svg onload="globalThis.__pwn=1"></svg>';

  const seedP = createPlayer({ seed: 8, policy: { sellAt: 4 } });
  seedP.tick(4000);
  closeModals(seedP);
  seedP.run(160);
  const good = JSON.parse(seedP.env.localStorage.getItem(SAVE_KEY));

  let poisoned = 0;
  const poison = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 5) return;
    if (Array.isArray(o)) { o.forEach(v => poison(v, depth + 1)); return; }
    Object.keys(o).forEach(k => {
      if (typeof o[k] === 'string') { o[k] = PAY; poisoned++; }
      else poison(o[k], depth + 1);
    });
  };
  poison(good, 0);
  assert.ok(poisoned > 20, '오염시킬 문자열이 너무 적다 (' + poisoned + ') — 세이브 생성이 실패했을 수 있다');

  const p = createPlayer({ seed: 2, storage: { [SAVE_KEY]: JSON.stringify(good) } });
  assert.strictEqual(p.env.errors.length, 0, '오염 세이브 부팅 예외:\n' + firstErrors(p.env, 5));
  p.tick(4000);
  closeModals(p);

  const DANGEROUS = 'img[onerror], svg[onload], iframe, object, embed';
  const baseScripts = p.doc.body.querySelectorAll('script').length;
  assert.strictEqual(p.doc.body.querySelectorAll(DANGEROUS).length, 0,
    '부팅만으로 위험 요소가 생성됐다 (사용자 조작 0회)');

  const ids = p.doc.querySelectorAll('#menu-drop button').map(b => b.id).filter(Boolean)
    .concat(p.doc.querySelectorAll('#footer button').map(b => b.id).filter(Boolean));
  for (const id of ids) {
    if (id === 'btn-reset') continue;
    p.click(id, 'poison:' + id);
    p.tick(200);
    const found = p.doc.body.querySelectorAll(DANGEROUS);
    assert.strictEqual(found.length, 0,
      id + ' 가 오염된 값으로 위험 요소를 만들었다: ' + found.map(e => e.tagName).join(','));
    closeModals(p);
    p.tick(100);
  }
  p.run(60);
  assert.strictEqual(p.doc.body.querySelectorAll(DANGEROUS).length, 0, '플레이 중 위험 요소 생성');
  assert.strictEqual(p.doc.body.querySelectorAll('script').length, baseScripts, '<script> 요소가 새로 생겼다');
  assert.strictEqual(p.env.sandbox.__pwn, undefined, '페이로드가 실행됐다');
  assert.strictEqual(p.env.errors.length, 0, '오염 순회 중 예외:\n' + firstErrors(p.env, 5));
});

// ---------------------------------------------------------------------------
test('키보드: 눌러 둔 손가락(auto-repeat)이 결정을 대신 내리지 않는다', () => {
  // 이 게임의 본질은 「파괴 후 5초 회수 윈도우의 침묵」이다. 실측된 결함: Space 를 홀드하면
  // 그 침묵이 1.3초에 태워지고 조각 회수 → 새 검 구매(-50) → +7 강화까지 한 홀드로 연쇄했다.
  function toVoid(seed) {
    const p = createPlayer({ seed, policy: { sellAt: 4, rescue: 'take', challenge: 'flee' } });
    p.tick(4000);
    closeModals(p);
    p.run(160);
    p.policy.sellAt = 99;
    for (let i = 0; i < 500; i++) {
      p.step();
      if (p.active('void')) return p;
      const s = p.state();
      if (s && s.hasSword && s.shards < 60) p.policy.sellAt = 4;
      else if (s && s.level >= 5) p.policy.sellAt = 99;
    }
    return null;
  }

  const hold = toVoid(9);
  assert.ok(hold, '회수창에 닿지 못했다');
  const b = hold.state();
  hold.key(' ');                                     // 최초 keydown (repeat 아님)
  for (let i = 0; i < 60; i++) {                     // 손가락을 누르고 있는 2초
    hold.key(' ', { repeat: true });
    hold.env.clock.advance(33, hold.env.record);
  }
  const a = hold.state();
  assert.strictEqual(a.swordGeneration, b.swordGeneration,
    '홀드가 새 검까지 빚었다 (5초의 침묵이 태워짐): gen ' + b.swordGeneration + ' → ' + a.swordGeneration);
  assert.strictEqual(a.level, b.level, '홀드가 새 검을 강화까지 했다');
  assert.strictEqual(hold.env.errors.length, 0, firstErrors(hold.env, 3));

  // 또박또박 누르는 것은 그대로 동작해야 한다 (v390 — 키보드로 새 검 빚기 약속 포함)
  const tap = toVoid(9);
  assert.ok(tap, '회수창에 닿지 못했다 (tap)');
  const t0 = tap.state();
  tap.key(' ');
  tap.tick(1200);
  const t1 = tap.state();
  assert.ok(t1.shards > t0.shards, '또박또박 누른 Space 가 회수하지 못했다');
  tap.key(' ');
  tap.tick(1200);
  assert.ok(tap.state().swordGeneration > t1.swordGeneration, '이어진 Space 가 새 검을 빚지 못했다');
});

// ---------------------------------------------------------------------------
test('키보드: 모달이 도전을 덮고 있으면 보이지 않는 베기가 확정되지 않는다', () => {
  const p = createPlayer({ seed: 3, policy: { sellAt: 99, rescue: 'take', challenge: 'auto' } });
  p.tick(4000);
  closeModals(p);
  let hit = false;
  for (let i = 0; i < 600 && !hit; i++) {
    p.step();
    const s = p.state();
    if (p.active('challenge') && s && s.level >= 5) hit = true;
  }
  assert.ok(hit, '도전을 만나지 못했다');

  p.click('btn-stats', 'open-modal');
  p.tick(300);
  assert.ok(p.doc.querySelector('.modal.active'), '모달이 열리지 않았다');

  const b = p.state();
  p.key(' ');
  p.tick(1500);
  const a = p.state();
  assert.strictEqual(a.totalSlain, b.totalSlain, '가려진 도전에서 베기가 확정됐다');
  assert.strictEqual(a.level, b.level, '가려진 도전에서 검 단계가 변했다');
  assert.ok(p.active('challenge'), '가려진 도전이 조용히 사라졌다');
});

// ---------------------------------------------------------------------------
test('겁의 교체: 저문 시대의 그림자를 새 겁으로 데려가지 않는다', () => {
  const p = createPlayer({ seed: 3, policy: { sellAt: 99, rescue: 'ignore', challenge: 'auto' } });
  p.tick(4000);
  closeModals(p);
  let hit = false;
  for (let i = 0; i < 600 && !hit; i++) {
    p.step();
    const s = p.state();
    if (p.active('challenge') && s && s.level >= 3) hit = true;
  }
  assert.ok(hit, '도전을 만나지 못했다');

  p.$('gameover-restart').click();
  p.tick(1500);
  assert.ok(!p.active('challenge'), '재시작 후에도 옛 그림자가 새 무대를 덮고 있다');

  const s = p.state();
  assert.strictEqual(s.hasSword, true, '새 겁의 검이 없다');
  const eb = p.$('btn-enhance');
  assert.strictEqual(eb.disabled, false, '새 겁의 검이 잠긴 채 시작한다');
  const b = p.state();
  eb.click();
  p.tick(1200);
  assert.notStrictEqual(p.state().level, b.level, '새 겁의 첫 강화(+0→+1)가 동작하지 않는다');
  assert.strictEqual(p.env.errors.length, 0, firstErrors(p.env, 3));
});

// ---------------------------------------------------------------------------
test('招影: 부를 수 있는 상태가 실제로 존재한다 (사문 회귀 차단)', () => {
  // v375 초영은 조건이 조합소 입장 조건(+0 에서만)과 상호 배타라 누를 수 있는 상태가
  // 아예 없었다 — 기능 전체가 사문이었다. 두 게이트가 다시 배타가 되면 여기서 걸린다.
  const openForge = (save) => {
    const p = createPlayer({ seed: 7, storage: { [SAVE_KEY]: JSON.stringify(save) } });
    p.tick(4000);
    closeModals(p);
    p.click('btn-forge', 'forge');
    p.tick(300);
    assert.ok(p.active('forge-modal'), '조합소가 열리지 않았다 (level ' + save.level + ')');
    return p;
  };
  const btnState = (p) => {
    const out = {};
    p.doc.querySelectorAll('.recipe-btn').forEach(b => { out[b.dataset.recipe] = !b.disabled; });
    return out;
  };

  // +0 — 도구를 빚는 자리 (설계 의도: 강화 시작 전 전략 준비)
  const zero = btnState(openForge({ hasSword: true, level: 0, shards: 500 }));
  ['protection', 'whetstone', 'spiritstone', 'divinationstone'].forEach(k =>
    assert.strictEqual(zero[k], true, '+0 에서 ' + k + ' 를 빚을 수 없다'));
  assert.strictEqual(zero.summon, false, '+0(그림자 최소 단계 미만)에서 초영이 열려 있다');

  // +3 — 그림자를 부를 수 있는 자리
  const p3 = openForge({ hasSword: true, level: 3, shards: 500,
    currentSword: { form: '직', inscriptions: [], soul: 0, enhanceAttempts: 5 } });
  const three = btnState(p3);
  assert.strictEqual(three.summon, true, '+3 에서도 초영을 부를 수 없다 — 여전히 사문');
  ['protection', 'whetstone', 'spiritstone'].forEach(k =>
    assert.strictEqual(three[k], false, '+3 에서 ' + k + ' 가 열려 있다 (도구는 +0 에서만)'));
  assert.match(p3.doc.querySelector('[data-recipe="whetstone"]').title || '', /\+0/,
    '비활성 사유가 표시되지 않는다');

  // 실제로 불러진다 — 비용 차감 · 도전 등장 · 통계 집계
  const before = p3.state();
  p3.doc.querySelector('[data-recipe="summon"]').click();
  p3.tick(1200);
  const after = p3.state();
  assert.ok(after.shards < before.shards, '초영이 조각을 소모하지 않았다');
  assert.ok(p3.active('challenge'), '초영이 그림자를 부르지 못했다');
  assert.strictEqual((after.stats.summoned || 0), (before.stats.summoned || 0) + 1, '초영 통계 미집계');
  assert.strictEqual(p3.env.errors.length, 0, firstErrors(p3.env, 3));
});

// ---------------------------------------------------------------------------
test('확률 표시: 무장 토글이 화면의 숫자를 즉시 바꾼다 (표시 ≠ 실제 방지)', () => {
  // 표시 계산은 armed 숫돌·영석을 이미 반영하는데 토글에 리스너가 없어 화면이 굳어 있었다:
  // 영석 25조각을 쓰고도 「파괴 10%」가 남고, 숫돌을 켜도 표시 63% vs 실제 굴림 88% 였다.
  const p = createPlayer({ seed: 7, storage: { [SAVE_KEY]: JSON.stringify({
    hasSword: true, level: 6, shards: 5000, spiritstones: 3, whetstones: 3,
    currentSword: { form: '직', inscriptions: [], soul: 0, enhanceAttempts: 8, levelHistory: [0, 6], startLevel: 0 },
    settings: { simpleMode: false },
  }) } });
  p.tick(4000);
  closeModals(p);
  p.tick(300);

  const fail = () => (p.$('odds-fail').textContent || '').trim();
  const succ = () => (p.$('odds-success').textContent || '').trim();
  const pct = () => { const m = succ().match(/(\d+)%/); return m ? parseInt(m[1], 10) : -1; };

  const base = pct();
  assert.ok(base > 0, '성공률 표시를 읽지 못했다: ' + succ());
  assert.match(fail(), /파괴/, '이 단계에는 파괴 위험이 있어야 한다: ' + fail());

  // 영석 — 파괴를 막는다. 화면에서 파괴 표기가 사라져야 한다.
  p.$('spirit-check').click();
  p.tick(100);
  assert.doesNotMatch(fail(), /파괴/, '영석을 켰는데 파괴 표기가 남아 있다: ' + fail());
  p.$('spirit-check').click();
  p.tick(100);
  assert.match(fail(), /파괴/, '영석을 껐는데 파괴 표기가 돌아오지 않는다 (위험 은폐 고착): ' + fail());

  // 숫돌 — 성공률 +25%
  p.$('whet-check').click();
  p.tick(100);
  assert.ok(pct() > base, '숫돌을 켰는데 성공률 표시가 그대로다: ' + base + '% → ' + pct() + '%');
  p.$('whet-check').click();
  p.tick(100);
  assert.strictEqual(pct(), base, '숫돌을 껐는데 성공률이 되돌아오지 않는다');

  assert.strictEqual(p.env.errors.length, 0, firstErrors(p.env, 3));
});

// ---------------------------------------------------------------------------
test('招影 × 매각: 이미 판 검이 도전 판정의 근거가 되지 않는다', () => {
  // 초영은 조합소를 닫고 450ms 뒤에 발화한다. 그 사이 검을 팔면 매각 전환 창(dissolve 800ms ·
  // 명명 모달 대기) 동안 state.hasSword/level 이 판 검의 값을 그대로 들고 있어, 계보에 들어가고
  // 대금까지 받은 검이 판정(level >= strength)의 근거가 됐다 — 名 보스는 검 1자루당 1회 소모라
  // 그 검으로 벤 보스가 명문 없이 영구 소멸했다. (v400 이 초영을 되살리며 함께 살아난 경로.)
  const p = createPlayer({ seed: 4, storage: { [SAVE_KEY]: JSON.stringify({
    level: 6, bestLevel: 6, shards: 3000, hasSword: true, seenHelp: true,
    currentSword: { enhanceAttempts: 0, slainCount: 0, inscriptions: [], form: '직', soul: 0 },
    sealedSwords: [],
  }) } });
  p.tick(4000);
  closeModals(p);

  p.click('btn-forge', 'forge');
  p.tick(50);
  const summon = p.doc.querySelector('[data-recipe="summon"]');
  assert.ok(summon && !summon.disabled, '초영을 부를 수 없다');
  summon.click();                       // 450ms 타이머 예약
  const paid = p.state().shards;

  p.click('btn-seal-direct', 'sell');    // 예약된 채로 매각
  p.tick(50);
  if (p.active('name-modal')) p.click('name-confirm', 'name-confirm');
  p.tick(600);                           // 450ms 발화 시점 통과

  assert.ok(!p.active('challenge'), '이미 판 검으로 도전이 열렸다');
  assert.ok(p.state().shards > paid, '어긋난 부름의 조각이 환급되지 않았다');

  p.tick(4000);
  closeModals(p);
  p.tick(1000);
  const s = p.state();
  assert.strictEqual(s.totalSlain, 0, '판 검으로 그림자를 베었다');
  assert.deepStrictEqual(s.foesSlain || {}, {}, '판 검으로 名 보스가 영구 소멸했다');
  assert.strictEqual(s.sealedSwords.length, 1, '매각 자체는 정상이어야 한다');
  assert.strictEqual(p.env.errors.length, 0, firstErrors(p.env, 3));
});

// ---------------------------------------------------------------------------
test('융검: 「도」는 계승되지 않는다 — +3 검이 道 검의 대우를 받지 않는다', () => {
  // 도는 성질이 아니라 성취 표식(level >= MAX_LEVEL)이다. 융합검은 +0 언저리에서 시작하는데
  // 이것을 물려받으면 그 자리에서 道 검이 됐다 — 보상 ×1.5 · wayReached++ · 검명 · 일생시 · 의식.
  // 봉인 때 한 번 세어진 도가 융합으로 재생산되는 루프였다.
  function fuseAndSell(topIns) {
    const p = createPlayer({ seed: 4, storage: { [SAVE_KEY]: JSON.stringify({
      hasSword: false, level: 0, shards: 5000, swordGeneration: 9,
      stats: { wayReached: 1 }, firstWayReached: true,
      sealedSwords: [
        { level: 15, form: '직', inscriptions: topIns, soul: 80, name: '직도',
          verse: ['a', 'b', 'c', 'd'], slainCount: 5, enhanceAttempts: 60 },
        { level: 4, form: '곡', inscriptions: ['초인'], soul: 20, name: '곡사',
          slainCount: 1, enhanceAttempts: 6 },
      ],
    }) } });
    p.tick(4000);
    closeModals(p);
    p.tick(300);

    p.click('btn-fusion', 'fusion');
    p.tick(400);
    // 후보 목록은 매 선택마다 다시 그려진다 — 클릭할 때마다 다시 조회해야 한다
    [0, 1].forEach(i => {
      const el = p.doc.querySelector('[data-fusion-idx="' + i + '"]');
      assert.ok(el, '융검 후보 ' + i + ' 를 찾지 못했다');
      el.click();
      p.tick(100);
    });
    const listText = p.doc.querySelectorAll('.fusion-item').map(x => x.textContent).join(' ');
    p.click('fusion-confirm', 'fuse');
    p.tick(1500);
    if (p.active('name-modal')) { p.click('name-confirm', 'name'); p.tick(1500); }
    closeModals(p);
    p.tick(800);

    // +3 까지 올린다 (팔 수 있는 최소 강화도)
    for (let i = 0; i < 150; i++) {
      const s = p.state();
      if (!s.hasSword || s.level >= 3) break;
      if (p.active('challenge')) { p.click('btn-flee', 'flee'); p.tick(1200); continue; }
      const eb = p.$('btn-enhance');
      if (eb && !eb.disabled) eb.click();
      p.tick(900);
      closeModals(p);
    }
    for (let i = 0; i < 25 && p.active('challenge'); i++) { p.click('btn-flee', 'flee'); p.tick(1200); }

    const mid = p.state();
    const before = { shards: mid.shards, way: mid.stats.wayReached };
    const sealBtn = p.$('btn-seal-direct');
    if (sealBtn.disabled) return { skipped: true, p };
    sealBtn.click();
    p.tick(800);
    if (p.active('name-modal')) { p.click('name-confirm', 'name'); p.tick(1500); }
    p.tick(10000);
    closeModals(p);
    p.tick(1000);
    const after = p.state();
    const rec = after.sealedSwords[after.sealedSwords.length - 1];
    return {
      p, listText, fusedIns: mid.currentSword.inscriptions || [], level: mid.level,
      gain: after.shards - before.shards, wayDelta: after.stats.wayReached - before.way,
      verseLines: rec ? (rec.verse || []).length : -1,
    };
  }

  const way = fuseAndSell(['도', '백련', '강체']);
  const control = fuseAndSell(['용참', '백련', '강체']);
  assert.ok(!way.skipped && !control.skipped, '융합검을 +3 까지 올리지 못했다');

  assert.ok(!way.fusedIns.includes('도'), '융합검이 도를 물려받았다: ' + way.fusedIns.join(','));
  assert.ok(way.level < 15, '이 검증은 MAX 미만 융합검을 전제한다: +' + way.level);
  assert.strictEqual(way.wayDelta, 0, '도를 물려받은 융합검 매각이 道 도달로 집계됐다');
  assert.strictEqual(way.verseLines, 0, '道 전용 일생시가 생성됐다: ' + way.verseLines + '행');
  assert.strictEqual(way.gain, control.gain,
    '도 계승 검의 매각 보상이 대조군과 다르다 (×1.5 배수 잔존): ' + way.gain + ' vs ' + control.gain);

  // 과잉 수정 방지: 후보 목록에서는 여전히 「도」가 보여야 한다 (어느 검이 道 검인지 알아야 고른다)
  assert.match(way.listText, /도/, '융검 후보 목록에서 도 표시가 사라졌다');
  assert.strictEqual(way.p.env.errors.length, 0, firstErrors(way.p.env, 3));
});

// ---------------------------------------------------------------------------
test('길의 끝: 래치되지 않는다 — 길이 다시 열리면 오버레이도 걷힌다', () => {
  // isStuck() 의 설계 근거는 「조각이 드는 행동 없이도 들어오는 수입이 매일 있으므로 조각
  // 고갈은 영구 사망이 아니다」인데, 오버레이가 래치되어 그 수입을 영영 몰랐다. 실측: 조각 10에
  // 죽고 3시간 뒤 55(새 검 비용 50 초과)가 됐는데도 오버레이는 그대로였고, 유일하게 보이는
  // 탈출구인 「다시 검을 들다」가 그 수입(55→50)과 도구(영석 1→0)를 없앴다.
  const stuckSave = {
    hasSword: false, level: 0, shards: 10, sealedSwords: [], enshrined: [], fallenSwords: [],
    swordGeneration: 3, seenHelp: true, stats: {},
    protections: 0, whetstones: 0, spiritstones: 0, divinationStones: 0,
  };
  const p = createPlayer({ seed: 5, storage: { [SAVE_KEY]: JSON.stringify(stuckSave) } });
  p.tick(6000);   // 관문 자동 처리 없이 — resolveGates 는 게임오버를 눌러 버린다
  assert.ok(p.active('gameover-overlay'), '갇힌 판인데 길의 끝이 뜨지 않았다');

  // 시간 수입이 들어오는 동안: 비용 미만이면 유지, 넘으면 걷힌다 — 시각이 아니라 *관계*를 잠근다
  let lifted = false;
  for (let i = 0; i < 24 && !lifted; i++) {     // 최대 12시간 (30분 단위)
    p.tick(1800000);
    const s = p.state();
    if (p.active('gameover-overlay')) {
      assert.ok(s.shards < 50,
        '새 검 비용(50)을 넘겼는데 길의 끝이 그대로다 (래치): 조각 ' + s.shards);
    } else {
      lifted = true;
      assert.ok(s.shards >= 50, '아직 갇혔는데 길의 끝이 걷혔다: 조각 ' + s.shards);
    }
  }
  assert.ok(lifted, '12시간 동안 시간 수입이 전혀 들어오지 않았다 — isStuck 의 설계 전제가 깨졌다');

  // 얼어 있던 표시가 되살아나야 한다 (오버레이 동안 render 가 돌지 않는다)
  const btn = p.$('btn-enhance');
  assert.strictEqual(btn.dataset.mode, 'newsword', '검없음 모드로 돌아오지 않았다');
  assert.strictEqual(btn.disabled, false, '조각이 충분한데 새 검 빚기가 잠겨 있다');
  assert.doesNotMatch(btn.textContent, /보유 10/, '버튼 라벨이 옛 조각 수에 얼어붙어 있다: ' + btn.textContent);

  // 실제로 이어져야 한다
  const before = p.state();
  btn.click();
  p.tick(1200);
  closeModals(p);
  const after = p.state();
  assert.strictEqual(after.hasSword, true, '걷힌 뒤 새 검을 빚지 못했다');
  assert.ok(after.shards < before.shards, '새 검이 조각을 소모하지 않았다');
  assert.strictEqual(p.env.errors.length, 0, firstErrors(p.env, 3));
});

// ---------------------------------------------------------------------------
test('길의 끝: 진짜 막힌 판은 걷히지 않는다 (오탐 방지)', () => {
  const p = createPlayer({ seed: 5, storage: { [SAVE_KEY]: JSON.stringify({
    hasSword: false, level: 0, shards: 0, sealedSwords: [], enshrined: [], fallenSwords: [],
    swordGeneration: 3, seenHelp: true, stats: {},
    protections: 0, whetstones: 0, spiritstones: 0, divinationStones: 0,
  }) } });
  p.tick(6000);
  assert.ok(p.active('gameover-overlay'), '길의 끝이 뜨지 않았다');
  p.tick(120000);
  assert.ok(p.active('gameover-overlay'), '아직 갇혔는데 길의 끝이 걷혔다');

  // 재시작 경로는 그대로여야 한다
  p.click('gameover-restart', 'restart');
  p.tick(1500);
  assert.ok(!p.active('gameover-overlay'), '재시작 후에도 길의 끝이 남았다');
  assert.strictEqual(p.state().hasSword, true, '재시작이 새 검을 주지 않았다');
  assert.strictEqual(p.env.errors.length, 0, firstErrors(p.env, 3));
});

// ---------------------------------------------------------------------------
test('중앙 페이드: 명문이 아닌 알림에 「명문이 새겨졌다」가 붙지 않는다', () => {
  // 이 연출은 명문 전용이 아니다 — 구사일생·검 파괴·방하·베기·보호권·예지·인트로·길 재개가
  // 같은 큐를 쓰는데 정적 부제가 전부에 붙어 매번 사실과 어긋났다.
  const p = createPlayer({ seed: 3, policy: { sellAt: 5 } });
  p.tick(4000);
  closeModals(p);
  p.tick(300);

  // 실제 명문 — 부제가 보여야 한다 (명문 사전 미리보기가 진짜 명문 키를 쓴다)
  p.click('btn-codex', 'codex');
  p.tick(400);
  const kanji = p.doc.querySelectorAll('.codex-kanji');
  assert.ok(kanji.length > 0, '명문 사전이 비어 있다');
  kanji[0].click();
  p.tick(300);
  assert.strictEqual(p.$('inscribe-sub').style.display, '', '실제 명문인데 부제가 숨겨졌다');
  closeModals(p);
  p.tick(1600);

  // 명문이 아닌 알림 — 부제가 숨어야 한다 (길 재개 페이드로 확인)
  const q = createPlayer({ seed: 5, storage: { [SAVE_KEY]: JSON.stringify({
    hasSword: false, level: 0, shards: 10, sealedSwords: [], enshrined: [], fallenSwords: [],
    swordGeneration: 3, seenHelp: true, stats: {},
    protections: 0, whetstones: 0, spiritstones: 0, divinationStones: 0,
  }) } });
  q.tick(6000);
  for (let i = 0; i < 400 && q.active('gameover-overlay'); i++) q.tick(30000);
  assert.ok(!q.active('gameover-overlay'), '길이 다시 열리지 않았다');
  assert.strictEqual(q.$('inscribe-sub').style.display, 'none',
    '명문이 아닌 알림에 「검에 명문이 새겨졌다」가 붙었다');
  assert.match(q.$('inscribe-label').textContent, /길이 다시 열렸다/, '길 재개 안내가 뜨지 않았다');
});

// ---------------------------------------------------------------------------
test('시간 보상: 타이머가 바꾼 상태가 화면에 닿는다 (조각을 쥐고도 잠기지 않는다)', () => {
  // 이 게임의 렌더 모델은 「매 액션 후 save() → render() 풀 리렌더」인데, *타이머가* 상태를
  // 바꾸는 경로(연일 마일스톤·정진·명절·첨·삼례)는 save()로 끝나 화면이 낡은 값에 고착됐다.
  // 최악의 증상: 보상이 강화 비용을 넘겨줬는데도 버튼이 disabled 인 채 굳어, 실제로는 조각을
  // 쥐고 있으면서 마우스·스페이스·엔터 어느 것도 먹지 않았다.
  // 게임은 *로컬* 시각으로 날짜 경계를 판정한다 — UTC 절대값을 박으면 CI(UTC)에서 자정을
  // 넘지 않는다 (v400 이 이미 한 번 겪은 함정). 벽시계 23:30 을 어느 시간대에서든 만든다.
  const T = new Date(2026, 4, 12, 23, 30, 0).getTime();

  // 실제 부팅이 만든 세이브를 바탕으로 삼는다 (손으로 지어낸 상태가 아니라)
  const seedP = createPlayer({ seed: 5, startTime: T });
  seedP.tick(5000);
  const base = Object.fromEntries(seedP.env.localStorage._store);
  const s = JSON.parse(base[SAVE_KEY]);
  Object.assign(s, {
    seenHelp: true, hasSword: true, level: 5, shards: 5,     // +5→+6 비용은 8 — 모자란다
    playStreak: 6, lastPlayDate: '2026-05-12', streakMilestonesShown: {},
  });
  s.currentSword = Object.assign({}, s.currentSword,
    { form: '직', startLevel: 0, inscriptions: [], soul: 5 });

  const p = createPlayer({ seed: 5, startTime: T,
    storage: Object.assign({}, base, { [SAVE_KEY]: JSON.stringify(s) }) });
  p.tick(5000);
  closeModals(p);

  const shown = () => (p.$('stat-shards').textContent || '').replace(/,/g, '').trim();
  assert.strictEqual(shown(), String(p.state().shards), '시작부터 표시가 어긋난다');
  assert.strictEqual(p.$('btn-enhance').disabled, true, '조각이 모자란데 강화가 열려 있다');

  p.tick(90 * 60 * 1000);   // 자정 통과 — 사용자 조작 0회

  const after = p.state();
  assert.ok(after.shards > 5, '자정 보상이 들어오지 않았다 — 이 검증의 전제가 깨졌다');
  assert.strictEqual(shown(), String(after.shards),
    '타이머 보상이 화면에 닿지 않았다 (표시 ' + shown() + ' vs 실제 ' + after.shards + ')');

  const eb = p.$('btn-enhance');
  assert.strictEqual(eb.disabled, false,
    '조각이 비용을 넘겼는데 강화가 잠긴 채다: ' + eb.textContent);
  assert.doesNotMatch(eb.textContent, /조 각 부 족/, '버튼 라벨이 낡은 값에 얼어붙어 있다');

  // 실제로 눌러진다
  const before = p.state();
  eb.click();
  p.tick(1200);
  closeModals(p);
  assert.notStrictEqual(p.state().shards, before.shards, '풀린 버튼이 실제로는 동작하지 않는다');
  assert.strictEqual(p.env.errors.length, 0, firstErrors(p.env, 3));
});

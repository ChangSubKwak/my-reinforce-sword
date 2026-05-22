'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./harness');

// ─────────────────────────────────────────────────────────────
// v3 封印 — 봉인 보상 곡선 sealReward(lv) = floor(lv^1.65 * 3) + lv
// ─────────────────────────────────────────────────────────────
const sealFns = loadFunctions(['sealReward']);

test('sealReward: 단조 증가 (강화도 높을수록 보상 큼)', () => {
  let prev = -1;
  for (let lv = 0; lv <= 15; lv++) {
    const r = sealFns.sealReward(lv);
    assert.ok(r > prev, `lv=${lv} 보상(${r})은 이전(${prev})보다 커야 함`);
    prev = r;
  }
});

test('sealReward: CLAUDE.md 곡선 참조값 일치', () => {
  // 참고 표: +3=21, +5=47, +7=81, +10=144, +15=276
  assert.strictEqual(sealFns.sealReward(3), 21);
  assert.strictEqual(sealFns.sealReward(5), 47);
  assert.strictEqual(sealFns.sealReward(7), 81);
  assert.strictEqual(sealFns.sealReward(10), 144);
  assert.strictEqual(sealFns.sealReward(15), 276);
});

test('sealReward: lv=0 은 0', () => {
  assert.strictEqual(sealFns.sealReward(0), 0);
});

// ─────────────────────────────────────────────────────────────
// v242 봉인 보상 단일 진원 — sealRewardBase 결정적 배수
// ─────────────────────────────────────────────────────────────
const neutralSealDeps = {
  schoolSealMul: () => 1, getSeason: () => ({ sealMul: 1 }), generationSealMul: () => 1,
};
const sealBaseFns = loadFunctions(['sealRewardBase', 'sealReward'], neutralSealDeps);

test('sealRewardBase: 중립 배수·명문 없음이면 base sealReward와 동일', () => {
  for (let lv = 0; lv <= 15; lv++) {
    assert.strictEqual(sealBaseFns.sealRewardBase(lv, [], false), sealBaseFns.sealReward(lv), 'lv=' + lv);
  }
});

test('sealRewardBase: 道 ×1.5 적용', () => {
  assert.strictEqual(sealBaseFns.sealRewardBase(15, ['道'], true), Math.floor(sealBaseFns.sealReward(15) * 1.5));
  // isWay 인자 없이 ins로만 道 감지도 동작
  assert.strictEqual(sealBaseFns.sealRewardBase(15, ['道'], false), Math.floor(sealBaseFns.sealReward(15) * 1.5));
});

test('sealRewardBase: 古(×1.10)와 久(×1.05)는 배타적, 古 우선', () => {
  const base = sealBaseFns.sealReward(10);
  assert.strictEqual(sealBaseFns.sealRewardBase(10, ['古', '久'], false), Math.floor(base * 1.10));
  assert.strictEqual(sealBaseFns.sealRewardBase(10, ['久'], false), Math.floor(base * 1.05));
});

test('sealRewardBase: 七星 ×1.5 중첩', () => {
  const base = sealBaseFns.sealReward(12);
  assert.strictEqual(sealBaseFns.sealRewardBase(12, ['七星'], false), Math.floor(base * 1.5));
});

// ─────────────────────────────────────────────────────────────
// v244 連斬 — 베기 보상 단일 진원 slayGrantAmount (streak 배수)
// ─────────────────────────────────────────────────────────────
test('slayGrantAmount: 連斬 streak 배수 적용 (3=×1.1, 5=×1.2, 7=×1.3)', () => {
  const at = s => loadFunctions(['slayGrantAmount', 'slayStreakRewardBonus'], { slayStreak: s }).slayGrantAmount(100);
  assert.strictEqual(at(0), 100, 'streak 0 → ×1');
  assert.strictEqual(at(3), 110, 'streak 3 → ×1.1');
  assert.strictEqual(at(5), 120, 'streak 5 → ×1.2');
  assert.strictEqual(at(7), 130, 'streak 7 → ×1.3');
});

test('slayGrantAmount: floor 적용 (정수 조각)', () => {
  const f = loadFunctions(['slayGrantAmount', 'slayStreakRewardBonus'], { slayStreak: 3 });
  assert.strictEqual(f.slayGrantAmount(15), Math.floor(15 * 1.1), '15×1.1=16.5 → 16');
});

// ─────────────────────────────────────────────────────────────
// v244 물러남 비용 단일 진원 fleeCost (速 형 무료)
// ─────────────────────────────────────────────────────────────
test('fleeCost: 速(fleeFree) 형은 0, 그 외 FLEE_COST', () => {
  const free = loadFunctions(['fleeCost'], { getForm: () => ({ fleeFree: true }), FLEE_COST: 3 });
  assert.strictEqual(free.fleeCost(), 0, '風 형 무료');
  const paid = loadFunctions(['fleeCost'], { getForm: () => ({}), FLEE_COST: 3 });
  assert.strictEqual(paid.fleeCost(), 3, '일반 형 FLEE_COST');
  const noForm = loadFunctions(['fleeCost'], { getForm: () => null, FLEE_COST: 3 });
  assert.strictEqual(noForm.fleeCost(), 3, 'form 없음 안전 → FLEE_COST');
});

// ─────────────────────────────────────────────────────────────
// v245 흔들림 차단 보호권 수 shakeGuardCost (표시=실제)
// ─────────────────────────────────────────────────────────────
test('shakeGuardCost: ceil((강도-레벨)/2), 최소 1', () => {
  const f = s => loadFunctions(['shakeGuardCost'], { state: { level: s } });
  assert.strictEqual(f(5).shakeGuardCost(10), 3, '(10-5)/2=2.5→3');
  assert.strictEqual(f(5).shakeGuardCost(11), 3, '(11-5)/2=3→3');
  assert.strictEqual(f(5).shakeGuardCost(5), 1, '동급 → 최소 1');
  assert.strictEqual(f(8).shakeGuardCost(6), 1, '레벨 우위여도 최소 1');
});

// ─────────────────────────────────────────────────────────────
// 강화 테이블 TABLE 불변식 (게임 곡선의 척추 — 향후 편집 안전망)
// ─────────────────────────────────────────────────────────────
const { readScript } = require('./harness');
function extractTable() {
  const js = readScript();
  const m = js.match(/const TABLE = (\[[\s\S]*?\]);/);
  if (!m) throw new Error('TABLE 정의를 찾지 못함');
  // 주석 줄(// ...) 제거 후 eval
  const cleaned = m[1].replace(/\/\/[^\n]*/g, '');
  return eval(cleaned);
}
test('TABLE: 첫 행(+0→+1)은 무료·확정 성공 (튜토리얼 불변식)', () => {
  const T = extractTable();
  assert.strictEqual(T[0].cost, 0);
  assert.strictEqual(T[0].success, 1.00);
  assert.strictEqual(T[0].destroy, 0);
  assert.strictEqual(T[0].downgrade, 0);
});
test('TABLE: 모든 행 destroy+downgrade <= 1, 확률 [0,1], cost>=0', () => {
  const T = extractTable();
  T.forEach((r, i) => {
    assert.ok(r.success >= 0 && r.success <= 1, `행 ${i} success 범위`);
    assert.ok(r.destroy >= 0 && r.destroy <= 1, `행 ${i} destroy 범위`);
    assert.ok(r.downgrade >= 0 && r.downgrade <= 1, `행 ${i} downgrade 범위`);
    assert.ok(r.destroy + r.downgrade <= 1 + 1e-9, `행 ${i} destroy+downgrade<=1 (현재 ${r.destroy + r.downgrade})`);
    assert.ok(r.cost >= 0 && Number.isFinite(r.cost), `행 ${i} cost>=0`);
  });
});
test('TABLE: 15단계(道까지) — MAX_LEVEL과 일치', () => {
  const T = extractTable();
  assert.strictEqual(T.length, 15, 'TABLE 길이 15 (현재 ' + T.length + ')');
});

// ─────────────────────────────────────────────────────────────
// v229 劍鳴 — 검 고유 소리 시그니처 (결정성 + 펜타토닉 제약)
// ─────────────────────────────────────────────────────────────
const SIGNATURE_SCALE = [262, 294, 330, 392, 440, 523, 587, 659, 784];
const sigFns = loadFunctions(['swordSignatureFreqs'], { SIGNATURE_SCALE });

test('swordSignatureFreqs: 3음 반환', () => {
  const f = sigFns.swordSignatureFreqs({ level: 5, form: '直', inscriptions: [], soul: 0 });
  assert.strictEqual(f.length, 3);
});

test('swordSignatureFreqs: 결정적 — 같은 검 같은 소리', () => {
  const s = { level: 10, form: '曲', inscriptions: ['道', '本'], soul: 67 };
  const a = sigFns.swordSignatureFreqs(s);
  const b = sigFns.swordSignatureFreqs(s);
  assert.deepStrictEqual(a, b);
});

test('swordSignatureFreqs: 다른 검은 다른 소리 (대체로)', () => {
  const a = sigFns.swordSignatureFreqs({ level: 3, form: '直', inscriptions: [], soul: 0 });
  const b = sigFns.swordSignatureFreqs({ level: 15, form: '速', inscriptions: ['道'], soul: 100 });
  assert.notDeepStrictEqual(a, b, '속성 다르면 소리 달라야 함');
});

test('swordSignatureFreqs: 모든 음이 펜타토닉 스케일 내', () => {
  for (let lv = 0; lv <= 15; lv++) {
    const f = sigFns.swordSignatureFreqs({ level: lv, form: '重', inscriptions: ['久'], soul: lv * 6 });
    f.forEach(freq => assert.ok(SIGNATURE_SCALE.includes(freq), `freq ${freq} 스케일 내`));
  }
});

test('swordSignatureFreqs: null sword 안전 처리', () => {
  const f = sigFns.swordSignatureFreqs(null);
  assert.strictEqual(f.length, 3, 'null도 3음 반환');
});

// ─────────────────────────────────────────────────────────────
// v225 無極 — 永劫 보너스 cap
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// v239 連氣 — 흐름 비용 절감 (자기제한 + 휘발성, 厄運轉機의 거울)
// ─────────────────────────────────────────────────────────────
test('flowCostReduce: 連3 미만은 0 (효과 없음)', () => {
  [0, 1, 2].forEach(s => {
    const fns = loadFunctions(['flowCostReduce'], { successStreak: s, FLOW_STEP: 0.02, FLOW_CAP: 0.10 });
    assert.strictEqual(fns.flowCostReduce(), 0, '連' + s + '은 0이어야 함');
  });
});

test('flowCostReduce: 連3=2%, 連5=6%, 단조 증가', () => {
  const r = s => loadFunctions(['flowCostReduce'], { successStreak: s, FLOW_STEP: 0.02, FLOW_CAP: 0.10 }).flowCostReduce();
  assert.ok(Math.abs(r(3) - 0.02) < 1e-9, '連3 → 2%');
  assert.ok(Math.abs(r(5) - 0.06) < 1e-9, '連5 → 6%');
  assert.ok(r(5) > r(3), '단조 증가');
});

test('flowCostReduce: 연속 성공이 커도 cap 10% (인플레이션 차단)', () => {
  [7, 12, 50].forEach(s => {
    const v = loadFunctions(['flowCostReduce'], { successStreak: s, FLOW_STEP: 0.02, FLOW_CAP: 0.10 }).flowCostReduce();
    assert.ok(Math.abs(v - 0.10) < 1e-9, '連' + s + ' → cap 10%');
  });
});

test('flowCostReduce: successStreak 비정상값 안전 (NaN/undefined → 0)', () => {
  const a = loadFunctions(['flowCostReduce'], { successStreak: undefined, FLOW_STEP: 0.02, FLOW_CAP: 0.10 }).flowCostReduce();
  assert.strictEqual(a, 0, 'undefined → 0');
});

test('eternityBonus: cap 5% (25 道)', () => {
  // state 의존 — 주입
  const states = [
    { eternityPoints: 0, expect: 0 },
    { eternityPoints: 10, expect: 0.02 },
    { eternityPoints: 25, expect: 0.05 },
    { eternityPoints: 100, expect: 0.05 },  // cap
  ];
  states.forEach(({ eternityPoints, expect }) => {
    const state = { eternityPoints };
    const fns = loadFunctions(['eternityBonus'], { state });
    assert.ok(Math.abs(fns.eternityBonus() - expect) < 1e-9, `永劫 ${eternityPoints} → ${expect}`);
  });
});

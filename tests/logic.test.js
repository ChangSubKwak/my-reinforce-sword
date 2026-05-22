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

// SHADOW_TYPES 가중치 합 = 1.0 (rollShadowType 확률 분포 보장 — CLAUDE.md 불변식)
test('SHADOW_TYPES: 가중치 합 = 1.0', () => {
  const js = readScript();
  const m = js.match(/const SHADOW_TYPES = (\[[\s\S]*?\n  \]);/);
  assert.ok(m, 'SHADOW_TYPES 정의');
  const types = eval(m[1].replace(/\/\/[^\n]*/g, ''));
  const sum = types.reduce((a, t) => a + (t.weight || 0), 0);
  assert.ok(Math.abs(sum - 1.0) < 1e-9, '가중치 합 1.0이어야 함 (현재 ' + sum + ')');
  assert.ok(types.length >= 4, '최소 4종 (normal/flee/steel/demon)');
});

// ─────────────────────────────────────────────────────────────
// v88 progressScore — 클라우드 동기화 우열 판정 (진행 손실 방지 핵심)
// ─────────────────────────────────────────────────────────────
const psFns = loadFunctions(['progressScore']);
test('progressScore: null/비객체는 -1 (빈 클라우드가 로컬을 이기지 못함)', () => {
  assert.strictEqual(psFns.progressScore(null), -1);
  assert.strictEqual(psFns.progressScore(undefined), -1);
  assert.strictEqual(psFns.progressScore(42), -1);
});
test('progressScore: 처치 + 봉인검×100 + 최고강화×10', () => {
  assert.strictEqual(psFns.progressScore({}), 0);
  assert.strictEqual(psFns.progressScore({ totalSlain: 7 }), 7);
  assert.strictEqual(psFns.progressScore({ sealedSwords: [1, 2, 3] }), 300);
  assert.strictEqual(psFns.progressScore({ bestLevel: 12 }), 120);
  assert.strictEqual(psFns.progressScore({ totalSlain: 5, sealedSwords: [1, 2], bestLevel: 10 }), 5 + 200 + 100);
});
test('progressScore: 다른 요인 동일하면 봉인검 많은 쪽이 우위 (봉인검=최고강화 10단계 가치)', () => {
  const more = psFns.progressScore({ sealedSwords: [1, 2], bestLevel: 15 });
  const fewer = psFns.progressScore({ sealedSwords: [1], bestLevel: 15 });
  assert.ok(more > fewer, '최고강화 동일 시 봉인검 많은 쪽이 높아야');
  // 봉인검 1개 = 최고강화 10단계 (가중치 설계 확인)
  assert.strictEqual(
    psFns.progressScore({ sealedSwords: [1] }),
    psFns.progressScore({ bestLevel: 10 }),
    '봉인검 1개(100) = 최고강화 10(100)'
  );
});
test('progressScore: 손상된 sealedSwords(비배열) 안전 처리', () => {
  assert.strictEqual(psFns.progressScore({ sealedSwords: 'corrupt', totalSlain: 3 }), 3);
});

// ─────────────────────────────────────────────────────────────
// startBonus — 선대 강기 → 새 검 시작 강화 (진행 곡선, cap 6)
// ─────────────────────────────────────────────────────────────
function startBonusAt(legacyTotal) {
  return loadFunctions(['startBonus'], {
    legacyStrength: () => legacyTotal, START_BONUS_CAP: 6, START_BONUS_DIVISOR: 25,
  }).startBonus();
}
test('startBonus: CLAUDE.md 곡선 (25→1, 50→2, 100→4, 150→6)', () => {
  assert.strictEqual(startBonusAt(0), 0);
  assert.strictEqual(startBonusAt(25), 1);
  assert.strictEqual(startBonusAt(50), 2);
  assert.strictEqual(startBonusAt(100), 4);
  assert.strictEqual(startBonusAt(150), 6);
});
test('startBonus: cap 6 (점수 인플레이션 차단)', () => {
  assert.strictEqual(startBonusAt(200), 6);
  assert.strictEqual(startBonusAt(10000), 6);
});
test('startBonus: extraLegacy 인자 반영 (융검 미리보기)', () => {
  const f = loadFunctions(['startBonus'], {
    legacyStrength: () => 50, START_BONUS_CAP: 6, START_BONUS_DIVISOR: 25,
  });
  assert.strictEqual(f.startBonus(0), 2, '50 → 2');
  assert.strictEqual(f.startBonus(-25), 1, '50-25=25 → 1 (융검 손실 반영)');
});

// ─────────────────────────────────────────────────────────────
// v27/v37 季節 + 久/古 — 경제 배수 곡선 (cost·seal에 영향)
// ─────────────────────────────────────────────────────────────
function seasonAt(attempts) {
  return loadFunctions(['getSeason'], { state: { stats: { enhanceAttempts: attempts } } }).getSeason();
}
test('getSeason: 누적 강화 시도별 4계절 임계 (50/150/400)', () => {
  assert.strictEqual(seasonAt(0).key, 'spring');
  assert.strictEqual(seasonAt(49).key, 'spring');
  assert.strictEqual(seasonAt(50).key, 'summer');
  assert.strictEqual(seasonAt(149).key, 'summer');
  assert.strictEqual(seasonAt(150).key, 'autumn');
  assert.strictEqual(seasonAt(399).key, 'autumn');
  assert.strictEqual(seasonAt(400).key, 'winter');
});
test('getSeason: 계절별 미세 효과 (±10% 이내, 점수 인플레이션 회피)', () => {
  assert.strictEqual(seasonAt(0).costMul, 0.95, '春 비용 -5%');
  assert.strictEqual(seasonAt(50).challengeMul, 1.05, '夏 도전 +5%');
  assert.strictEqual(seasonAt(150).sealMul, 1.05, '秋 봉인 +5%');
  assert.strictEqual(seasonAt(400).rescueSec, 1.0, '冬 회수 +1초');
});
test('getAgeEffect: 古(×1.10)·久(×1.05)·무명(×1), 古 우선', () => {
  const age = ins => loadFunctions(['getAgeEffect'], {
    state: { hasSword: true, currentSword: { inscriptions: ins } },
  }).getAgeEffect();
  const eq = (a, c, s) => { assert.strictEqual(a.costMul, c); assert.strictEqual(a.sealMul, s); };
  eq(age([]), 1, 1);
  eq(age(['久']), 1.05, 1.05);
  eq(age(['古']), 1.10, 1.10);
  eq(age(['久', '古']), 1.10, 1.10);  // 古 우선
});

// ─────────────────────────────────────────────────────────────
// v245k activityByDate 무한 성장 방지 (최근 120일 cap)
// ─────────────────────────────────────────────────────────────
test('recordActivityDate: 120일 초과 시 가장 오래된 항목 정리', () => {
  const activityByDate = {};
  for (let i = 0; i < 130; i++) {
    const d = '2020-' + String((i % 12) + 1).padStart(2, '0') + '-' + String((i % 28) + 1).padStart(2, '0') + '#' + i;
    activityByDate[d] = 1;
  }
  const st = { activityByDate };
  const fns = loadFunctions(['recordActivityDate'], { state: st, todayStr: () => '2099-12-31' });
  fns.recordActivityDate();
  const keys = Object.keys(st.activityByDate);
  assert.ok(keys.length <= 120, '120 이하로 정리 (현재 ' + keys.length + ')');
  assert.strictEqual(st.activityByDate['2099-12-31'], 1, '오늘 항목은 유지');
});

// ─────────────────────────────────────────────────────────────
// v11 makeSwordName — 검명 생성 (28슬롯 컬렉션 구동, 결정적)
// ─────────────────────────────────────────────────────────────
(function () {
  const js = readScript();
  const NAME_SUFFIX = eval(js.match(/const NAME_SUFFIX = (\[[\s\S]*?\]);/)[1]);
  const NUM_KANJI = eval(js.match(/const NUM_KANJI = (\[[^\]]*\]);/)[1]);
  const nameFns = loadFunctions(['makeSwordName'], { NAME_SUFFIX, NUM_KANJI });
  const mk = nameFns.makeSwordName;

  test('makeSwordName: 정점 명문 우선순위 (道 > 鬼斬 > 本 > ...)', () => {
    assert.strictEqual(mk('直', ['道'], 15), '直道');
    assert.strictEqual(mk('曲', ['鬼斬', '本'], 10), '曲魔', '鬼斬이 本보다 우선');
    assert.strictEqual(mk('速', ['久', '道'], 5), '速道', '道가 久보다 우선(배열 순서)');
  });
  test('makeSwordName: 명문 없으면 강화도 한자', () => {
    assert.strictEqual(mk('重', [], 7), '重七');
    assert.strictEqual(mk('直', [], 0), '直零');
    assert.strictEqual(mk('曲', [], 15), '曲十五');
  });
  test('makeSwordName: form 없으면 無 접두', () => {
    assert.strictEqual(mk(null, [], 3), '無三');
    assert.strictEqual(mk(undefined, ['本'], 9), '無本');
  });
  test('makeSwordName: 결정적 (같은 입력 같은 검명)', () => {
    assert.strictEqual(mk('重', ['剛體'], 12), mk('重', ['剛體'], 12));
  });
})();

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

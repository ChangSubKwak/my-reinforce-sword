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
  beastSealMul: () => 1, solarSealMul: () => 1,
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

test('sealRewardBase: opts.steps 방출 — 분해 표시 단일 진원 (v274)', () => {
  // 분해 표시가 별도 하드코딩 없이 sealRewardBase 자체 단계를 쓰도록 보장.
  const steps = [];
  const r = sealBaseFns.sealRewardBase(15, ['道', '七星'], true, { steps });
  assert.ok(steps.length >= 3, '단계 ≥3 (기본+道+七星)');
  assert.strictEqual(steps[0].base, sealBaseFns.sealReward(15), 'steps[0]은 기본 sealReward');
  assert.ok(steps.some(s => s.mul === 1.5), '道/七星 ×1.5 단계 존재');
  // steps 없이 호출하면 동일 결과 (방출이 계산을 바꾸지 않음)
  assert.strictEqual(r, sealBaseFns.sealRewardBase(15, ['道', '七星'], true), 'steps 유무가 결과 불변');
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
const { readScript, extractConst } = require('./harness');
function extractTable() { return extractConst('TABLE'); }
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
  const types = extractConst('SHADOW_TYPES');
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
  // v357 — 殿堂(enshrined) 검도 ×100 (道 검 진열 세이브가 동기화에서 과소평가→손실되던 것 방지)
  assert.strictEqual(psFns.progressScore({ enshrined: [1, 2] }), 200);
  assert.strictEqual(psFns.progressScore({ sealedSwords: [1], enshrined: [1, 2] }), 300);
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
  const NAME_SUFFIX = extractConst('NAME_SUFFIX');
  const NUM_KANJI = extractConst('NUM_KANJI');
  const nameFns = loadFunctions(['makeSwordName'], { NAME_SUFFIX, NUM_KANJI });
  const mk = nameFns.makeSwordName;

  // 형은 한글화(7단계) 완료, 접미 명문/숫자 한자는 후속 단계 — 현재는 혼합 출력이 정상
  test('makeSwordName: 정점 명문 우선순위 (道 > 鬼斬 > 本 > ...)', () => {
    assert.strictEqual(mk('직', ['道'], 15), '직道');
    assert.strictEqual(mk('곡', ['귀참', '本'], 10), '곡마', '鬼斬이 本보다 우선');
    assert.strictEqual(mk('속', ['久', '道'], 5), '속道', '道가 久보다 우선(배열 순서)');
  });
  test('makeSwordName: 명문 없으면 강화도 한자', () => {
    assert.strictEqual(mk('중', [], 7), '중칠');
    assert.strictEqual(mk('직', [], 0), '직영');
    assert.strictEqual(mk('곡', [], 15), '곡십오');
  });
  test('makeSwordName: form 없으면 無 접두', () => {
    assert.strictEqual(mk(null, [], 3), '無삼');
    assert.strictEqual(mk(undefined, ['本'], 9), '無本');
  });
  test('makeSwordName: 결정적 (같은 입력 같은 검명)', () => {
    assert.strictEqual(mk('중', ['剛體'], 12), mk('중', ['剛體'], 12));
  });
})();

// ─────────────────────────────────────────────────────────────
// v6 形 — SWORD_FORMS 4종 효과 (enhanceCost/successChanceNow/fleeCost 구동)
// ─────────────────────────────────────────────────────────────
test('SWORD_FORMS: 4종(直曲重速) 정의 + 문서화된 효과', () => {
  const F = extractConst('SWORD_FORMS');
  assert.deepStrictEqual(Object.keys(F).sort(), ['곡', '직', '중', '속'].sort(), '4종 형');
  assert.strictEqual(F['직'].successBonus, 0.03, '直 성공 +3%');
  assert.strictEqual(F['곡'].destroyReduce, 0.03, '曲 파괴 -3%');
  assert.strictEqual(F['중'].costMul, 1.10, '重 비용 +10%');
  assert.strictEqual(F['중'].rewardMul, 1.20, '重 보상 +20%');
  assert.strictEqual(F['속'].fleeFree, true, '速 도망 무료');
});
test('SWORD_FORMS: 효과는 미세 편향 (점수 인플레이션 회피, |bonus|<=0.2)', () => {
  const F = extractConst('SWORD_FORMS');
  Object.values(F).forEach(f => {
    if (typeof f.successBonus === 'number') assert.ok(Math.abs(f.successBonus) <= 0.05, 'successBonus 미세');
    if (typeof f.destroyReduce === 'number') assert.ok(Math.abs(f.destroyReduce) <= 0.05, 'destroyReduce 미세');
    if (typeof f.costMul === 'number') assert.ok(f.costMul >= 0.8 && f.costMul <= 1.2, 'costMul ±20% 이내');
    if (typeof f.rewardMul === 'number') assert.ok(f.rewardMul >= 0.8 && f.rewardMul <= 1.3, 'rewardMul 범위');
  });
});

// ─────────────────────────────────────────────────────────────
// v238 enhanceCost — 비용 단일 진원 행동 테스트 (배수·ceil·floor 옵션)
// ─────────────────────────────────────────────────────────────
function makeEnhanceCost(deps) {
  const base = {
    TABLE: [{ cost: 10 }],
    getForm: () => ({}), enhanceEcho: null, getResolve: () => ({ costMul: 1 }),
    getSeason: () => ({ costMul: 1 }), getAgeEffect: () => ({ costMul: 1 }),
    blessingCostMul: () => 1, sanctumCostMul: () => 1, wishCostMul: () => 1,
    solarCostMul: () => 1, weekendCostMul: () => 1, flowCostReduce: () => 0,
  };
  return loadFunctions(['enhanceCost'], Object.assign(base, deps || {})).enhanceCost;
}
test('enhanceCost: 중립 배수 = 기본 비용, 범위 밖 = 0', () => {
  assert.strictEqual(makeEnhanceCost()(0), 10);
  assert.strictEqual(makeEnhanceCost()(5), 0, 'TABLE[5] 없음 → 0');
});
test('enhanceCost: 형 비용·잔향·계절 배수 곱셈 + Math.ceil', () => {
  assert.strictEqual(makeEnhanceCost({ getForm: () => ({ costMul: 1.1 }) })(0), 11);
  assert.strictEqual(makeEnhanceCost({ enhanceEcho: { costMul: 0.5 } })(0), 5, '餘香 -50%');
  assert.strictEqual(makeEnhanceCost({ getSeason: () => ({ costMul: 0.95 }) })(0), 10, 'ceil(9.5)=10');
});
test('enhanceCost: 連氣 흐름 할인 (1-flowCostReduce)', () => {
  assert.strictEqual(makeEnhanceCost({ flowCostReduce: () => 0.10 })(0), 9);
});
test('enhanceCost: floor 옵션은 保身(resolve costMul) 가산 무시', () => {
  const heavy = { getResolve: () => ({ costMul: 1.5 }) };  // 保身
  assert.strictEqual(makeEnhanceCost(heavy)(0), 15, '保身 비용 1.5배');
  assert.strictEqual(makeEnhanceCost(heavy)(0, { floor: true }), 10, 'floor=保身 가산 제외(게임오버 판정)');
});

// ─────────────────────────────────────────────────────────────
// v241 effectiveDestroyChance — 파괴 확률 단일 진원 행동 테스트
// ─────────────────────────────────────────────────────────────
function makeDestroyChance(deps) {
  const base = {
    TABLE: [{ destroy: 0.20 }],
    $: () => null,  // 靈石 체크박스 없음
    state: { spiritstones: 0 },
    enhanceEcho: null, sanctumBlocksDestroy: () => false,
    getForm: () => ({}), getResolve: () => ({ destroyMul: 1 }),
    schoolDestroyReduce: () => 0, guardianBonus: () => ({ destroyReduce: 0 }),
    adversityReady: false, getScarDestroyReduce: () => 0,
    weatherDestroyReduce: () => 0, wishDestroyReduce: () => 0, solarDestroyReduce: () => 0,
  };
  return loadFunctions(['effectiveDestroyChance'], Object.assign(base, deps || {})).effectiveDestroyChance;
}
test('effectiveDestroyChance: destroy 0인 단계는 0', () => {
  assert.strictEqual(makeDestroyChance({ TABLE: [{ destroy: 0 }] })(0), 0);
  assert.strictEqual(makeDestroyChance()(9), 0, 'TABLE[9] 없음 → 0');
});
test('effectiveDestroyChance: 차단(靈石/잔향影盾/結界) 시 0', () => {
  const spiritOn = { $: () => ({ checked: true, disabled: false }), state: { spiritstones: 1 } };
  assert.strictEqual(makeDestroyChance(spiritOn)(0), 0, '靈石 차단');
  assert.strictEqual(makeDestroyChance({ enhanceEcho: { destroyBlock: true } })(0), 0, '잔향 影盾');
  assert.strictEqual(makeDestroyChance({ sanctumBlocksDestroy: () => true })(0), 0, '結界');
});
test('effectiveDestroyChance: 감소항 합산 + 형 + 역경 + Math.max(0)', () => {
  assert.ok(Math.abs(makeDestroyChance()(0) - 0.20) < 1e-9, '기본 0.20');
  assert.ok(Math.abs(makeDestroyChance({ getForm: () => ({ destroyReduce: 0.03 }) })(0) - 0.17) < 1e-9, '曲 -3%');
  assert.ok(Math.abs(makeDestroyChance({ adversityReady: true })(0) - 0.08) < 1e-9, '역경 -12%');
  // 감소항이 destroy를 초과해도 음수 안 됨
  assert.strictEqual(makeDestroyChance({ schoolDestroyReduce: () => 0.5 })(0), 0, 'Math.max(0)');
});
test('effectiveDestroyChance: 覺悟 destroyMul (一心 1.5배 / 保身 0)', () => {
  assert.ok(Math.abs(makeDestroyChance({ getResolve: () => ({ destroyMul: 1.5 }) })(0) - 0.30) < 1e-9, '一心 1.5배');
  assert.strictEqual(makeDestroyChance({ getResolve: () => ({ destroyMul: 0 }) })(0), 0, '保身 0배');
});

// ─────────────────────────────────────────────────────────────
// v240 successChanceNow — 성공 확률 단일 진원 행동 테스트
// ─────────────────────────────────────────────────────────────
function makeSuccessChance(deps) {
  const base = {
    TABLE: [{ success: 0.50 }],
    state: { level: 0, whetstones: 0 },
    getForm: () => ({}), $: () => null, enhanceEcho: null,
    breathBonus: () => 0, pendingBreathBoost: false,
    soulEffects: () => ({ successBonus: 0 }), schoolSuccessBonus: () => 0,
    guardianBonus: () => ({ successBonus: 0 }), getResolve: () => ({ successAdd: 0 }),
    adversityReady: false, persistentSuccessBonus: () => 0,
  };
  return loadFunctions(['successChanceNow'], Object.assign(base, deps || {})).successChanceNow;
}
test('successChanceNow: 기본 성공률, 범위 밖 레벨 = 0', () => {
  assert.ok(Math.abs(makeSuccessChance()() - 0.50) < 1e-9);
  assert.strictEqual(makeSuccessChance({ state: { level: 9 } })(), 0, 'TABLE[9] 없음 → 0');
});
test('successChanceNow: 砥(체크박스)·형·역경·persistent 합산', () => {
  const whetOn = { $: () => ({ checked: true, disabled: false }), state: { level: 0, whetstones: 1 } };
  assert.ok(Math.abs(makeSuccessChance(whetOn)() - 0.75) < 1e-9, '砥 +25%');
  assert.ok(Math.abs(makeSuccessChance({ getForm: () => ({ successBonus: 0.03 }) })() - 0.53) < 1e-9, '直 +3%');
  assert.ok(Math.abs(makeSuccessChance({ adversityReady: true })() - 0.90) < 1e-9, '역경 +40%');
  assert.ok(Math.abs(makeSuccessChance({ persistentSuccessBonus: () => 0.05 })() - 0.55) < 1e-9, 'persistent +5%');
});
test('successChanceNow: 眞空 호흡 ×2 (pendingBreathBoost)', () => {
  assert.ok(Math.abs(makeSuccessChance({ breathBonus: () => 0.10, pendingBreathBoost: true })() - 0.70) < 1e-9, '0.5+0.2');
  assert.ok(Math.abs(makeSuccessChance({ breathBonus: () => 0.10 })() - 0.60) < 1e-9, '부스트 없으면 0.5+0.1');
});
test('successChanceNow: [0,1] 클램프', () => {
  assert.strictEqual(makeSuccessChance({ TABLE: [{ success: 0.9 }], adversityReady: true })(), 1, '1.3 → 1');
  assert.strictEqual(makeSuccessChance({ getResolve: () => ({ successAdd: -0.7 }) })(), 0, '-0.2 → 0');
});

// ─────────────────────────────────────────────────────────────
// v92 融劍 — fusionPreview 계승 규칙 (강한 형·최우선 명문·혼 평균·시작 강화)
// ─────────────────────────────────────────────────────────────
(function () {
  const FUSION_PRIORITY = extractConst('FUSION_PRIORITY');
  function preview(swords, selected, legacyTotal) {
    return loadFunctions(['fusionPreview'], {
      fusionSelected: selected, state: { sealedSwords: swords },
      FUSION_PRIORITY, legacyStrength: () => legacyTotal,
      START_BONUS_CAP: 6, START_BONUS_DIVISOR: 25, trialStartLevelBonus: () => 0, MAX_LEVEL: 15,
    }).fusionPreview();
  }
  const A = { level: 5, form: '직', soul: 10, inscriptions: ['本'] };
  const B = { level: 10, form: '곡', soul: 15, inscriptions: ['道'] };

  test('fusionPreview: 강한 검(높은 강화도)의 형 계승', () => {
    assert.strictEqual(preview([A, B], [0, 1], 100).form, '곡', 'B(+10)가 A(+5)보다 강함');
  });
  test('fusionPreview: 최우선 명문 계승 (道 > 本)', () => {
    assert.strictEqual(preview([A, B], [0, 1], 100).inscription, '道', 'FUSION_PRIORITY 순서');
  });
  test('fusionPreview: 혼 평균 floor', () => {
    assert.strictEqual(preview([A, B], [0, 1], 100).soul, 12, 'floor((10+15)/2)');
  });
  test('fusionPreview: 시작 강화 = 두 검 제거 후 강기로 재계산', () => {
    // legacyStrength 100, 잃는 강기 5+10=15 → 잔여 85 → floor(85/25)=3
    assert.strictEqual(preview([A, B], [0, 1], 100).startLevel, 3);
  });
  test('fusionPreview: 2검 선택 아니면 null', () => {
    assert.strictEqual(preview([A, B], [0], 100), null);
    assert.strictEqual(preview([A, B], [], 100), null);
  });
})();

// ─────────────────────────────────────────────────────────────
// protectCost / rescueShards — 경제 계단/회수 곡선
// ─────────────────────────────────────────────────────────────
const econFns = loadFunctions(['protectCost', 'rescueShards']);
test('protectCost: 강화도별 계단 (≤5→1, 6~8→2, 9~11→3, 12+→5)', () => {
  [0, 3, 5].forEach(l => assert.strictEqual(econFns.protectCost(l), 1, 'lv' + l + '→1'));
  [6, 8].forEach(l => assert.strictEqual(econFns.protectCost(l), 2, 'lv' + l + '→2'));
  [9, 11].forEach(l => assert.strictEqual(econFns.protectCost(l), 3, 'lv' + l + '→3'));
  [12, 14, 15].forEach(l => assert.strictEqual(econFns.protectCost(l), 5, 'lv' + l + '→5'));
});
test('protectCost: 단조 비감소 (높은 단계가 더 비싸거나 같음)', () => {
  let prev = 0;
  for (let l = 0; l <= 15; l++) { const c = econFns.protectCost(l); assert.ok(c >= prev, 'lv' + l); prev = c; }
});
test('rescueShards: floor(lv² × 0.7), 최소 3', () => {
  assert.strictEqual(econFns.rescueShards(0), 3, '최소 3');
  assert.strictEqual(econFns.rescueShards(1), 3, 'floor(0.7)=0 → 최소 3');
  assert.strictEqual(econFns.rescueShards(5), 17, 'floor(17.5)');
  assert.strictEqual(econFns.rescueShards(10), 70);
  assert.strictEqual(econFns.rescueShards(15), 157, 'floor(157.5)');
});
test('rescueShards: 단조 증가 (강화도 높을수록 회수 많음)', () => {
  let prev = -1;
  for (let l = 0; l <= 15; l++) { const r = econFns.rescueShards(l); assert.ok(r >= prev, 'lv' + l); prev = r; }
});

// ─────────────────────────────────────────────────────────────
// v245u fmtNum — 큰 수 천 단위 구분 (가독성)
// ─────────────────────────────────────────────────────────────
test('fmtNum: 천 단위 콤마, 비정상값 안전', () => {
  const f = loadFunctions(['fmtNum']).fmtNum;
  assert.strictEqual(f(0), '0');
  assert.strictEqual(f(999), '999');
  assert.strictEqual(f(1234), '1,234');
  assert.strictEqual(f(1234567), '1,234,567');
  assert.strictEqual(f(NaN), '0', 'NaN → 0');
  assert.strictEqual(f(Infinity), '0', 'Infinity → 0');
  assert.strictEqual(f('x'), '0', '비숫자 → 0');
});

// ─────────────────────────────────────────────────────────────
// v75 formatTimeAgo — 상대 시간 (미래 ts 방어 포함)
// ─────────────────────────────────────────────────────────────
test('formatTimeAgo: 단위 경계 + 미래 ts 방어', () => {
  const f = loadFunctions(['formatTimeAgo']).formatTimeAgo;
  const now = Date.now();
  assert.strictEqual(f(now - 5000), '5초 전');
  assert.strictEqual(f(now - 120000), '2분 전');
  assert.strictEqual(f(now - 7200000), '2시간 전');
  assert.strictEqual(f(now - 2 * 86400000), '2일 전');
  assert.strictEqual(f(now + 10000), '방금', '미래 ts(시계 오차) → 음수 대신 방금');
});

// ─────────────────────────────────────────────────────────────
// v247 性情 — 검의 기질 (플레이 방식 → 정체성, 순수 파생)
// ─────────────────────────────────────────────────────────────
const tempFns = loadFunctions(['deriveTemperament']);
const temp = s => tempFns.deriveTemperament(s).name;
test('deriveTemperament: 강(베기)·정(흉터)·도(고강화)·화(균형)', () => {
  assert.strictEqual(temp({ slainCount: 5 }), '강', '베기 지배 → 강');
  assert.strictEqual(temp({ scars: 2 }), '정', '흉터(×2=4) 지배 → 정');
  assert.strictEqual(temp({ level: 12 }), '도', '위험 영역(+12→5) 지배 → 도');
  assert.strictEqual(temp({ slainCount: 0, scars: 0, level: 5 }), '화', '뚜렷한 기질 없음 → 화');
});
test('deriveTemperament: 동점은 강>정>도 우선', () => {
  assert.strictEqual(temp({ slainCount: 4, scars: 2 }), '강', '강4=정4 → 강 우선');
  assert.strictEqual(temp({ scars: 3, level: 13 }), '정', '정6=도6 → 정 우선');
});
test('deriveTemperament: null/무행동 안전 → 화', () => {
  assert.strictEqual(tempFns.deriveTemperament(null).key, 'wa');
  assert.strictEqual(temp({}), '화');
  assert.strictEqual(temp({ level: 7 }), '화', '+7은 위험 영역 직전 → 0');
});

// ─────────────────────────────────────────────────────────────
// v370 率性 — 形(천성) × 性情(기질)의 합치/배반 (synthesis, 결정적, 효과 0)
// ─────────────────────────────────────────────────────────────
const npFns = loadFunctions(['deriveNaturePath', 'deriveTemperament']);
const np = s => npFns.deriveNaturePath(s).name;
test('deriveNaturePath: 形 친화 기질과 합치 → 솔성', () => {
  assert.strictEqual(np({ form: '직', slainCount: 5 }), '솔성', '直(강친화) + 강 → 솔성');
  assert.strictEqual(np({ form: '곡', scars: 3 }), '솔성', '曲(정친화) + 정 → 솔성');
  assert.strictEqual(np({ form: '중', scars: 3 }), '솔성', '重(정친화) + 정 → 솔성');
  assert.strictEqual(np({ form: '속', level: 12 }), '솔성', '速(도친화) + 도 → 솔성');
});
test('deriveNaturePath: 形 친화와 배반 → 역성', () => {
  assert.strictEqual(np({ form: '직', scars: 3 }), '역성', '直(강친화) + 정 → 역성');
  assert.strictEqual(np({ form: '속', slainCount: 5 }), '역성', '速(도친화) + 강 → 역성');
  assert.strictEqual(np({ form: '곡', level: 12 }), '역성', '曲(정친화) + 도 → 역성');
});
test('deriveNaturePath: 화(뚜렷한 기질 없음) → 무위 (形 무관)', () => {
  assert.strictEqual(np({ form: '직' }), '무위', '무행동 直 → 무위');
  assert.strictEqual(np({ form: '속', level: 7 }), '무위', '+7 직전 → 화 → 무위');
});
test('deriveNaturePath: 形 미정·null은 판정 보류 (빈 name·라인, 하위호환)', () => {
  assert.strictEqual(npFns.deriveNaturePath(null).key, 'none', 'null → none');
  assert.strictEqual(npFns.deriveNaturePath({ slainCount: 5 }).name, '', '形 없는 검 → 보류(빈 name)');
  assert.strictEqual(npFns.deriveNaturePath({ form: '직', slainCount: 5 }).line.length > 0, true, '판정 시 line 존재');
});

test('collectionNatureTendency: 率性/逆性 우세·균형·표본부족 (컬렉션 거울)', () => {
  const fns = loadFunctions(['collectionNatureTendency', 'deriveNaturePath', 'deriveTemperament']);
  const ct = fns.collectionNatureTendency;
  const follow = { form: '직', slainCount: 5 };  // 率性
  const defy = { form: '직', scars: 3 };          // 逆性
  const quiet = { form: '직' };                    // 和 → 無爲 (집계 제외)
  assert.strictEqual(ct([follow, follow]).key, 'none', '판정 검 2 < 3 → 표본 부족');
  assert.strictEqual(ct([follow, defy]).key, 'none', '판정 검 2 < 3 → 표본 부족');
  assert.strictEqual(ct([follow, follow, follow, defy]).key, 'follow', '率性 3 vs 逆性 1 (3>1.5) → follow');
  assert.strictEqual(ct([defy, defy, defy, follow]).key, 'defy', '逆性 3 vs 1 → defy');
  assert.strictEqual(ct([follow, follow, defy, defy]).key, 'balanced', '2:2 (2>3 거짓) → balanced');
  assert.strictEqual(ct([follow, follow, defy, defy, quiet]).key, 'balanced', '無爲(quiet) 분모 제외 → 2:2 balanced');
  assert.strictEqual(ct([]).key, 'none', '빈 컬렉션 → none');
  assert.ok(ct([follow, follow, follow]).line.length > 0, '판정 시 line 존재 (3:0 follow)');
});

// ─────────────────────────────────────────────────────────────
// v248 遺言 — 검의 1인칭 마지막 말 (性情 파생, 결정적)
// ─────────────────────────────────────────────────────────────
const lwFns = loadFunctions(['generateLastWords', 'deriveTemperament']);
const lw = s => lwFns.generateLastWords(s);
test('generateLastWords: 道 검은 전용 유언', () => {
  assert.strictEqual(lw({ inscriptions: ['道'], slainCount: 5, level: 15 }), '나는 도를 보았다. 그것으로 족하다.');
});
test('generateLastWords: 龍斬(용 격파) 전용 1인칭 유언, 단 道가 우선 (v370j)', () => {
  assert.strictEqual(lw({ inscriptions: ['용참'], slainCount: 5, level: 15 }), '용을 베었으니, 여한이 없다.');
  assert.strictEqual(lw({ inscriptions: ['道', '용참'], level: 15 }), '나는 도를 보았다. 그것으로 족하다.', '道가 龍斬보다 우선');
});
test('generateLastWords: 性情별 유언 (剛/靜/賭/和)', () => {
  assert.ok(lw({ slainCount: 5, level: 5 }).length > 0, '剛 유언');
  assert.ok(lw({ scars: 2, level: 4 }).includes('부서지지') || lw({ scars: 2, level: 4 }).includes('지켜냈다'), '靜 유언');
  assert.ok(lw({ level: 12 }).includes('올랐다') || lw({ level: 12 }).includes('도박'), '賭 유언');
  assert.ok(lw({ level: 3 }).includes('고요히') || lw({ level: 3 }).includes('평범'), '和 유언');
});
test('generateLastWords: 결정적 (같은 검 같은 유언), null 안전', () => {
  const s = { slainCount: 3, level: 6 };
  assert.strictEqual(lw(s), lw(s));
  assert.strictEqual(lw(null), '');
});

// ─────────────────────────────────────────────────────────────
// v249 波瀾 — 일생 기복 (levelHistory 하락 횟수 파생)
// ─────────────────────────────────────────────────────────────
const journeyFns = loadFunctions(['deriveJourney', 'levelDropCount']);
const journey = h => journeyFns.deriveJourney({ levelHistory: h });
test('deriveJourney: 하락 0 = 곧게, 1~2 = 다시 섬, 3~5 = 기복, 6+ = 수없이', () => {
  assert.match(journey([0, 1, 2, 3, 4]), /곧게 올랐다/, '단조 상승');
  assert.match(journey([0, 1, 0, 1, 2]), /1번 무너졌으나/, '1회 하락');
  assert.match(journey([3, 2, 3, 2, 3, 2, 4]), /기복의 검/, '3~5회');
  assert.match(journey([5, 4, 5, 4, 5, 4, 5, 4, 5, 4, 5, 4, 5]), /수없이 무너지고/, '6회+ (13개, 6하락)');
});
test('levelDropCount: levelHistory 하락 횟수', () => {
  assert.strictEqual(journeyFns.levelDropCount({ levelHistory: [0, 1, 2, 3] }), 0);
  assert.strictEqual(journeyFns.levelDropCount({ levelHistory: [3, 2, 3, 2] }), 2);
  assert.strictEqual(journeyFns.levelDropCount({}), 0, '데이터 없음 → 0');
});
test('collectionHighlight: 점수 최대 검 선택, 빈 배열 null', () => {
  const ch = loadFunctions(['collectionHighlight']).collectionHighlight;
  const swords = [{ name: 'A', level: 5 }, { name: 'B', level: 12 }, { name: 'C', level: 9 }];
  assert.strictEqual(ch(swords, s => s.level).name, 'B', '최고 강화도');
  assert.strictEqual(ch([], s => s.level), null);
  assert.strictEqual(ch(null, s => s.level), null);
});
test('deriveJourney: 데이터 부족(<2) 또는 없음 → 빈 문자열', () => {
  assert.strictEqual(journey([]), '');
  assert.strictEqual(journey([5]), '');
  assert.strictEqual(journeyFns.deriveJourney(null), '');
  assert.strictEqual(journeyFns.deriveJourney({}), '');
});

test('makeComparePersona: 검 비교 정체성 라벨 우선순위 (道 > 龍斬 > 전투 > 밤 ...)', () => {
  const mp = loadFunctions(['makeComparePersona']).makeComparePersona;
  assert.strictEqual(mp({ inscriptions: ['道'] }), '도의 검');
  assert.strictEqual(mp({ inscriptions: ['용참'] }), '용을 벤 검', 'v370l 龍斬 → 고유 라벨');
  assert.strictEqual(mp({ inscriptions: ['道', '용참'] }), '도의 검', '道가 龍斬보다 우선');
  assert.strictEqual(mp({ inscriptions: ['용참', '귀참'] }), '용을 벤 검', '龍斬이 전투보다 우선');
  assert.strictEqual(mp({ inscriptions: ['귀참'] }), '전투의 검');
  assert.strictEqual(mp({ inscriptions: ['야차참'] }), '밤의 검');
  assert.strictEqual(mp({ inscriptions: [], slainCount: 0 }), '평화의 검', '무전투 → 평화');
  assert.strictEqual(mp(null), '', 'null 안전');
});

// ─────────────────────────────────────────────────────────────
// v251 影格 — 그림자 강도 등급 형용
// ─────────────────────────────────────────────────────────────
test('shadowTier: 강도 구간별 형용 (여린/굳센/강대한/흉험한)', () => {
  const st = loadFunctions(['shadowTier']).shadowTier;
  assert.strictEqual(st(1), '여린');
  assert.strictEqual(st(3), '여린');
  assert.strictEqual(st(4), '굳센');
  assert.strictEqual(st(7), '굳센');
  assert.strictEqual(st(8), '강대한');
  assert.strictEqual(st(11), '강대한');
  assert.strictEqual(st(12), '흉험한');
  assert.strictEqual(st(20), '흉험한');
});

// ─────────────────────────────────────────────────────────────
// 통합: generateBiography — 파생 요소(時生·形·정점·性情)가 한 서사로 결합
// ─────────────────────────────────────────────────────────────
test('generateBiography 통합: 時生·형·정점·性情이 일대기에 결합', () => {
  const bio = loadFunctions(['generateBiography', 'deriveTemperament', 'deriveNaturePath']).generateBiography;
  const sword = {
    form: '직', name: '직검', level: 15, inscriptions: ['道'],
    slainCount: 8, soul: 80, scars: 1, stars: {}, bornTod: '夜',
    levelHistory: [0, 5, 10, 15],
  };
  const text = bio(sword);
  assert.ok(text.length > 20, '비어있지 않은 서사');
  assert.match(text, /깊은 밤/, '時生(夜) 개막 반영');
  assert.match(text, /곧은 검 직검/, '形+검명');
  assert.match(text, /도/, '道 정점');
  assert.match(text, /베기로써 나아가는 기질/, '性情(베기 지배 → 강) 결합');
});
test('generateBiography 통합: bornTod 없는 구 검도 안전 (접두 생략)', () => {
  const bio = loadFunctions(['generateBiography', 'deriveTemperament', 'deriveNaturePath']).generateBiography;
  const text = bio({ form: '곡', name: '구검', level: 4, inscriptions: [], levelHistory: [0, 1] });
  assert.ok(text.length > 0 && !text.startsWith(','), '접두 없이 정상 서사');
});
test('generateBiography: 名(명명된 적) 격파가 일대기에 결합 — 龍斬은 鬼斬보다 우선 (v370h)', () => {
  const bio = loadFunctions(['generateBiography', 'deriveTemperament', 'deriveNaturePath']).generateBiography;
  const mk = (ins, extra) => bio(Object.assign({ form: '직', name: '검', level: 10, slainCount: 0, levelHistory: [0, 10] }, { inscriptions: ins }, extra || {}));
  assert.match(mk(['용참']), /용을 베어냈/, '龍斬 → 용 격파 서사');
  assert.match(mk(['제참']), /귀제/, '帝斬 → 귀제 격파');
  assert.match(mk(['풍참']), /흑풍/, '風斬 → 흑풍 격파');
  // 龍斬은 鬼斬보다 우선 (정점 무훈)
  assert.match(mk(['용참', '귀참']), /용을 베어냈/, '龍斬+鬼斬 → 龍 우선');
  // 그 외 명명된 적은 鬼斬보다 아래
  assert.match(mk(['제참', '귀참']), /검귀의 피/, '帝斬+鬼斬 → 鬼斬 우선 (龍 외엔 鬼斬이 위)');
  // 명명된 적 없으면 기존 일반 슬레인 서사 유지
  assert.match(mk([], { slainCount: 6 }), /6의 그림자를 베어냈/, '명명된 적 없음 → 일반 슬레인');
  // v370k 夜叉斬 — 鬼斬 바로 아래
  assert.match(mk(['야차참']), /야차/, '夜叉斬 → 야차 격파 서사');
  assert.match(mk(['귀참', '야차참']), /검귀의 피/, '鬼斬+夜叉斬 → 鬼斬 우선');
});

// ─────────────────────────────────────────────────────────────
// v15 generateVerse — 道 검 일생시 4행 (형/명문/슬레인 분기)
// ─────────────────────────────────────────────────────────────
const verseFns = loadFunctions(['generateVerse']);
const verse = (f, ins, lv, sl) => verseFns.generateVerse(f, ins, lv, sl, 0, 0);
test('generateVerse: 4행 반환 + 형/닫음 행', () => {
  const v = verse('직', ['道'], 15, 8);
  assert.strictEqual(v.length, 4);
  assert.strictEqual(v[0], '강직의 검 한 자루', '直 형 행');
  assert.strictEqual(v[3], '+15 의 길로 마무리되다', '닫음 행');
});
test('generateVerse: 명문 행 우선순위 (鬼斬+本 > 本 > 무명)', () => {
  assert.strictEqual(verse('곡', ['귀참', '本'], 12, 3)[1], '본질을 깨우고 검귀의 피를 받아');
  assert.strictEqual(verse('곡', ['本'], 12, 3)[1], '본질에 이르러');
  assert.strictEqual(verse('곡', [], 12, 3)[1], '조용히 단련되어', '무명');
});
test('generateVerse: 名(명명된 적) 격파 행 — 龍斬은 鬼斬보다 우선 (v370i)', () => {
  assert.match(verse('직', ['용참'], 15, 8)[1], /용을 베어/, '龍斬 → 용 격파 시행');
  assert.match(verse('직', ['제참'], 13, 5)[1], /귀제/, '帝斬 → 귀제');
  assert.match(verse('직', ['풍참'], 8, 2)[1], /흑풍/, '風斬 → 흑풍');
  // 龍斬은 鬼斬보다 위 (정점 무훈), 그 외 명명된 적은 鬼斬보다 아래
  assert.match(verse('직', ['용참', '귀참'], 15, 8)[1], /용을 베어/, '龍斬+鬼斬 → 龍 우선');
  assert.strictEqual(verse('직', ['제참', '귀참'], 13, 5)[1], '검귀의 그림자를 베고', '帝斬+鬼斬 → 鬼斬 우선');
  // v370k 夜叉斬 — 鬼斬 아래
  assert.match(verse('직', ['야차참'], 10, 3)[1], /야차/, '夜叉斬 → 야차 시행');
  assert.strictEqual(verse('직', ['귀참', '야차참'], 10, 3)[1], '검귀의 그림자를 베고', '鬼斬+夜叉斬 → 鬼斬 우선');
});
test('generateVerse: 슬레인 행 구간 (0 / 1 / <5 / <10 / 이상)', () => {
  assert.match(verse('중', [], 10, 0)[2], /한 마리도 만나지 않은/);
  assert.match(verse('중', [], 10, 1)[2], /단 한 마리/);
  assert.match(verse('중', [], 10, 3)[2], /3의 그림자/);
  assert.match(verse('중', [], 10, 7)[2], /거듭 갈라놓고/);
  assert.match(verse('중', [], 10, 20)[2], /수많은 그림자/);
});
test('generateVerse: 형 없으면 이름 없는 검', () => {
  assert.strictEqual(verse(null, [], 5, 0)[0], '이름 없는 검 한 자루');
});

// ─────────────────────────────────────────────────────────────
// v50 getPersonas — 플레이어 페르소나 (스탯 임계)
// ─────────────────────────────────────────────────────────────
function personaNames(st) {
  return loadFunctions(['getPersonas'], { state: st }).getPersonas().map(p => p.name);
}
test('getPersonas: 무성취 → 초보', () => {
  assert.ok(personaNames({ stats: {}, sealedSwords: [], bestLevel: 0 }).some(x => x.includes('초보')));
});
test('getPersonas: 임계 달성 페르소나', () => {
  assert.ok(personaNames({ stats: { slainDemon: 3 }, sealedSwords: [] }).some(x => x.includes('귀살자')));
  const masters = personaNames({ stats: { wayReached: 5 }, sealedSwords: [] });
  assert.ok(masters.some(x => x.includes('달인')) && masters.some(x => x.includes('추구자')), 'wayReached 5 → 달인+추구자');
  assert.ok(personaNames({ stats: {}, totalDestroyed: 10, sealedSwords: [] }).some(x => x.includes('도박꾼')));
});
test('getPersonas: 집착자 (봉인 0 + 최고 +8)', () => {
  assert.ok(personaNames({ stats: {}, sealedSwords: [], bestLevel: 8 }).some(x => x.includes('집착자')));
});

// ─────────────────────────────────────────────────────────────
// v141 道號 — generatePlayerTitle 우선순위 (희귀 성취 우선)
// ─────────────────────────────────────────────────────────────
function playerTitle(st) {
  return loadFunctions(['generatePlayerTitle'], { state: st, hasFourWays: () => false }).generatePlayerTitle();
}
test('generatePlayerTitle: 최고 성취 우선 (ultimate > 道15 > ...)', () => {
  assert.match(playerTitle({ ultimateAchieved: true, stats: { wayReached: 15 } }), /千秋萬代/, 'ultimate 최우선');
  assert.match(playerTitle({ stats: { wayReached: 15 } }), /十五道師/, '道 15');
  assert.match(playerTitle({ stats: { wayReached: 1 } }), /道를 본 자/, '道 1회');
});
test('generatePlayerTitle: 무성취도 항상 칭호 반환 (빈 문자열 아님)', () => {
  const t = playerTitle({ stats: {} });
  assert.ok(typeof t === 'string' && t.length > 0, '신규 플레이어도 칭호');
});

// ─────────────────────────────────────────────────────────────
// v138 雙銘 — detectResonances (명문 쌍 공명 감지)
// ─────────────────────────────────────────────────────────────
(function () {
  const PAIRED_RESONANCES = extractConst('PAIRED_RESONANCES');
  const detect = loadFunctions(['detectResonances'], { PAIRED_RESONANCES }).detectResonances;
  const keys = ins => detect(ins).map(r => r.key);
  test('detectResonances: 쌍이 모두 있을 때만 공명', () => {
    assert.deepStrictEqual(keys(['道', '七星']), ['tianming'], '天命 쌍');
    assert.deepStrictEqual(keys(['귀참', '단마']), ['metsumao'], '滅魔 쌍');
    assert.deepStrictEqual(keys(['道']), [], '쌍 미완성 → 공명 없음');
    assert.deepStrictEqual(keys([]), [], '명문 없음');
  });
  test('detectResonances: 여러 쌍 동시 감지', () => {
    const k = keys(['道', '七星', '귀참', '단마']);
    assert.ok(k.includes('tianming') && k.includes('metsumao'), '두 공명 모두');
  });
  test('detectResonances: onSeal 보상 배수 순수성 (天命 ×2)', () => {
    const tian = PAIRED_RESONANCES.find(r => r.key === 'tianming');
    assert.strictEqual(tian.onSeal({}, 100), 200, '天命 onSeal = ×2');
  });
})();

// ─────────────────────────────────────────────────────────────
// v89 시련의 혼 — trial 메타 진행 (봉인 검 수 기반, 게임오버 영구)
// ─────────────────────────────────────────────────────────────
(function () {
  const TRIALS = extractConst('TRIALS');
  function trials(n) {
    const sealedSwords = new Array(n).fill({ level: 1 });
    return loadFunctions(
      ['trialCount', 'trialUnlocked', 'trialSuccessBonus', 'trialStartSoulBonus', 'trialStartLevelBonus'],
      { state: { sealedSwords }, TRIALS }
    );
  }
  test('trialUnlocked: 봉인 검 수 임계 (1/3/5/10/20)', () => {
    assert.strictEqual(trials(0).trialUnlocked('t1'), false);
    assert.strictEqual(trials(1).trialUnlocked('t1'), true, '1봉인 → t1');
    assert.strictEqual(trials(4).trialUnlocked('t3'), false, '4 < 5');
    assert.strictEqual(trials(5).trialUnlocked('t3'), true, '5 → t3');
    assert.strictEqual(trials(19).trialUnlocked('t5'), false);
    assert.strictEqual(trials(20).trialUnlocked('t5'), true, '20 → t5');
  });
  test('trial 보너스: 임계 충족 시만 (성공+1%/영혼+20/시작+1)', () => {
    assert.strictEqual(trials(5).trialSuccessBonus(), 0.01, '5봉인 → +1%');
    assert.strictEqual(trials(4).trialSuccessBonus(), 0, '4 → 0');
    assert.strictEqual(trials(3).trialStartSoulBonus(), 20, '3봉인 → 영혼+20');
    assert.strictEqual(trials(2).trialStartSoulBonus(), 0);
    assert.strictEqual(trials(20).trialStartLevelBonus(), 1, '20봉인 → 시작+1');
    assert.strictEqual(trials(19).trialStartLevelBonus(), 0);
  });
})();

// ─────────────────────────────────────────────────────────────
// v225 無極 — eternityTitle 칭호 임계 (永/劫/無極)
// ─────────────────────────────────────────────────────────────
test('eternityTitle: 永劫 점수 임계 (0→없음, 1→永, 10→劫, 25→無極)', () => {
  const title = p => loadFunctions(['eternityTitle'], { state: { eternityPoints: p } }).eternityTitle();
  assert.strictEqual(title(0), null);
  assert.strictEqual(title(1), '永');
  assert.strictEqual(title(9), '永');
  assert.strictEqual(title(10), '劫');
  assert.strictEqual(title(24), '劫');
  assert.strictEqual(title(25), '無極');
  assert.strictEqual(title(100), '無極');
});

// ─────────────────────────────────────────────────────────────
// v229 劍鳴 — 검 고유 소리 시그니처 (결정성 + 펜타토닉 제약)
// ─────────────────────────────────────────────────────────────
const SIGNATURE_SCALE = [262, 294, 330, 392, 440, 523, 587, 659, 784];
const sigFns = loadFunctions(['swordSignatureFreqs'], { SIGNATURE_SCALE });

test('swordSignatureFreqs: 3음 반환', () => {
  const f = sigFns.swordSignatureFreqs({ level: 5, form: '직', inscriptions: [], soul: 0 });
  assert.strictEqual(f.length, 3);
});

test('swordSignatureFreqs: 결정적 — 같은 검 같은 소리', () => {
  const s = { level: 10, form: '곡', inscriptions: ['道', '本'], soul: 67 };
  const a = sigFns.swordSignatureFreqs(s);
  const b = sigFns.swordSignatureFreqs(s);
  assert.deepStrictEqual(a, b);
});

test('swordSignatureFreqs: 다른 검은 다른 소리 (대체로)', () => {
  const a = sigFns.swordSignatureFreqs({ level: 3, form: '직', inscriptions: [], soul: 0 });
  const b = sigFns.swordSignatureFreqs({ level: 15, form: '속', inscriptions: ['道'], soul: 100 });
  assert.notDeepStrictEqual(a, b, '속성 다르면 소리 달라야 함');
});

test('swordSignatureFreqs: 모든 음이 펜타토닉 스케일 내', () => {
  for (let lv = 0; lv <= 15; lv++) {
    const f = sigFns.swordSignatureFreqs({ level: lv, form: '중', inscriptions: ['久'], soul: lv * 6 });
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

test('solarTermEffect: 모든 節氣가 비어있지 않은 효과 라벨을 가짐 (v264)', () => {
  // v263에서 절기 보너스 6종을 연결했고, v264가 효과를 표시 → 각 절기는 정확히 한 효과 필드.
  const SOLAR_TERMS = extractConst('SOLAR_TERMS');
  assert.ok(Array.isArray(SOLAR_TERMS) && SOLAR_TERMS.length === 8, '8주요 절기');
  let active = SOLAR_TERMS[0];
  const fns = loadFunctions(['solarTermEffect'], { getCurrentSolarTerm: () => active });
  SOLAR_TERMS.forEach(t => {
    active = t;
    const label = fns.solarTermEffect();
    assert.ok(typeof label === 'string' && label.length > 0, t.key + '는 효과 라벨이 있어야 함');
  });
});

test('escapeHtml: 위험 문자 이스케이프 (v275 — 공유 데이터 저장형 XSS 차단)', () => {
  const { escapeHtml } = loadFunctions(['escapeHtml']);
  assert.strictEqual(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.strictEqual(escapeHtml('a&b'), 'a&amp;b');
  assert.strictEqual(escapeHtml('"q\'s"'), '&quot;q&#39;s&quot;');
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(undefined), '');
  assert.strictEqual(escapeHtml(42), '42');
  // 정상 닉네임/검명은 그대로
  assert.strictEqual(escapeHtml('直道劍'), '直道劍');
});

test('리더보드 닉네임·손님 검 이름이 escapeHtml로 렌더됨 (XSS 회귀 방지)', () => {
  const { readScript } = require('./harness');
  const js = readScript();
  // 리더보드 닉네임
  assert.match(js, /escapeHtml\(nickname\)/, '리더보드 닉네임 이스케이프');
  // 손님 검 이름
  assert.match(js, /escapeHtml\(s\.name \|\| '無名'\)/, '손님 검 이름 이스케이프');
});

test('리더보드 숫자 필드가 Number()로 강제됨 (v276 — 문자열 주입 차단)', () => {
  const { readScript } = require('./harness');
  const js = readScript();
  // 서버 row의 숫자 필드는 사용자가 쓸 수 있으므로 innerHTML 삽입 전 Number 강제
  assert.match(js, /Number\(row\.way_reached\) \|\| 0/, 'way_reached 강제');
  assert.match(js, /Number\(row\.best_level\) \|\| 0/, 'best_level 강제');
  assert.match(js, /Number\(row\.total_slain\) \|\| 0/, 'total_slain 강제');
});

// ─────────────────────────────────────────────────────────────
// v279 客劍 import 검증 — decodeSwordCode 입력 새니타이즈 (보안 핵심)
// ─────────────────────────────────────────────────────────────
const decodeFns = loadFunctions(['decodeSwordCode']);
const mkCode = (obj) => 'CK1' + Buffer.from(encodeURIComponent(JSON.stringify(obj)), 'binary').toString('base64');

test('decodeSwordCode: 정상 코드 디코드 + 수치 클램프', () => {
  const r = decodeFns.decodeSwordCode(mkCode({ n: '直道劍', f: '직', l: 12, i: ['道'], s: 50, v: 'a/b', b: 3 }));
  assert.strictEqual(r.name, '直道劍');
  assert.strictEqual(r.form, '직');
  assert.strictEqual(r.level, 12);
  assert.strictEqual(r.soul, 50);
  assert.deepStrictEqual(r.inscriptions, ['道']);
  assert.strictEqual(r.isGuest, true);
});

test('decodeSwordCode: level 0~15 · soul 0~100 클램프', () => {
  const hi = decodeFns.decodeSwordCode(mkCode({ n: 'x', f: '직', l: 99, i: [], s: 999, b: 0 }));
  assert.strictEqual(hi.level, 15, 'level 상한 15');
  assert.strictEqual(hi.soul, 100, 'soul 상한 100');
  const lo = decodeFns.decodeSwordCode(mkCode({ n: 'x', f: '직', l: -5, i: [], s: -5, b: -9 }));
  assert.strictEqual(lo.level, 0, 'level 하한 0');
  assert.strictEqual(lo.soul, 0, 'soul 하한 0');
  assert.strictEqual(lo.beads, 0, 'beads 하한 0');
});

test('decodeSwordCode: 形 화이트리스트 (직/곡/중/속만, 그 외 빈 문자열)', () => {
  ['직', '곡', '중', '속'].forEach(f =>
    assert.strictEqual(decodeFns.decodeSwordCode(mkCode({ n: 'x', f, l: 0, i: [] })).form, f));
  assert.strictEqual(decodeFns.decodeSwordCode(mkCode({ n: 'x', f: '<img>', l: 0, i: [] })).form, '', '비정상 형 → 빈 값');
  assert.strictEqual(decodeFns.decodeSwordCode(mkCode({ n: 'x', f: 'evil', l: 0, i: [] })).form, '');
});

test('decodeSwordCode: 이름 24자·명문 12개 상한 + 문자열 강제', () => {
  const longName = 'あ'.repeat(50);
  const manyIns = Array.from({ length: 30 }, (_, i) => i);  // 숫자 → String 강제 대상
  const r = decodeFns.decodeSwordCode(mkCode({ n: longName, f: '직', l: 0, i: manyIns, s: 0 }));
  assert.strictEqual(r.name.length, 24, '이름 24자 컷');
  assert.strictEqual(r.inscriptions.length, 12, '명문 12개 컷');
  assert.ok(r.inscriptions.every(x => typeof x === 'string'), '명문 모두 문자열');
});

test('decodeSwordCode: 잘못된 입력은 null (prefix/base64/JSON/필수필드)', () => {
  assert.strictEqual(decodeFns.decodeSwordCode(''), null, '빈 문자열');
  assert.strictEqual(decodeFns.decodeSwordCode('NOPREFIX'), null, 'CK1 접두사 없음');
  assert.strictEqual(decodeFns.decodeSwordCode('CK1!!!'), null, '깨진 base64');
  assert.strictEqual(decodeFns.decodeSwordCode(mkCode({ n: 'x', f: '직' })), null, 'l/i 누락 (l 숫자 아님)');
  assert.strictEqual(decodeFns.decodeSwordCode(mkCode({ l: 5, i: 'notarray' })), null, 'i가 배열 아님');
});

test('breathBonus: 呼吸 임계 잠금 (첫/60s+/20s+/8s+/그외 — v17 dial)', () => {
  const at = (lastEnhanceTime) => loadFunctions(['breathBonus'], { lastEnhanceTime }).breathBonus();
  assert.strictEqual(at(0), 0.10, '첫 강화(falsy) = 최대 0.10');
  assert.strictEqual(at(null), 0.10, 'null = 최대 0.10');
  const now = Date.now();
  assert.strictEqual(at(now - 65000), 0.10, '60s+ = 0.10 (깊은 호흡)');
  assert.strictEqual(at(now - 25000), 0.05, '20~60s = 0.05 (호흡)');
  assert.strictEqual(at(now - 10000), 0.02, '8~20s = 0.02 (얕은 호흡)');
  assert.strictEqual(at(now - 3000), 0, '<8s = 0');
});

test('soulEffects/getSoulStage: 魂 단계 임계 잠금 (覺34/本67 — v10 dial)', () => {
  const make = (soul, hasSword = true) => loadFunctions(['soulEffects', 'getSoulStage'], {
    state: { hasSword, currentSword: { soul } }, SOUL_AWAKEN: 34, SOUL_TRUE: 67,
  });
  assert.strictEqual(make(33).getSoulStage(), 'plain', '33 = plain');
  assert.strictEqual(make(34).getSoulStage(), 'wake', '34 = 覺');
  assert.strictEqual(make(66).getSoulStage(), 'wake', '66 = 覺');
  assert.strictEqual(make(67).getSoulStage(), 'true', '67 = 本');
  assert.strictEqual(make(0, false).getSoulStage(), 'none', '검 없음 = none');
  const e0 = make(33).soulEffects(); assert.strictEqual(e0.successBonus, 0); assert.strictEqual(e0.rewardMul, 1.0);
  const ew = make(34).soulEffects(); assert.strictEqual(ew.successBonus, 0.02); assert.strictEqual(ew.rewardMul, 1.0);
  const et = make(67).soulEffects(); assert.strictEqual(et.successBonus, 0.04); assert.strictEqual(et.rewardMul, 1.15);
});

test('RESOLVE 값 잠금 (覺悟 dial — 平常/一心/保身, v91)', () => {
  const R = extractConst('RESOLVE');
  assert.strictEqual(R.normal.successAdd, 0); assert.strictEqual(R.normal.destroyMul, 1);
  assert.strictEqual(R.normal.downgradeMul, 1); assert.strictEqual(R.normal.costMul, 1);
  // 一心 — 올인 도박: 성공 +8%, 파괴 ×1.5
  assert.strictEqual(R.focus.successAdd, 0.08); assert.strictEqual(R.focus.destroyMul, 1.5);
  assert.strictEqual(R.focus.downgradeMul, 1); assert.strictEqual(R.focus.costMul, 1);
  // 保身 — 신중: 성공 -10%, 파괴 ×0, 하락 ×0.5, 비용 ×1.5
  assert.strictEqual(R.guard.successAdd, -0.10); assert.strictEqual(R.guard.destroyMul, 0);
  assert.strictEqual(R.guard.downgradeMul, 0.5); assert.strictEqual(R.guard.costMul, 1.5);
});

test('guardianBonus: 守 형별 패시브 잠금 (道 검만 — v52 dial)', () => {
  const make = (sword, idx = 0) => loadFunctions(['guardianBonus', 'getGuardian'], {
    state: { guardianIdx: sword ? idx : null, sealedSwords: sword ? [sword] : [] },
  });
  const none = make(null).guardianBonus();
  assert.strictEqual(none.successBonus, 0); assert.strictEqual(none.rewardMul, 1);
  assert.strictEqual(none.rescueSec, 0); assert.strictEqual(none.destroyReduce, 0);
  // 道 아닌 검은 수호자 불가 → all-zero
  assert.strictEqual(make({ form: '직', inscriptions: [] }).guardianBonus().successBonus, 0, '非道 검은 무효');
  // 道 검 형별 패시브
  const f = (form) => make({ form, inscriptions: ['道'] }).guardianBonus();
  assert.strictEqual(f('직').successBonus, 0.02, '直 +2% 성공');
  assert.strictEqual(f('곡').destroyReduce, 0.02, '曲 -2% 파괴');
  assert.strictEqual(f('중').rewardMul, 1.10, '重 ×1.10 보상');
  assert.strictEqual(f('속').rescueSec, 1.0, '速 +1s 회수');
});

test('getSchoolMastery / MASTERY_TIERS: 流派 숙련 임계 잠금 (모든 유파 보너스 배율)', () => {
  const M = extractConst('MASTERY_TIERS');
  assert.deepStrictEqual(M.map(t => [t.min, t.mul]), [[3, 1.0], [6, 1.5], [10, 2.0], [15, 2.5]], 'tier 값');
  const at = (count) => loadFunctions(['getSchoolMastery', 'getFormCounts'], {
    state: { sealedSwords: Array.from({ length: count }, () => ({ form: '직' })) },
    MASTERY_TIERS: M,
  }).getSchoolMastery('직');
  assert.strictEqual(at(0), null, '0 = 미달성');
  assert.strictEqual(at(2), null, '2 = 미달성 (<3, SCHOOL_THRESHOLD)');
  assert.strictEqual(at(3).mul, 1.0, '3 = 入門 ×1.0');
  assert.strictEqual(at(5).mul, 1.0, '5 = 여전히 入門');
  assert.strictEqual(at(6).mul, 1.5, '6 = 師範 ×1.5');
  assert.strictEqual(at(10).mul, 2.0, '10 = 宗師 ×2.0');
  assert.strictEqual(at(15).mul, 2.5, '15 = 超越 ×2.5');
});

test('SHADOW_TYPES 값 잠금 (전투 dial — flee/steel 보정)', () => {
  const by = Object.fromEntries(extractConst('SHADOW_TYPES').map(t => [t.key, t]));
  assert.strictEqual(by.normal.strengthMul, 1.0); assert.strictEqual(by.normal.rewardMul, 1.0);
  assert.strictEqual(by.flee.strengthMul, 0.85, '逃影 강도 ×0.85');
  assert.strictEqual(by.flee.rewardMul, 1.8, '逃影 보상 ×1.8');
  assert.strictEqual(by.flee.slayEvade, 0.35, '逃影 35% 회피');
  assert.strictEqual(by.steel.rewardMul, 1.5, '鋼影 보상 ×1.5');
  assert.strictEqual(by.steel.strengthAdd, 3, '鋼影 강도 +3');
});

test('affinityRewardMul: 形相剋 보상 배율 잠금 (favored ×1.25 / weakness ×0.85, v129)', () => {
  const FA = extractConst('FORM_AFFINITY');
  assert.strictEqual(FA['직'].favored, 'normal'); assert.strictEqual(FA['직'].weakness, 'demon');
  assert.strictEqual(FA['속'].favored, 'flee'); assert.strictEqual(FA['중'].favored, 'demon');
  assert.match(readScript(), /AFFINITY_FAVORED_MUL = 1\.25/, 'favored ×1.25');
  assert.match(readScript(), /AFFINITY_WEAKNESS_MUL = 0\.85/, 'weakness ×0.85');
  const f = loadFunctions(['affinityRewardMul', 'getAffinity'], { FORM_AFFINITY: FA, AFFINITY_FAVORED_MUL: 1.25, AFFINITY_WEAKNESS_MUL: 0.85 });
  assert.strictEqual(f.affinityRewardMul('직', 'normal'), 1.25, '直>평범 favored');
  assert.strictEqual(f.affinityRewardMul('직', 'demon'), 0.85, '直<검귀 weakness');
  assert.strictEqual(f.affinityRewardMul('속', 'flee'), 1.25, '速>도망 favored');
  assert.strictEqual(f.affinityRewardMul('직', 'steel'), 1.0, '中립');
  assert.strictEqual(f.affinityRewardMul(null, 'normal'), 1.0, 'form 없음 中립');
});

test('computeMindChart: 무행동(zero) 상태도 NaN 없이 0% (|| 1 가드)', () => {
  const zero = loadFunctions(['computeMindChart'], { state: { stats: {}, gambleStats: {} } }).computeMindChart();
  zero.forEach(b => {
    assert.ok(Number.isFinite(b.pct), b.name + ' pct가 유한해야 (NaN 금지)');
    assert.strictEqual(b.pct, 0, b.name + ' = 0%');
  });
  const f = loadFunctions(['computeMindChart'], { state: { stats: { slainNormal: 3 }, gambleStats: { win: 1 } } }).computeMindChart();
  assert.strictEqual(f.find(b => b.name.startsWith('戰')).pct, 75, '3/(3+1)=75%');
  assert.strictEqual(f.find(b => b.name.startsWith('賭')).pct, 25, '1/4=25%');
});

test('deriveNameOrigin: 이름의 유래 서사 (makeSwordName 우선순위 거울, v311)', () => {
  const NS = extractConst('NAME_SUFFIX');
  const f = (ins, lv) => loadFunctions(['deriveNameOrigin'], { NAME_SUFFIX: NS }).deriveNameOrigin('직', ins, lv);
  assert.match(f(['道'], 15), /도에 이르러 道의 이름을 얻었다/);
  assert.match(f(['귀참', '本'], 12), /마의 이름을 얻었다/, '鬼斬이 本보다 우선');
  assert.match(f(['本'], 10), /본질을 깨달아 本의 이름을 얻었다/);
  assert.match(f([], 7), /강화 \+7의 자취로 이름을 얻었다/, '명문 없으면 강화도');
});

test('deriveForging: 단련 노고 서사 (시도/강화도 비, v313)', () => {
  const f = loadFunctions(['deriveForging']).deriveForging;
  assert.strictEqual(f(0, 5), '', '시도 0 → 표시 없음');
  assert.match(f(8, 10), /순탄한 단련/, '8≤10*1.5 순탄');
  assert.match(f(45, 10), /험난한 길/, '45≥10*4 험난');
  assert.match(f(25, 10), /25번 두드려 \+10에 이르렀다/, '중간');
});

test('computeRecords: 봉인 검의 beads·enhanceAttempts도 최댓값에 반영 (v313/v314 보존 검증)', () => {
  const state = {
    sealedSwords: [{ beads: 50, enhanceAttempts: 30, slainCount: 2, soul: 10 }],
    enshrined: [], hasSword: false, bestLevel: 5, swordGeneration: 1, bestStreak: 0,
  };
  const r = loadFunctions(['computeRecords'], { state }).computeRecords();
  assert.strictEqual(r.maxBeads, 50, '봉인 검 念珠가 최다 念珠 기록에 반영');
  assert.strictEqual(r.maxEnhance, 30, '봉인 검 강화 시도가 최다 시도 기록에 반영');
  assert.strictEqual(r.maxSlain, 2);
});

test('HIDDEN_ACHIEVEMENTS 慎重/無欲 + protectsUsed 보존 (v315)', () => {
  const by = Object.fromEntries(extractConst('HIDDEN_ACHIEVEMENTS').map(a => [a.key, a]));
  assert.strictEqual(by.shinjuu.check({ protectsUsed: 5 }), true, '慎重: 보호권 5회');
  assert.strictEqual(by.shinjuu.check({ protectsUsed: 4 }), false);
  assert.strictEqual(by.muyoku.check({ level: 10, protectsUsed: 0 }), true, '無欲: +10 무보호');
  assert.strictEqual(!!by.muyoku.check({ level: 10, protectsUsed: 3 }), false, '보호권 쓴 +10은 無欲 아님 (false-positive 방지)');
  // 봉인 검에 protectsUsed가 보존돼야 위 check가 sealed 검에서 의미있음
  assert.match(readScript(), /protectsUsed: state\.currentSword\.protectsUsed \|\| 0/, 'seal 경로가 protectsUsed 보존');
});

test('encodeSwordCode→decodeSwordCode 라운드트립 — 공유 코드 무결성', () => {
  const { encodeSwordCode, decodeSwordCode } = loadFunctions(['encodeSwordCode', 'decodeSwordCode']);
  const sword = { name: '直道劍', form: '직', level: 12, inscriptions: ['道', '本'], soul: 67, verse: ['첫 행', '둘째 행'], beads: 40 };
  const code = encodeSwordCode(sword);
  assert.match(code, /^CK1/, 'CK1 접두사');
  const r = decodeSwordCode(code);
  assert.ok(r, '디코드 성공');
  assert.strictEqual(r.name, '直道劍');
  assert.strictEqual(r.form, '직');
  assert.strictEqual(r.level, 12);
  assert.strictEqual(JSON.stringify(r.inscriptions), JSON.stringify(['道', '本']), '명문 라운드트립');
  assert.strictEqual(r.soul, 67);
  assert.strictEqual(JSON.stringify(r.verse), JSON.stringify(['첫 행', '둘째 행']), '시구 join/split 라운드트립');
  assert.strictEqual(r.beads, 40, 'beads 라운드트립');
  assert.strictEqual(r.isGuest, true);
});

test('resonanceBonus: 共鳴 — 같은 형 봉인 검당 +0.5%, cap 5% (v178 dial)', () => {
  const mk = (form, sealedForms) => loadFunctions(['resonanceBonus', 'sameFormSealedCount'], {
    state: { hasSword: true, currentSword: { form }, sealedSwords: sealedForms.map(f => ({ form: f })) },
  });
  assert.strictEqual(mk('직', []).resonanceBonus(), 0, '같은 형 0개 → 0');
  assert.ok(Math.abs(mk('직', ['직', '직']).resonanceBonus() - 0.01) < 1e-9, '直 2개 → +1%');
  assert.ok(Math.abs(mk('직', ['직', '곡', '직']).resonanceBonus() - 0.01) < 1e-9, '直 2개만 카운트(曲 무시)');
  assert.strictEqual(mk('직', Array(20).fill('직')).resonanceBonus(), 0.05, 'cap +5%');
  const noSword = loadFunctions(['resonanceBonus', 'sameFormSealedCount'], { state: { hasSword: false, sealedSwords: [] } });
  assert.strictEqual(noSword.resonanceBonus(), 0, '검 없음 → 0');
});

test('getScarDestroyReduce: 흉터당 -1% 파괴 (v111 刻痕 dial)', () => {
  const at = (scars, hasSword = true) => loadFunctions(['getScarDestroyReduce'], {
    state: { currentSword: hasSword ? { scars } : null },
  }).getScarDestroyReduce();
  assert.strictEqual(at(0), 0, '흉터 0 → 0');
  assert.ok(Math.abs(at(1) - 0.01) < 1e-9, '흉터 1 → -1%');
  assert.ok(Math.abs(at(3) - 0.03) < 1e-9, '흉터 3 → -3%');
  assert.strictEqual(at(0, false), 0, '검 없음 → 0');
});

test('moodSuccessBonus: 心象 — 喜 +3%, 怒 -2%, 그 외 0 (v127 dial)', () => {
  const at = (mood) => loadFunctions(['moodSuccessBonus'], { currentMood: mood }).moodSuccessBonus();
  assert.ok(Math.abs(at('joy') - 0.03) < 1e-9, '喜 +3%');
  assert.ok(Math.abs(at('rage') - (-0.02)) < 1e-9, '怒 -2%');
  assert.strictEqual(at('calm'), 0);
  assert.strictEqual(at(null), 0);
});

test('enshrineSuccessBonus: 殿堂 검당 +1.5%, 최대 3진열 +4.5% (v118 dial)', () => {
  const at = (n) => loadFunctions(['enshrineSuccessBonus', 'enshrineCount'], { state: { enshrined: Array(n).fill({}) } }).enshrineSuccessBonus();
  assert.strictEqual(at(0), 0);
  assert.ok(Math.abs(at(1) - 0.015) < 1e-9, '1진열 → +1.5%');
  assert.ok(Math.abs(at(3) - 0.045) < 1e-9, '3진열 → +4.5%');
});

test('getCurrentEra / eraSuccessBonus: 紀元 임계(300/1000/3000/8000) + 성공 보너스 dial', () => {
  const ERAS = extractConst('ERAS');
  assert.deepStrictEqual(ERAS.map(e => [e.threshold, e.successBonus]),
    [[0, 0], [300, 0.01], [1000, 0.02], [3000, 0.03], [8000, 0.05]], 'ERAS 임계·보너스');
  const at = (n) => loadFunctions(['getCurrentEra', 'eraSuccessBonus'],
    { state: { stats: { enhanceAttempts: n } }, ERAS }).eraSuccessBonus();
  assert.strictEqual(at(0), 0, '萌芽');
  assert.strictEqual(at(299), 0, '<300 아직 萌芽');
  assert.ok(Math.abs(at(300) - 0.01) < 1e-9, '300 → 修練');
  assert.ok(Math.abs(at(1000) - 0.02) < 1e-9, '1000 → 開眼');
  assert.ok(Math.abs(at(8000) - 0.05) < 1e-9, '8000 → 神域');
  assert.ok(Math.abs(at(99999) - 0.05) < 1e-9, '최고 era 유지');
});

test('challengeReward: 베기 기본 보상 곡선 strength*4+6 (단조 증가)', () => {
  const f = loadFunctions(['challengeReward']).challengeReward;
  assert.strictEqual(f(1), 10, '1*4+6');
  assert.strictEqual(f(6), 30, '黑風(강도6)');
  assert.strictEqual(f(15), 66);
  let prev = -1;
  for (let s = 1; s <= 20; s++) { const r = f(s); assert.ok(r > prev, '강도 ' + s + ' 단조'); prev = r; }
});

test('dailySeed: 결정적 해시 (같은 날짜 동일·음수 없음·날짜별 변화)', () => {
  const f = loadFunctions(['dailySeed']).dailySeed;
  assert.strictEqual(f('2026-05-22'), f('2026-05-22'), '같은 날짜 → 동일 seed (결정적)');
  assert.ok(f('2026-05-22') >= 0, '음수 없음');
  assert.notStrictEqual(f('2026-05-22'), f('2026-05-23'), '다른 날짜 → 다른 seed');
  assert.strictEqual(f(''), 0, '빈 문자열 → 0');
  assert.ok(Number.isInteger(f('2026-12-31')), '정수 반환');
});

test('getTimeOfDay: 시간대 경계 (朝5-11/晝11-17/夕17-21/夜 그 외 — v153/v252)', () => {
  const at = (hour) => {
    function FakeDate() {}
    FakeDate.prototype.getHours = function () { return hour; };
    return loadFunctions(['getTimeOfDay'], { Date: FakeDate }).getTimeOfDay().key;
  };
  assert.strictEqual(at(4), 'night', '4시 → 夜');
  assert.strictEqual(at(5), 'morning', '5시 → 朝');
  assert.strictEqual(at(10), 'morning');
  assert.strictEqual(at(11), 'day', '11시 → 晝');
  assert.strictEqual(at(16), 'day');
  assert.strictEqual(at(17), 'evening', '17시 → 夕');
  assert.strictEqual(at(20), 'evening');
  assert.strictEqual(at(21), 'night', '21시 → 夜');
});

test('getCurrentSolarTerm: 날짜→절기 선택 (latest-passed term, v177)', () => {
  const ST = extractConst('SOLAR_TERMS');
  const at = (month, day) => {
    function FakeDate() {}
    FakeDate.prototype.getMonth = function () { return month - 1; };
    FakeDate.prototype.getDate = function () { return day; };
    return loadFunctions(['getCurrentSolarTerm'], { Date: FakeDate, SOLAR_TERMS: ST }).getCurrentSolarTerm().key;
  };
  assert.strictEqual(at(1, 1), 'dongzhi', '1월 → 冬至(전년 동지 유지, 立春 전)');
  assert.strictEqual(at(2, 3), 'dongzhi', '2/3 → 아직 冬至');
  assert.strictEqual(at(2, 4), 'lichun', '2/4 → 立春');
  assert.strictEqual(at(6, 21), 'xiazhi', '6/21 → 夏至');
  assert.strictEqual(at(12, 22), 'dongzhi', '12/22 → 冬至');
});

test('stalemateCost: 對峙 비용 10 + ceil(강도*1.2) (v183)', () => {
  const at = (strength) => loadFunctions(['stalemateCost'], { challenge: strength != null ? { strength } : null }).stalemateCost();
  assert.strictEqual(at(null), 0, '도전 없음 → 0');
  assert.strictEqual(at(5), 10 + Math.ceil(6), '강도5 → 16');
  assert.strictEqual(at(10), 10 + Math.ceil(12), '강도10 → 22');
});

test('getActiveSchools: 같은 형 SCHOOL_THRESHOLD(3) 이상 봉인 시 활성 (v12)', () => {
  const at = (forms) => loadFunctions(['getActiveSchools', 'getFormCounts'], {
    state: { sealedSwords: forms.map(f => ({ form: f })) },
    SCHOOLS: { '직': {}, '곡': {}, '중': {}, '속': {} }, SCHOOL_THRESHOLD: 3,
  }).getActiveSchools();
  assert.strictEqual(JSON.stringify(at([])), '[]', '0개 → 없음');
  assert.strictEqual(JSON.stringify(at(['직', '직'])), '[]', '2 < 3 → 없음');
  assert.strictEqual(JSON.stringify(at(['직', '직', '직'])), '["직"]', '直 3개 → 직류 활성');
  assert.strictEqual(JSON.stringify(at(['직', '직', '직', '곡', '곡', '곡'])), JSON.stringify(['직', '곡']), '둘 다 활성');
});

test('SCHOOLS 보너스 값 잠금 (流派 dial — 직류+1%/곡류-1%/중류×1.10/속류+1s, v12)', () => {
  const S = extractConst('SCHOOLS');
  assert.strictEqual(S['직'].schoolBonusSuccess, 0.01, '직류 성공 +1%');
  assert.strictEqual(S['곡'].schoolBonusDestroyReduce, 0.01, '곡류 파괴 -1%');
  assert.strictEqual(S['중'].schoolBonusSealMul, 1.10, '중류 봉인 ×1.10');
  assert.strictEqual(S['속'].schoolBonusRescueSec, 1.0, '속류 회수 +1s');
});

test('schoolRescueSec(): 속류 회수 보너스가 활성 임계·유파 숙련·殿堂 합산까지 합성 (v12/v65 회수 타이밍 dial)', () => {
  const SCHOOLS = extractConst('SCHOOLS');
  const MASTERY_TIERS = extractConst('MASTERY_TIERS');
  const expectFast = SCHOOLS['속'].schoolBonusRescueSec; // 1.0
  // 같은 컬렉션을 getFormCounts/getActiveSchools/schoolMasteryMul 전 체인에 흘려 합성 검증
  const at = (sealed, enshrined) => loadFunctions(
    ['schoolRescueSec', 'getActiveSchools', 'getFormCounts', 'schoolMasteryMul', 'getSchoolMastery'],
    {
      state: {
        sealedSwords: (sealed || []).map(f => ({ form: f })),
        enshrined: (enshrined || []).map(f => ({ form: f })),
      },
      SCHOOLS, SCHOOL_THRESHOLD: 3, MASTERY_TIERS,
    }
  ).schoolRescueSec();
  assert.strictEqual(at([]), 0, '0자루 → 미활성 → 0초 (회수 보너스 없음)');
  assert.strictEqual(at(['속', '속']), 0, '2 < 3 → 미활성 → 0초');
  assert.strictEqual(at(['속', '속', '속']), expectFast * 1.0, '3자루 入門(×1.0) → +1.0초');
  assert.strictEqual(at(['속', '속', '속', '속', '속', '속']), expectFast * 1.5, '6자루 師範(×1.5) → +1.5초');
  // v350 머지 컬렉션: 봉인 2 + 殿堂 1 = 3 → 활성 (殿堂 검도 流派 진척에 합산)
  assert.strictEqual(at(['속', '속'], ['속']), expectFast * 1.0, '봉인2+殿堂1=3 → 入門 활성');
  // 다른 형은 속류 회수에 기여 안 함
  assert.strictEqual(at(['직', '직', '직']), 0, '직류 3자루는 회수 보너스 0 (성공률 계열)');
});

test('성공률 게이트 dial 잠금 (四道/究極/神殿/朝/소원 — successChanceNow 합산항, 값+게이트)', () => {
  // 분기점 버그류(display≠actual)의 핵심: 성공률 합산항이 조용히 값/게이트가 바뀌면
  // 표시·실제가 함께 어긋난다. 각 게이트 헬퍼의 dial 값과 on/off 조건을 잠근다.
  const fourWay = (on) => loadFunctions(['fourWaySuccessBonus'], { hasFourWays: () => on }).fourWaySuccessBonus();
  assert.strictEqual(fourWay(true), 0.03, '四道 달성 → +3%');
  assert.strictEqual(fourWay(false), 0, '四道 미달 → 0');

  const ult = (on) => loadFunctions(['ultimateSuccessBonus'], { state: { ultimateAchieved: on } }).ultimateSuccessBonus();
  assert.strictEqual(ult(true), 0.01, '究極 달성 → 영구 +1%');
  assert.strictEqual(ult(false), 0, '究極 미달 → 0');

  const shrine = (has) => loadFunctions(['shrineSuccessBonus'], { shrineHas: (k) => has && k === 'd1' }).shrineSuccessBonus();
  assert.strictEqual(shrine(true), 0.01, "神殿 d1 보유 → +1%");
  assert.strictEqual(shrine(false), 0, '神殿 d1 미보유 → 0');

  const tod = (key) => loadFunctions(['todSuccessBonus'], { getTimeOfDay: () => ({ key }) }).todSuccessBonus();
  assert.strictEqual(tod('morning'), 0.01, '朝(morning) → +1%');
  assert.strictEqual(tod('night'), 0, '그 외 시간대 → 0');

  const wish = (charges, bonus) => loadFunctions(['wishSuccessBonus'], {
    state: { swordWish: charges != null ? { charges, successBonus: bonus } : null },
  }).wishSuccessBonus();
  assert.strictEqual(wish(2, 0.05), 0.05, '소원 충전>0 → swordWish.successBonus 적용');
  assert.strictEqual(wish(0, 0.05), 0, '소원 충전 소진 → 0');
  assert.strictEqual(wish(null), 0, '소원 없음 → 0');
});

test('베기 보상 배수 dial 잠금 (氣分/소원/神殿/날씨/夜 — slayGrantAmount 곱셈항, 값+기본 1.0)', () => {
  // 보상 배수는 기본값이 반드시 1.0 — 0으로 떨어지면 보상이 통째로 사라지는 고전 버그.
  // 각 배수의 dial 값과 미발동 시 1.0 복귀를 잠근다.
  const mood = (m) => loadFunctions(['moodSlayRewardMul'], { currentMood: m }).moodSlayRewardMul();
  assert.strictEqual(mood('joy'), 1.05, '喜 → ×1.05');
  assert.strictEqual(mood('rage'), 1.05, '怒 → ×1.05');
  assert.strictEqual(mood('calm'), 1.0, '그 외 기분 → ×1.0 (기본)');

  const shrine = (has) => loadFunctions(['shrineSlayRewardMul'], { shrineHas: (k) => has && k === 'd4' }).shrineSlayRewardMul();
  assert.strictEqual(shrine(true), 1.02, '神殿 d4 → ×1.02');
  assert.strictEqual(shrine(false), 1.0, '神殿 d4 미보유 → ×1.0');

  const weather = (w) => loadFunctions(['weatherSlayRewardMul'], { weatherActive: w }).weatherSlayRewardMul();
  assert.strictEqual(weather('wind'), 1.15, '風 → ×1.15');
  assert.strictEqual(weather('rain'), 1.0, '그 외 날씨 → ×1.0');

  const tod = (key) => loadFunctions(['todSlayRewardBonus'], { getTimeOfDay: () => ({ key }) }).todSlayRewardBonus();
  assert.strictEqual(tod('night'), 1.02, '夜 → ×1.02');
  assert.strictEqual(tod('morning'), 1.0, '그 외 시간대 → ×1.0');

  const wish = (charges, mul) => loadFunctions(['wishSlayRewardMul'], {
    state: { swordWishSlay: charges != null ? { charges, slayRewardMul: mul } : null },
  }).wishSlayRewardMul();
  assert.strictEqual(wish(1, 1.5), 1.5, '소원 슬레이 충전>0 → slayRewardMul 적용');
  assert.strictEqual(wish(0, 1.5), 1.0, '소원 슬레이 소진 → ×1.0');
  assert.strictEqual(wish(null), 1.0, '소원 없음 → ×1.0');

  // 殿堂 수용량 보너스는 가산(기본 0) — 위 배수들과 기본값 의미가 다름을 함께 잠근다
  const cap = (has) => loadFunctions(['shrineEnshrineCapBonus'], { shrineHas: (k) => has && k === 'd5' }).shrineEnshrineCapBonus();
  assert.strictEqual(cap(true), 1, '神殿 d5 → 殿堂 +1칸');
  assert.strictEqual(cap(false), 0, '神殿 d5 미보유 → +0 (가산 기본 0)');
});

test('節氣 접근자 7종 필드 라우팅 잠금 (각 solar* 가 자기 필드만 읽음 — v177 죽은 보너스류 분기점 방지)', () => {
  // integrity는 "호출됨"만 확인 — 어느 필드를 읽는지는 안 봄. 필드 오라우팅
  // (예: solarRewardMul이 .sealMul을 읽음)은 분기점 버그라 따로 잠근다.
  // 모든 필드에 서로 다른 sentinel을 넣어 각 헬퍼가 자기 필드만 집는지 검증.
  const term = { costMul: 1.11, challengeMul: 1.22, rewardMul: 1.33, sealMul: 1.44, rescueSec: 5, destroyReduce: 0.07, soulMul: 1.66 };
  const fns = loadFunctions(
    ['solarCostMul', 'solarChallengeMul', 'solarRewardMul', 'solarSealMul', 'solarRescueSec', 'solarDestroyReduce', 'solarSoulMul'],
    { getCurrentSolarTerm: () => term }
  );
  assert.strictEqual(fns.solarCostMul(), 1.11, 'solarCostMul → costMul');
  assert.strictEqual(fns.solarChallengeMul(), 1.22, 'solarChallengeMul → challengeMul');
  assert.strictEqual(fns.solarRewardMul(), 1.33, 'solarRewardMul → rewardMul');
  assert.strictEqual(fns.solarSealMul(), 1.44, 'solarSealMul → sealMul');
  assert.strictEqual(fns.solarRescueSec(), 5, 'solarRescueSec → rescueSec');
  assert.strictEqual(fns.solarDestroyReduce(), 0.07, 'solarDestroyReduce → destroyReduce');
  assert.strictEqual(fns.solarSoulMul(), 1.66, 'solarSoulMul → soulMul');

  // 빈 절기(효과 없는 날) → 배수는 1, 가산/초는 0
  const def = loadFunctions(
    ['solarCostMul', 'solarChallengeMul', 'solarRewardMul', 'solarSealMul', 'solarRescueSec', 'solarDestroyReduce', 'solarSoulMul'],
    { getCurrentSolarTerm: () => ({}) }
  );
  assert.strictEqual(def.solarCostMul(), 1, '무효과 → 비용배수 1');
  assert.strictEqual(def.solarChallengeMul(), 1, '무효과 → 도전배수 1');
  assert.strictEqual(def.solarRewardMul(), 1, '무효과 → 보상배수 1');
  assert.strictEqual(def.solarSealMul(), 1, '무효과 → 봉인배수 1');
  assert.strictEqual(def.solarRescueSec(), 0, '무효과 → 회수초 0');
  assert.strictEqual(def.solarDestroyReduce(), 0, '무효과 → 파괴감소 0');
  assert.strictEqual(def.solarSoulMul(), 1, '무효과 → 영혼배수 1');
});

test('단일 게이트 dial 잠금 (蝕/주말/사방신/변이/七寶/雷 — 값+게이트+기본 타입)', () => {
  // 배수(기본 1.0)와 가산(기본 0)을 섞어 잠근다 — 둘을 헷갈리면 보상/확률이 통째 사라지거나 0이 됨.
  const eclipse = (on) => loadFunctions(['eclipseSoulMul'], { eclipseActive: on }).eclipseSoulMul();
  assert.strictEqual(eclipse(true), 2.0, '日蝕 중 → 영혼 ×2.0');
  assert.strictEqual(eclipse(false), 1.0, '평시 → ×1.0 (배수 기본)');

  const weekend = (on) => loadFunctions(['weekendChallengeMul'], { isWeekend: () => on }).weekendChallengeMul();
  assert.strictEqual(weekend(true), 1.05, '주말 → 도전 ×1.05');
  assert.strictEqual(weekend(false), 1, '평일 → ×1');

  const beast = (on) => loadFunctions(['beastChallengeMul'], { beastUnlocked: (k) => on && k === 'genbu' }).beastChallengeMul();
  assert.strictEqual(beast(true), 1.05, '玄武 해방 → 도전 ×1.05');
  assert.strictEqual(beast(false), 1, '미해방 → ×1');

  const mut = (m) => loadFunctions(['mutationSuccessBonus'], {
    state: { hasSword: true, currentSword: { mutation: m } },
  }).mutationSuccessBonus();
  assert.strictEqual(mut('gangol'), 0.02, '鋼骨 변이 → 성공 +2%');
  assert.strictEqual(mut('none'), 0, '그 외 변이 → +0 (가산 기본)');

  const treasure = (on) => loadFunctions(['treasureGlobalBonus'], { allSevenTreasures: () => on }).treasureGlobalBonus();
  assert.strictEqual(treasure(true), 0.015, '七寶 완성 → 글로벌 +1.5%');
  assert.strictEqual(treasure(false), 0, '미완성 → +0');

  const weather = (on) => loadFunctions(['weatherSuccessBonus'], { lightningBonusReady: on }).weatherSuccessBonus();
  assert.strictEqual(weather(true), 0.10, '雷 충전 → 성공 +10%');
  assert.strictEqual(weather(false), 0, '평시 → +0');
});

test('世代(generation) 보너스 합성 잠금 (누적 임계 필터 + 가산 successBonus / 곱셈 slay·seal)', () => {
  const GENERATIONS = extractConst('GENERATIONS');
  const at = (gen) => loadFunctions(
    ['generationSuccessBonus', 'generationSlayMul', 'generationSealMul', 'getGenerationMilestones'],
    { GENERATIONS, state: { swordGeneration: gen } }
  );
  let f = at(0);
  assert.strictEqual(f.generationSuccessBonus(), 0, 'gen0 → 성공 +0');
  assert.strictEqual(f.generationSlayMul(), 1, 'gen0 → slay ×1');
  assert.strictEqual(f.generationSealMul(), 1, 'gen0 → seal ×1');
  f = at(10);
  assert.strictEqual(f.generationSuccessBonus(), 0.01, 'gen10 百鍊宗 → +1%');
  f = at(25);
  assert.strictEqual(f.generationSealMul(), 1.05, 'gen25 千鍛士 → seal ×1.05');
  assert.strictEqual(f.generationSuccessBonus(), 0.01, 'gen25 → 누적 성공 여전히 +1% (g25엔 successBonus 없음)');
  f = at(50);
  assert.strictEqual(Math.round(f.generationSuccessBonus() * 100) / 100, 0.02, 'gen50 → g10+g50 가산 +2%');
  assert.strictEqual(f.generationSealMul(), 1.05, 'gen50 → seal 여전히 ×1.05');
  f = at(100);
  assert.strictEqual(f.generationSlayMul(), 1.10, 'gen100 百代仙 → slay ×1.10');
  assert.strictEqual(Math.round(f.generationSuccessBonus() * 100) / 100, 0.02, 'gen100 → 가산 성공 +2%');
  assert.strictEqual(f.generationSealMul(), 1.05, 'gen100 → seal ×1.05');
});

test('四方神(beast) 보너스 키-라우팅 잠금 (각 헬퍼가 자기 신수만 — 교차배선 방지)', () => {
  // 4 헬퍼가 서로 다른 신수(suzaku/byakko/seiryu/genbu)를 읽음. 한 신수만 해방하고
  // 그 헬퍼만 발동하는지(나머지는 기본값) 확인 → 키 오라우팅(분기점) 차단.
  const only = (unlocked) => loadFunctions(
    ['beastSuccessBonus', 'beastRescueSec', 'beastSealMul', 'beastChallengeMul', 'beastUnlocked'],
    { state: { beastsUnlocked: { [unlocked]: true } } }
  );
  let f = only('suzaku');
  assert.strictEqual(f.beastSuccessBonus(), 0.01, '朱雀 → 성공 +1%');
  assert.strictEqual(f.beastRescueSec(), 0, '朱雀만 해방 → 회수 0');
  assert.strictEqual(f.beastSealMul(), 1, '朱雀만 해방 → seal ×1');
  assert.strictEqual(f.beastChallengeMul(), 1, '朱雀만 해방 → 도전 ×1');
  f = only('byakko');
  assert.strictEqual(f.beastRescueSec(), 0.5, '白虎 → 회수 +0.5s');
  assert.strictEqual(f.beastSuccessBonus(), 0, '白虎만 → 성공 0');
  f = only('seiryu');
  assert.strictEqual(f.beastSealMul(), 1.03, '靑龍 → seal ×1.03');
  assert.strictEqual(f.beastSuccessBonus(), 0, '靑龍만 → 성공 0');
  f = only('genbu');
  assert.strictEqual(f.beastChallengeMul(), 1.05, '玄武 → 도전 ×1.05');
  assert.strictEqual(f.beastSealMul(), 1, '玄武만 → seal ×1');
});

test('todayStr: 로컬 YYYY-MM-DD (timezone-safe, 0-패딩 — 일일 리셋 핵심)', () => {
  const at = (y, mIndex, day) => {
    function FakeDate() {}
    FakeDate.prototype.getFullYear = function () { return y; };
    FakeDate.prototype.getMonth = function () { return mIndex; };
    FakeDate.prototype.getDate = function () { return day; };
    return loadFunctions(['todayStr'], { Date: FakeDate, String: String }).todayStr();
  };
  assert.strictEqual(at(2026, 4, 22), '2026-05-22', '월 0-index +1');
  assert.strictEqual(at(2026, 0, 5), '2026-01-05', '한 자리 월/일 0-패딩');
  assert.strictEqual(at(2026, 11, 31), '2026-12-31');
});

test('formatPlayTime: ms → 분/시간/일 (v174 歲月)', () => {
  const f = loadFunctions(['formatPlayTime']).formatPlayTime;
  assert.strictEqual(f(0), '1분 미만');
  assert.strictEqual(f(59000), '1분 미만', '<1분');
  assert.strictEqual(f(60000), '1분');
  assert.strictEqual(f(3660000), '1시간 1분', '61분');
  assert.strictEqual(f(90000000), '1일 1시간', '1500분=25시간');
});

test('computeOverallProgress: 大成 — 신규 0%, 100 cap (가중치 합 100)', () => {
  // 의존 상수/함수 미주입(typeof undefined) + 빈 state → 모든 기여 0 → 0%
  const zero = loadFunctions(['computeOverallProgress'], { state: { stats: {}, enshrined: [] } }).computeOverallProgress();
  assert.strictEqual(zero, 0, '신규 플레이어 大成 0% (NaN/부분값 아님)');
  // 소스가 100으로 cap (가중치 합 100 초과 방지)
  assert.match(readScript(), /return Math\.min\(100, Math\.round\(total\)\)/, '大成 100 cap');
});

// v371 checkNaturePath — 率性 인식 순간의 발화 로직 (행동 테스트, 와이어링 가드와 상보)
test('v371 checkNaturePath: follow/defy만 1회 발화 + seen 잠금 + 일지 기록', () => {
  function run(np, seen, hasSword) {
    const calls = { announce: [], record: [] };
    const state = { hasSword: hasSword !== false, currentSword: { naturePathSeen: !!seen } };
    loadFunctions(['checkNaturePath'], {
      state,
      deriveNaturePath: () => np,
      announceInscription: (k, l) => calls.announce.push([k, l]),
      recordEvent: (t) => calls.record.push(t),
    }).checkNaturePath();
    return { calls, state };
  }
  // follow → 발화 1회 + 일지 + seen 잠금
  let r = run({ key: 'follow', name: '率性' }, false, true);
  assert.strictEqual(r.calls.announce.length, 1, 'follow 발화');
  assert.strictEqual(r.calls.record.length, 1, 'follow 일지 기록');
  assert.strictEqual(r.state.currentSword.naturePathSeen, true, '발화 후 seen 잠금');
  // defy → 발화
  assert.strictEqual(run({ key: 'defy', name: '逆性' }, false, true).calls.announce.length, 1, 'defy 발화');
  // 이미 본 검 → 무발화 (1회성)
  assert.strictEqual(run({ key: 'follow', name: '率性' }, true, true).calls.announce.length, 0, 'seen=true 무발화');
  // 無爲/none(길 미정) → 무발화 (즉발·싸구려 방지)
  assert.strictEqual(run({ key: 'wuwei', name: '無爲' }, false, true).calls.announce.length, 0, '無爲 무발화');
  assert.strictEqual(run({ key: 'none', name: '' }, false, true).calls.announce.length, 0, 'none 무발화');
  // 검 없음 → 무발화
  assert.strictEqual(run({ key: 'follow', name: '率性' }, false, false).calls.announce.length, 0, '검 없음 무발화');
});

// v371d 天命 — 이룬 천명이 一代記에 결합되는지 (天命 v93 + 傳記 융합, 효과 0)
test('v371d generateBiography: 달성한 天命은 일대기에 줄로 나타나고 미달성은 안 나타남', () => {
  const DESTINIES = extractConst('DESTINIES');
  const fns = loadFunctions(['generateBiography', 'deriveTemperament', 'deriveNaturePath'], { DESTINIES });
  const base = { form: '직', level: 13, inscriptions: [], slainCount: 0, soul: 0, scars: 0, stars: {}, name: '시험검' };
  const fulfilled = fns.generateBiography(Object.assign({}, base, { destiny: 'reach13', destinyFulfilled: true }));
  assert.match(fulfilled, /천명 「極의 천명」을 이루었다/, '달성한 天命이 일대기에 결합');
  const unfulfilled = fns.generateBiography(Object.assign({}, base, { destiny: 'reach13', destinyFulfilled: false }));
  assert.ok(!/천명 「/.test(unfulfilled), '미달성 검은 天命 줄 없음');
  const noDestiny = fns.generateBiography(base);  // 하위호환: destiny 필드 없는 구 검
  assert.ok(!/천명 「/.test(noDestiny), '천명 필드 없는 구 검 안전');
});

// v371e 血統 — 융합으로 태어난 검의 부모 혈통이 一代記 개막에 결합되는지 (효과 0)
test('v371e generateBiography: 융합검은 血統(부모 검명) 줄이 나타나고 비융합검은 안 나타남', () => {
  const DESTINIES = extractConst('DESTINIES');
  const fns = loadFunctions(['generateBiography', 'deriveTemperament', 'deriveNaturePath'], { DESTINIES });
  const base = { form: '직', level: 8, inscriptions: [], slainCount: 0, soul: 0, scars: 0, stars: {}, name: '자식검' };
  const fused = fns.generateBiography(Object.assign({}, base, { fusedFrom: ['아비검', '어미검'] }));
  assert.match(fused, /두 검 「아비검」과 「어미검」의 혼을 이어 태어났다/, '융합검 血統 결합');
  const plain = fns.generateBiography(base);  // fusedFrom 없음
  assert.ok(!/혼을 이어 태어났다/.test(plain), '비융합검은 血統 줄 없음');
});

// v371f 久/古 — 오래 산 검의 遺言이 longevity를 반영하는지 (道/龍斬 > 古 > 久 > 性情, 효과 0)
test('v371f generateLastWords: 古/久 노쇠 검의 작별 + 우선순위', () => {
  const fns = loadFunctions(['generateLastWords', 'deriveTemperament']);
  assert.match(fns.generateLastWords({ inscriptions: ['古'], level: 5 }), /오랜 세월을 보았다/, '古 작별');
  assert.match(fns.generateLastWords({ inscriptions: ['久'], level: 5 }), /긴 생이었다/, '久 작별');
  // 정점(道/龍斬)이 노쇠보다 우선
  assert.match(fns.generateLastWords({ inscriptions: ['道', '古'], level: 5 }), /도를 보았다/, '道가 古보다 우선');
  assert.match(fns.generateLastWords({ inscriptions: ['용참', '古'], level: 5 }), /용을 베었으니/, '龍斬이 古보다 우선');
  // 노쇠 없으면 기존 性情 경로 (구 검 하위호환)
  assert.ok(fns.generateLastWords({ inscriptions: [], level: 5 }).length > 0, '노쇠 없는 검도 작별 존재');
});

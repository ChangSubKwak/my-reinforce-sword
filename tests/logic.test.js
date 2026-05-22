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
// v6 形 — SWORD_FORMS 4종 효과 (enhanceCost/successChanceNow/fleeCost 구동)
// ─────────────────────────────────────────────────────────────
test('SWORD_FORMS: 4종(直曲重速) 정의 + 문서화된 효과', () => {
  const F = extractConst('SWORD_FORMS');
  assert.deepStrictEqual(Object.keys(F).sort(), ['曲', '直', '重', '速'].sort(), '4종 형');
  assert.strictEqual(F['直'].successBonus, 0.03, '直 성공 +3%');
  assert.strictEqual(F['曲'].destroyReduce, 0.03, '曲 파괴 -3%');
  assert.strictEqual(F['重'].costMul, 1.10, '重 비용 +10%');
  assert.strictEqual(F['重'].rewardMul, 1.20, '重 보상 +20%');
  assert.strictEqual(F['速'].fleeFree, true, '速 도망 무료');
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
    weatherDestroyReduce: () => 0, wishDestroyReduce: () => 0,
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
  const A = { level: 5, form: '直', soul: 10, inscriptions: ['本'] };
  const B = { level: 10, form: '曲', soul: 15, inscriptions: ['道'] };

  test('fusionPreview: 강한 검(높은 강화도)의 형 계승', () => {
    assert.strictEqual(preview([A, B], [0, 1], 100).form, '曲', 'B(+10)가 A(+5)보다 강함');
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
test('deriveTemperament: 剛(베기)·靜(흉터)·賭(고강화)·和(균형)', () => {
  assert.strictEqual(temp({ slainCount: 5 }), '剛', '베기 지배 → 剛');
  assert.strictEqual(temp({ scars: 2 }), '靜', '흉터(×2=4) 지배 → 靜');
  assert.strictEqual(temp({ level: 12 }), '賭', '위험 영역(+12→5) 지배 → 賭');
  assert.strictEqual(temp({ slainCount: 0, scars: 0, level: 5 }), '和', '뚜렷한 기질 없음 → 和');
});
test('deriveTemperament: 동점은 剛>靜>賭 우선', () => {
  assert.strictEqual(temp({ slainCount: 4, scars: 2 }), '剛', '剛4=靜4 → 剛 우선');
  assert.strictEqual(temp({ scars: 3, level: 13 }), '靜', '靜6=賭6 → 靜 우선');
});
test('deriveTemperament: null/무행동 안전 → 和', () => {
  assert.strictEqual(tempFns.deriveTemperament(null).key, 'wa');
  assert.strictEqual(temp({}), '和');
  assert.strictEqual(temp({ level: 7 }), '和', '+7은 위험 영역 직전 → 0');
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

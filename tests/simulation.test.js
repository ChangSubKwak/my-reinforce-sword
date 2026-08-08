'use strict';
// v391 風洞(풍동) — 게임 곡선 시뮬레이터.
// 기존 테스트는 전부 *값*을 잠근다 (TABLE 수치·라벨·와이어링). 이 파일은 *동역학*을 잠근다 —
// 이 곡선으로 게임이 실제로 굴러가는가: 초반 파산율 / 봉인 루프 수익성 / 도 도달 비용.
// 시드 고정 몬테카를로라 결정적 — TABLE/비용 다이얼을 크게 잘못 돌리면 값 테스트가 아니라
// "게임이 망가졌다"(파산 폭증·수익 붕괴·도 불가능)로 잡힌다.
// 다이얼 튜닝 시: 밴드를 벗어나면 의도한 곡선 변화인지 판단 후 밴드를 갱신할 것 (CLAUDE.md 참조).
const { test } = require('node:test');
const assert = require('node:assert');
const { extractConst, loadFunctions } = require('./harness');

const TABLE = extractConst('TABLE');
const { rescueShards } = loadFunctions(['rescueShards']);

// CLAUDE.md 「봉인 균형 곡선」 문서값 — 실제 sealRewardBase는 유파/계절 등과 얽혀 있어
// 기본 곡선(floor(lv^1.65*3)+lv)의 대표점만 사용. 실제 곡선 값은 기존 seal 테스트가 잠근다.
const SEAL_REWARD = { 3: 21, 5: 47, 7: 81, 10: 144, 15: 276 };
const NEWSWORD_COST = 50;

// mulberry32 — 시드 고정 결정적 PRNG (Math.random 금지 — 재현성)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 증류된 핵심 루프 시뮬레이터 — 보너스/형/유파/도구 없이 순수 TABLE 곡선만.
// 전략: level >= sellAt이면 판매, 아니면 강화. 파괴 시 회수(항상 성공 가정) 후
// 조각이 되면 새 검(50). 어느 행동도 불가하면 파산(ruin).
function simulateRun(rng, opts) {
  const sellAt = opts.sellAt;
  const maxActions = opts.maxActions || 400;
  let shards = opts.startShards != null ? opts.startShards : 50;
  let level = 0;
  let hasSword = true;
  let sold = 0, destroyed = 0, netEarned = 0;
  for (let i = 0; i < maxActions; i++) {
    if (!hasSword) {
      if (shards >= NEWSWORD_COST) { shards -= NEWSWORD_COST; hasSword = true; level = 0; continue; }
      return { ruined: true, actions: i, sold, destroyed, shards, net: shards - opts.startShards };
    }
    if (level >= sellAt) {
      const reward = SEAL_REWARD[sellAt];
      shards += reward; netEarned += reward;
      sold++; level = 0;  // 새 검은 자동 (봉인 후 무료 지급 — 실제 게임과 동일)
      continue;
    }
    const t = TABLE[level];
    if (!t) return { ruined: false, actions: i, sold, destroyed, shards, net: shards - opts.startShards };
    if (shards < t.cost) {
      // 강화도 판매(< SEAL_MIN 가정: sellAt >= 3이므로 level < 3일 때만 도달)도 못 하면 파산
      if (level < 3) return { ruined: true, actions: i, sold, destroyed, shards, net: shards - opts.startShards };
      // 3 <= level < sellAt — 조기 판매로 연명
      const early = SEAL_REWARD[3];
      shards += early; sold++; level = 0;
      continue;
    }
    shards -= t.cost;
    const roll = rng();
    if (roll < t.success) { level++; continue; }
    const failRoll = rng();
    if (failRoll < t.destroy) {
      destroyed++;
      // rescueRate — 5초 침묵의 성패 확률 (1 = 낙관 하한, 0 = 비관 상한)
      if (rng() < (opts.rescueRate != null ? opts.rescueRate : 1)) shards += rescueShards(level);
      hasSword = false; level = 0;
    } else if (failRoll < t.destroy + t.downgrade) {
      level = Math.max(0, level - 1);
    }
    // else 유지
  }
  return { ruined: false, actions: maxActions, sold, destroyed, shards, net: shards - opts.startShards };
}

test('풍동: 초반 생존성 — 파괴 구간 밖은 파산 불가, 안은 회수가 생사를 가른다', () => {
  const N = 3000;
  // (a) 파괴 구간(+5→6부터)을 밟지 않는 +5 판매 전략은 구조적으로 파산 불가 — 튜토리얼 안전지대
  const rng0 = mulberry32(12345);
  let ruined0 = 0;
  for (let i = 0; i < N; i++) {
    if (simulateRun(rng0, { sellAt: 5, startShards: 50, maxActions: 300, rescueRate: 0 }).ruined) ruined0++;
  }
  // (하락 연쇄로 조각이 갈려나가는 극희귀 파산은 존재 — 파괴 없이도. "사실상 0"이 곡선의 약속)
  assert.ok(ruined0 / N < 0.01, '+5 판매(파괴 구간 회피) 파산율 < 1% (현재 ' + ((ruined0 / N) * 100).toFixed(2) + '%) — 안전지대가 사라지면 초반이 무너진다');
  // (b) 파괴 구간을 지나는 +7 판매: 회수 성공률이 파산율을 물질적으로 낮춰야 한다 —
  //     5초 침묵의 경제적 의미(v389 부활)의 직접 증명
  const rngA = mulberry32(12347);
  let ruinedA = 0;
  for (let i = 0; i < N; i++) {
    if (simulateRun(rngA, { sellAt: 7, startShards: 50, maxActions: 300, rescueRate: 1 }).ruined) ruinedA++;
  }
  const rngB = mulberry32(12348);
  let ruinedB = 0;
  for (let i = 0; i < N; i++) {
    if (simulateRun(rngB, { sellAt: 7, startShards: 50, maxActions: 300, rescueRate: 0 }).ruined) ruinedB++;
  }
  const rateA = ruinedA / N, rateB = ruinedB / N;
  assert.ok(rateB > rateA + 0.01, '회수 0%(' + (rateB * 100).toFixed(1) + '%)가 회수 100%(' + (rateA * 100).toFixed(1) + '%)보다 유의미하게 위험 — 회수가 공짜 장식이면 침묵의 긴장이 죽는다');
  assert.ok(rateB > 0.02, '파괴 구간 + 회수 실패는 실재하는 위험 (현재 ' + (rateB * 100).toFixed(1) + '%)');
  assert.ok(rateA < 0.6 && rateB < 0.85, '어느 쪽도 절망은 아님 (회수1 ' + (rateA * 100).toFixed(1) + '% / 회수0 ' + (rateB * 100).toFixed(1) + '%)');
});

test('풍동: 봉인 루프 수익성 — +5/+7 판매 전략은 장기 우상향', () => {
  // 파산하지 않은 런들의 순증 평균이 양수여야 게임이 "모아서 도전"으로 진행 가능하다
  [5, 7].forEach(sellAt => {
    const rng = mulberry32(777 + sellAt);
    const N = 1500;
    let netSum = 0, survivors = 0;
    for (let i = 0; i < N; i++) {
      const r = simulateRun(rng, { sellAt, startShards: 200, maxActions: 400 });
      if (!r.ruined) { netSum += r.net; survivors++; }
    }
    assert.ok(survivors > N * 0.5, '+' + sellAt + ' 전략 생존 다수 (현재 ' + survivors + '/' + N + ')');
    const avgNet = netSum / survivors;
    assert.ok(avgNet > 0, '+' + sellAt + ' 판매 장기 순증 양수 (현재 평균 ' + avgNet.toFixed(1) + ') — 음수면 경제가 침몰한다');
  });
});

test('풍동: 도(+15)의 값 — 맨몸으론 사실상 불가능, 영석이 정상 등정로', () => {
  // (a) 맨몸: 파괴 93%가 지배해 +10 복귀 반복 — 도가 천문학적이어야 "정점"이다.
  //     이 불변식은 "영석/보너스 없이 도를 깎을 수 있게 만드는" 곡선 완화를 잡는다.
  const rngRaw = mulberry32(20260808);
  const rawCosts = [];
  for (let i = 0; i < 60; i++) {
    let level = 10, spent = 0, guard = 0;
    while (level < 15 && guard++ < 400000) {
      const t = TABLE[level];
      spent += t.cost;
      if (rngRaw() < t.success) { level++; continue; }
      const failRoll = rngRaw();
      if (failRoll < t.destroy) { level = 10; }  // 파괴 → +10 복구 가정 (복구 비용 미산입 — 그래도 충분히 천문학적)
      else if (failRoll < t.destroy + t.downgrade) { level = Math.max(10, level - 1); }
    }
    rawCosts.push(spent);
  }
  rawCosts.sort((a, b) => a - b);
  const rawMedian = rawCosts[Math.floor(rawCosts.length / 2)];
  assert.ok(rawMedian > 500000, '맨몸 도 중앙값(' + rawMedian + ') > 50만 — 정점은 맨손으로 오르는 산이 아니다');
  // (b) 영석 전략 (강화마다 영석 25 — 파괴 0, 하락만 남음): 실전 등정로가 "저축으로 닿는" 규모여야 한다
  const rngSp = mulberry32(20260809);
  const spCosts = [];
  for (let i = 0; i < 400; i++) {
    let level = 10, spent = 0, guard = 0;
    while (level < 15 && guard++ < 200000) {
      const t = TABLE[level];
      spent += t.cost + 25;  // 영석 (recipes.spiritstone.cost — 기존 테스트가 값 잠금)
      if (rngSp() < t.success) { level++; continue; }
      if (rngSp() < t.downgrade) level = Math.max(10, level - 1);  // 영석 시 destroy 0 — 하락/유지만
    }
    spCosts.push(spent);
  }
  spCosts.sort((a, b) => a - b);
  const spMedian = spCosts[Math.floor(spCosts.length / 2)];
  assert.ok(spMedian > SEAL_REWARD[15] * 3, '영석 등정 중앙값(' + spMedian + ') > 도 보상×3 — 도가 싸지면 정점이 무너진다');
  assert.ok(spMedian < 400000, '영석 등정 중앙값(' + spMedian + ') < 40만 — 실전 등정로마저 막히면 도는 장식이 된다');
});

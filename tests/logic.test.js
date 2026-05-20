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

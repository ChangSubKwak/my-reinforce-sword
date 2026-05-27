'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./harness');

// ─────────────────────────────────────────────────────────────
// v227 客劍 — 검 공유 코드 인코딩/디코딩 (보안 중요: 신뢰 불가 입력)
// ─────────────────────────────────────────────────────────────
const codeFns = loadFunctions(['encodeSwordCode', 'decodeSwordCode']);

test('encodeSwordCode: CK1 prefix + base64', () => {
  const code = codeFns.encodeSwordCode({ name: '直道', form: '직', level: 15, inscriptions: ['도'], soul: 80 });
  assert.match(code, /^CK1/, 'CK1 prefix가 있어야 함');
  assert.ok(code.length > 3, '본문이 있어야 함');
});

test('round-trip: 인코딩 후 디코딩하면 원본 보존', () => {
  const orig = { name: '曲魔', form: '곡', level: 12, inscriptions: ['귀참', '본'], soul: 67, verse: ['행1', '행2'], beads: 36 };
  const code = codeFns.encodeSwordCode(orig);
  const back = codeFns.decodeSwordCode(code);
  assert.strictEqual(back.name, '曲魔');
  assert.strictEqual(back.form, '곡');
  assert.strictEqual(back.level, 12);
  assert.deepStrictEqual(back.inscriptions, ['귀참', '본']);
  assert.strictEqual(back.soul, 67);
  assert.strictEqual(back.beads, 36);
  assert.strictEqual(back.isGuest, true);
});

test('decodeSwordCode: 잘못된 prefix 거부', () => {
  assert.strictEqual(codeFns.decodeSwordCode('XXXabc'), null);
  assert.strictEqual(codeFns.decodeSwordCode(''), null);
  assert.strictEqual(codeFns.decodeSwordCode(null), null);
});

test('decodeSwordCode: 깨진 base64 거부 (throw 안 함)', () => {
  assert.strictEqual(codeFns.decodeSwordCode('CK1!!!notbase64@@@'), null);
  assert.strictEqual(codeFns.decodeSwordCode('CK1'), null);
});

test('decodeSwordCode: level 범위 clamp (0~15)', () => {
  const overCode = codeFns.encodeSwordCode({ name: 'x', form: '직', level: 999, inscriptions: [], soul: 0 });
  assert.strictEqual(codeFns.decodeSwordCode(overCode).level, 15, 'level은 15로 clamp');
  const negCode = codeFns.encodeSwordCode({ name: 'x', form: '직', level: -50, inscriptions: [], soul: 0 });
  assert.strictEqual(codeFns.decodeSwordCode(negCode).level, 0, 'level은 0으로 clamp');
});

test('decodeSwordCode: soul 범위 clamp (0~100)', () => {
  const code = codeFns.encodeSwordCode({ name: 'x', form: '직', level: 5, inscriptions: [], soul: 9999 });
  assert.strictEqual(codeFns.decodeSwordCode(code).soul, 100);
});

test('decodeSwordCode: 잘못된 form은 빈 문자열로 정규화', () => {
  const code = codeFns.encodeSwordCode({ name: 'x', form: '惡', level: 5, inscriptions: [], soul: 0 });
  assert.strictEqual(codeFns.decodeSwordCode(code).form, '', 'whitelist 외 form은 제거');
});

test('decodeSwordCode: 임의 JSON 주입 — 필수 필드 검증', () => {
  // i(inscriptions)가 배열이 아니면 거부
  const bad = 'CK1' + Buffer.from(encodeURIComponent(JSON.stringify({ n: 'x', l: 5, i: 'notarray' })), 'binary').toString('base64');
  assert.strictEqual(codeFns.decodeSwordCode(bad), null, 'inscriptions 비배열 → null');
});

test('decodeSwordCode: 명문 12개 초과 시 잘림', () => {
  const many = Array.from({ length: 30 }, (_, i) => 'k' + i);
  const code = codeFns.encodeSwordCode({ name: 'x', form: '직', level: 5, inscriptions: many, soul: 0 });
  assert.ok(codeFns.decodeSwordCode(code).inscriptions.length <= 12, '명문 최대 12개');
});

test('decodeSwordCode: name 24자 제한', () => {
  const longName = '가'.repeat(100);
  const code = codeFns.encodeSwordCode({ name: longName, form: '직', level: 5, inscriptions: [], soul: 0 });
  assert.ok(codeFns.decodeSwordCode(code).name.length <= 24, 'name 최대 24자');
});

// ─────────────────────────────────────────────────────────────
// v196 週報 — ISO 8601 주차 계산
// ─────────────────────────────────────────────────────────────
const weekFns = loadFunctions(['getIsoWeek']);

test('getIsoWeek: ISO 8601 정확성', () => {
  // 2026-01-01은 목요일 → 그 주가 W01 (목요일 포함)
  assert.strictEqual(weekFns.getIsoWeek(new Date('2026-01-01T12:00:00')), '2026-W01');
  // 2026-01-05는 월요일 → W02
  assert.strictEqual(weekFns.getIsoWeek(new Date('2026-01-05T12:00:00')), '2026-W02');
  // 2026-05-19 화요일 → W21
  assert.strictEqual(weekFns.getIsoWeek(new Date('2026-05-19T12:00:00')), '2026-W21');
});

test('getIsoWeek: 같은 주 내 날짜는 동일 주차', () => {
  const mon = weekFns.getIsoWeek(new Date('2026-05-18T08:00:00'));
  const sun = weekFns.getIsoWeek(new Date('2026-05-24T23:00:00'));
  assert.strictEqual(mon, sun, '월~일 동일 ISO 주차');
});

test('getIsoWeek: 형식 YYYY-Www', () => {
  assert.match(weekFns.getIsoWeek(new Date('2026-03-15T00:00:00')), /^\d{4}-W\d{2}$/);
});

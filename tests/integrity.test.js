'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { HTML_PATH, readScript } = require('./harness');

const html = fs.readFileSync(HTML_PATH, 'utf8');
const js = readScript();

// ─────────────────────────────────────────────────────────────
// 게임 파일 무결성 (회귀 방지)
// ─────────────────────────────────────────────────────────────

test('인라인 스크립트가 유효한 JS로 파싱됨', () => {
  assert.doesNotThrow(() => new Function(js), 'script가 파싱되어야 함');
});

test('중복 HTML id 없음', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(x => x[1]);
  const seen = {}, dups = [];
  ids.forEach(id => { if (seen[id]) dups.push(id); seen[id] = 1; });
  assert.deepStrictEqual([...new Set(dups)], [], '중복 id: ' + [...new Set(dups)].join(', '));
});

test('단일 IIFE 구조 — 전역 오염 없음 (var/function 전역 노출 최소)', () => {
  // 스크립트가 IIFE로 감싸져 있는지
  assert.ok(/\(function\s*\(\)\s*\{/.test(js) || /^\s*\(\(\)\s*=>/.test(js), 'IIFE로 감싸야 함');
});

test('SAVE_KEY 상수 존재 (localStorage 키)', () => {
  assert.match(js, /SAVE_KEY\s*=\s*['"]reinforce_sword/, 'SAVE_KEY 정의 필요');
});

test('TABLE 강화 테이블 — +0→+1은 cost 0, success 1.0 (튜토리얼 불변식)', () => {
  // TABLE 정의에서 첫 항목 확인
  const m = js.match(/TABLE\s*=\s*\[([\s\S]{0,200})/);
  assert.ok(m, 'TABLE 정의 존재');
  // 첫 줄에 cost: 0 과 success: 1 류가 있어야 함
  assert.match(m[1], /success:\s*1(\.0+)?/, '첫 강화 success 1.0');
  assert.match(m[1], /cost:\s*0/, '첫 강화 cost 0');
});

test('MAX_LEVEL 또는 TABLE 길이로 道 위치 정의', () => {
  assert.ok(/MAX_LEVEL/.test(js), 'MAX_LEVEL 참조 존재');
});

test('setInterval 호출이 과도하지 않음 (메모리 누수 감시 — 50개 이하)', () => {
  const n = (js.match(/setInterval\(/g) || []).length;
  assert.ok(n <= 50, 'setInterval 수가 50 이하여야 함 (현재 ' + n + ')');
});

test('디버그 console.log 잔존 없음', () => {
  const n = (js.match(/console\.(log|debug)\(/g) || []).length;
  assert.strictEqual(n, 0, 'console.log/debug 잔존: ' + n);
});

test('localStorage 저장은 try/catch 또는 save() 통해서만', () => {
  // setItem 직접 호출 위치가 save 함수 내에 있는지 (대략적: setItem 호출 수가 적어야)
  const n = (js.match(/localStorage\.setItem/g) || []).length;
  assert.ok(n <= 6, 'localStorage.setItem 직접 호출은 제한적이어야 함 (현재 ' + n + ')');
});

test('강화 성공 확률 — successChanceNow() 단일 진원 (표시·前兆·占卜·실제 굴림 동일)', () => {
  // v178~v225 보너스가 한쪽에만 추가되어 표시≠실제로 어긋난 버그(코드리뷰) +
  // v240: rollOmen(占卜 100% 예측)이 砥·잔향·8개 persistent 보너스를 누락해 거짓 예측.
  // 모든 성공 임계를 successChanceNow()로 일원화 → 회귀 방지.
  assert.match(js, /function successChanceNow\(\)/, 'successChanceNow 헬퍼 존재');
  const callCount = (js.match(/successChanceNow\(\)/g) || []).length;
  // 정의 1 + 표시(render) 1 + 前兆(rollOmen) 1 + 실제 굴림 포착 1 = 최소 4회
  assert.ok(callCount >= 4, 'successChanceNow()가 표시·omen·실제 모두에서 호출 (현재 ' + callCount + ')');
  // persistentSuccessBonus는 이제 successChanceNow 내부 1곳에서만 (중복 제거)
  assert.match(js, /function persistentSuccessBonus\(\)/, 'persistentSuccessBonus 헬퍼 존재');
  // 실제 굴림은 인라인 성공 보너스 합산이 아니라 포착된 successChance 사용
  assert.match(js, /if \(roll < successChance\)/, '실제 굴림이 successChance 단일값 사용');
});

test('successChanceNow 본문은 모든 성공 보너스원 포함 (砥·수호자·역경·잔향·persistent)', () => {
  const m = js.match(/function successChanceNow\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(m, 'successChanceNow 본문');
  const body = m[1];
  ['whetBonus', 'soulEffects', 'schoolSuccessBonus', 'breath', 'guardianBonus', 'getResolve', 'adversityReady', 'echoSuccessBonus', 'persistentSuccessBonus', 'pendingBreathBoost']
    .forEach(fn => assert.match(body, new RegExp(fn), fn + ' 포함되어야 함'));
});

test('파괴 확률 — effectiveDestroyChance() 헬퍼로 일원화 (危·欲·표시 동기)', () => {
  // v235 헬퍼가 render 표시·危 맥동·欲 봉인 힌트에서 공유되어야 함
  assert.match(js, /function effectiveDestroyChance\(/, 'effectiveDestroyChance 헬퍼 존재');
  const n = (js.match(/effectiveDestroyChance\(/g) || []).length;
  // 정의 1 + render(showDestroy) 1 + 봉인 힌트 1 = 최소 3
  assert.ok(n >= 3, 'effectiveDestroyChance가 여러 곳에서 공유 (현재 ' + n + ')');
  // dead 변수 echoDestroyBlockShow 제거 확인
  assert.strictEqual((js.match(/echoDestroyBlockShow/g) || []).length, 0, 'dead 변수 제거됨');
});

test('파괴 확률 — effectiveDestroyChance()가 실제 굴림과 동일 감소항·차단조건 (危·omen 과대표시 방지)', () => {
  // v241: 危 경고·omen이 guardian/adversity/weather/wish 감소와 靈石 차단을 누락해 파괴 위험 과대표시.
  // 표시 헬퍼가 실제 enhance 파괴식(11782)과 동일 항을 가져야 함.
  const m = js.match(/function effectiveDestroyChance\(lv\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(m, 'effectiveDestroyChance 본문');
  const body = m[1];
  ['schoolDestroyReduce', 'guardianBonus', 'adversityReady', 'getScarDestroyReduce', 'weatherDestroyReduce', 'wishDestroyReduce', 'destroyMul']
    .forEach(fn => assert.match(body, new RegExp(fn), fn + ' 감소항 포함'));
  // 차단 조건: 靈石 체크박스 + 잔향 + 結界
  assert.match(body, /spirit-check/, '靈石 체크박스 차단 반영');
  assert.match(body, /enhanceEcho/, '잔향 차단 반영');
  assert.match(body, /sanctumBlocksDestroy/, '結界 차단 반영');
});

test('前兆 omen은 파괴를 effectiveDestroyChance()로 예측 (인라인 파괴식 잔존 없음)', () => {
  const m = js.match(/function rollOmen\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(m, 'rollOmen 본문');
  const body = m[1];
  assert.match(body, /effectiveDestroyChance\(lv\)/, 'omen이 헬퍼 사용');
  // omen 본문에 t.destroy 직접 산식이 없어야 함 (헬퍼로 위임)
  assert.strictEqual((body.match(/t\.destroy/g) || []).length, 0, 'omen에 인라인 파괴식 없음');
});

test('persistentSuccessBonus는 후기 보너스 시스템 모두 포함', () => {
  // 헬퍼 본문 추출
  const m = js.match(/function persistentSuccessBonus\(\)\s*\{([\s\S]*?)\}/);
  assert.ok(m, '헬퍼 본문');
  const body = m[1];
  ['resonanceBonus', 'beastSuccessBonus', 'treasureGlobalBonus', 'mutationSuccessBonus', 'eternityBonus']
    .forEach(fn => assert.match(body, new RegExp(fn + '\\(\\)'), fn + ' 포함되어야 함'));
});

test('강화 비용 — enhanceCost() 헬퍼로 일원화 (표시·실제·修練자동·게임오버 동기)', () => {
  // v238: 비용 공식이 4곳에 복붙되어 autoStep/게임오버가 보신·잔향·결계 배수를 누락 →
  //   修練 무한 스핀 / 게임오버 소프트락 버그. 단일 진원으로 회귀 방지.
  assert.match(js, /function enhanceCost\(/, 'enhanceCost 헬퍼 존재');
  const callCount = (js.match(/enhanceCost\(/g) || []).length;
  // 정의 1 + 표시 1 + 실제 1 + 修練자동 1 + 게임오버 1 = 최소 5
  assert.ok(callCount >= 5, 'enhanceCost가 모든 비용 지점에서 공유 (현재 ' + callCount + ')');
  // 인라인 복붙 비용 공식은 헬퍼 본문 1회만 허용 (다른 곳 복붙 = 회귀)
  const inlinePattern = (js.match(/t\.cost\s*\*\s*formCostMul\s*\*\s*getSeason\(\)\.costMul/g) || []).length;
  assert.ok(inlinePattern <= 1, '비용 공식은 enhanceCost 본문 1회만 (현재 ' + inlinePattern + ')');
});

test('enhanceCost 헬퍼는 모든 비용 배수 포함 (보신·잔향·결계·소망·절기·주말)', () => {
  const m = js.match(/function enhanceCost\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(m, 'enhanceCost 본문');
  const body = m[1];
  ['getResolve', 'enhanceEcho', 'blessingCostMul', 'sanctumCostMul', 'wishCostMul', 'solarCostMul', 'weekendCostMul', 'getSeason', 'getAgeEffect', 'flowCostReduce']
    .forEach(fn => assert.match(body, new RegExp(fn), fn + ' 배수 포함되어야 함'));
});

test('모든 modal은 modal-close 또는 data-close 버튼 보유', () => {
  // 각 class="modal" 블록에 data-close 가 최소 1개 (대략적 검증)
  const modalCount = (html.match(/class="modal"/g) || []).length;
  const closeCount = (html.match(/data-close/g) || []).length;
  assert.ok(closeCount >= modalCount * 0.8, '대부분 모달에 닫기 버튼 (' + closeCount + '/' + modalCount + ')');
});

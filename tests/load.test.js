'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { HTML_PATH, readScript } = require('./harness');

const js = readScript();

// load() 강건성 — 외부 import(백업/클라우드 v47/v82)로 손상된 데이터가
// 들어와도 타입 보정으로 안전해야 함 (소스 정적 검증).

test('load(): stats 기본 sub-key 병합 (구 저장본 보정)', () => {
  assert.match(js, /DEFAULT_STATS\s*=\s*\{/, 'DEFAULT_STATS 정의');
  assert.match(js, /Object\.assign\(\{\},\s*DEFAULT_STATS/, 'stats를 default와 병합');
  // 신규 sub-key가 기본에 포함
  const m = js.match(/DEFAULT_STATS\s*=\s*\{([^}]*)\}/);
  assert.ok(m, 'DEFAULT_STATS 본문');
  ['yakshaSlain', 'stalemate', 'downgraded', 'wayReached'].forEach(k =>
    assert.match(m[1], new RegExp(k + ':'), 'stats.' + k + ' 기본값 포함'));
});

test('load(): 신규 컬렉션 배열/객체 타입 방어 존재', () => {
  // 외부 import 손상 대비 — 각 키 타입 가드
  const guards = [
    /Array\.isArray\(state\.guestSwords\)/,
    /Array\.isArray\(state\.userDiary\)/,
    /Array\.isArray\(state\.userSeal\)/,
    /state\.hourActivity.*length !== 24/,
    /typeof state\.treasures !== 'object'/,
    /typeof state\.beastsUnlocked !== 'object'/,
    /typeof state\.activityByDate !== 'object'/,
    /typeof state\.discoveredEggs !== 'object'/,
    /typeof state\.settings !== 'object'/,
    /typeof state\.eternityPoints !== 'number'/,
  ];
  guards.forEach((re, i) => assert.match(js, re, '가드 #' + i + ' 누락'));
});

test('load(): 핵심 배열 (sealedSwords/enshrined/recentLog) 타입 보정', () => {
  assert.match(js, /Array\.isArray\(state\.sealedSwords\)/);
  assert.match(js, /Array\.isArray\(state\.enshrined\)/);
  assert.match(js, /Array\.isArray\(state\.recentLog\)/);
});

test('load(): try/catch로 감싸 손상 JSON에도 throw 안 함', () => {
  // load 본문이 try { ... } catch 구조인지
  const m = js.match(/function load\(\)\s*\{\s*try\s*\{/);
  assert.ok(m, 'load()는 try/catch로 보호되어야 함');
});

test('normalizeState(): load()·applyCloudState 공유 (클라우드 복원도 전체 타입 방어)', () => {
  // v245g: applyCloudState가 부분 방어만 해 손상된 클라우드 데이터가 게임을 깨뜨릴 위험 →
  // load()의 전체 정규화를 normalizeState()로 추출해 양쪽이 공유.
  assert.match(js, /function normalizeState\(\)/, 'normalizeState 헬퍼 존재');
  assert.match(js, /if \(raw\) state = Object\.assign\(state, JSON\.parse\(raw\)\);\s*\n\s*normalizeState\(\);/, 'load()가 normalizeState 호출');
  assert.match(js, /state = Object\.assign\(\{\}, state, cloudData\);\s*\n\s*normalizeState\(\);/, 'applyCloudState가 normalizeState 호출');
  assert.match(js, /state = Object\.assign\(\{\}, state, loaded\);\s*\n\s*normalizeState\(\);/, '파일 복원도 normalizeState 호출');
  // 정규화 호출처 ≥ 3 (load·클라우드·파일 복원)
  assert.ok((js.match(/normalizeState\(\);/g) || []).length >= 3, 'normalizeState가 3개 복원 경로 공유');
  // 핵심 가드들이 normalizeState 본문에 존재 (구 applyCloudState엔 없던 것들)
  const m = js.match(/function normalizeState\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(m, 'normalizeState 본문');
  ['treasures', 'eternityPoints', 'hourActivity', 'DEFAULT_STATS', 'gambleStats']
    .forEach(k => assert.ok(m[1].includes(k), k + ' 가드가 normalizeState에 포함'));
});

test('save(): SAVE_KEY 사용', () => {
  const m = js.match(/function save\(\)\s*\{([\s\S]{0,400})/);
  assert.ok(m, 'save() 정의');
  assert.match(m[1], /SAVE_KEY/, 'save는 SAVE_KEY 사용');
});

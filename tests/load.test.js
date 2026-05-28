'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { HTML_PATH, readScript, loadFunctions } = require('./harness');

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

test('load(): 배열로 순회되는 모든 state 필드는 normalizeState 가드 보유 (손상 import 크래시 방지, 구조적)', () => {
  // 고정 리스트(위 테스트) 대신 소스에서 배열 순회 필드를 추출해 가드 존재를 강제 —
  // 새 배열 state 필드를 render에서 .forEach하면서 가드를 빠뜨리면 손상된 클라우드/백업
  // import가 문자열을 넣었을 때 render가 throw. 자동 차단(리스트 갱신 불필요).
  const nm = js.match(/function normalizeState\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(nm, 'normalizeState 본문');
  const body = nm[1];
  // state.X.(forEach|map|slice|filter|reduce|some|every|join) — 최상위 배열 필드만 (nested 제외)
  const iterated = new Set();
  let m; const re = /\bstate\.([a-zA-Z]+)\.(?:forEach|map|slice|filter|reduce|some|every|join)\b/g;
  while ((m = re.exec(js))) iterated.add(m[1]);
  const unguarded = [...iterated].filter(f => {
    // Array.isArray(state.f) 또는 state.f...length 가드가 normalizeState에 있어야 함
    return !new RegExp('Array\\.isArray\\(state\\.' + f + '\\)').test(body)
        && !new RegExp('state\\.' + f + '\\b[\\s\\S]{0,30}?length').test(body);
  });
  assert.deepStrictEqual(unguarded, [], '배열 순회되나 normalizeState 가드 없는 필드(손상 import 크래시 위험): ' + unguarded.join(', '));
});

test('load(): Object.keys/values/entries로 접근되는 state 필드는 normalizeState 객체 가드 보유 (Object.keys(null) 크래시 방지)', () => {
  // Object.keys(null)/values/entries(null)은 TypeError throw — 손상 import가 객체 필드를
  // null로 넣으면 render 크래시. 배열 가드(위)의 객체 짝. 소스에서 추출해 자동 강제.
  const nm = js.match(/function normalizeState\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(nm, 'normalizeState 본문');
  const body = nm[1];
  const accessed = new Set();
  let m; const re = /Object\.(?:keys|values|entries)\(state\.([a-zA-Z]+)\)/g;
  while ((m = re.exec(js))) accessed.add(m[1]);
  const unguarded = [...accessed].filter(f =>
    !new RegExp("typeof state\\." + f + " !== 'object'").test(body)
    && !new RegExp('Array\\.isArray\\(state\\.' + f + '\\)').test(body));
  assert.deepStrictEqual(unguarded, [], 'Object.keys 접근되나 normalizeState 객체 가드 없는 필드(null→크래시 위험): ' + unguarded.join(', '));
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

test('normalizeState() 동작 검증: 손상 입력 강제 보정 (정적 regex가 못 잡는 행위)', () => {
  // normalizeState는 state.X만 변이(재대입 없음) → 주입 객체로 결과를 직접 읽을 수 있음.
  const st = {
    sealedSwords: 'CORRUPT', currentSword: null, whetstones: 'x',
    enshrined: 42, hourActivity: [1, 2, 3], swordWish: 'bad',
    gambleStats: null, stats: null,
  };
  const { normalizeState } = loadFunctions(['normalizeState'], { state: st, assignDestiny: () => {}, MAX_LEVEL: 15 });
  normalizeState();
  // sandbox에서 생성된 배열/객체는 호스트와 prototype이 달라 deepStrictEqual 불가 → 구조 검사
  const emptyArr = (x) => Array.isArray(x) && x.length === 0;
  assert.ok(emptyArr(st.sealedSwords), '문자열 sealedSwords → []');
  assert.ok(st.currentSword && typeof st.currentSword === 'object', 'null currentSword → 객체 재생성');
  assert.ok(emptyArr(st.currentSword.inscriptions), 'currentSword.inscriptions → []');
  assert.strictEqual(st.currentSword.soul, 0, 'soul → 0');
  assert.strictEqual(st.whetstones, 0, '비숫자 whetstones → 0');
  assert.ok(emptyArr(st.enshrined), '숫자 enshrined → []');
  assert.strictEqual(st.hourActivity.length, 24, '길이≠24 hourActivity → 24칸 리셋');
  assert.ok(st.hourActivity.every(v => v === 0), 'hourActivity 리셋값 전부 0');
  assert.strictEqual(st.swordWish, null, 'object 아닌 swordWish → null');
  assert.ok(st.gambleStats && st.gambleStats.win === 0 && st.gambleStats.lose === 0, 'null gambleStats → 기본 {win:0,lose:0}');
});

test('normalizeState() 동작 검증: 검 사용자텍스트 태그문자 제거 (백업/클라우드 import XSS 경계 방어, v370m)', () => {
  // 검명/메모/寄言/血統은 회고·계보·詩集에서 innerHTML에 raw 삽입됨. 외부 백업 import 시
  // < > 포함 텍스트가 스크립트로 실행될 수 있어 normalizeState(import 경유)에서 제거해야 함.
  const st = {
    sealedSwords: [{ name: '검<img src=x onerror=alert(1)>', memo: 'a<b>c', kigen: '<svg onload=e>', fusedFrom: ['<i>A', 'B>'] }],
    enshrined: [{ name: 'safe', kigen: '<script>bad</script>' }],
    currentSword: { name: '<b>cur', inscriptions: [] },
    userSeal: ['正', '</text><img onerror=x>'],  // v187 印 — buildSealSVG가 <text>에 raw 삽입
  };
  const { normalizeState } = loadFunctions(['normalizeState'], { state: st, assignDestiny: () => {}, MAX_LEVEL: 15 });
  normalizeState();
  const s0 = st.sealedSwords[0];
  assert.ok(!/[<>]/.test(s0.name), '봉인검명에서 < > 제거');
  assert.ok(!/[<>]/.test(s0.memo), '메모에서 < > 제거');
  assert.ok(!/[<>]/.test(s0.kigen), '寄言에서 < > 제거');
  assert.ok(s0.fusedFrom.every(n => !/[<>]/.test(n)), '血統 이름에서 < > 제거');
  assert.ok(!/[<>]/.test(st.enshrined[0].kigen), '殿堂 검 寄言에서 < > 제거');
  assert.ok(!/[<>]/.test(st.currentSword.name), '현재 검명에서 < > 제거');
  assert.ok(st.userSeal.every(c => !/[<>]/.test(c)), '印(userSeal) 글자에서 < > 제거 (buildSealSVG raw 삽입 방어)');
  // 정상 텍스트는 보존 (태그문자 없는 한글/한자)
  assert.strictEqual(st.enshrined[0].name, 'safe', '정상 검명 보존');
  assert.strictEqual(st.userSeal[0], '正', '정상 印 글자 보존');
});

test('normalizeState() XSS sanitize는 assignDestiny가 throw해도 실행됨 (보안 skip 회귀 방지)', () => {
  // XSS sanitize는 normalizeState 단일 try/catch 안에서 assignDestiny() 호출 뒤에 옴.
  // assignDestiny가 (로컬 try-catch 없이) throw하면 normalizeState가 조기 abort → 악성
  // import가 sanitize 안 된 채 통과. 현재 assignDestiny는 로컬 try-catch로 감싸져 안전한데,
  // 이 회귀(로컬 try-catch 제거 / sanitize를 throw 뒤로 이동)를 잠근다.
  const st = {
    hasSword: true,
    currentSword: { name: '<img onerror=x>', inscriptions: [] },  // destiny 없음 → assignDestiny 호출 트리거
    sealedSwords: [{ name: '<b>evil' }], enshrined: [],
  };
  const throwingDestiny = () => { throw new Error('boom'); };
  const { normalizeState } = loadFunctions(['normalizeState'], { state: st, assignDestiny: throwingDestiny, MAX_LEVEL: 15 });
  normalizeState();
  assert.ok(!/[<>]/.test(st.currentSword.name), 'assignDestiny throw에도 현재 검명 sanitize됨');
  assert.ok(!/[<>]/.test(st.sealedSwords[0].name), 'assignDestiny throw에도 봉인 검명 sanitize됨');
});

test('normalizeState() 동작 검증: 핵심 수치 범위/정수 강제 (손상 import 게임-브로큰 방지, v370o)', () => {
  const st = {
    level: 999, bestLevel: 'abc', shards: -50, protections: 3.7,
    whetstones: NaN, spiritstones: -1, divinationStones: 2,
    sealedSwords: [{ level: 9999, name: 'x' }], enshrined: [],
  };
  const { normalizeState } = loadFunctions(['normalizeState'], { state: st, assignDestiny: () => {}, MAX_LEVEL: 15 });
  normalizeState();
  assert.strictEqual(st.level, 15, 'level 999 → MAX(15)로 클램프');
  assert.strictEqual(st.bestLevel, 15, "bestLevel 'abc' → NaN이지만 level(15) 이상 보정");
  assert.strictEqual(st.shards, 0, '음수 shards → 0');
  assert.strictEqual(st.protections, 3, 'float protections → floor(3)');
  assert.strictEqual(st.whetstones, 0, 'NaN whetstones → 0');
  assert.strictEqual(st.spiritstones, 0, '음수 spiritstones → 0');
  assert.strictEqual(st.divinationStones, 2, '정상값 보존');
  assert.strictEqual(st.sealedSwords[0].level, 15, '봉인 검 level 9999 → MAX 클램프');
});

test('normalizeState() 동작 검증: 정상 수치는 클램프가 no-op (정상 저장본 불변)', () => {
  const st = { level: 7, bestLevel: 12, shards: 340, protections: 2, whetstones: 1, spiritstones: 0, sealedSwords: [{ level: 10 }], enshrined: [] };
  const { normalizeState } = loadFunctions(['normalizeState'], { state: st, assignDestiny: () => {}, MAX_LEVEL: 15 });
  normalizeState();
  assert.strictEqual(st.level, 7); assert.strictEqual(st.bestLevel, 12); assert.strictEqual(st.shards, 340);
  assert.strictEqual(st.protections, 2); assert.strictEqual(st.sealedSwords[0].level, 10);
});

test('normalizeState() 동작 검증: stats 병합이 기존 값 보존 + 신규 키만 보강 (데이터 손실 방지)', () => {
  // 핵심 불변식: Object.assign({}, DEFAULT, existing) 순서 — existing이 default를 이긴다.
  // 순서가 뒤집히면 구 저장본의 누적 통계가 0으로 덮여 사라짐(데이터 손실).
  const st = { stats: { enhanceSuccess: 7, slainDemon: 3, wayReached: 2 } };
  const { normalizeState } = loadFunctions(['normalizeState'], { state: st, assignDestiny: () => {}, MAX_LEVEL: 15 });
  normalizeState();
  assert.strictEqual(st.stats.enhanceSuccess, 7, '기존 enhanceSuccess 보존');
  assert.strictEqual(st.stats.slainDemon, 3, '기존 slainDemon 보존');
  assert.strictEqual(st.stats.wayReached, 2, '기존 wayReached 보존');
  // 구 저장본에 없던 신규 키는 0으로 보강
  assert.strictEqual(st.stats.stalemate, 0, '누락 신규키 stalemate → 0 보강');
  assert.strictEqual(st.stats.downgraded, 0, '누락 신규키 downgraded → 0 보강');
});

test('normalizeState() 동작 검증: 정상 데이터는 건드리지 않음 (멱등·비파괴)', () => {
  const good = {
    sealedSwords: [{ form: '직' }], enshrined: [{ form: '곡' }],
    currentSword: { enhanceAttempts: 5, slainCount: 2, inscriptions: ['도'], soul: 50, form: '중' },
    whetstones: 3, hourActivity: new Array(24).fill(0), stats: { enhanceSuccess: 9 },
  };
  good.hourActivity[5] = 11;
  const { normalizeState } = loadFunctions(['normalizeState'], { state: good, assignDestiny: () => {} });
  normalizeState();
  assert.strictEqual(good.sealedSwords.length, 1, 'sealedSwords 보존');
  assert.strictEqual(good.currentSword.soul, 50, 'soul 보존');
  assert.deepStrictEqual(good.currentSword.inscriptions, ['도'], 'inscriptions 보존');
  assert.strictEqual(good.whetstones, 3, 'whetstones 보존');
  assert.strictEqual(good.hourActivity[5], 11, '유효 길이-24 hourActivity 값 보존');
  assert.strictEqual(good.stats.enhanceSuccess, 9, 'stats 기존값 보존');
});

test('save(): SAVE_KEY 사용', () => {
  const m = js.match(/function save\(\)\s*\{([\s\S]{0,400})/);
  assert.ok(m, 'save() 정의');
  assert.match(m[1], /SAVE_KEY/, 'save는 SAVE_KEY 사용');
});

// 한글화 3단계 — 학파 키 한자→음역 무손실 마이그레이션 (구 세이브 처치수 보존)
test('normalizeState: 그림자 학파 키 夜流→야류 등 무손실 변환', () => {
  const st = { shadowOriginsSlain: { '夜流': 3, '霧流': 1, '야류': 2 } };
  const { normalizeState } = loadFunctions(['normalizeState'], { state: st, assignDestiny: () => {}, MAX_LEVEL: 15 });
  normalizeState();
  assert.strictEqual(st.shadowOriginsSlain['야류'], 5, '夜流(3)+기존 야류(2) 합산');
  assert.strictEqual(st.shadowOriginsSlain['무류'], 1, '霧流→무류');
  assert.ok(!('夜流' in st.shadowOriginsSlain) && !('霧流' in st.shadowOriginsSlain), '구 한자 키 제거');
});

// 한글화 7단계 — 형 키 마이그레이션 (현재검·봉인검·전당검 form 한자→음역)
test('normalizeState: 형 키 直/曲/重/速 → 직/곡/중/속 마이그레이션', () => {
  const st = { currentSword: { form: '直' }, sealedSwords: [{ form: '曲' }, { form: '速' }], enshrined: [{ form: '重' }] };
  loadFunctions(['normalizeState'], { state: st, assignDestiny: () => {}, MAX_LEVEL: 15 }).normalizeState();
  assert.strictEqual(st.currentSword.form, '직', '현재검 直→직');
  assert.strictEqual(st.sealedSwords[0].form, '곡', '봉인검 曲→곡');
  assert.strictEqual(st.sealedSwords[1].form, '속', '봉인검 速→속');
  assert.strictEqual(st.enshrined[0].form, '중', '전당검 重→중');
});

// 한글화 10단계 — 명명된 적 격파 명문 키 마이그레이션 (inscriptions 배열)
test('normalizeState: 명문 키 鬼斬/龍斬/斷魔 → 귀참/용참/단마 (무손실)', () => {
  const st = { currentSword: { inscriptions: ['鬼斬', '본'] }, sealedSwords: [{ inscriptions: ['龍斬', '도'] }], enshrined: [{ inscriptions: ['斷魔'] }], heritageInscription: '夜叉斬' };
  loadFunctions(['normalizeState'], { state: st, assignDestiny: () => {}, MAX_LEVEL: 15 }).normalizeState();
  assert.deepStrictEqual(st.currentSword.inscriptions, ['귀참', '본'], '鬼斬→귀참, 미마이그레이션 키(本) 보존');
  assert.deepStrictEqual(st.sealedSwords[0].inscriptions, ['용참', '도'], '龍斬→용참');
  assert.deepStrictEqual(st.enshrined[0].inscriptions, ['단마'], '斷魔→단마');
  assert.strictEqual(st.heritageInscription, '야차참', '전수 명문 夜叉斬→야차참');
});

// 한글화 10단계(B) — 정체성·메타 명문 키 마이그레이션 (충돌쌍 覺/刻 분리 확인)
test('normalizeState: 명문 키 覺→각성, 刻→각인(충돌분리), 本→본, 七星→칠성', () => {
  const st = { currentSword: { inscriptions: ['覺', '刻', '本', '七星', '聖'] } };
  loadFunctions(['normalizeState'], { state: st, assignDestiny: () => {}, MAX_LEVEL: 15 }).normalizeState();
  assert.deepStrictEqual(st.currentSword.inscriptions, ['각성', '각인', '본', '칠성', '성'], '覺/刻 충돌 없이 분리 변환');
});

// 한글화 10단계(C) — 道/四道 명문 키 마이그레이션 (이스케이프 키, 정점 식별)
test('normalizeState: 명문 키 道→도, 四道→사도 (구 세이브 정점 보존)', () => {
  const st = { currentSword: { inscriptions: ['道', '본'] }, sealedSwords: [{ inscriptions: ['四道', '도'] }] };
  loadFunctions(['normalizeState'], { state: st, assignDestiny: () => {}, MAX_LEVEL: 15 }).normalizeState();
  assert.deepStrictEqual(st.currentSword.inscriptions, ['도', '본'], '道→도');
  assert.deepStrictEqual(st.sealedSwords[0].inscriptions, ['사도', '도'], '四道→사도, 기존 도 보존');
});

// 한글화 — 時生(bornTod) 키 한자→한글 마이그레이션
test('normalizeState: bornTod 朝/夜 → 아침/밤 (時生 저장 키)', () => {
  const st = { currentSword: { bornTod: '朝' }, sealedSwords: [{ bornTod: '夜' }, { bornTod: '낮' }] };
  loadFunctions(['normalizeState'], { state: st, assignDestiny: () => {}, MAX_LEVEL: 15 }).normalizeState();
  assert.strictEqual(st.currentSword.bornTod, '아침', '朝→아침');
  assert.strictEqual(st.sealedSwords[0].bornTod, '밤', '夜→밤');
  assert.strictEqual(st.sealedSwords[1].bornTod, '낮', '이미 한글이면 유지');
});

// 한글화 — 奇緣(축복) 발견 키 마이그레이션
test('normalizeState: blessingsDiscovered 涅槃→열반 등 (奇緣 발견 보존)', () => {
  const st = { blessingsDiscovered: { '涅槃': 123, '銀河': 456, '열반': 789 } };
  loadFunctions(['normalizeState'], { state: st, assignDestiny: () => {}, MAX_LEVEL: 15 }).normalizeState();
  assert.strictEqual(st.blessingsDiscovered['열반'], 789, '이미 한글이면 유지(덮어쓰기 주의)');
  assert.strictEqual(st.blessingsDiscovered['은하'], 456, '銀河→은하');
  assert.ok(!('涅槃' in st.blessingsDiscovered) && !('銀河' in st.blessingsDiscovered), '구 한자 키 제거');
});

// 한글화 — 印(인장) 저장값 음역 (팔레트 글자만, 임의 입력 보존)
test('normalizeState: userSeal/playerSeal 天→천 등 (인장 음 보존)', () => {
  const st = { userSeal: ['天', '無', 'X'], playerSeal: '心', currentSword: { playerSeal: '道' } };
  loadFunctions(['normalizeState'], { state: st, assignDestiny: () => {}, MAX_LEVEL: 15 }).normalizeState();
  assert.deepStrictEqual(st.userSeal, ['천', '무', 'X'], '팔레트 글자 음역, 비팔레트(X) 보존');
  assert.strictEqual(st.playerSeal, '심', '心→심');
  assert.strictEqual(st.currentSword.playerSeal, '道', '팔레트 외(道)는 그대로');
});

// 한글화 — 字(칼날 새김) currentSword.engraving 마이그레이션
test('normalizeState: currentSword.engraving 義/龍 등→의/용 (字 새김 음 보존)', () => {
  const st = { currentSword: { engraving: '義' } };
  loadFunctions(['normalizeState'], { state: st, assignDestiny: () => {}, MAX_LEVEL: 15 }).normalizeState();
  assert.strictEqual(st.currentSword.engraving, '의', '義→의');
  // 미팔레트 글자(古 등 EM 맵 밖)는 그대로
  const st2 = { currentSword: { engraving: 'X' } };
  loadFunctions(['normalizeState'], { state: st2, assignDestiny: () => {}, MAX_LEVEL: 15 }).normalizeState();
  assert.strictEqual(st2.currentSword.engraving, 'X', '팔레트 외 보존');
});

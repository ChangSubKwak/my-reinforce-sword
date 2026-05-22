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

test('성공률 breakdown(renderStatus)이 persistentSuccessBonus 전 항목을 표시 (display≠actual 방지)', () => {
  // persistentSuccessBonus()가 합산하는 모든 성공 보너스 출처는 renderStatus 분해 표시에도
  // 나타나야 함 — 헤드라인 %는 맞는데 항목 합이 안 맞는 v257-류 divergence 방지.
  const pm = js.match(/function persistentSuccessBonus\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(pm, 'persistentSuccessBonus 본문');
  const terms = [...new Set([...pm[1].matchAll(/(\w+(?:Bonus|Success))\(\)/g)].map(m => m[1]))];
  assert.ok(terms.length >= 16, 'persistentSuccessBonus 항목 ≥16개 (현재 ' + terms.length + ')');
  const rm = js.match(/function renderStatus\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(rm, 'renderStatus 본문');
  const missing = terms.filter(t => !rm[1].includes(t + '()'));
  assert.deepStrictEqual(missing, [], 'breakdown에서 누락된 성공 보너스 출처: ' + missing.join(', '));
});

test('성공률 분해가 successChanceNow의 즉시/검별 성공원도 표시 (v265 — form/砥/魂/守/覺悟/逆/잔향)', () => {
  // v259는 persistent 항만 채웠음. successChanceNow는 form/whet/soul/guardian/resolve/adversity/echo도
  // 더하므로 (直+砥면 헤드라인이 분해 합보다 ~28%p 높았음) 분해에 동일 출처가 있어야 함.
  const rm = js.match(/function renderStatus\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(rm, 'renderStatus 본문');
  const body = rm[1];
  // v361 — 제목이 form/잔향도 주장하나 기존 리스트가 누락했음. 둘 다 객체-속성 성공항
  // (f0.successBonus 形, enhanceEcho.successBonus 잔향)이라 함수형이 아님 — cost(v354)/destroy
  // (v355)와 동일하게 명시 검사로 잠금. 이로써 success 분해의 객체-속성 성공원까지 완전 커버.
  ['guardianBonus', 'soulEffects', 'getResolve', 'schoolSuccessBonus', 'breathBonus',
   'adversityReady', 'whet-check', 'f0.successBonus', 'enhanceEcho.successBonus'].forEach(src =>
    assert.ok(body.includes(src), '성공 분해에 ' + src + ' 출처 누락'));
});

test('주요 입력 필드에 aria-label (v299 — placeholder만으로는 라벨 불충분)', () => {
  ['name-input', 'memo-input', 'kigen-input', 'seal-craft-input', 'guest-import-code',
   'diary-input', 'login-email', 'login-otp-code', 'lb-nickname'].forEach(id =>
    assert.match(html, new RegExp('id="' + id + '" aria-label="[^"]+"'), id + ' aria-label 누락'));
});

test('모든 role="dialog"에 aria-modal="true" (v298 — 모달 시맨틱)', () => {
  const dialogs = (html.match(/role="dialog"/g) || []).length;
  const modal = (html.match(/role="dialog" aria-modal="true"/g) || []).length;
  assert.ok(dialogs > 0, 'role=dialog 존재');
  assert.strictEqual(modal, dialogs, '모든 dialog가 aria-modal=true (' + modal + '/' + dialogs + ')');
});

test('메뉴 aria-expanded가 class 변경에 동기화됨 (v297 — stale 방지)', () => {
  // 한자 메뉴 버튼들은 닫을 때 syncMenuAria 미호출 → MutationObserver로 단일 지점 동기화.
  assert.match(js, /new MutationObserver\(syncMenuAria\)\.observe\([^,]+,\s*\{\s*attributes:\s*true,\s*attributeFilter:\s*\['class'\]/, 'menu-drop class 관찰로 aria 동기화');
});

test('초기 state.currentSword가 newSword 전용 필드 포함 (shape drift 방지, v290)', () => {
  // 첫 currentSword 리터럴(초기 state)이 newSword가 만드는 검과 동일 필드를 가져야 함 —
  // 누락 시 첫 검에서만 해당 필드가 undefined (foesEncountered 등).
  const i = js.indexOf('currentSword: {');
  assert.ok(i >= 0, 'currentSword 리터럴 존재');
  let s = js.indexOf('{', i), d = 0, end = -1;
  for (let j = s; j < js.length; j++) { const c = js[j]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { end = j; break; } } }
  const body = js.slice(s, end + 1);
  ['startLevel', 'foesEncountered', 'playerSeal', 'bornTod'].forEach(f =>
    assert.ok(body.includes(f + ':'), '초기 currentSword에 ' + f + ' 누락'));
});

test('최상위 함수 이름 중복 없음 (동명 함수 shadowing 방지 — v288 renderRecords 버그類)', () => {
  // 같은 스코프 두 번째 function 선언이 첫 번째를 가려, 호출자가 의도와 다른 함수를 부르는 버그.
  // v288: renderRecords가 2개(records-list 채움 vs 新記 html 반환)여서 劍士録 모달이 비어 있었음.
  const counts = {};
  for (const m of js.matchAll(/^  function (\w+)\s*\(/gm)) counts[m[1]] = (counts[m[1]] || 0) + 1;
  const dups = Object.entries(counts).filter(([, v]) => v > 1).map(([k, v]) => k + ' ×' + v);
  assert.deepStrictEqual(dups, [], '중복 최상위 함수 선언(뒤 정의가 앞을 가림): ' + dups.join(', '));
});

test('玉露 축복은 실패한 강화에만 환급 (성공 fall-through 회귀 방지, v285)', () => {
  // 玉露 발동이 enhanceFailed 가드 안에 있어야 함 — 공통 정리부에 있어 성공에도 환급되던 버그 방지.
  assert.match(js, /enhanceFailed && gyokuro && Math\.random\(\) < gyokuro\.chance/, '玉露는 enhanceFailed 가드 필요');
  assert.match(js, /const enhanceFailed = !\(roll < successChance\)/, 'enhanceFailed = 비성공 정의');
});

test('砥 라벨 +N% == successChanceNow whetBonus (3중 하드코딩 drift 방지)', () => {
  // "+25%"가 정적 HTML·render JS·successChanceNow(0.25) 세 곳에 하드코딩 → 한쪽 변경 시 표시≠실제.
  const m = js.match(/whetBonus\s*=\s*useWhet\s*\?\s*(0?\.\d+)/);
  assert.ok(m, 'successChanceNow의 whetBonus 정의');
  const pct = Math.round(parseFloat(m[1]) * 100);
  assert.ok(html.includes('성공 +' + pct + '%'), '정적 HTML 砥 라벨이 +' + pct + '% 와 일치');
  assert.ok(js.includes('(성공 +' + pct + '%)'), 'render JS 砥 라벨이 +' + pct + '% 와 일치');
});

test('조합소 레시피 표시 비용 == recipes 객체 cost (하드코딩 drift 방지)', () => {
  // HTML 레시피 라벨의 "조각 N"이 recipes[key].cost와 일치해야 함 — 둘 다 하드코딩이라 drift 위험.
  const pairs = [...html.matchAll(/<small>조각 (\d+)[^<]*<\/small><\/div>\s*<button class="recipe-btn" data-recipe="(\w+)"/g)]
    .map(m => ({ cost: +m[1], key: m[2] }));
  assert.ok(pairs.length >= 6, '레시피 cost↔key 페어 ≥6 (현재 ' + pairs.length + ')');
  pairs.forEach(p => {
    const m = js.match(new RegExp(p.key + ':\\s*\\{[\\s\\S]{0,80}?cost:\\s*(\\d+)'));
    assert.ok(m, 'recipes.' + p.key + ' cost 정의 없음');
    assert.strictEqual(+m[1], p.cost, p.key + ' 표시(' + p.cost + ') ≠ recipes.cost(' + m[1] + ')');
  });
});

test('강화 비용 분해(renderStatus)가 enhanceCost의 *CostMul/flowCostReduce 항을 모두 표시 (v273)', () => {
  // enhanceCost가 곱하는 모든 단독 함수형 배수는 비용 분해 표시에도 나타나야 함 (display≠actual 방지).
  const em = js.match(/function enhanceCost\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(em, 'enhanceCost 본문');
  const muls = [...new Set([...em[1].matchAll(/(\w+CostMul|flowCostReduce)\(\)/g)].map(m => m[1]))];
  assert.ok(muls.length >= 5, 'enhanceCost 단독 배수 함수 ≥5 (현재 ' + muls.length + ')');
  const rm = js.match(/function renderStatus\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(rm, 'renderStatus 본문');
  const missing = muls.filter(t => !rm[1].includes(t + '()'));
  assert.deepStrictEqual(missing, [], '비용 분해에서 누락된 배수: ' + missing.join(', '));
  // v354 — 객체-속성 배수(getSeason()/getAgeEffect()/getResolve()의 .costMul)도 분해에 있어야 함.
  // 위 정규식은 *CostMul() 함수형만 잡아 季節/노쇠/覺悟를 놓침 → 그 라인 삭제 시 display<actual 미검출.
  // (覺悟는 분해에서 rsv = getResolve() 별칭으로 쓰므로 '함수 호출됨'으로 검사.)
  const objMuls = [...new Set([...em[1].matchAll(/(\w+)\(\)\.costMul/g)].map(m => m[1]))];
  const objMissing = objMuls.filter(fn => !rm[1].includes(fn + '()'));
  assert.deepStrictEqual(objMissing, [], '비용 분해에서 누락된 객체-속성 배수 함수: ' + objMissing.join(', '));
});

test('파괴 확률 분해(renderStatus)가 effectiveDestroyChance의 *DestroyReduce 항을 모두 표시', () => {
  // effectiveDestroyChance가 빼는 모든 감소원은 파괴 분해 표시에도 나타나야 함 (display≠actual 방지).
  const em = js.match(/function effectiveDestroyChance\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(em, 'effectiveDestroyChance 본문');
  const reducers = [...new Set([...em[1].matchAll(/(\w+DestroyReduce)\(\)/g)].map(m => m[1]))];
  assert.ok(reducers.length >= 4, '*DestroyReduce 감소원 ≥4개 (현재 ' + reducers.length + ')');
  const rm = js.match(/function renderStatus\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(rm, 'renderStatus 본문');
  const missing = reducers.filter(t => !rm[1].includes(t + '()'));
  assert.deepStrictEqual(missing, [], '파괴 분해에서 누락된 감소원: ' + missing.join(', '));
  // v355 — 객체-속성 감소항(*DestroyReduce() 정규식이 못 잡는 것)도 분해에 있어야 함:
  // 形(f.destroyReduce 曲)·守(guardianBonus().destroyReduce)·覺悟(rsv.destroyMul). 파괴 전용
  // 속성이라 success/cost 분해와 안 겹침 — 그 라인 삭제 시 display<actual 미검출 갭(v354류).
  ['f.destroyReduce', 'guardianBonus().destroyReduce', 'rsv.destroyMul'].forEach(term =>
    assert.ok(rm[1].includes(term), '파괴 분해에 객체-속성 감소항 누락: ' + term));
});

test('四神 보너스 접근자가 실제로 소비됨 (정의만 있고 미사용 = 죽은 보너스 방지)', () => {
  // v261: beastSealMul/beastChallengeMul/beastRescueSec가 정의만 되고 호출 안 돼
  // 青龍/玄武/白虎 보너스가 광고만 되고 미적용이던 버그 회귀 방지.
  ['beastSuccessBonus', 'beastSealMul', 'beastChallengeMul', 'beastRescueSec'].forEach(fn => {
    const calls = (js.match(new RegExp(fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\(\\)', 'g')) || []).length;
    assert.ok(calls >= 2, fn + '은 정의 외 호출처가 있어야 함 (현재 ' + calls + ')');
  });
});

test('節氣(solar-term) 보너스 접근자가 실제로 소비됨 (v263 — 6종 죽은 보너스 연결)', () => {
  // v177 節氣 시스템: solarCostMul만 연결되고 나머지 6종은 정의만 있던 죽은 보너스였음.
  // v263에서 reward/seal/rescue/challenge/destroy/soul 전부 연결 → 회귀 방지.
  ['solarCostMul', 'solarChallengeMul', 'solarRewardMul', 'solarSealMul',
   'solarRescueSec', 'solarDestroyReduce', 'solarSoulMul'].forEach(fn => {
    const calls = (js.match(new RegExp(fn + '\\(\\)', 'g')) || []).length;
    assert.ok(calls >= 2, fn + '은 정의 외 호출처가 있어야 함 (현재 ' + calls + ')');
  });
});

test('v40+ 이후 제거된 검 SVG 요소를 참조하지 않음 (죽은 $() 방지)', () => {
  // pommel/guard-deco/blade-shine/blade(static)는 v40 path 기반 재설계로 사라짐.
  // 이들을 $()로 잡아도 항상 null이므로 참조 자체가 죽은 코드 → 재유입 방지.
  ["'blade-shine'", "'guard-deco'", "'pommel'"].forEach(id =>
    assert.ok(!js.includes('$(' + id + ')'), '죽은 SVG 참조 $(' + id + ') 재유입'));
});

test('localStorage.removeItem(SAVE_KEY) 호출은 모두 try-guarded (v267b — private mode 안전)', () => {
  // 초기화 경로(btn-reset / restartFromGameOver)에서 storage 예외가 in-memory 리셋을 막지 않도록.
  const all = [...js.matchAll(/(try\s*\{\s*)?localStorage\.removeItem\(SAVE_KEY\)/g)];
  assert.ok(all.length >= 2, 'removeItem(SAVE_KEY) 호출 ≥2 (현재 ' + all.length + ')');
  all.forEach((m, i) => assert.ok(m[1], 'removeItem #' + i + ' try 가드 누락'));
});

test('배경 클릭으로 모달 닫기 (v267 — 박스 클릭은 무시, name/form-select 제외)', () => {
  assert.match(js, /modal\.addEventListener\('click', \(e\) => \{\s*if \(e\.target === modal\) modal\.classList\.remove\('active'\);/,
    '백드롭(e.target===modal) 클릭만 닫기');
  assert.match(js, /modal\.id === 'name-modal' \|\| modal\.id === 'form-select-modal'/, 'name/form-select 제외');
});

test('Esc가 열린 일반 모달을 닫음 (name/form-select 제외, 챌린지보다 우선)', () => {
  // v266: ~50개 정보 모달에 Esc-닫기가 없던 UX 갭. 전역 keydown에서 처리.
  assert.match(js, /querySelectorAll\('\.modal\.active'\)/, '활성 모달 셀렉터 사용');
  assert.match(js, /m\.id !== 'name-modal' && m\.id !== 'form-select-modal'/, 'name/form-select 제외');
  assert.match(js, /open\[open\.length - 1\]\.classList\.remove\('active'\)/, '최상단 모달 닫기');
  assert.match(js, /else if \(challenge\) flee\(\)/, '모달 없을 때만 챌린지 flee');
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

test('봉인 보상 — sealRewardBase/Display 단일 진원 (버튼·미리보기·실제 grant 동일)', () => {
  // v242: 봉인 버튼 라벨이 generationSealMul/雙銘 배수를 누락해 실제 grant보다 낮게 표시.
  // 결정적 배수를 sealRewardBase()로 일원화, doSeal·표시 모두 공유.
  assert.match(js, /function sealRewardBase\(/, 'sealRewardBase 헬퍼 존재');
  assert.match(js, /function sealRewardDisplay\(/, 'sealRewardDisplay 헬퍼 존재');
  // 인라인 봉인 배수 복붙 잔존 없음 — base 헬퍼 본문 1곳만 schoolSealMul()*... 패턴 허용
  const inlineSeal = (js.match(/sealReward\([^)]*\)[\s\S]{0,40}?schoolSealMul/g) || []).length;
  assert.ok(inlineSeal <= 1, '봉인 배수 인라인 복붙은 base 헬퍼 1회만 (현재 ' + inlineSeal + ')');
  // doSeal은 base 헬퍼 사용
  assert.match(js, /let reward = sealRewardBase\(lv, ins, isWay\)/, 'doSeal이 sealRewardBase 사용');
});

test('sealRewardBase는 모든 결정적 봉인 배수 포함 (道·school·season·久古·七星·系譜)', () => {
  const m = js.match(/function sealRewardBase\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(m, 'sealRewardBase 본문');
  const body = m[1];
  ['schoolSealMul', 'getSeason', "includes('古')", "includes('久')", "includes('七星')", 'generationSealMul', '1.5']
    .forEach(tok => assert.ok(body.includes(tok), tok + ' 포함되어야 함'));
});

test('previewResonanceReward는 부작용(onSealPersistent) 호출 안 함 — 미리보기 안전', () => {
  const m = js.match(/function previewResonanceReward\([^)]*\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(m, 'previewResonanceReward 본문');
  assert.ok(!m[1].includes('onSealPersistent'), '미리보기는 지속효과 호출 금지');
  assert.match(m[1], /onSeal\b/, 'onSeal 보상 배수만 적용');
});

test('베기 보상 표시 — slayGrantAmount/finalReward로 連斬 반영 (표시=실제)', () => {
  // v244: 베기 버튼·검귀/명적 컷씬이 streak 미반영 c.reward를 표시해 실제 지급보다 적게 보이던 버그.
  assert.match(js, /function slayGrantAmount\(/, 'slayGrantAmount 헬퍼 존재');
  assert.match(js, /slayGrantAmount\(challenge\.reward\)/, '베기 버튼 라벨이 streak 반영');
  assert.match(js, /const finalReward = slayGrantAmount\(c\.reward\)/, '실제 지급도 동일 헬퍼');
  // 컷씬 메시지에 streak 미반영 raw c.reward 표시 잔존 없음
  assert.strictEqual((js.match(/조각 \+' \+ c\.reward/g) || []).length, 0, '컷씬에 raw c.reward 표시 없음');
});

test('물러남 비용 — fleeCost()로 표시·실제 일치 (速 무료 반영)', () => {
  // v244: 速(風) 형은 무료지만 도전 표시는 항상 FLEE_COST를 보여주던 발산 수정.
  assert.match(js, /function fleeCost\(\)/, 'fleeCost 헬퍼 존재');
  assert.match(js, /const cost = fleeCost\(\)/, 'flee()가 fleeCost 사용');
  assert.match(js, /fleeCost\(\) === 0 \? '도망 — 무료/, '표시도 fleeCost 사용(무료 분기)');
});

test('흔들림 차단 보호권 — shakeGuardCost()로 표시·실제 일원화', () => {
  // v245: 도전 stakes에 실패 시 필요 보호권 수 노출 + 실제 차감과 동일 공식 공유.
  assert.match(js, /function shakeGuardCost\(/, 'shakeGuardCost 헬퍼 존재');
  assert.match(js, /const guardCost = shakeGuardCost\(c\.strength\)/, '실제 차감이 헬퍼 사용');
  assert.match(js, /shakeGuardCost\(challenge\.strength\)/, '도전 표시가 헬퍼 사용');
});

test('結界 하락 흡수 표시 — 靈石/餘香 동시 차단 시 흡수 0 (실제와 동일 조건)', () => {
  // v245b: 結界+靈石/餘香 동시 활성 시 표시 하락%가 실제보다 부풀던 발산 수정.
  assert.match(js, /sanctumActive && !useSpiritR && !echoBlockR/, '표시 흡수 조건이 spirit/echo 차단 반영');
});

test('일일 리셋 날짜 — 로컬 자정 기준 (UTC toISOString 미사용)', () => {
  // v245h: 占/籤/拈花/三儀/연속출석/캘린더 등 일일 기능이 UTC라 KST 사용자는 오전 9시에 리셋되던 버그.
  // 날짜 헬퍼가 캐노니컬 로컬 todayStr()로 위임 (toISOString 미사용).
  ['todayStr3', 'todayDateStr', 'todayOracleDateStr'].forEach(fn => {
    const m = js.match(new RegExp('function ' + fn + '\\(\\)\\s*\\{([^}]*)\\}'));
    assert.ok(m, fn + ' 정의');
    assert.ok(!m[1].includes('toISOString'), fn + '는 toISOString(UTC) 미사용');
    assert.match(m[1], /todayStr\(\)/, fn + '는 로컬 todayStr() 위임');
  });
  // todayStr() 자체는 로컬 (getFullYear/getMonth/getDate)
  const tm = js.match(/function todayStr\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(tm && /getFullYear\(\)/.test(tm[1]) && /getDate\(\)/.test(tm[1]), 'todayStr는 로컬 날짜 구성');
});

test('모든 modal은 modal-close 또는 data-close 버튼 보유', () => {
  // 각 class="modal" 블록에 data-close 가 최소 1개 (대략적 검증)
  const modalCount = (html.match(/class="modal"/g) || []).length;
  const closeCount = (html.match(/data-close/g) || []).length;
  assert.ok(closeCount >= modalCount * 0.8, '대부분 모달에 닫기 버튼 (' + closeCount + '/' + modalCount + ')');
});

test('초기화(btn-reset)는 reload 사용 — in-place state 리터럴 drift 재발 방지 (v289)', () => {
  const m = js.match(/\$\('btn-reset'\)\.addEventListener\([\s\S]{0,400}?\n  \}\);/);
  assert.ok(m, 'btn-reset 핸들러 추출');
  assert.match(m[0], /location\.reload\(\)/, 'reset은 location.reload() 사용');
  assert.ok(!/state = \{[\s\S]*?shards: 50/.test(m[0]), 'in-place 대형 state 리터럴 없어야 (drift 원인)');
});

test('정의되지 않은 CSS 변수 참조 없음 (var(--x) 오타/누락 방지, v305)', () => {
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
  const defined = new Set();
  for (const m of css.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
  for (const m of html.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]); // 인라인 style 정의 포함
  const missing = new Set();
  for (const m of html.matchAll(/var\((--[\w-]+)/g)) if (!defined.has(m[1])) missing.add(m[1]);
  assert.deepStrictEqual([...missing], [], '정의 안 된 CSS 변수 참조(폴백되어 의도색 미적용): ' + [...missing].join(', '));
});

test('aria-labelledby/for/aria-describedby가 존재하는 id를 가리킴 (깨진 ARIA 참조 방지)', () => {
  const ids = new Set();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  const broken = [];
  for (const m of html.matchAll(/(?:aria-labelledby|aria-describedby|for)="([^"]+)"/g))
    for (const ref of m[1].split(/\s+/)) if (ref && !ids.has(ref)) broken.push(ref);
  assert.deepStrictEqual([...new Set(broken)], [], '존재하지 않는 id 참조(스크린리더 라벨 깨짐): ' + [...new Set(broken)].join(', '));
});

test('SVG url(#id) 참조가 정의된 id를 가리킴 (그라데이션/필터 깨짐 방지)', () => {
  const ids = new Set();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  const broken = [];
  for (const m of html.matchAll(/url\(#([^)\s"']+)\)/g)) if (!ids.has(m[1])) broken.push(m[1]);
  assert.deepStrictEqual([...new Set(broken)], [], '정의 안 된 SVG id 참조(그라데이션/필터 미적용): ' + [...new Set(broken)].join(', '));
});

test('모든 $("id") DOM 참조가 존재하는 id를 가리킴 (오타→null-deref render 깨짐 방지)', () => {
  // ref-integrity 가족(var(--x)/aria/url(#id))의 DOM-요소 짝. $("foo").textContent에서 foo가
  // 없으면 null-deref로 render throw. 정적/innerHTML-문자열/동적(.id=, setAttribute) id 모두 수집.
  const ids = new Set();
  for (const m of html.matchAll(/id="([^"]+)"/g)) ids.add(m[1]);       // 정적 + innerHTML 문자열 내 id="..."
  for (const m of js.matchAll(/id="([^"]+)"/g)) ids.add(m[1]);          // js 문자열 내 id="..."
  for (const m of js.matchAll(/\.id\s*=\s*["']([^"']+)["']/g)) ids.add(m[1]);  // el.id = 'x'
  for (const m of js.matchAll(/setAttribute\(["']id["'],\s*["']([^"']+)["']\)/g)) ids.add(m[1]);
  const missing = new Set();
  for (const m of js.matchAll(/\$\(["']([a-zA-Z][\w-]*)["']\)/g)) if (!ids.has(m[1])) missing.add(m[1]);
  assert.deepStrictEqual([...missing], [], '존재하지 않는 id를 $()로 참조(null-deref 위험): ' + [...missing].join(', '));
});

test('봉인·殿堂 push가 로직/표시 의존 sword 필드를 모두 보존 (v313-315/v344 류 field-drop 방지)', () => {
  // records(computeRecords)·achievements(HIDDEN_ACHIEVEMENTS)·duel(duelPower)이 읽는 로직 필드 +
  // SVG/회고/血統/時生이 읽는 표시 필드는 봉인 시 반드시 보존돼야 함. 누락 시 기록 미집계·성취
  // 오발동, 또는 정체성(篆刻/時生/血統) 소실. 소비자가 sealedSwords+enshrined를 concat해 함께
  // 순회하므로(예: computeRecords) 두 push가 같은 필드 집합을 가져야 한다 (v344: enshrine이
  // playerSeal/bornTod/fusedFrom를 누락해 殿堂 검만 정체성 소실하던 드리프트 수정).
  function pushBody(marker) {
    const i = js.indexOf(marker);
    assert.ok(i >= 0, marker + ' 존재');
    let s = js.indexOf('{', i), d = 0, end = -1;
    for (let j = s; j < js.length; j++) { const c = js[j]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { end = j; break; } } }
    return js.slice(s, end + 1);
  }
  const reads = ['inscriptions', 'level', 'protectsUsed', 'scars', 'slainCount', 'soul', 'stars',
    'enhanceAttempts', 'beads', 'playerSeal', 'bornTod', 'fusedFrom', 'levelHistory', 'form', 'verse'];
  for (const [name, marker] of [['doSeal', 'state.sealedSwords.push({'], ['enshrineSeal', 'state.enshrined.push({']]) {
    const body = pushBody(marker);
    const missing = reads.filter(f => !new RegExp('\\b' + f + '\\s*[:,]').test(body));
    assert.deepStrictEqual(missing, [], name + ' 검에 미보존된 의존 필드: ' + missing.join(', '));
  }
  // v370g — 고정 리스트 대신 두 push의 필드 집합 자체를 비교: 한쪽에만 필드를 추가하는
  // 드리프트(v313/v344 재발 클래스)를 리스트 갱신 없이 자동 차단. enshrinedAt만 殿堂 전용 허용.
  const fieldsOf = (marker) => {
    const body = pushBody(marker).replace(/\/\/[^\n]*/g, '');  // 인라인 주석 제거
    const set = new Set(); let m; const re = /[{,]\s*([a-zA-Z_]\w*)\s*(?=[:,}])/g;
    while ((m = re.exec(body))) set.add(m[1]);
    return set;
  };
  const doSet = fieldsOf('state.sealedSwords.push({');
  const enSet = fieldsOf('state.enshrined.push({');
  const ENSHRINE_ONLY = new Set(['enshrinedAt']);  // 殿堂 진열 시각 — 의도적 enshrine 전용
  const inDoNotEn = [...doSet].filter(f => !enSet.has(f));
  const inEnNotDo = [...enSet].filter(f => !doSet.has(f) && !ENSHRINE_ONLY.has(f));
  assert.deepStrictEqual(inDoNotEn, [], 'doSeal에만 있고 enshrineSeal에 누락된 필드(殿堂 검 정체성 소실): ' + inDoNotEn.join(', '));
  assert.deepStrictEqual(inEnNotDo, [], 'enshrineSeal에만 있고 doSeal에 누락된 필드(봉인 검 소실): ' + inEnNotDo.join(', '));
});

test('server.js: 루트 디렉토리 정적 서빙 안 함 — 소스/CLAUDE.md 노출 방지 (v332)', () => {
  // 주석에도 'express.static' 단어가 있으므로(설명용) 실제 미들웨어 등록만 검사
  const srv = fs.readFileSync(HTML_PATH.replace(/index\.html$/, 'server.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/app\.use\(\s*express\.static/.test(srv), 'express.static 미들웨어 재도입 금지 (루트 전체 서빙 → 소스/CLAUDE.md/schema 노출)');
  assert.match(srv, /sendFile\([^)]*index\.html/, 'catch-all로 index.html 서빙');
  assert.match(srv, /X-Frame-Options/, '보안 헤더 유지 (v334)');
});

test('메인 게임 컨테이너에 role="main" 랜드마크 (v339 a11y)', () => {
  assert.match(html, /<div id="game" role="main"/, '#game이 main 랜드마크 (스크린리더 본문 점프)');
  assert.strictEqual((html.match(/role="main"/g) || []).length, 1, 'main 랜드마크는 정확히 1개');
});

test('v342: 結界 흡수 파괴 확률이 단일 진원(sanctumAbsorbedDestroy)으로 통일 — 표시·실제 굴림 드리프트 방지', () => {
  // 표시(sanctumAbsorbedShow)와 실제 굴림(sanctumDestroyAbsorbed)이 손으로 동기화하던
  // 두 인라인 사본 → 한 헬퍼로 묶음. 향후 감소항 추가 시 한쪽만 수정되어 발생하던
  // display≠actual 드리프트(weather/wish/solar가 이렇게 누락됐었음)를 구조적으로 차단.
  const defCount = (js.match(/function sanctumAbsorbedDestroy\(/g) || []).length;
  assert.strictEqual(defCount, 1, 'sanctumAbsorbedDestroy 정의는 정확히 1개');
  const callCount = (js.match(/sanctumAbsorbedDestroy\(lv\)/g) || []).length;
  assert.ok(callCount >= 2, '표시·실제 두 경로가 sanctumAbsorbedDestroy(lv)를 호출해야 함 (got ' + callCount + ')');
});

test('v343: 실제 강화 굴림(effectiveDestroy)이 표시 헬퍼(effectiveDestroyChance)와 동일한 파괴-감소항을 모두 포함 — display≠actual 드리프트 차단', () => {
  // 헬퍼 직접 호출은 불가(헬퍼가 state.spiritstones를 live 재계산 → useSpirit 차감 후 회귀).
  // 그래서 두 공식은 분리 유지하되, 감소항 집합은 반드시 일치해야 함. (v263이 헬퍼엔 solar를
  // 넣었으나 이 인라인 굴림 사본을 못 고쳐 冬至 -2%가 표시·約束만 되고 실제론 무시됐던 버그.)
  const reduceTerms = ['schoolDestroyReduce(', 'guardianBonus(', 'getScarDestroyReduce(',
    'weatherDestroyReduce(', 'wishDestroyReduce(', 'solarDestroyReduce('];
  // omen 경로(effectiveDestroyChance(lv) 직접 호출)와 구분 — 인라인 공식 굴림은 (useSpirit 로 시작.
  const rollLine = (js.match(/const effectiveDestroy = \(useSpirit[^\n]*/) || [''])[0];
  assert.ok(rollLine, 'enhance의 인라인 effectiveDestroy 할당을 찾아야 함');
  for (const term of reduceTerms) {
    assert.ok(rollLine.includes(term), '실제 굴림에 ' + term + ') 감소항 누락 — 표시와 드리프트');
  }
});

test('v347: rollOmen(占卜 예측)이 실제 굴림과 동일 파괴 임계 사용 — 이중변환 division 재발 방지', () => {
  // 占卜은 잠긴 롤(divinationLockedFailRoll)을 실제 enhance가 재사용 → 예측=실제 보장.
  // 단 임계가 같아야 함: 실제는 else(실패) 분기에서 failRoll < effectiveDestroy(조건부).
  // 과거 rollOmen이 /(1-success)로 나눠 파괴를 과대예측(거짓양성)했다(v122/v347).
  const m = js.match(/function rollOmen\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(m, 'rollOmen 함수를 찾아야 함');
  const body = m[0];
  assert.match(body, /failRoll < effectiveDestroy\)/, 'rollOmen 파괴 임계는 실제 굴림과 동일한 plain effectiveDestroy');
  assert.doesNotMatch(body, /effectiveDestroy\s*\//, 'effectiveDestroy를 나누면 안 됨(이중변환 — 占卜 거짓양성)');
});

test('v349b: 覺悟(RESOLVE) 라벨·desc가 상수와 일치 (하드코딩 drift 방지 — 砥 라벨/레시피 비용류)', () => {
  // aria-label(정적 HTML)과 desc(객체, #resolve-desc에 표시)가 successAdd/destroyMul/costMul을
  // 하드코딩 → 상수 변경 시 표시≠실제. 정적 HTML은 보간 불가하므로 테스트로 잠근다.
  const val = (key, field) => {
    const m = js.match(new RegExp(key + ':\\s*\\{[^}]*\\b' + field + ':\\s*(-?[0-9.]+)'));
    assert.ok(m, 'RESOLVE.' + key + '.' + field + ' 추출');
    return parseFloat(m[1]);
  };
  const fSucc = val('focus', 'successAdd'), fDes = val('focus', 'destroyMul');
  const gSucc = val('guard', 'successAdd'), gCost = val('guard', 'costMul');
  // 一心 (focus): 성공 +8%, 파괴 1.5배 — aria + desc 모두
  assert.ok(html.includes('성공 +' + Math.round(fSucc * 100) + '%'), '一心 성공 라벨 == successAdd(' + fSucc + ')');
  assert.ok(html.includes('파괴 ' + fDes + '배'), '一心 파괴 라벨 == destroyMul(' + fDes + ')');
  assert.ok(js.includes('성공 +' + Math.round(fSucc * 100) + '%'), '一心 desc 성공 == successAdd');
  // 保身 (guard): 성공 -10%, 비용 1.5배
  assert.ok(html.includes('성공 ' + Math.round(gSucc * 100) + '%'), '保身 성공 라벨 == successAdd(' + gSucc + ')');
  assert.ok(html.includes('비용 ' + gCost + '배'), '保身 비용 라벨 == costMul(' + gCost + ')');
});

test('v350: getFormCounts가 sealedSwords+enshrined 둘 다 집계 (流派가 殿堂 검 누락하던 outlier 방지)', () => {
  // getWayFormCounts(四道)·~10개 집계 지점은 두 컬렉션을 합산하는데 getFormCounts만
  // sealedSwords-only였음 → 道 검 殿堂 진열 시 流派 진척에서 빠짐. 같은 형 검 집계는
  // 봉인+殿堂을 합쳐야 함(enshrine은 봉인의 한 형태, 四道와 동일 처리).
  const m = js.match(/function getFormCounts\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(m, 'getFormCounts 본문');
  assert.match(m[1], /state\.enshrined/, 'getFormCounts는 state.enshrined도 집계해야 함');
});

test('merged-collection: 形/道 집계·필터가 sealedSwords-only면 안 됨 (v350-362 클러스터 회귀 방지)', () => {
  // 道 검을 殿堂(enshrined)에 진열하면 流派/共鳴/sync/표시/업적에서 빠지던 버그 군집(v350-362).
  // 모든 形/道 tally는 sealedSwords+enshrined 합산해야 함. fixed 패턴은 ).concat(state.enshrined
  // 가 사이에 있어 아래 정규식(즉시 .forEach/.filter)에 안 걸림 → 매치 = 회귀.
  // (legacyStrength는 s.level 합, whisper는 s.verse 필터라 form/道 아님 — 의도적 trade-off, 미포함.)
  const formOnly = js.match(/state\.sealedSwords \|\| \[\]\)\.(forEach|filter|map)\([^)]*\bs\.form\b/g) || [];
  assert.deepStrictEqual(formOnly, [], 'sealedSwords-only 形 집계(enshrined 누락 회귀): ' + formOnly.join(' || '));
  const daoOnly = js.match(/state\.sealedSwords \|\| \[\]\)\.filter\([^)]*['"道]/g) || [];
  // 道 = 道. filter에서 道 검 거르는데 enshrined 미합산이면 회귀.
  const daoBad = daoOnly.filter(s => s.indexOf('道') >= 0);
  assert.deepStrictEqual(daoBad, [], 'sealedSwords-only 道 필터(enshrined 누락 회귀): ' + daoBad.join(' || '));
});

test('save(): 저장 실패를 침묵하지 않고 1회 경고 (v370p — quota 초과 시 무음 데이터손실 방지)', () => {
  // 매 액션마다 save()되므로 침묵 catch면 quota 초과 시 진행도 미저장을 모른 채 손실.
  const m = js.match(/function save\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(m, 'save() 본문');
  const body = m[1];
  assert.match(body, /catch\s*\([^)]*\)\s*\{[\s\S]*log\(/, 'save() catch가 log로 사용자 경고 (침묵 catch 회귀 방지)');
  assert.match(body, /saveFailedWarned/, 'save()가 1회-경고 플래그 사용 (매 액션 스팸 방지)');
});

test('merged-collection: 검 중의 검(컬렉션 하이라이트)이 殿堂 검도 합산 (v370d — 헬퍼 site 회귀 방지)', () => {
  // collectionHighlight(sealed,...) 헬퍼를 쓰는 site는 위 .forEach/.filter 정규식에 안 잡힘.
  // 가장 강한 검을 殿堂에 진열하면 명예의 전당에서 사라지던 v350류 누락 — sealed-only 회귀 차단.
  // 게이트(sealed.length<3) + collectionHighlight(sealed) 시그니처로 블록을 유일 식별
  assert.match(js,
    /const sealed = \(state\.sealedSwords \|\| \[\]\)\.concat\(state\.enshrined \|\| \[\]\);\s*\n\s*if \(sealed\.length < 3\)[\s\S]{0,260}?collectionHighlight\(sealed/,
    '검 중의 검은 sealedSwords+enshrined 합산이어야 함 (殿堂 검 누락 회귀)');
});

test('merged-collection: 詩集(renderAnthology) 一生詩·遺言이 殿堂 검도 포함 (v370e — verse shape 회귀 방지)', () => {
  // verse(一生詩/遺言) 컬렉션은 .filter(s=>s.verse)·slice 형태라 form/道 meta-test에 안 잡힘.
  // whisper(v369)는 enshrined verse 합산하는데 詩集이 sealed-only면 — 속삭인 시가 詩集에 없는 모순.
  const body = js.match(/function renderAnthology\(\)\s*\{[\s\S]{0,260}?const sealed =[^\n]*/);
  assert.ok(body, 'renderAnthology 본문');
  assert.match(body[0], /const sealed = \(state\.sealedSwords \|\| \[\]\)\.concat\(state\.enshrined \|\| \[\]\)/,
    '詩集은 sealedSwords+enshrined 합산이어야 함 (殿堂 道 검 一生詩 누락 회귀)');
});

test('v368: isStuck가 voidPending도 가드 — 파괴~회수창(350ms) 사이 game-over가 회수창을 덮지 않음', () => {
  // 파괴 시 hasSword=false 즉시, showVoid(rescueWindow 설정)는 +350ms. 그 갭의 동기 render()가
  // game-over를 띄우면 #gameover-overlay(z-index:500)가 회수창(#void, z-index auto)을 덮음.
  // voidPending: 파괴 분기에서 set, isStuck에서 가드, showVoid/endVoid에서 해제(reload 리셋 → soft-lock 불가).
  assert.match(js, /if \(rescueWindow \|\| voidPending\) return false;/, 'isStuck가 voidPending 가드');
  assert.match(js, /voidPending = true;[^\n]*\n\s*setTimeout\(\(\) => showVoid/, '파괴 분기에서 voidPending=true (showVoid 예약 직전)');
  // showVoid가 voidPending 해제 (rescueWindow 인계) — soft-lock 방지의 핵심
  const sv = js.match(/function showVoid\([^)]*\)\s*\{([\s\S]{0,120})/);
  assert.ok(sv && /voidPending = false/.test(sv[1]), 'showVoid 진입 시 voidPending 해제');
});

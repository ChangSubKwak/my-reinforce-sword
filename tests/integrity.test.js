'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { HTML_PATH, readScript, extractConst } = require('./harness');

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

test('옥로 축복은 실패한 강화에만 환급 (성공 fall-through 회귀 방지, v285)', () => {
  // 옥로 발동이 enhanceFailed 가드 안에 있어야 함 — 공통 정리부에 있어 성공에도 환급되던 버그 방지.
  assert.match(js, /enhanceFailed && gyokuro && Math\.random\(\) < gyokuro\.chance/, '옥로는 enhanceFailed 가드 필요');
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

// startHeartbeat는 80ms 고빈도 타이머라 재진입 시 이전 핸들을 clearInterval로 정리하지
// 않으면 인터벌이 누적 누수된다. 호출부 수는 그대로(1)라 위 setInterval≤50 집계 가드로는
// 잡히지 않는 회귀 클래스 — 함수 본문에서 clearInterval이 setInterval보다 먼저 와야 함.
test('startHeartbeat는 재진입 시 이전 인터벌을 clearInterval로 정리 (80ms 타이머 누수 방지)', () => {
  const m = js.match(/function startHeartbeat\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(m, 'startHeartbeat 함수 존재');
  const body = m[1];
  const clearIdx = body.indexOf('clearInterval');
  const setIdx = body.indexOf('setInterval');
  assert.ok(clearIdx >= 0, 'startHeartbeat에 clearInterval 가드 존재');
  assert.ok(setIdx >= 0, 'startHeartbeat에 setInterval 존재');
  assert.ok(clearIdx < setIdx, 'clearInterval이 setInterval보다 먼저 (재진입 누수 방지)');
});

// schedulePush는 매 액션(봉인 등)마다 호출되는 3초 디바운스 클라우드 push. 재진입 시
// 이전 타이머를 clearTimeout으로 정리하지 않으면 연속 액션마다 별도 push가 쌓여
// 중복 Supabase 쓰기 폭주가 된다. setTimeout이라 setInterval≤50 집계 가드는 못 잡음.
test('schedulePush는 재진입 시 이전 타이머를 clearTimeout으로 정리 (중복 push 폭주 방지)', () => {
  const m = js.match(/function schedulePush\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(m, 'schedulePush 함수 존재');
  const body = m[1];
  const clearIdx = body.indexOf('clearTimeout');
  const setIdx = body.indexOf('setTimeout');
  assert.ok(clearIdx >= 0, 'schedulePush에 clearTimeout 디바운스 가드 존재');
  assert.ok(setIdx >= 0, 'schedulePush에 setTimeout 존재');
  assert.ok(clearIdx < setIdx, 'clearTimeout이 setTimeout보다 먼저 (디바운스)');
});

// autoPull은 네트워크 await가 있는 비동기 클라우드 가져오기. 재진입 가드(autoPullRunning)가
// 없으면 동시 pull이 겹쳐 클라우드 적용이 중복/경합(clobber)된다. 진입 시 early-return 가드 +
// true 세팅 + finally 리셋의 3요소가 모두 있어야 함.
test('autoPull은 autoPullRunning 재진입 가드 (동시 pull 경합/중복 적용 방지)', () => {
  const m = js.match(/async function autoPull\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(m, 'autoPull 함수 존재');
  const body = m[1];
  assert.match(body, /autoPullRunning\)\s*return/, 'early-return 가드에 autoPullRunning 포함');
  assert.match(body, /autoPullRunning\s*=\s*true/, '진입 시 autoPullRunning=true');
  assert.match(body, /finally\s*\{[\s\S]*autoPullRunning\s*=\s*false/, 'finally에서 autoPullRunning=false 리셋');
});

// 동시성 안전 불변식 (CLAUDE.md 명시): enhance/sealSword는 도전·회수 활성 중 진입을 막아야
// 하고(상태 손상 방지), slay는 보상 분기 전에 challenge를 즉시 null로 잠가야 함(더블클릭 시
// 이중 보상/영혼 방지). 함수 선언 직후를 확인 — 긴 본문이라 선언 후 슬라이스로 견고하게.
function afterDecl(sig, len) {
  const i = js.indexOf(sig);
  assert.ok(i >= 0, sig + ' 존재');
  return js.slice(i + sig.length, i + sig.length + len);
}
test('enhance/sealSword 초입 동시성 가드 (도전·회수 중 진입 차단 — 상태 손상 방지)', () => {
  assert.match(afterDecl('function enhance() {', 120), /if \(challenge \|\| rescueWindow\) return/,
    'enhance는 초입에 challenge||rescueWindow 가드');
  assert.match(afterDecl('function sealSword() {', 120), /if \(challenge \|\| rescueWindow\) return/,
    'sealSword는 초입에 challenge||rescueWindow 가드');
});
test('slay는 보상 분기 전에 challenge를 즉시 null로 잠금 (더블클릭 이중 보상 방지)', () => {
  const body = afterDecl('function slay() {', 400);
  const nullIdx = body.indexOf('challenge = null');
  const rewardIdx = body.indexOf('c.strength');
  assert.ok(nullIdx >= 0, 'slay에 challenge=null 잠금 존재');
  assert.ok(rewardIdx >= 0, 'slay에 c.strength 보상 분기 존재');
  assert.ok(nullIdx < rewardIdx, 'challenge=null이 보상 분기보다 먼저 (더블클릭 안전)');
});

// 融劍도 보상-변이 행동 더블파이어 클래스: fuseSwords는 splice+과금 전에 hasSword로 잠근다.
// newSword()가 hasSword=true를 동기 설정 → 두 번째 클릭은 차단(이중 splice/이중 과금 방지).
test('fuseSwords는 splice/과금 전에 hasSword로 재진입 차단 (이중 융검 방지)', () => {
  const body = afterDecl('function fuseSwords() {', 1800);
  const guardIdx = body.indexOf('if (state.hasSword) return');
  const spliceIdx = body.indexOf('state.sealedSwords.splice');
  const costIdx = body.indexOf('state.shards -= FUSION_COST');
  assert.ok(guardIdx >= 0, 'fuseSwords에 hasSword 가드 존재');
  assert.ok(spliceIdx >= 0 && costIdx >= 0, 'splice + 과금 존재');
  assert.ok(guardIdx < spliceIdx && guardIdx < costIdx, 'hasSword 가드가 splice·과금보다 먼저');
});

// doSeal은 자체 재진입 가드가 없어, 봉인 더블클릭/더블엔터 방어는 askName이 책임진다:
// onConfirm이 cleanup()(리스너 removeEventListener)을 callback(doSeal) *전에* 호출해야
// 두 번째 이벤트가 무리스너로 무시된다. 이 순서가 깨지면 한 검이 이중 봉인(이중 보상+이중 push)된다.
test('askName onConfirm은 callback(doSeal) 전에 cleanup으로 리스너 해제 (이중 봉인 방지)', () => {
  const body = afterDecl('function onConfirm() {', 200);
  const cleanIdx = body.indexOf('cleanup()');
  const cbIdx = body.indexOf('callback(');
  assert.ok(cleanIdx >= 0, 'onConfirm이 cleanup() 호출');
  assert.ok(cbIdx >= 0, 'onConfirm이 callback() 호출');
  assert.ok(cleanIdx < cbIdx, 'cleanup()이 callback()보다 먼저 (더블파이어 방지)');
  // cleanup()은 confirm 리스너를 실제로 제거해야 함 (재호출 무력화)
  assert.match(afterDecl('function cleanup() {', 300), /removeEventListener\('click',\s*onConfirm\)/, 'cleanup이 onConfirm 리스너 해제');
});

// v371c 守魂 — 수호자(지정 道 검)가 있으면 一閃 도전 때 그가 우선 속삭인다(守+whisper 융합).
// 회귀 시 수호자가 다시 침묵(임의 道 검만 속삭임)하므로 우선 로직을 잠근다.
test('v371c 守魂: whisperFromAncestor는 수호자 우선 + 守 표식', () => {
  const body = afterDecl('function whisperFromAncestor(', 1400);
  assert.match(body, /getGuardian\(\)/, '수호자 조회');
  assert.match(body, /isGuardian\s*=\s*true/, '수호자면 우선 화자 지정');
  assert.match(body, /isGuardian \?/, '수호자 속삭임에 守 표식 분기');
});

// 회수/도박 핸들러도 slay와 같은 더블클릭 클래스 — 보상(조각) 전에 rescued로 잠그지 않으면
// 빠른 더블탭이 이중 회수된다. rescueWindow 객체 리터럴 안의 두 핸들러 모두 잠금 검사.
test('회수/도박 핸들러는 조각 지급 전에 rescued 잠금 (더블클릭 이중 회수 방지)', () => {
  const i = js.indexOf('rescueWindow = {');
  assert.ok(i >= 0, 'rescueWindow 객체 존재');
  const slice = js.slice(i, i + 1200);
  const guardIdx = slice.indexOf('if (rescued) return');
  const rewardIdx = slice.indexOf('state.shards += shardReward');
  assert.ok(guardIdx >= 0, 'rescued 가드 존재');
  assert.ok(rewardIdx >= 0, 'shardReward 지급 존재');
  assert.ok(guardIdx < rewardIdx, 'rescued 잠금이 조각 지급보다 먼저 (더블클릭 안전)');
  assert.ok((slice.match(/rescued = true/g) || []).length >= 2, '회수·도박 두 핸들러 모두 rescued 잠금');
});

// 한글화 회귀 방지: 性情 분포 카운터·필터는 deriveTemperament().key(안정 영문 키)로 집계해야
// 한다. 표시 이름(.name)으로 키잉하면 음역 단계에서 이름이 바뀔 때 조용히 깨진다
// (한글화 1단계에서 tc[.name]가 구 한자 키와 불일치해 분포·필터가 0이 된 회귀).
test('性情 분포/필터는 deriveTemperament().key로 집계 (표시이름 키잉 회귀 방지)', () => {
  assert.match(js, /tc\[deriveTemperament\(s\)\.key\]/, '분포 카운터는 .key로 집계');
  assert.match(js, /deriveTemperament\(s\)\.key === legacyFilter/, '性情 필터는 .key로 비교');
});

// v371 率性 인식 순간: deriveNaturePath(v370)가 follow/defy일 때 1회만 페이드. naturePathSeen
// 플래그로 재발화 차단, 명문 cadence(checkInscriptions)에 훅. 점수 효과 0 — 회귀 시 즉발/중복/무발화.
test('v371: checkNaturePath는 follow/defy 1회성 게이트 + checkInscriptions 훅', () => {
  const body = afterDecl('function checkNaturePath() {', 600);
  assert.match(body, /naturePathSeen\)\s*return/, '이미 본 검은 재발화 안 함 (1회성)');
  assert.match(body, /'follow'.*'defy'|np\.key !== 'follow' && np\.key !== 'defy'/, 'follow/defy일 때만 (無爲/none 제외)');
  assert.match(body, /naturePathSeen\s*=\s*true/, '발화 후 seen=true 잠금');
  assert.match(body, /recordEvent\(/, 'v371b — 발현을 일지(recentLog)에 기록 (생애 사건 일관성)');
  // checkInscriptions가 checkNaturePath를 호출해야 함 (행동 cadence 훅 — 회귀 시 무발화)
  assert.match(afterDecl('function checkInscriptions() {', 500), /checkNaturePath\(\)/, 'checkInscriptions가 checkNaturePath 호출');
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
  ['schoolSealMul', 'getSeason', "includes('고')", "includes('구')", "includes('칠성')", 'generationSealMul', '1.5']
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

test('정적 HTML 요소 id는 유일 (중복 id → getElementById가 첫 요소만 잡는 wrong-element 버그 방지)', () => {
  // $() resolve 가드의 짝(uniqueness). 정적 마크업 id만 검사 — <script> 내 JS-문자열 id는
  // 동적 render마다 생성/제거되므로 소스에 같은 문자열이 여러 번 나오는 게 정상(제외).
  const staticHtml = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const counts = {};
  for (const m of staticHtml.matchAll(/\sid="([^"]+)"/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
  const dups = Object.entries(counts).filter(([, v]) => v > 1).map(([k]) => k);
  assert.deepStrictEqual(dups, [], '중복된 정적 HTML id (getElementById 모호성): ' + dups.join(', '));
});

test('NEWSWORD_COST 단일 진원 (v370t — 표시·행동·재시작이 같은 const, 지역 재선언 금지)', () => {
  // 새 검 비용이 render 표시·click 행동·restartFromGameOver에서 각각 하드코딩(=50)되어
  // 한 곳만 바꾸면 표시≠실제 비용 드리프트하던 것 → 모듈 const 1개로 통일. 지역 재선언 회귀 차단.
  const decls = (js.match(/const NEWSWORD_COST\s*=/g) || []).length;  // 실제 선언만 (주석 언급 제외)
  assert.strictEqual(decls, 1, 'NEWSWORD_COST 선언은 정확히 1개(모듈 const)여야 함 (지역 재선언=드리프트): ' + decls);
});

test('Space/Enter enhance는 모달 열림 중 차단됨 (v370r — 모달 중 의도치 않은 강화·파괴 방지)', () => {
  // Space 핸들러의 enhance 분기가 .modal.active 가드를 가져야 함. 없으면 계보/회고 등 읽는 중
  // Space가 enhance()를 발동해 조각 소모·검 파괴. slay/rescue는 #challenge/#void(.modal 아님)라 무관.
  const m = js.match(/if \(e\.key === ' ' \|\| e\.key === 'Enter'\)\s*\{([\s\S]*?)\n    \}/);
  assert.ok(m, 'Space/Enter 핸들러 본문');
  const body = m[1];
  assert.match(body, /modal\.active|modalOpen/, 'enhance 분기가 모달 열림 가드 보유');
  // enhance() 호출이 모달 가드와 같은 조건에 묶여 있는지(분리 회귀 방지)
  assert.match(body, /!modalOpen[\s\S]*enhance\(\)|modal\.active[\s\S]*enhance\(\)/, 'enhance()가 모달 가드로 보호됨');
});

test('전역 키보드 단축키가 텍스트 입력 중 비활성 (v370s — m/p 타이핑이 음소거/방지권 토글 방지)', () => {
  // 입력 핸들러가 stopPropagation 안 해 document keydown으로 버블 → 'm'/'p' 타이핑이 toggleMute/
  // 방지권 토글. document keydown 핸들러 진입부에서 INPUT/TEXTAREA 포커스 시 early return해야 함.
  const m = js.match(/키보드 단축키\s*\n\s*document\.addEventListener\('keydown',\s*\(e\)\s*=>\s*\{([\s\S]{0,500})/);
  assert.ok(m, '메인 단축키 keydown 핸들러');
  assert.match(m[1], /tagName === 'INPUT'[\s\S]*tagName === 'TEXTAREA'/, '입력 포커스 시 전역 단축키 early return');
  assert.match(m[1], /return;/, 'early return 존재');
});

test('UI 용어 일관성: 道를 로마자 "Dao"로 표기하지 않음 (한글/한자 톤, CLAUDE.md 영어 자제)', () => {
  // v370q — 게임오버 여정 텍스트가 한 화면에서 道(≥10/≥1 분기)와 'Dao'(≥5 분기)를 혼용하던
  // 불일치 수정. 한국어-조사 맥락의 로마자 道(Dao에/Dao를/Dao의)는 명백한 UI 문자열 → 재유입 차단.
  const stray = js.match(/Dao(에|를|의|로|가|에서|까지)/g) || [];
  assert.deepStrictEqual(stray, [], '로마자 "Dao" + 한글 조사 (道로 표기해야 함): ' + stray.join(', '));
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
  // v334 보안 헤더 4종 전부 유지 — 하나만 검사하면 나머지 누락 회귀를 놓침
  // (예: nosniff 제거 시 MIME 스니핑 노출). 의도적으로 추가된 4종 모두 잠금.
  assert.match(srv, /X-Frame-Options/, '보안 헤더 유지: X-Frame-Options (v334)');
  assert.match(srv, /X-Content-Type-Options/, '보안 헤더 유지: nosniff (MIME 스니핑 방지)');
  assert.match(srv, /Referrer-Policy/, '보안 헤더 유지: Referrer-Policy');
  assert.match(srv, /Permissions-Policy/, '보안 헤더 유지: Permissions-Policy');
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
  // v396 — 유수(流水)는 consumeWishEnhance(charges 1→0) *전에* 캡처한 wishDR을 굴림에 사용:
  // 마지막 충전이 파괴 굴림에 적용되도록. 캡처 상수명이 감소항 커버리지를 대신 증명한다.
  const reduceTerms = ['schoolDestroyReduce(', 'guardianBonus(', 'getScarDestroyReduce(',
    'weatherDestroyReduce(', 'wishDR', 'solarDestroyReduce('];
  // omen 경로(effectiveDestroyChance(lv) 직접 호출)와 구분 — 인라인 공식 굴림은 (useSpirit 로 시작.
  const rollLine = (js.match(/const effectiveDestroy = \(useSpirit[^\n]*/) || [''])[0];
  assert.ok(rollLine, 'enhance의 인라인 effectiveDestroy 할당을 찾아야 함');
  for (const term of reduceTerms) {
    assert.ok(rollLine.includes(term), '실제 굴림에 ' + term + ' 감소항 누락 — 표시와 드리프트');
  }
  // 캡처는 consume보다 앞서야 함 (뒤면 charges 0으로 감소항이 0이 됨 — v396 [2])
  const capIdx = js.indexOf('const wishDR = wishDestroyReduce()');
  const consumeIdx = js.indexOf('consumeWishEnhance();');
  assert.ok(capIdx >= 0, 'wishDR 캡처 라인 존재');
  assert.ok(consumeIdx > capIdx, 'wishDR 캡처는 consumeWishEnhance 전');
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
  // 헬퍼화 후: allSealedSwords() 호출이 두 컬렉션을 통합 (헬퍼 본문 자체 검증 별도).
  const m = js.match(/function getFormCounts\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(m, 'getFormCounts 본문');
  assert.match(m[1], /allSealedSwords\(\)|state\.enshrined/, 'getFormCounts는 봉인+전당 통합 컬렉션 사용');
  // allSealedSwords 자체가 두 컬렉션을 통합하는지 검증
  const h = js.match(/function allSealedSwords\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(h, 'allSealedSwords 헬퍼 본문');
  assert.match(h[1], /state\.sealedSwords/, '헬퍼가 sealedSwords 포함');
  assert.match(h[1], /state\.enshrined/, '헬퍼가 enshrined 포함');
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
  const daoBad = daoOnly.filter(s => s.indexOf('도') >= 0);
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
  // 헬퍼화 후: allSealedSwords() 통합. 게이트(sealed.length<3) + collectionHighlight(sealed) 시그니처.
  assert.match(js,
    /const sealed = allSealedSwords\(\);\s*\n\s*if \(sealed\.length < 3\)[\s\S]{0,260}?collectionHighlight\(sealed/,
    '검 중의 검은 봉인+전당 통합(allSealedSwords) 사용 (殿堂 검 누락 회귀)');
});

test('merged-collection: 詩集(renderAnthology) 一生詩·遺言이 殿堂 검도 포함 (v370e — verse shape 회귀 방지)', () => {
  // verse(一生詩/遺言) 컬렉션은 .filter(s=>s.verse)·slice 형태라 form/道 meta-test에 안 잡힘.
  // whisper(v369)는 enshrined verse 합산하는데 詩集이 sealed-only면 — 속삭인 시가 詩集에 없는 모순.
  // 헬퍼화 후: allSealedSwords() 통합.
  const body = js.match(/function renderAnthology\(\)\s*\{[\s\S]{0,260}?const sealed =[^\n]*/);
  assert.ok(body, 'renderAnthology 본문');
  assert.match(body[0], /const sealed = allSealedSwords\(\)/,
    '詩集은 봉인+전당 통합(allSealedSwords) 사용 (殿堂 道 검 一生詩 누락 회귀)');
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

// UI 재설계(B) 회귀 방지: 1a 검 정보 패널(현세)이 천명 포함 + 1b stage-minimal로 무대 배너 일원화.
// 무대 배너를 다시 always-on으로 되돌리거나 패널에서 천명이 빠지면(드라마가 다시 묻힘) 잠금.
test('UI 재설계: 검 정보 패널 천명 통합 + stage-minimal 무대 배너 숨김 (1a/1b)', () => {
  // 1a — 현세 패널이 천명을 모음 (무대 배너 대체 완결)
  const rm = js.match(/function renderStatus\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(rm && /천명/.test(rm[1]), '현세 패널에 천명 통합 (1a)');
  // 1b — stage-minimal이 항상-켜진 배너 4종을 숨김
  assert.match(html, /body\.stage-minimal[\s\S]*?#destiny-banner/, 'stage-minimal이 천명 배너 숨김');
  assert.match(html, /#guardian-display\s*\{\s*display:\s*none/, 'stage-minimal이 수호자 표시 숨김');
  assert.match(js, /classList\.add\('stage-minimal'\)/, '초기화 시 stage-minimal 적용');
});

// renderCodex 단일 출처 잠금 — 별도 conditions 룩업 재유입 차단.
// v4 당시의 conditions{} 는 INSCRIPTIONS 14개만 커버 → 32 으로 자란 후 18개가 "특수 조건"으로 추락했음.
// label은 모든 항목에 존재. 재유입 시 같은 stale 발생.
test('renderCodex가 별도 conditions 룩업 없이 ins.label 단일 출처로 (stale "특수 조건" 회귀 방어)', () => {
  const rc = js.match(/function renderCodex\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(rc, 'renderCodex 본문 위치');
  const body = rc[1];
  assert.ok(!/const conditions\s*=\s*\{/.test(body), 'renderCodex 내 별도 conditions 룩업 없음 (label 단일 출처 보존)');
  assert.ok(!/'특수 조건'/.test(body), '"특수 조건" fallback 문구 없음 (label로 대체됨)');
  assert.match(body, /ins\.label/, 'ins.label을 직접 표시');
});

// DESTINIES.foe 체크가 NAMED_FOES.inscription 자동 동기화 (하드코드 회귀 방어).
// 이전: ['풍참','월참','인참','제참','용참'] 하드코드 → NAMED_FOES에 6번째 추가 시 천명이 새 적 베어도 silently 미발동.
test('DESTINIES.foe.check는 NAMED_FOES를 동적 참조 (하드코드 회귀 차단)', () => {
  // foe 천명 정의 줄(들) 본문에서 NAMED_FOES 참조 확인
  const foeDef = js.match(/key:\s*'foe'[\s\S]{0,500}?check:[^}]+?\}/);
  assert.ok(foeDef, 'DESTINIES.foe 정의 위치');
  assert.match(foeDef[0], /NAMED_FOES\.some/, 'foe.check가 NAMED_FOES.some 패턴으로 동적 순회');
  assert.ok(!/\['풍참'[^\]]*'용참'\]/.test(foeDef[0]), 'inscription 하드코드 배열 없음 (제대로 동적화)');
});

// generateBiography / generateVerse 의 名 격파 분기가 NAMED_FOES.narration / .verse 단일 출처
// (이전 FOE_NARR / FOE_VERSE 객체 + 하드코드 inscription 배열 = 4-way drift 채널).
test('NAMED_FOES 격파 narration/verse는 단일 출처 (FOE_NARR/FOE_VERSE 객체 회귀 차단)', () => {
  // 옛 lookup 객체 재유입 금지
  assert.ok(!/const FOE_NARR\s*=\s*\{/.test(js), 'FOE_NARR 룩업 객체 없음 (NAMED_FOES.narration로 통합)');
  assert.ok(!/const FOE_VERSE\s*=\s*\{/.test(js), 'FOE_VERSE 룩업 객체 없음 (NAMED_FOES.verse로 통합)');
  // 옛 하드코드 inscription 배열 회귀 금지(2곳)
  const hardArr = /\[\s*'용참'\s*,\s*'제참'\s*,\s*'인참'\s*,\s*'월참'\s*,\s*'풍참'\s*\]/g;
  const hits = (js.match(hardArr) || []).length;
  assert.strictEqual(hits, 0, '용참/제참/인참/월참/풍참 하드코드 배열 없음 (NAMED_FOES 동적 순회)');
  // NAMED_FOES 5개 모두 narration·verse 필드 보유 (출처 무결성)
  const NF = extractConst('NAMED_FOES');
  assert.strictEqual(NF.length, 5, 'NAMED_FOES 5개');
  NF.forEach(f => {
    assert.ok(typeof f.narration === 'string' && f.narration.length > 0, f.key + ' .narration 보유');
    assert.ok(typeof f.verse === 'string' && f.verse.length > 0, f.key + ' .verse 보유');
  });
});

// allSealedSwords() 헬퍼 단일 진원 잠금 — 봉인+전당 통합 컬렉션 패턴이 인라인으로 회귀하지 않도록.
// 28개 사이트가 이 헬퍼를 통해 두 컬렉션을 자동 합산. 사이트가 helper 우회해 인라인 sealedSwords-only로
// 작성하면 v350-362 클러스터 같은 enshrined 누락 회귀 재발.
test('allSealedSwords() 헬퍼가 정의되고 인라인 (sealedSwords||[]).concat(enshrined||[]) 패턴 회귀 없음', () => {
  // 헬퍼 정의 존재 + 두 컬렉션 통합
  const def = js.match(/function allSealedSwords\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(def, 'allSealedSwords 헬퍼 정의 존재');
  assert.match(def[1], /state\.sealedSwords/, '헬퍼가 sealedSwords 포함');
  assert.match(def[1], /state\.enshrined/, '헬퍼가 enshrined 포함');
  // 인라인 회귀 패턴 (헬퍼 정의 본문 외엔 0건)
  const inlinePat1 = js.match(/\(state\.sealedSwords \|\| \[\]\)\.concat\(state\.enshrined \|\| \[\]\)/g) || [];
  const inlinePat2 = js.match(/\[\]\.concat\(state\.sealedSwords \|\| \[\], state\.enshrined \|\| \[\]\)/g) || [];
  // pat1은 헬퍼 정의 본문 1곳만 허용. pat2는 0건.
  assert.strictEqual(inlinePat1.length, 1, '인라인 (sealedSwords||[]).concat(enshrined||[]) — 헬퍼 본문 1곳만 (' + inlinePat1.length + '개 발견)');
  assert.strictEqual(inlinePat2.length, 0, '인라인 [].concat(sealedSwords||[], enshrined||[]) 회귀 0건 (' + inlinePat2.length + '개 발견)');
});

// 접근성: 모든 role="dialog" modal에 aria-labelledby 또는 aria-label 보유
// (4개 누락이 stale했음: weekly-report / gallery / codex-book / user-poem).
test('a11y: 모든 modal dialog는 aria-labelledby/aria-label 보유 (screen reader 식별)', () => {
  const dialogMatches = html.match(/<div[^>]*role="dialog"[^>]*>/g) || [];
  const unlabeled = dialogMatches.filter(d => !/aria-label/.test(d));
  assert.deepStrictEqual(unlabeled, [], 'aria-labelledby 또는 aria-label 누락 dialog: ' + unlabeled.join('\n  '));
});

// a11y: modal focus trap (inert 기반) 설정이 있는지 잠금.
// 67개 modal 열기 사이트가 있어 site-별 inert toggle은 비현실적.
// 단일 MutationObserver가 모든 .modal class 변경 감시 + 형제(#game/다른 modal) inert sync.
test('a11y: setupModalFocusTrap이 MutationObserver로 .modal active 감시 (focus 이탈 방지)', () => {
  assert.match(js, /setupModalFocusTrap/, '모달 focus trap 헬퍼 존재');
  // MutationObserver 사용 (attribute class 감시)
  assert.match(js, /new MutationObserver\(syncInert\)/, 'MutationObserver로 syncInert 호출');
  // inert 토글 — game 본체 + 다른 modal
  assert.match(js, /game\.inert\s*=\s*true/, '#game에 inert 적용 (modal 열림 시)');
  assert.match(js, /m\.inert\s*=\s*\(m\s*!==\s*active\)/, '활성 modal 외 다른 modal들에 inert');
  // 구 브라우저 graceful (구식 사용자도 게임 가능)
  assert.match(js, /'inert' in HTMLElement\.prototype/, 'inert 지원 안 하면 graceful skip');
});

// 페이지 가시성 — 탭 숨김 시 ambient drone fade. 다른 탭 잡음 + 모바일 배터리.
test('페이지 가시성: visibilitychange 핸들러가 ambient drone 제어', () => {
  assert.match(js, /addEventListener\('visibilitychange'/, 'visibilitychange 이벤트 리스너 등록');
  assert.match(js, /document\.hidden[\s\S]{0,80}stopAmbient/, '탭 숨김 시 stopAmbient 호출');
  assert.match(js, /!muted[\s\S]{0,80}startAmbient/, '탭 표시 시 (음소거 아님) startAmbient 재개');
});

// 테마 추종(theme-* 변형이 --accent/--fg/--danger 재정의) — 강조/전경/위험 역할 UI가
// 레거시 골드 #d4af37 / 오프화이트 #e8e6dd로 박히면 푸른/은빛 테마에서 미추종.
// CLAUDE.md: "색은 항상 CSS 변수 사용 — 하드코딩 hex(#d4af37 등 레거시) 금지".
// (검 <defs> 그라데이션 / burstParticles 장식 / 형-정체성 색맵 등 의도적 고정은 예외라 전수 검사 X.)
// 감사로 확인·수정한 강조/전경 역할 6개 UI 사이트가 레거시 hex로 회귀하지 않는지 잠금.
test('테마 추종: 감사 수정한 강조/전경 역할 UI가 레거시 hex로 회귀 안 함 (var(--accent)/--fg)', () => {
  // 폼 입력(select/textarea) 텍스트 — fg 역할. color:#e8e6dd 0건.
  assert.strictEqual((js.match(/color:#e8e6dd/g) || []).length, 0,
    '폼 입력 텍스트색은 var(--fg) (레거시 #e8e6dd 회귀)');
  // 설정 ON 토글 — accent 역할
  assert.doesNotMatch(js, /on \? '#d4af37'/, '설정 ON 토글색은 var(--accent)');
  // 도박 결과 오버레이 — win=accent / lose=danger
  assert.doesNotMatch(js, /win \? '#d4af37'/, '도박 결과 win색은 var(--accent)');
  // 銘刻 문자 선택 보더 — 선택 강조 accent 역할
  assert.doesNotMatch(js, /isPicked \? '#d4af37'/, '銘刻 선택 보더는 var(--accent)');
  // 일언 hover — accent 역할
  assert.doesNotMatch(js, /style\.color = '#d4af37'/, '일언 hover색은 var(--accent)');
  // 시(時)분포 시계차트 — 단일 accent 데이터 시각화
  assert.doesNotMatch(js, /count > 0 \? '#d4af37'/, '시계차트 데이터색은 var(--accent)');
});

// v33 傳授 heritageOrder가 名 보스 처치 명문 전체를 포함하는지 — FUSION_PRIORITY 쌍둥이 drift 차단.
// (이전: ['단마','귀참','고','구']로 용참/제참/인참/월참/풍참/야차참 누락 → 가장 빛나는 무훈이
//  전수에서 silently 사라지던 버그. NAMED_FOES 단일 출처와 대조해 회귀 잠금.)
test('傳授: heritageOrder가 모든 名 보스 처치 명문 포함 (전수 누락 drift 차단)', () => {
  const heritageOrder = extractConst('heritageOrder');
  const NAMED_FOES = extractConst('NAMED_FOES');
  assert.ok(Array.isArray(heritageOrder), 'heritageOrder 배열 존재');
  NAMED_FOES.forEach(f => {
    assert.ok(heritageOrder.includes(f.inscription),
      '보스 명문 ' + f.inscription + '(' + f.name + ')이 heritageOrder에 누락 — 전수 silently lost');
  });
  // 특수 그림자 처치 야차참(귀참 동등 희귀)도 포함
  assert.ok(heritageOrder.includes('야차참'), '야차참 누락');
  // 우선순위 일관 — 귀참이 단마보다 앞 (NAME_SUFFIX/FUSION_PRIORITY와 동일)
  assert.ok(heritageOrder.indexOf('귀참') < heritageOrder.indexOf('단마'),
    '귀참은 단마보다 우선 (우선순위 역전 회귀)');
});

// 融劍 후 守(guardianIdx) 보정 — sealedSwords splice로 인덱스가 밀리면 수호자가 다른 道 검으로
// 조용히 뒤바뀌거나 소멸. fuseSwords가 splice 후 guardianIdx를 보정하는지 잠금.
test('融劍: fuseSwords가 splice 후 guardianIdx 보정 (수호자 스왑/소멸 차단)', () => {
  const fuse = js.match(/function fuseSwords\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(fuse, 'fuseSwords 정의 존재');
  assert.match(fuse[0], /guardianIdx/, 'fuseSwords가 guardianIdx를 보정');
  // 제거 대상이 수호자면 null, 아니면 밀린 만큼 감소
  assert.match(fuse[0], /guardianIdx\s*=\s*null/, '수호자 검 융합 시 guardianIdx=null');
});

// 봉인/전당 검 inscriptions 배열 강제 — 손상/import 검이 비배열이면 .includes/.join 크래시.
test('세이브 호환: sanitizeSword가 inscriptions 배열 강제 (sealed/enshrined import 크래시 차단)', () => {
  const san = js.match(/const sanitizeSword = \(sw\) =>\s*\{[\s\S]*?\n      \}/);
  assert.ok(san, 'sanitizeSword 헬퍼 존재');
  assert.match(san[0], /!Array\.isArray\(sw\.inscriptions\)/, 'inscriptions 비배열 보정');
});

// gameover 검명은 정규 3-arg makeSwordName(form, ins, level) — 단일 인자 호출(객체 전달) 회귀 차단.
test('makeSwordName: gameover 호출이 정규 3-arg (단일 인자 TypeError 회귀 차단)', () => {
  assert.doesNotMatch(js, /makeSwordName\(sw\)/, 'makeSwordName(sw) 단일 인자 호출 없음');
});

// ─────────────────────────────────────────────────────────────
// v372 宿敵 — 와이어링 무결성 (탄생/재등장/설욕/보정이 실제 경로에 연결됐는지)
// ─────────────────────────────────────────────────────────────
test('v372 숙적: slay 실패(비차단)에서 탄생, 성공에서 설욕 — 양쪽 훅 존재', () => {
  const body = afterDecl('function slay() {', 12000);
  const noteIdx = body.indexOf('noteNemesisDefeat(c)');
  const levelDownIdx = body.indexOf('state.level = Math.max(0, state.level - 1)');
  assert.ok(noteIdx >= 0, 'slay 실패 분기에 noteNemesisDefeat 훅');
  assert.ok(levelDownIdx >= 0 && noteIdx > levelDownIdx,
    '탄생은 검 단계가 실제로 꺾인 뒤 (보호권 차단 시 제외 — 진 것이 아니다)');
  assert.match(body, /resolveNemesisSlain\(c, finalReward\)/, 'slay 성공 분기에 설욕 훅');
});

test('v372 숙적: 재등장은 spawn 롤 통과 후 대체 (도전 총 빈도 인플레이션 없음)', () => {
  const body = afterDecl('function maybeTriggerChallenge(forced) {', 9000);
  const rollIdx = body.indexOf('Math.random() >= chance) return');
  const nemIdx = body.indexOf('nemesisReturnChance(');
  assert.ok(rollIdx >= 0 && nemIdx > rollIdx, '숙적 분기는 기존 spawn 롤 이후 (빈도 불변)');
  assert.match(body, /pendingNamedFoe\(\)/, '이름 있는 적 100% spawn이 숙적보다 우선 (기존 규칙 보존)');
  assert.match(body, /challenge\.isNemesis = true/, '도전 객체에 숙적 스냅샷 표시');
});

test('v372 숙적: normalizeState가 손상 import를 방어 (강도 cap·이름 태그 제거·원한 범위)', () => {
  const body = afterDecl('function normalizeState() {', 20000);
  assert.match(body, /state\.nemesis && typeof state\.nemesis === 'object'/, 'nemesis 형태 검증');
  assert.match(body, /n\.strength = clampInt\(n\.strength, 1, MAX_LEVEL\)/,
    '강도 cap = MAX_LEVEL (설욕 불가능 고착 방지)');
  assert.match(body, /n\.name\.replace\(\/\[<>\]\/g, ''\)/, '이름 태그 문자 제거 (v370m XSS 경계 일관)');
  assert.match(body, /state\.nemesesSlain = clampInt\(state\.nemesesSlain, 0\)/, '설욕 누적 정수 강제');
});

test('v372 숙적: 설욕 명문 존재 + 원한 표식이 render에 연결', () => {
  assert.match(js, /key: '설욕'/, 'INSCRIPTIONS에 설욕 명문 (verse 포함 — v20 규율)');
  const resolveBody = afterDecl('function resolveNemesisSlain(', 2200);
  assert.match(resolveBody, /state\.nemesis = null/, '설욕 시 원한 해소');
  assert.match(resolveBody, /grantInscription\('설욕'\)/, '설욕 명문 부여');
  const renderBody = afterDecl('function render() {', 2500);
  assert.match(renderBody, /renderNemesisMark\(\)/, 'render가 원한 표식 갱신');
  assert.ok(html.includes('id="nemesis-mark"'), '#nemesis-mark 요소 존재');
});

// ─────────────────────────────────────────────────────────────
// v373 劍塚 — 와이어링 무결성 (스냅샷/회수 확정/보정/UI가 실제 경로에 연결됐는지)
// ─────────────────────────────────────────────────────────────
test('v373 검총: 파괴 분기가 showVoid 전에 검을 스냅샷 (일생 데이터 소멸 전 매장)', () => {
  const body = afterDecl('function enhance() {', 30000);
  const fallenIdx = body.indexOf('recordFallenSword(destroyedLevel)');
  const voidIdx = body.indexOf('showVoid(destroyedLevel)');
  assert.ok(fallenIdx >= 0, '파괴 분기에 recordFallenSword 훅');
  assert.ok(voidIdx > fallenIdx, '스냅샷은 회수창보다 먼저 (currentSword 덮어쓰기 전)');
  // recentLog가 사후명을 담음 (기존: 강화도 숫자만 남던 익명 기록)
  assert.match(body, /recordEvent\('검 파괴 ' \+ fallen\.name/, '일지에 사후명 기록');
});

test('v373 검총: endVoid가 회수 결과를 무덤에 확정 + 첫 매장 마일스톤', () => {
  const body = afterDecl('function endVoid(rescued, released) {', 3200);
  assert.match(body, /grave\.rescued = !!rescued/, '회수 결과 확정 (만가의 마지막 행)');
  assert.match(body, /grave\.rescued === null/, '이중 확정 방지 가드 (null일 때만)');
  assert.match(body, /maybeMilestone\('firstGrave'/, '첫 매장 안내 (검총 발견성)');
});

test('v373 검총: normalizeState가 손상 import를 방어 (배열·레벨 cap·태그 제거·상한)', () => {
  const body = afterDecl('function normalizeState() {', 26000);
  assert.match(body, /Array\.isArray\(state\.fallenSwords\)/, 'fallenSwords 배열 보정');
  assert.match(body, /f\.level = clampInt\(f\.level, 0, MAX_LEVEL\)/, '무덤 레벨 범위 강제');
  assert.match(body, /FALLEN_TUNING\.cap/, '무덤 수 상한 강제 (import 폭주 차단)');
  assert.match(body, /f\.name = makePosthumousName\(f\.form, f\.level\)/, '오염된 사후명 결정적 재생성');
});

test('v373 검총: 모달·메뉴·핸들러 와이어링 + recordFallenSword 내부 (cap·사후명·XSS 경계)', () => {
  assert.ok(html.includes('id="graveyard-modal"'), '#graveyard-modal 존재');
  assert.ok(html.includes('id="btn-graveyard"'), '메뉴 검총 버튼 존재');
  assert.match(js, /\$\('btn-graveyard'\)\.addEventListener/, '검총 버튼 핸들러');
  const rec = afterDecl('function recordFallenSword(', 1400);
  assert.match(rec, /makePosthumousName\(/, '매장 시 사후명 부여');
  assert.match(rec, /FALLEN_TUNING\.cap/, '상한 초과 시 가장 오래된 무덤부터 잊힘');
  const rg = afterDecl('function renderGraveyard() {', 4500);
  assert.match(rg, /generateElegy\(/, '무덤마다 만가 렌더');
  assert.match(rg, /escapeHtml\(/, 'import 유래 문자열 이스케이프 (v275 XSS 경계 일관)');
});

// ─────────────────────────────────────────────────────────────
// v374 再鍊 — 와이어링 무결성 (가드/1회성/혈통 보존/UI가 실제 경로에 연결됐는지)
// ─────────────────────────────────────────────────────────────
test('v374 재련: reforgeSword 가드 4중 (동시성·검 보유·1회성·조각) + newSword 경유', () => {
  const body = afterDecl('function reforgeSword(', 2200);
  assert.match(body, /if \(challenge \|\| rescueWindow \|\| voidPending\) return/,
    '도전/회수/파괴 직후 갭 중 재련 차단 (sealSword 동시성 규율 + v368 voidPending)');
  assert.match(body, /if \(state\.hasSword\) return/, '검 보유 중 재련 차단 (융검과 동일 게이트)');
  assert.match(body, /f\.reforged\) return/, '무덤당 1회 — 혼 farming 차단');
  assert.match(body, /state\.shards < cost/, '조각 부족 가드');
  assert.match(body, /newSword\(\)/, '통합 진입점 newSword 경유 (시작 보너스 일관 — 인플레이션 없음)');
  assert.match(body, /f\.reforged = true/, '과금 후 즉시 무덤 잠금');
  assert.match(body, /reforgedFrom = f\.name/, '무덤 혈통 기록 (회고/一代記)');
});

test('v374 재련: 무덤 혈통이 봉인·殿堂 양쪽에 보존 + 명문·sanitize·boolean 강제', () => {
  // 봉인/전당 push 필드 대칭은 기존 field-set 비교 테스트가 자동 강제 — 여기선 존재만 잠금
  assert.match(js, /reforgedFrom: state\.currentSword\.reforgedFrom \|\| null/, 'push에 reforgedFrom 보존');
  assert.match(js, /key: '재련'/, 'INSCRIPTIONS에 재련 명문 (verse 포함 — v20 규율)');
  const nb = afterDecl('function normalizeState() {', 26000);
  assert.match(nb, /sw\.reforgedFrom = stripTags\(sw\.reforgedFrom\)/, '재련 혈통 태그 제거 (v370m XSS 경계)');
  assert.match(nb, /f\.reforged = f\.reforged === true/, '무덤 재련 플래그 boolean 강제 (truthy 오염 차단)');
});

test('v374 재련: 검총 UI에 버튼 렌더 + 위임 핸들러가 reforgeSword 호출', () => {
  const rg = afterDecl('function renderGraveyard() {', 4500);
  assert.match(rg, /grave-reforge-btn/, '무덤 항목에 재련 버튼 렌더');
  assert.match(rg, /reforgeCost\(f\.level\)/, '버튼 라벨 비용 = 실제 비용 (단일 진원, 하드코딩 drift 방지)');
  assert.match(js, /reforgeSword\(parseInt\(rf\.dataset\.graveIdx, 10\)\)/, '위임 핸들러 → reforgeSword');
});

// ─────────────────────────────────────────────────────────────
// v375 招影 — 그림자를 부른다 (능동 도전 · 소환 farming 인플레이션 차단)
// ─────────────────────────────────────────────────────────────
test('v375 초영: maybeTriggerChallenge(forced)는 spawn 롤만 우회 (가드·名 우선순위 보존)', () => {
  const body = afterDecl('function maybeTriggerChallenge(forced) {', 10000);
  const guardIdx = body.indexOf('if (!state.hasSword) return');
  const foeIdx = body.indexOf('pendingNamedFoe()');
  const rollIdx = body.indexOf('!forced && Math.random() >= chance) return');
  assert.ok(guardIdx >= 0, '검 보유 가드는 forced에도 유효');
  assert.ok(foeIdx > guardIdx, '名 100% spawn이 소환보다 우선 (기존 규칙 보존)');
  assert.ok(rollIdx > foeIdx, 'forced는 spawn 롤만 우회');
  assert.match(body, /forced \? summonNemesisChance\(nem\.wins\) : nemesisReturnChance\(nem\.wins\)/,
    '소환 시 숙적 응답 bias (원한은 향을 맡는다 — 설욕의 능동 추구)');
  // 전리품 절반은 모든 배수 캐스케이드 *이후* (반토막이 다시 배수로 부풀지 않게)
  const weekendIdx = body.indexOf('weekendChallengeMul');
  const halfIdx = body.indexOf('SUMMON_TUNING.rewardMul');
  assert.ok(weekendIdx >= 0 && halfIdx > weekendIdx, '절반 적용은 배수 캐스케이드 마지막');
  assert.match(body, /challenge\.summoned = true/, '소환 표식 (도전 화면 안내용)');
});

test('v375 초영: 레시피 가드·표시·통계·도전 화면 안내 와이어링', () => {
  assert.ok(html.includes('data-recipe="summon"'), '조합소 초영 레시피 HTML 존재');
  assert.match(js, /summon:\s*\{[\s\S]{0,500}?check: \(\) => state\.hasSword && state\.level >= CHALLENGE_MIN_LEVEL && !challenge && !rescueWindow/,
    '레시피 가드 4중 (검 보유·최소 강화·도전/회수 중 차단)');
  assert.match(js, /bumpStat\('summoned'\)/, '초영 통계 집계');
  assert.match(js, /maybeTriggerChallenge\(true\)/, '소환 강제 트리거');
  assert.match(js, /challenge\.summoned\s*\n?\s*\?/, '도전 화면에 전리품 절반 안내 (결정 전 명시)');
  const ds = js.match(/const DEFAULT_STATS = \{[^}]*\}/);
  assert.ok(ds && /summoned: 0/.test(ds[0]), 'DEFAULT_STATS에 summoned 병합 기본값 (구 저장본 보정)');
});

// ─────────────────────────────────────────────────────────────
// v376 誓約 — 와이어링 무결성 (위반 훅 5곳·기록 보존·UI가 실제 경로에 연결됐는지)
// ─────────────────────────────────────────────────────────────
test('v376 서약: 위반 훅 5곳 — 방지권/숫돌/영석/도망/대치/조기 매각', () => {
  // 무방 — 방지권 실제 소모 지점 (armed가 아니라 consumed)
  assert.match(js, /state\.protections -= pCost;[^\n]*breakOath\('nofallback'\)/, '무방 — 방지권 소모 시');
  // 맨손 — 숫돌·영석 소모 지점 2곳
  const nostoneHooks = (js.match(/breakOath\('nostone'\)/g) || []).length;
  assert.strictEqual(nostoneHooks, 2, '맨손 — 숫돌+영석 소모 2곳 (현재 ' + nostoneHooks + ')');
  // 불퇴 — 도망과 대치 양쪽 (대치도 물러섬)
  const fleeBody = afterDecl('function flee() {', 1200);
  assert.match(fleeBody, /breakOath\('noflee'\)/, '불퇴 — flee');
  const stBody = afterDecl('function stalemate() {', 1200);
  assert.match(stBody, /breakOath\('noflee'\)/, '불퇴 — stalemate');
  // 일도 — v388 감사로 위치 이동: 매각 *확정* 시점(doSeal)에서만 파계 (askName 취소 시 파계 없음),
  // 새겨진 파계를 봉인 기록(ins)에도 반영. sealSword에는 상태 변경이 없어야 한다.
  const sealBody = afterDecl('function sealSword() {', 1200);
  assert.ok(sealBody.indexOf("breakOath('wayonly')") < 0, '일도 — sealSword(모달 진입 전)에서 파계 금지 (취소 가능 지점)');
  const dsB = afterDecl('function doSeal(', 1000);
  const brkIdx = dsB.indexOf("breakOath('wayonly')");
  assert.ok(brkIdx >= 0, '일도 — 파계는 doSeal(확정 시점)');
  assert.match(dsB, /lv < MAX_LEVEL\) \{/, '일도 — 도 도달 매각은 위반 아님');
  assert.match(dsB, /ins\.push\('파계'\)/, '새겨진 파계를 봉인 기록(ins)에 반영');
});

test('v376 서약: 기록 보존 (봉인·殿堂·무덤) + 지킴 통계 + sanitize', () => {
  const oathPushes = (js.match(/oath: state\.currentSword\.oath \|\| null/g) || []).length;
  assert.strictEqual(oathPushes, 2, '봉인·殿堂 양쪽 push에 oath 보존 (field-set 대칭 테스트와 이중 잠금)');
  const rec = afterDecl('function recordFallenSword(', 1600);
  assert.match(rec, /oath: cs\.oath \?/, '무덤에도 맹세 보존 (만가의 맹세 행)');
  const dsBody = afterDecl('function doSeal(', 3000);
  assert.match(dsBody, /oath && !state\.currentSword\.oath\.broken\) bumpStat\('oathsKept'\)/, '파계 없는 봉인 = 지킨 맹세');
  const nb = afterDecl('function normalizeState() {', 30000);
  assert.match(nb, /sw\.oath\.name = \(typeof sw\.oath\.name === 'string'\) \? stripTags\(sw\.oath\.name\)/, 'oath.name 태그 제거 (v370m)');
  assert.match(nb, /f\.oath\.broken = f\.oath\.broken === true/, '무덤 oath.broken boolean 강제');
  const ds = js.match(/const DEFAULT_STATS = \{[^}]*\}/);
  assert.ok(ds && /oathsSworn: 0/.test(ds[0]) && /oathsKept: 0/.test(ds[0]) && /oathsBroken: 0/.test(ds[0]),
    'DEFAULT_STATS에 서약 3종 병합 기본값');
});

test('v376 서약: 명문·UI·시한 와이어링', () => {
  assert.match(js, /key: '서약'/, 'INSCRIPTIONS 서약 (verse 포함 — v20 규율)');
  assert.match(js, /key: '파계'/, 'INSCRIPTIONS 파계');
  const sw = afterDecl('function swearOath(', 1200);
  assert.match(sw, /grantInscription\('서약'\)/, '맹세 시 서약 명문');
  const bo = afterDecl('function breakOath(', 900);
  assert.match(bo, /grantInscription\('파계'\)/, '위반 시 파계 명문');
  const cs = afterDecl('function canSwearOath() {', 500);
  assert.match(cs, /OATH_MAX_ATTEMPTS/, '맹세 시한 — 늦은 맹세는 맹세가 아니다');
  assert.match(cs, /!challenge && !rescueWindow/, '도전/회수 중 맹세 차단 (동시성 규율)');
  assert.ok(html.includes('id="btn-oath"'), '#btn-oath 존재');
  assert.ok(html.includes('id="oath-modal"'), '#oath-modal 존재');
  const renderBody = afterDecl('function render() {', 3000);
  assert.match(renderBody, /renderOathButton\(\)/, 'render가 맹세 버튼/상태 갱신');
  assert.match(js, /swearOath\(item\.dataset\.oath\)/, '계율 선택 위임 핸들러');
});

// ─────────────────────────────────────────────────────────────
// v377 影史 — 와이어링 무결성 (설욕록 캡처 순서·도감 커버리지·상성 단일 진원)
// ─────────────────────────────────────────────────────────────
test('v377 설욕록: 아카이브 push는 state.nemesis 소거 *전* (origin/strength 소실 방지)', () => {
  const body = afterDecl('function resolveNemesisSlain(', 2200);
  const pushIdx = body.indexOf('state.nemesesArchive.push(');
  const nullIdx = body.indexOf('state.nemesis = null');
  assert.ok(pushIdx >= 0, '설욕록 push 훅');
  assert.ok(nullIdx > pushIdx, '캡처는 원한 해소보다 먼저 (nem.origin/strength가 null 이후엔 소실)');
  assert.match(body, /NEMESIS_TUNING\.archiveCap/, '설욕록 cap 강제 (오래된 것부터 잊힘)');
});

test('v377 영사: 도감이 그림자 세계 5부를 모두 커버 + 종 목록은 배열 순회 (신규 변종 자동 포함)', () => {
  const body = afterDecl('function renderShadowLore() {', 7000);
  assert.match(body, /SHADOW_TYPES\.map\(/, '종 목록은 SHADOW_TYPES 직접 순회 — 새 변종 추가 시 도감 자동 갱신');
  assert.match(body, /yakshaSlain/, '야차 (밤 한정 별종) 포함');
  assert.match(body, /ORIGIN_KEYS\.map\(/, '학파 4종 순회');
  assert.match(body, /NAMED_FOES\.filter\(/, '名 처치 진척 요약');
  assert.match(body, /FORM_AFFINITY/, '형상극 상성 전역 공개 (도감의 보상 = 지식)');
  // 상성 배수는 상수 보간 — 하드코딩 ×1.25/×0.85가 AFFINITY_*_MUL과 drift하는 것 차단 (v349 규율)
  assert.match(body, /AFFINITY_FAVORED_MUL/, '강함 배수 상수 보간');
  assert.match(body, /AFFINITY_WEAKNESS_MUL/, '약함 배수 상수 보간');
  assert.doesNotMatch(body, /×1\.25|×0\.85/, '상성 배수 하드코딩 없음');
  assert.match(body, /nemesesArchive/, '설욕록 표시');
  assert.match(body, /escapeHtml\(/, 'import 유래 이름 이스케이프 (v275 규율)');
});

test('v377 영사: 모달·메뉴·정규화 와이어링', () => {
  assert.ok(html.includes('id="shadowlore-modal"'), '#shadowlore-modal 존재');
  assert.ok(html.includes('id="btn-shadowlore"'), '메뉴 영사 버튼 존재');
  assert.match(js, /\$\('btn-shadowlore'\)\.addEventListener/, '영사 버튼 핸들러');
  const nb = afterDecl('function normalizeState() {', 34000);
  assert.match(nb, /Array\.isArray\(state\.nemesesArchive\)/, '설욕록 배열 보정');
  assert.match(nb, /a\.strength = clampInt\(a\.strength, 1, MAX_LEVEL\)/, '설욕록 강도 범위 강제');
  assert.match(nb, /a\.name = makeNemesisName\(a\.origin, a\.typeKey\)/, '오염된 이름 결정적 재생성');
});

// ─────────────────────────────────────────────────────────────
// v378 放下 — 와이어링 무결성 (5초 침묵의 세 번째 길)
// ─────────────────────────────────────────────────────────────
test('v378 방하: rescueWindow.release — 잠금·타이머 정리·장송·endVoid(false, true)', () => {
  const body = afterDecl('function showVoid(', 6500);
  const releaseIdx = body.indexOf('release: () => {');
  assert.ok(releaseIdx >= 0, 'rescueWindow에 release 경로 (줍기/도박/방하 3길)');
  const rel = body.slice(releaseIdx, releaseIdx + 1400);
  assert.match(rel, /if \(rescued\) return/, 'rescue·gamble과 동일 플래그로 더블클릭/경합 잠금');
  assert.match(rel, /clearInterval\(tickInterval\)/, '틱 타이머 정리');
  assert.match(rel, /clearTimeout\(failTimeout\)/, '안전망 타이머 정리');
  assert.match(rel, /playSwordSignature\(/, '장송 — 부러진 검이 제 소리로 작별 (v229 재활용)');
  assert.match(rel, /endVoid\(false, true\)/, '조각 미회수 + 방하 표식으로 종료');
  assert.doesNotMatch(rel, /state\.shards \+=/, '방하는 보상 0 — 그것이 이 길의 전부');
});

test('v378 방하: endVoid — 의식적 놓아줌은 회수 실패가 아니다 (통계·위로·무덤 분리)', () => {
  const body = afterDecl('function endVoid(rescued, released) {', 3200);
  assert.match(body, /if \(!rescued && !released\) \{/, 'rescueFailed·慰는 무위 실패에만 (방하 제외 가드)');
  const failIdx = body.indexOf('bumpStat(\'rescueFailed\')');
  const relBranchIdx = body.indexOf('} else if (released) {');
  assert.ok(failIdx >= 0 && relBranchIdx > failIdx, '방하 전용 분기 (장 페이드) 존재');
  assert.match(body, /if \(released\) grave\.released = true/, '무덤에 후장(厚葬) 기록');
});

test('v378 방하: UI·통계·정규화 와이어링', () => {
  assert.ok(html.includes('id="rescue-release"'), '#rescue-release 버튼 존재 (회수창 3번째 선택지)');
  assert.match(js, /rescueWindow && rescueWindow\.release\) rescueWindow\.release\(\)/, '방하 클릭 핸들러');
  assert.match(js, /bumpStat\('released'\)/, '방하 통계 집계');
  const ds = js.match(/const DEFAULT_STATS = \{[^}]*\}/);
  assert.ok(ds && /released: 0/.test(ds[0]), 'DEFAULT_STATS에 released 병합 기본값');
  const nb = afterDecl('function normalizeState() {', 34000);
  assert.match(nb, /f\.released = f\.released === true/, '무덤 후장 플래그 boolean 강제');
  // 검총 목록에서 후장이 전손보다 우선 표시 (released 무덤은 rescued=false이기도 하므로)
  const rg = afterDecl('function renderGraveyard() {', 5000);
  const relIdx = rg.indexOf("f.released === true ? ' · 후장'");
  const lostIdx = rg.indexOf("' · 전손'");
  assert.ok(relIdx >= 0 && lostIdx > relIdx, '후장 분기가 전손보다 먼저');
});

// ─────────────────────────────────────────────────────────────
// v379 走馬燈 — 와이어링 무결성 (침묵의 5초에 일생이 흐르는지)
// ─────────────────────────────────────────────────────────────
test('v379 주마등: showVoid가 방금 매장된 무덤으로만 발동 + endVoid 정리', () => {
  const body = afterDecl('function showVoid(', 8000);
  assert.match(body, /flashGrave && flashGrave\.rescued === null\) spawnLifeFlashes\(flashGrave, totalSec\)/,
    '이 파괴로 매장된 무덤(rescued 미확정)일 때만 발동');
  const endBody = afterDecl('function endVoid(rescued, released) {', 3400);
  assert.match(endBody, /clearLifeFlashes\(\)/, '조기 종료(회수/도박/방하) 시 예약 조각 정리');
});

test('v379 주마등: 설정 존중·창 닫힘 가드·용량 제한·사후명 보존', () => {
  const body = afterDecl('function spawnLifeFlashes(', 2600);
  assert.match(body, /getSetting\('reduceMotion'\)\) return/, 'v228 設 모션 감소 존중');
  assert.match(body, /if \(!rescueWindow\) return/, '창이 닫힌 뒤 예약분 실행 차단');
  assert.match(body, /frags\.slice\(0, maxN - 1\)\.concat\(frags\[frags\.length - 1\]\)/,
    '윈도우 길이 초과 시 잘라도 사후명(마지막)은 유지');
  // v380 — 좌우 측면 사다리 (중앙 세로축의 원·카운트다운·버튼과 겹침 구조적 차단, 결정적 배치)
  assert.match(body, /min\(150px, 36%\)/, '좌우 측면 사다리 배치 — 중앙 축 비움 (겹침 제보 수정)');
  assert.match(body, /i % 2/, '좌우 교대 결정적 배치 (Math.random 배치 아님)');
  assert.doesNotMatch(body, /137\.5/, '타원 궤도(중앙 침범 위험) 제거됨');
  const clearBody = afterDecl('function clearLifeFlashes() {', 400);
  assert.match(clearBody, /querySelectorAll\('\.life-flash'\)/, '잔여 DOM 조각 제거');
  assert.match(clearBody, /clearTimeout/, '예약 타이머 해제');
  assert.ok(html.includes('.life-flash'), '.life-flash 기반 CSS 존재');
});

// ─────────────────────────────────────────────────────────────
// v380 corner-stack — 우상단 마커 겹침 구조적 차단 (좌표 손배치 → flex 스택)
// ─────────────────────────────────────────────────────────────
test('v380 corner-stack: 우상단 마커 전원이 스택 안 + fixed 좌표 손배치 잔존 없음', () => {
  // 겹침의 근원: way-counter(right:60)가 weather(90)/solar(110)를 덮고,
  // nemesis-mark와 path-progress가 정확히 같은 좌표(top:68/right:18)에 겹치던 손배치.
  const stackM = html.match(/<div id="corner-stack">[\s\S]*?\n<\/div>/);
  assert.ok(stackM, '#corner-stack 컨테이너 존재');
  const CORNER_IDS = ['solar-term-mark', 'weather-mark', 'tod-mark', 'season-mark',
    'era-mark', 'gen-mark', 'way-counter', 'path-progress', 'nemesis-mark'];
  CORNER_IDS.forEach(id => {
    assert.ok(stackM[0].includes('id="' + id + '"'), id + '가 corner-stack 안에 배치');
    // CSS에서 개별 fixed 좌표가 재유입되면 스택과 이중 배치 → 겹침 재발
    const cssM = html.match(new RegExp('#' + id + '\\s*\\{[^}]*\\}'));
    assert.ok(cssM, '#' + id + ' CSS 존재');
    assert.doesNotMatch(cssM[0], /position:\s*fixed/, '#' + id + ' fixed 좌표 손배치 잔존 (겹침 재발 위험)');
  });
  assert.match(html, /#corner-stack \{[^}]*flex-direction: column/, '스택은 세로 flex (배치는 컨테이너가 관리)');
  // 도혼 속삭임은 스택 아래로 (top:80 시절 마커 행과 겹치던 것)
  const whisperCss = html.match(/#ancestor-whisper \{[^}]*\}/);
  assert.ok(whisperCss && /top:\s*150px/.test(whisperCss[0]), 'ancestor-whisper는 스택 아래 (150px)');
  // 회수창 버튼 좌우 배치 — 세로 쌓기(-134px)가 스테이지 아래 UI와 겹치던 것
  const gambleCss = html.match(/#rescue-gamble \{[^}]*\}/);
  const releaseCss = html.match(/#rescue-release \{[^}]*\}/);
  assert.ok(gambleCss && /calc\(50% - 72px\)/.test(gambleCss[0]), '도박 버튼 좌측 나란히');
  assert.ok(releaseCss && /calc\(50% \+ 72px\)/.test(releaseCss[0]) && /bottom: -78px/.test(releaseCss[0]),
    '방하 버튼 우측 나란히 (같은 띠 — 아래 UI 침범 없음)');
});

// ─────────────────────────────────────────────────────────────
// v381 劍傳 — 족자 내보내기 와이어링 (일생 전 층위 결합·XSS 경계·다운로드)
// ─────────────────────────────────────────────────────────────
test('v381 검전: 족자 빌더가 검 일생의 전 층위를 결합 + XSS 경계', () => {
  const body = afterDecl('function buildScrollSVG(', 7000);
  // 세션에 걸쳐 쌓인 정체성 층위가 족자에 전부 결합되는지 (한 층위라도 빠지면 서사 유실)
  ['escapeHtml(', 'wrapText(', 'generateBiography(', 'generateLastWords(',
   'deriveTemperament(', 'deriveNaturePath(', 'buildSwordBody(', 'getPrimaryKanji(']
    .forEach(fn => assert.ok(body.includes(fn), '족자가 ' + fn + ' 결합'));
  assert.match(body, /s\.verse/, '일생시(도 검) 포함');
  assert.match(body, /s\.oath/, '서약 운명(v376) 포함');
  assert.match(body, /levelHistory/, '강화도 궤적(v51) 포함');
  assert.match(body, /reforgedFrom/, '재련 혈통(v374) 포함');
  assert.match(body, /fusedFrom/, '융합 혈통(v92) 포함');
  // 이름·서사는 escapeHtml 경유 (import 유래 검명이 SVG 마크업 주입되는 것 차단)
  assert.match(body, /escapeHtml\(name\)/, '검명 이스케이프 (v275/v370m 규율)');
});

test('v381 검전: 회고 모달 스태시·버튼·다운로드 와이어링', () => {
  const sd = afterDecl('function showSwordDetail(', 400);
  assert.match(sd, /lastDetailSword = s/, '회고 모달이 보고 있는 검을 스태시 (족자 버튼용)');
  assert.ok(html.includes('id="btn-export-scroll"'), '회고 모달에 족자 저장 버튼');
  assert.match(js, /exportSwordScroll\(lastDetailSword\)/, '버튼 → 족자 내보내기');
  const ex = afterDecl('function exportSwordScroll(', 1400);
  assert.match(ex, /image\/svg\+xml/, 'SVG Blob 다운로드 (v77 패턴)');
  assert.match(ex, /revokeObjectURL/, 'Blob URL 정리 (누수 방지)');
  assert.match(ex, /try \{/, '실패 안전 (족자 생성 오류가 게임을 깨지 않음)');
});

// ─────────────────────────────────────────────────────────────
// v382 天秤 — 와이어링 무결성 (굴림 지점·보존·표시가 실제 경로에 연결됐는지)
// ─────────────────────────────────────────────────────────────
test('v382 천칭: 원장은 실제 굴림과 같은 확률·같은 판정으로 기록', () => {
  const body = afterDecl('function enhance() {', 30000);
  const recIdx = body.indexOf('recordLuck(successChance, roll < successChance)');
  const branchIdx = body.indexOf('if (roll < successChance) {');
  assert.ok(recIdx >= 0, '굴림 직후 원장 기록 (단일 진원 successChance — 표시≠실제 드리프트 불가)');
  assert.ok(branchIdx > recIdx, '기록은 성공 분기 진입 전 (분기 내 조기 return에도 누락 없음)');
});

test('v382 천칭: 원장 보존 (봉인·殿堂·무덤) + 숫자 강제 + DEFAULT_STATS', () => {
  const pushes = (js.match(/luckExp: state\.currentSword\.luckExp \|\| 0/g) || []).length;
  assert.strictEqual(pushes, 2, '봉인·殿堂 양쪽 push에 원장 보존 (field-set 대칭과 이중 잠금)');
  const rec = afterDecl('function recordFallenSword(', 1800);
  assert.match(rec, /luckExp: cs\.luckExp \|\| 0/, '무덤에도 운 결산 보존 (만가)');
  const nb = afterDecl('function normalizeState() {', 40000);
  assert.match(nb, /typeof sw\.luckExp !== 'number' \|\| !isFinite\(sw\.luckExp\)/, '검 원장 숫자 강제 (문자열 오염 → + 연산 붕괴 방지)');
  assert.match(nb, /typeof state\.stats\.luckExp !== 'number'/, '평생 원장 숫자 강제');
  const ds = js.match(/const DEFAULT_STATS = \{[^}]*\}/);
  assert.ok(ds && /luckExp: 0/.test(ds[0]) && /luckAct: 0/.test(ds[0]), 'DEFAULT_STATS 병합 기본값');
});

test('v382 천칭: 표시 결합 — 記錄·회고·족자·페르소나', () => {
  const rs = js.match(/function renderStats\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(rs && rs[0].includes('luckDelta(s)'), '記錄 모달 평생 운 행');
  assert.match(js, /천칭 — ' \+ \(ld >= 0 \? '\+' : ''\)/, '회고/족자 운 결산 표시');
  const scroll = afterDecl('function buildScrollSVG(', 8000);
  assert.match(scroll, /luckWord\(ld\)\.word/, '족자에도 운 결산 (v381 전 층위 결합 규율)');
  const gp = js.match(/function getPersonas\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(gp && /천행/.test(gp[0]) && /역풍/.test(gp[0]), '천행/역풍 페르소나 (±5 임계)');
});

// ─────────────────────────────────────────────────────────────
// v383 꺾임의 儀式 — 와이어링 무결성 (패배 의식·숙적 결합·승리 컷씬 격리)
// ─────────────────────────────────────────────────────────────
test('v383 꺾임: slay 실패 분기 — 통계·숙적 반환값·의식이 순서대로 연결', () => {
  const body = afterDecl('function slay() {', 14000);
  const levelDownIdx = body.indexOf('state.level = Math.max(0, state.level - 1)');
  const defeatStatIdx = body.indexOf("bumpStat('defeats')");
  const noteIdx = body.indexOf('const nemInfo = noteNemesisDefeat(c)');
  const ritualIdx = body.indexOf('showDefeatRitual(c, nemInfo)');
  assert.ok(levelDownIdx >= 0 && defeatStatIdx > levelDownIdx, '꺾임 통계는 실제 단계 하락 후');
  assert.ok(noteIdx > defeatStatIdx && ritualIdx > noteIdx, '숙적 판정 반환값 → 의식 메시지 결합 순서');
});

test('v383 꺾임: noteNemesisDefeat 반환 계약 (birth/deepen/null) + 의식 오버레이 재활용', () => {
  const nb = afterDecl('function noteNemesisDefeat(', 2200);
  assert.match(nb, /return \{ kind: 'deepen', name: n\.name, wins: n\.wins \}/, '심화 반환');
  assert.match(nb, /return \{ kind: 'birth', name: state\.nemesis\.name \}/, '탄생 반환');
  assert.match(nb, /if \(!c \|\| !c\.type\) return null/, '무효 입력 null');
  const sr = afterDecl('function showDefeatRitual(', 1200);
  assert.match(sr, /demon-slay-overlay/, '승리 컷씬 오버레이 재활용 (v49/v90/v372 패턴)');
  assert.match(sr, /classList\.add\('defeat'\)/, '패배 변형 클래스');
  assert.match(sr, /SFX\.defeat\(\)/, '꺾임 효과음');
  assert.ok(html.includes('#demon-slay-overlay.defeat #demon-slay-kanji'), '패배 변형 CSS (핏빛 반전)');
});

test('v383 꺾임: 승리 컷씬 3처가 패배 변형을 방어적으로 해제 + 통계 병합', () => {
  const clears = (js.match(/dso\.classList\.remove\('defeat'\)/g) || []).length;
  assert.ok(clears >= 3, '설욕/귀참/名 승리 컷씬이 defeat 클래스 해제 (현재 ' + clears + '처) — 붉은 승리 컷씬 방지');
  const ds = js.match(/const DEFAULT_STATS = \{[^}]*\}/);
  assert.ok(ds && /defeats: 0/.test(ds[0]), 'DEFAULT_STATS에 defeats 병합 기본값');
  assert.match(js, /SFX\.defeat\b/, 'SFX 카탈로그에 defeat 존재');
});

// ─────────────────────────────────────────────────────────────
// v384 劫 — 와이어링 무결성 (커밋 지점·표시·방어)
// ─────────────────────────────────────────────────────────────
test('v384 겁: 아카이브 커밋은 재시작 시 1회 — newSword 전 (첫 검은 새 겁의 것)', () => {
  const rb = afterDecl('function restartFromGameOver() {', 1200);
  const archIdx = rb.indexOf('archiveEra()');
  const newIdx = rb.indexOf('newSword()');
  assert.ok(archIdx >= 0 && newIdx > archIdx, '재시작 → 매장 → 새 검 순서');
  const ab = afterDecl('function archiveEra() {', 900);
  assert.match(ab, /ERA_TUNING\.cap/, '겁 수 상한 (오래된 시대부터 잊힘)');
  assert.match(ab, /state\.eraStart = eraSnapshot\(\)/, '매장 직후 새 겁 개막 스냅샷');
  // showGameOver는 표시만 (커밋 없음 — 새로고침 이중 아카이브 방지). 슬라이스를 함수 경계에서 절단.
  let gb = afterDecl('function showGameOver() {', 3200);
  const gbEnd = gb.indexOf('function restartFromGameOver');
  if (gbEnd >= 0) gb = gb.slice(0, gbEnd);
  assert.match(gb, /currentEraSummary\(\)/, '게임오버 화면에 저무는 겁 요약');
  assert.doesNotMatch(gb, /archiveEra\(\)/, '표시 지점에서 커밋 금지 (이중 아카이브 방지)');
});

test('v384 겁: 표시·방어 와이어링', () => {
  assert.ok(html.includes('id="gameover-era"'), '게임오버 겁 표시 요소');
  const rs = js.match(/function renderStats\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(rs && rs[0].includes('겁 의  연 대 기') && rs[0].includes('describeEra(e)'), '記錄 모달 연대기 섹션');
  const nb = afterDecl('function normalizeState() {', 44000);
  assert.match(nb, /Array\.isArray\(state\.eras\)/, '연대기 배열 보정');
  assert.match(nb, /try \{ state\.eraStart = eraSnapshot\(\); \} catch/, '개막 스냅샷 — sandbox 안전 내부 try');
});

// ─────────────────────────────────────────────────────────────
// v385 劍士傳 — 대장장이 족자 와이어링 (단일 진원 수집·XSS·다운로드)
// ─────────────────────────────────────────────────────────────
test('v385 검사전: 수집은 단일 진원 헬퍼로 + 세션 전 층위 결합', () => {
  const cb = afterDecl('function collectSmithData() {', 2400);
  assert.match(cb, /allSealedSwords\(\)/, '계보는 봉인+전당 단일 진원 순회 (v350류 누락 방지)');
  assert.match(cb, /getPersonas\(\)/, '페르소나');
  assert.match(cb, /getActiveSchools\(\)/, '유파');
  assert.match(cb, /generatePlayerTitle\(\)/, '호(v141)');
  assert.match(cb, /collectionHighlight\(/, '대표검 (v250 재사용)');
  assert.match(cb, /state\.nemesesSlain/, '설욕(v372) 결합');
  assert.match(cb, /oathsKept/, '서약(v376) 결합');
  assert.match(cb, /luckAct/, '천칭(v382) 결합');
  assert.match(cb, /state\.eras/, '겁 연대기(v384) 결합');
});

test('v385 검사전: 렌더·메뉴·다운로드 와이어링 + XSS 경계', () => {
  const sb = afterDecl('function buildSmithScrollSVG() {', 4500);
  assert.match(sb, /buildSmithScrollLines\(/, '순수 조립부 경유 (조립 로직 테스트 가능)');
  assert.match(sb, /wrapText\(/, '장문 줄바꿈 (v381 재사용)');
  assert.match(sb, /escapeHtml\(/, '텍스트 이스케이프 (import 유래 검명 SVG 주입 차단)');
  assert.ok(html.includes('id="btn-export-smith"'), '메뉴 검사전 버튼');
  assert.match(js, /\$\('btn-export-smith'\)\.addEventListener/, '버튼 핸들러');
  const ex = afterDecl('function exportSmithScroll() {', 1400);
  assert.match(ex, /image\/svg\+xml/, 'SVG Blob 다운로드');
  assert.match(ex, /revokeObjectURL/, 'URL 정리');
  assert.match(ex, /try \{/, '실패 안전');
});

// ─────────────────────────────────────────────────────────────
// v386 九死一生 — 와이어링 무결성 (실제 굴림 결합·보존·표시)
// ─────────────────────────────────────────────────────────────
test('v386 생사 원장: 실패 4분기(열반/파괴/하락/유지) 전부 기록 — 누락 없는 저울', () => {
  const body = afterDecl('function enhance() {', 34000);
  assert.match(body, /const deathPossible = useProtect \? 0 : effectiveDestroy/,
    '기대는 실제 굴림과 같은 effectiveDestroy (보호권 armed면 0 — 걸리지 않은 판)');
  const ledgerCalls = (body.match(/recordDeathLedger\(deathPossible, (true|false)\)/g) || []);
  assert.strictEqual(ledgerCalls.length, 4, '열반·파괴·하락·유지 4분기 전부 기록 (현재 ' + ledgerCalls.length + ') — 한 분기라도 빠지면 저울이 기움');
  assert.strictEqual(ledgerCalls.filter(c => c.includes('true')).length, 1, '실제 죽음은 파괴 분기 하나뿐');
  const nearCalls = (body.match(/checkNearMiss\(deathPossible, failRoll\)/g) || []).length;
  assert.strictEqual(nearCalls, 2, '구사일생 판정은 생존 2분기(하락/유지)에서');
});

test('v386 생사 원장: closestCall 보존 3처 + 숫자 방어 + 표시 결합', () => {
  const pushes = (js.match(/closestCall: \(typeof state\.currentSword\.closestCall === 'number'\)/g) || []).length;
  assert.strictEqual(pushes, 2, '봉인·殿堂 push 보존 (field-set 대칭과 이중 잠금)');
  const rec = afterDecl('function recordFallenSword(', 2200);
  assert.match(rec, /closestCall: \(typeof cs\.closestCall === 'number'\)/, '무덤에도 생환 기억 보존');
  const nb = afterDecl('function normalizeState() {', 48000);
  assert.match(nb, /sw\.closestCall != null && \(typeof sw\.closestCall !== 'number'/, '검 closestCall 범위 강제');
  assert.match(nb, /typeof state\.stats\.destExp !== 'number'/, '평생 생사 원장 숫자 강제');
  const ds = js.match(/const DEFAULT_STATS = \{[^}]*\}/);
  assert.ok(ds && /destExp: 0/.test(ds[0]) && /nearMisses: 0/.test(ds[0]), 'DEFAULT_STATS 병합 기본값');
  // 표시 — 記錄 파괴 천칭 + 검전/검사전 족자 결합 (v381 전 층위 규율)
  const rs = js.match(/function renderStats\(\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(rs && rs[0].includes('deathLedgerWord(dd)'), '記錄 파괴 천칭 행');
  const scroll = afterDecl('function buildScrollSVG(', 9000);
  assert.match(scroll, /s\.closestCall/, '검전 족자에 구사일생 (전 층위 규율)');
  const smith = afterDecl('function buildSmithScrollLines(', 3200);
  assert.match(smith, /deathLedgerWord\(d\.deathDelta\)/, '검사전에 파괴 천칭');
  assert.match(smith, /구사일생 ' \+ d\.nearMisses/, '검사전 무훈에 구사일생');
});

// ─────────────────────────────────────────────────────────────
// v387 簡 — 간결 모드 (사용자 제보 「너무 복잡」 대응: 숨김이지 삭제가 아님)
// ─────────────────────────────────────────────────────────────
test('v387 간결: 설정 기본값 ON + applySettings 연결', () => {
  assert.match(js, /key:\s*'simpleMode'[^}]*def:\s*true/, '간결 모드 설정 존재 + 기본값 ON');
  const ab = afterDecl('function applySettings() {', 400);
  assert.match(ab, /classList\.toggle\('simple-mode', getSetting\('simpleMode'\) === true\)/, 'body 클래스 토글 (=== true — truthy 문자열 방어, v388)');
});

test('v387 간결: 결정 표면은 숨기되 드라마·본질은 남긴다', () => {
  const cssM = html.match(/\/\* v387 簡[\s\S]*?body\.simple-mode #menu-drop[\s\S]*?\{ display: none; \}/);
  assert.ok(cssM, '간결 모드 CSS 블록 존재');
  const css = cssM[0];
  // 고급 결정 UI 숨김 (inline display 이기려면 !important)
  ['#resolve-row', '#btn-oath', '#destiny-banner', '#guardian-display', '#current-chart']
    .forEach(sel => assert.ok(css.includes('body.simple-mode ' + sel), sel + ' 숨김'));
  // #stone-row 는 v400 에서 조건부로 이관 — 기본(도구 0개)은 여전히 숨김이되,
  // 조합소가 파는 물건을 지니면 드러난다 (「살 수는 있는데 쓸 수 없는」 함정 차단).
  assert.ok(css.includes('body.simple-mode:not(.has-stones) #stone-row'), '#stone-row 조건부 숨김');
  assert.match(css, /display: none !important/, 'inline display를 이기는 !important');
  // 본질·드라마는 절대 숨기지 않는다 — 강화/팔기/회수/도전/컷씬/의식
  ['#btn-enhance', '#btn-seal-direct', '#void', '#challenge', '#rescue-circle', '#rescue-release',
   '#demon-slay-overlay', '.life-flash', '#nemesis-mark', '#btn-fusion']
    .forEach(sel => assert.ok(!css.includes(sel + ',') && !css.includes(sel + ' {') && !css.includes(sel + '\n'),
      sel + '은 간결 모드에서도 보임 (본질/드라마)'));
  assert.match(css, /#menu-drop button:not\(\.menu-core\)/, '메뉴는 핵심만');
});

// ─────────────────────────────────────────────────────────────
// v388 감사 — 세션 결함 수정 잠금 (재발 방지)
// ─────────────────────────────────────────────────────────────
test('v388 감사: 파괴~회수창 갭(voidPending) 유출 차단 — 강화/새검/융검/봉인/재진입', () => {
  const eb = afterDecl('function enhance() {', 200);
  assert.match(eb, /if \(voidPending\) return/, 'enhance — 갭 중 강화 차단 (Space auto-repeat 유출)');
  assert.match(js, /if \(voidPending \|\| rescueWindow\) return;[^\n]*\n\s*if \(btnEnhance\.dataset\.mode === 'newsword'\)/,
    '버튼 — 갭 중 새 검 구매 차단 (조각 유출)');
  const fb = afterDecl('function fuseSwords() {', 250);
  assert.match(fb, /challenge \|\| rescueWindow \|\| voidPending\) return/, '융검 — 갭/회수창 중 차단');
  const sb = afterDecl('function sealSword() {', 200);
  assert.match(sb, /if \(voidPending\) return/, '봉인 — 갭 중 차단');
  const vb = afterDecl('function showVoid(', 300);
  assert.match(vb, /if \(rescueWindow\) return/, '회수창 재진입 차단 (고아 타이머 → endVoid 이중 실행 방지)');
});

test('v388 감사: 초영 환급·컷씬 공유 타이머·꺾임 2.5s 정렬·간결 상태 중화', () => {
  // 초영 — 450ms 사이 상태 어긋남 시 단일 진원 비용으로 환급 (무고지 조각 소실 방지)
  assert.match(js, /state\.shards \+= recipes\.summon\.cost/, '초영 환급 (비용 단일 진원)');
  assert.match(js, /부름이 어긋났다/, '환급 고지');
  // 컷씬 4곳(귀참/名/설욕/꺾임) — 공유 dsoTimer로 교차 절단 방지
  const clears = (js.match(/if \(dsoTimer\) clearTimeout\(dsoTimer\)/g) || []).length;
  assert.strictEqual(clears, 4, '컷씬 4곳 전부 공유 타이머 정리 (현재 ' + clears + ')');
  // 꺾임 지속시간이 CSS 애니메이션(2.5s)과 정렬
  const dr = afterDecl('function showDefeatRitual(', 1400);
  assert.match(dr, /\}, 2500\)/, '꺾임 2500ms (1900ms 조기 제거로 페이드 없이 사라지던 결함)');
  // 간결 모드 — 숨겨진 결정 UI의 휘발 상태 중화 (보이지 않는 배율 지속 방지)
  const ab = afterDecl('function applySettings() {', 1200);
  assert.match(ab, /resolveMode = 'normal'/, '간결 ON 시 각오 평상 복귀');
  assert.match(ab, /setSanctum\(false\)/, '간결 ON 시 결계 해제');
  assert.match(ab, /'whet-check', 'spirit-check', 'divination-check', 'auto-check'/, '간결 ON 시 armed 체크 해제');
});

test('v388 감사: slay 실패/회피가 endChallenge 호출 (水鏡·crisis 드론·타이머 잔존 결함)', () => {
  const body = afterDecl('function slay() {', 16000);
  const calls = (body.match(/endChallenge\(\)/g) || []).length;
  assert.ok(calls >= 3, 'slay 내 endChallenge ≥3 (성공/실패/회피 — 현재 ' + calls + ')');
});

test('v388 감사: normalizeState 보강 — 무덤 soul/form·stats 정수·eraStart·설정 boolean', () => {
  const nb = afterDecl('function normalizeState() {', 52000);
  assert.match(nb, /f\.soul = clampInt\(f\.soul, 0, 100\)/, '무덤 soul cap (재련 SOUL_MAX 우회 차단)');
  assert.match(nb, /f\.form !== '직' && f\.form !== '곡'/, '무덤 form 화이트리스트 (재련 경유 XSS/룩업 붕괴 차단)');
  assert.match(nb, /sw\.form !== '직' && sw\.form !== '곡'/, '봉인/전당/현재 검 form 화이트리스트');
  assert.match(nb, /Object\.keys\(DEFAULT_STATS\)\.forEach/, '전 카운터 정수 강제 (bumpStat 문자열 폭주 차단)');
  assert.match(nb, /Array\.isArray\(state\.eraStart\)/, 'eraStart 형태 검증 (NaN 겁 영구 기록 차단)');
  assert.match(nb, /typeof state\.settings\[k\] !== 'boolean'/, '설정 boolean 강제');
  assert.match(nb, /state\.totalSlain = clampInt/, 'totalSlain clamp (겁 델타 원천)');
  // 전당 진열도 지킨 맹세 집계 (doSeal 단독이던 과소집계)
  const kept = (js.match(/bumpStat\('oathsKept'\)/g) || []).length;
  assert.strictEqual(kept, 2, 'oathsKept 집계 2곳 — 봉인+전당 (현재 ' + kept + ')');
});

// ─────────────────────────────────────────────────────────────
// v389 감사 — 문구 드리프트·죽은 차원 부활 잠금
// ─────────────────────────────────────────────────────────────
test('v389: 검없음 차원 부활 — 길이 하나라도 남으면 게임 오버가 아니다', () => {
  const body = afterDecl('function isStuck() {', 1600);
  // '검 없음 = 무조건 게임 오버'가 새 검 빚기(v31)·융검(v92)·재련(v374)을 도달 불가로 만들고
  // 회수 조각의 물질적 의미를 죽이던 결함 — 세 갈래 길 검사 잠금
  assert.match(body, /shardsNum >= NEWSWORD_COST\) return false/, '새 검의 길');
  assert.match(body, /length >= 2 && shardsNum >= FUSION_COST\) return false/, '융검의 길');
  assert.match(body, /!f\.reforged && shardsNum >= reforgeCost\(f\.level \|\| 0\)\)\) return false/, '재련의 길');
  assert.match(body, /return true/, '세 길이 모두 끊겼을 때만 길의 끝');
});

test('v389: 게임오버 도구 초기화 완전성 + 안내 문구 현행화', () => {
  const rb = afterDecl('function restartFromGameOver() {', 900);
  assert.match(rb, /state\.divinationStones = 0/, '점복석도 초기화 (「도구는 초기화」 문구와 일치)');
  // 3지선다가 된 두 결정의 안내 (2지선다로 안내하던 드리프트)
  assert.match(js, /줍기 \/ 도박 \/ 놓아주기/, 'firstDestroy — 회수 3길 안내');
  assert.match(js, /베거나, 양보\(대치\)하거나, 도망치세요/, 'firstChallenge — 도전 3택 안내');
  assert.ok(html.includes('줍기 · 도박(2배 or 0) · 놓아주기'), '도움말 — 회수 3길');
  assert.ok(html.includes('간결 모드」를 끄면'), '도움말 — 숨겨진 선택지의 존재 안내');
  // 단축키 Enter 병기 (핸들러는 Space·Enter 동일)
  assert.ok(html.includes('␣ Enter'), 'key-hint — Enter 병기');
  assert.ok(html.includes('스페이스 · Enter'), '도움말 — Enter 병기');
  // 서약 시한 안내 (버튼이 예고 없이 사라지던 UX)
  assert.ok(html.includes('강화 3회를 넘기면 걸 수 없다'), '서약 모달 — 시한 명시');
  assert.match(js, /맹세를 건다 \(강화 3회 전까지\)/, '서약 버튼 — 시한 명시');
  // 보신 desc 하락 절반 (사용자에게 유리한 효과 누락)
  assert.match(js, /파괴 0 · 하락 절반 · 비용 1\.5배/, '보신 desc — downgradeMul 0.5 반영');
  // 검총·리더보드가 간결 모드에서도 보임 (안내 문구가 숨겨진 메뉴로 보내던 결함)
  assert.match(html, /id="btn-graveyard" class="menu-core"/, '검총 — 파괴 서사의 종착점은 본질');
  assert.match(html, /id="btn-leaderboard" class="menu-core"/, '리더보드 — 도달 안내 문구의 목적지');
});

// ─────────────────────────────────────────────────────────────
// v390 감사 3차 — 부활한 검없음 상태의 상호작용 결함 수정 잠금
// ─────────────────────────────────────────────────────────────
test('v390: 함정 경계 경고 — 정확히-소진 지출이 클릭 한 번 뒤 길의 끝이 되지 않게', () => {
  const fb = afterDecl('function forgeLeavesStuck(', 700);
  assert.match(fb, /startBonus\(\) \+ trialStartLevelBonus\(\)/, '예상 시작 강화 — newSword와 동일 공식');
  // v396 [11] — 갓 빚은 검의 판매 하한은 startLevel+1 (minSealLevel): 「+3+는 팔 수 있다」 면제가
  // 유산 시작 +3~+7 검의 함정을 놓치던 결함. +0 시작만 첫 강화 무료라 예외.
  assert.match(fb, /if \(lv < 1\) return false/, '+0(첫 강화 무료)만 함정 아님');
  assert.doesNotMatch(fb, /lv >= SEAL_MIN_LEVEL\) return false/, '유산 시작 +3+ 면제 재유입 금지 (v396 [11])');
  assert.match(fb, /enhanceCost\(lv, \{ floor: true \}\)/, '강화비 단일 진원 비교');
  const warns = (js.match(/forgeLeavesStuck\(\w+(?:\.\w+)*\) && !confirm\(FORGE_TRAP_WARN\)/g) || []).length
    + (js.match(/forgeLeavesStuck\(NEWSWORD_COST\) && !confirm\(FORGE_TRAP_WARN\)/g) || []).length
    + (js.match(/forgeLeavesStuck\(FUSION_COST\) && !confirm\(FORGE_TRAP_WARN\)/g) || []).length
    + (js.match(/forgeLeavesStuck\(cost\) && !confirm\(FORGE_TRAP_WARN\)/g) || []).length;
  const sites = (js.match(/!confirm\(FORGE_TRAP_WARN\)\) return/g) || []).length;
  assert.strictEqual(sites, 3, '지출 3처(새 검/융검/재련) 전부 경고 (현재 ' + sites + ')');
  // 재련은 f.reforged 커밋 전에 경고 (취소해도 무덤이 잠기지 않게)
  const rf = afterDecl('function reforgeSword(', 1400);
  const warnIdx = rf.indexOf('FORGE_TRAP_WARN');
  const commitIdx = rf.indexOf('f.reforged = true');
  assert.ok(warnIdx >= 0 && commitIdx > warnIdx, '재련 경고는 무덤 잠금 전');
});

test('v390: 검없음 상태 상호작용 — 키보드/신사/점복/정진/단일 진원', () => {
  // 키보드로 새 검 빚기 (enhance 직접 호출이 무시되던 결함 — key-hint 약속 이행)
  assert.match(js, /btnEnhance\.dataset\.mode === 'newsword'\) btnEnhance\.click\(\)/, 'Space/Enter — newsword 모드는 버튼 경유');
  // 게임오버 Enter 이중 발화 차단
  assert.match(js, /stopImmediatePropagation\(\)/, '게임오버 Enter — 재시작+강화 이중 발화 차단');
  // 신사 헌사 — 검없음 여비 경고
  const db = afterDecl('function donateToShrine(', 1200);
  assert.match(db, /!state\.hasSword && \(state\.shards - d\.cost\) < NEWSWORD_COST/, '검없음 여비 잠식 헌사 경고');
  // 검없음 분기에서 점복 토글도 잠금 (armed 헛소모 차단)
  assert.match(js, /dc\.disabled = true; dc\.checked = false/, '검없음 — 점복 disarm');
  // 정진/1시간 마일스톤 — 검없음 폴백 (주지 않는 보상 표시 드리프트)
  assert.match(js, /state\.shards \+= 30;  \/\/ v390/, '정진 3시간 검없음 폴백');
  // 죽은 조합소 newsword 레시피 제거 + 미정의 상수 폴백 제거
  assert.ok(!html.includes('data-recipe="newsword"'), '도달 불가 newsword 레시피 제거 (메인 버튼이 단일 진입점)');
  assert.doesNotMatch(js, /FORGE_NEW_SWORD_COST/, '미정의 상수 폴백 제거 (NEWSWORD_COST 단일 진원)');
});

// ─────────────────────────────────────────────────────────────
// v392 관문 — CI·테스트 열거 무결성
// ─────────────────────────────────────────────────────────────
test('v392 관문: npm test가 모든 테스트 파일을 열거 + CI 워크플로 존재', () => {
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  // glob(node 21+ 전용)이 아닌 명시 열거 — 새 *.test.js를 만들고 여기 안 넣으면 CI에서 조용히 안 돈다
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js'));
  assert.ok(files.length >= 5, '테스트 파일 ≥5 (현재 ' + files.length + ')');
  files.forEach(f => assert.ok(pkg.scripts.test.includes('tests/' + f),
    'npm test 스크립트에 ' + f + ' 누락 — 조용히 실행되지 않는 테스트'));
  assert.ok(!pkg.scripts.test.includes('*'), 'glob 미사용 (node 18/20 호환 — engines 선언 정합)');
  // CI 관문 존재
  assert.ok(fs.existsSync(path.join(root, '.github', 'workflows', 'ci.yml')), 'CI 워크플로 존재 (push/PR 관문)');
  const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.ok(ci.includes('npm run lint:parse') && ci.includes('npm test'), 'CI가 parse+전체 스위트 실행');
});

// ─────────────────────────────────────────────────────────────
// v393 書體 — 의도된 활자의 실체화 (선언 133처 vs 로드 0처이던 결함)
// ─────────────────────────────────────────────────────────────
test('v393 서체: Noto Serif KR을 실제로 로드 — 선언만 하고 로드 안 하던 회귀 차단', () => {
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Noto\+Serif\+KR/, '서체 로드 링크 존재');
  assert.match(html, /display=swap/, 'FOIT 없음 — 로드 전엔 폴백 그대로 (오프라인 동일)');
  assert.match(html, /wght@200;400;700/, '실사용 두께(대형 한자 200 · 본문 400 · 새김 700) 포함');
  assert.match(html, /rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin/, 'preconnect (로드 지연 최소화)');
  // 서체 선언이 실제로 광범위한지 (로드가 무의미해지는 선언 제거 회귀 감지)
  const decls = (html.match(/Noto Serif KR/g) || []).length;
  assert.ok(decls > 50, 'Noto Serif KR 선언 광범위 (현재 ' + decls + '처)');
});

// ─────────────────────────────────────────────────────────────
// v394 재방문 경량화 — 서버 캐시 정책 (라이브 실측 기반)
// ─────────────────────────────────────────────────────────────
test('v394 서버: no-store 금지 — 조건부 재검증(304)이 살아 있어야 재방문이 가볍다', () => {
  const path = require('node:path');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(!server.includes('no-store'), 'no-store는 ETag 304 재검증까지 차단 — 재방문마다 전량 재전송 (v394 실측 288KB)');
  assert.match(server, /Cache-Control', 'no-cache'/, 'no-cache — 캐시하되 매 방문 재검증 (갱신 즉시 전파 + 미변경 304)');
  // (express.static 재도입 금지는 기존 v332 전용 테스트가 커버 — 주석 속 언급까지 잡는 중복 검사는 두지 않는다)
});

// ─────────────────────────────────────────────────────────────
// v395 常在 — PWA (설치형·오프라인) 무결성
// ─────────────────────────────────────────────────────────────
test('v395 PWA: 서버 라우트 3종이 캐치올보다 먼저 + SW는 network-first', () => {
  const path = require('node:path');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const catchAllIdx = server.indexOf("app.get('*'");
  ['/sw.js', '/manifest.webmanifest', '/icon.svg'].forEach(route => {
    const idx = server.indexOf("app.get('" + route + "'");
    assert.ok(idx >= 0, route + ' 라우트 존재');
    assert.ok(idx < catchAllIdx, route + ' 라우트가 캐치올보다 먼저 (아니면 index.html이 대신 나감)');
  });
  // SW 전략 — network-first (온라인 동작 불변, 오프라인만 폴백): 낡은 버전 고착 사고 구조적 차단
  assert.match(server, /fetch\(req\)\.then/, 'SW — 항상 네트워크 먼저');
  assert.match(server, /catch\(\(\) => caches\.match\('\/'\)\)/, 'SW — 오프라인일 때만 캐시 폴백');
  assert.match(server, /origin !== self\.location\.origin\) return/, 'SW — CDN(서체/Supabase) 불관여');
  assert.match(server, /caches\.delete/, 'SW — 구 캐시 정리 (activate)');
  assert.match(server, /req\.mode === 'navigate'/, 'SW — 내비게이션 응답만 캐시 갱신');
});

test('v395 PWA: 클라이언트 등록 — manifest 링크 + 프로토콜 가드 (file:// 무변화)', () => {
  assert.ok(html.includes('rel="manifest" href="/manifest.webmanifest"'), 'manifest 링크');
  assert.ok(html.includes('name="theme-color" content="#1f1a14"'), 'theme-color (설치 앱 크롬 색)');
  assert.match(js, /'serviceWorker' in navigator && \(location\.protocol === 'https:' \|\| location\.hostname === 'localhost'\)/,
    'SW 등록 프로토콜 가드 — file:// 더블클릭 실행은 기존 그대로');
  assert.match(js, /register\('\/sw\.js'\)\.catch/, '등록 실패는 조용히 (향상일 뿐 필수 아님)');
});

test('v387 간결: menu-core 태깅 — 필수만, 과잉 태깅 금지', () => {
  const coreCount = (html.match(/class="menu-core"/g) || []).length;
  assert.ok(coreCount >= 8 && coreCount <= 13, '핵심 버튼 8~13개 (현재 ' + coreCount + ') — 전부 태깅하면 간결이 무의미');
  ['btn-stats', 'btn-help', 'btn-settings', 'btn-mute', 'btn-reset', 'btn-backup', 'btn-restore', 'btn-cloud-login']
    .forEach(id => assert.match(html, new RegExp('id="' + id + '" class="menu-core"'), id + '는 핵심 (기록/안내/설정/소리/초기화/백업/클라우드)'));
  // 설정 진입로가 간결 모드에서 살아있어야 전체 복귀 가능 — btn-settings는 반드시 core
  assert.match(html, /id="btn-settings" class="menu-core"/, '설정 진입로 보존 (전체 모드 복귀 경로)');
});

// ─────────────────────────────────────────────────────────────
// v396 大監査 — 레거시 전 계층(v1~v371) 감사 30건 수정 잠금
// ─────────────────────────────────────────────────────────────
test('v396 [0]: 점복 잠금 — 체크 토글 무한 재롤(확정 강화) exploit 차단', () => {
  const hStart = js.indexOf("const _divCheck = $('divination-check')");
  assert.ok(hStart >= 0, '점복 체크박스 핸들러 존재');
  const handler = js.slice(hStart, hStart + 600);
  assert.doesNotMatch(handler, /clearDivinationLock/, '체크 해제로 잠긴 롤 무효화 금지');
  const omen = afterDecl('function rollOmen() {', 1800);
  assert.match(omen, /divinationLockedLevel !== null && divinationLockedLevel !== lv\) clearDivinationLock\(\)/, '잠금은 레벨 단위');
  const clears = (js.match(/clearDivinationLock\(\);/g) || []).length;
  assert.ok(clears >= 3, 'enhance 소모 지점(성공/실패/열반) 잠금 해제 유지 (현재 ' + clears + ')');
});

test('v396 [1][2][13]: enhance 굴림 정합 — 결계/유수 사전 캡처·방지권 counterfactual 통일', () => {
  const dIdx = js.indexOf('state.shards -= actualCost');
  const rIdx = js.indexOf('recordLuck(successChance', dIdx);
  assert.ok(dIdx > 0 && rIdx > dIdx, 'enhance 차감·굴림 마커 존재');
  const capS = js.indexOf('const sanctumArmed = sanctumBlocksDestroy()');
  assert.ok(capS >= 0 && capS < dIdx, '결계 상태는 ×3 비용 차감 전에 캡처 (이중 과금 차단)');
  const capW = js.indexOf('const wishDR = wishDestroyReduce()');
  assert.ok(capW >= 0 && capW < dIdx, '유수 감소항은 consume 전에 캡처');
  assert.ok(!js.slice(dIdx, rIdx).includes('maybeForceSanctumOff()'), '차감~굴림 사이 결계 강제 해제 금지');
  const offCount = (js.match(/maybeForceSanctumOff\(\);/g) || []).length;
  assert.ok(offCount >= 3, '결계 자동 해제는 굴림 이후 각 exit에 (현재 ' + offCount + ')');
  assert.match(js, /const protectedFromDestroy = useProtect && failRoll < effectiveDestroy;/, '각흔 counterfactual = 실제 굴림값 (축약 재계산 금지)');
});

test('v396 [5][6]: 멸마·뇌신 charge — spawn이 아닌 slay 성공 시 소모 (「다음 슬레이」 이행)', () => {
  const mtc = afterDecl('function maybeTriggerChallenge(forced) {', 8000);
  assert.ok(!mtc.includes('state.metsumaoCharges--'), 'spawn 시 멸마 차감 금지');
  assert.ok(!mtc.includes('consumeWishSlay()'), 'spawn 시 뇌신 소모 금지');
  assert.match(mtc, /usedMetsumao = true/, '멸마 배율 표식 (배율은 spawn에 — 표시 일치)');
  const tnf = afterDecl('function triggerNamedFoe(foe) {', 2800);
  assert.match(tnf, /usedMetsumao = true/, '名 보스도 멸마·뇌신 적용');
  assert.ok(!tnf.includes('state.metsumaoCharges--'), '名 spawn 차감 금지');
  const sb = afterDecl('function slay() {', 4200);
  assert.match(sb, /c\.usedMetsumao\) state\.metsumaoCharges = Math\.max/, 'slay 성공 시 멸마 소모');
  assert.match(sb, /c\.usedWishSlay\) consumeWishSlay\(\)/, 'slay 성공 시 뇌신 소모');
});

test('v396 [7][27]: 봉인 전이·충전 타이머 — 이중 매각·명명 모달 관통 차단', () => {
  assert.match(js, /let sealTransition = false/, '전이 플래그 존재');
  const sealB = afterDecl('function sealSword() {', 900);
  assert.match(sealB, /if \(sealTransition\) return/, 'sealSword 전이 가드');
  assert.match(sealB, /cancelCharge\(\)/, 'sealSword 진입 시 충전 취소');
  const dsB = afterDecl('function doSeal(', 1200);
  assert.match(dsB, /if \(sealTransition\) return/, 'doSeal 재진입 가드');
  assert.match(dsB, /state\.level !== lv\)/, 'doSeal 스냅샷 재검증 (파괴 검 이중 존재 차단)');
  // v397 리뷰 — set은 안전망 타이머와 한 몸(armSealTransition): 정상 해제 사이의 어떤 예외라도
  // 플래그가 영구 잠기면 강화·매각이 동시에 막혀 새로고침 외엔 복구 불가였다.
  assert.match(dsB, /armSealTransition\(\)/, 'doSeal 진입 시 arm (안전망 포함)');
  assert.match(js, /function armSealTransition\(\)/, '안전망 헬퍼 존재');
  const armB = afterDecl('function armSealTransition() {', 300);
  assert.match(armB, /sealTransition = true/, 'arm이 플래그를 세운다');
  assert.match(armB, /setTimeout\(\(\) => \{ sealTransition = false/, '안전망 타이머가 반드시 해제');
  const clearCount = (js.match(/sealTransition = false/g) || []).length;
  assert.ok(clearCount >= 4, '해제 지점(선언 + 안전망 + 도/일반 exit) (현재 ' + clearCount + ')');
  const eb2 = afterDecl('function enhance() {', 1300);
  assert.match(eb2, /if \(sealTransition\) return/, 'enhance 전이 가드');
  assert.match(eb2, /name-modal/, 'enhance 명명 모달 가드');
  assert.match(js, /let chargeTimer = null/, '충전 타이머 모듈 핸들');
  assert.match(js, /chargeTimer = setTimeout\(/, '충전 타이머 추적 배선');
});

test('v396 [4][29]: 지연 endChallenge 취소 · 형 선택 중 도전 보류', () => {
  const sc = afterDecl('function showChallenge() {', 900);
  assert.match(sc, /clearTimeout\(pendingEndTimer\)/, '새 도전이 직전 지연 정리 타이머를 취소');
  assert.match(js, /pendingEndTimer = setTimeout/, '지연 endChallenge 모듈 핸들 추적');
  const mtcTop = afterDecl('function maybeTriggerChallenge(forced) {', 900);
  assert.match(mtcTop, /formDeferredChallenge = \{ forced/, '형 선택 모달 중 도전 보류');
  const afc = afterDecl('function applyFormChoice(form) {', 1000);
  assert.match(afc, /formDeferredChallenge/, '형 확정 후 보류 도전 발화');
});

test('v396 [8][15][25][28]: import 소독 커버리지 — 봉인 검 서사 필드·첨·도호', () => {
  const sw = afterDecl('const sanitizeSword = (sw) => {', 2800);
  assert.match(sw, /sw\.inscriptions = sw\.inscriptions\.map\(stripTags\)/, '명문 원소 소독 (무덤과 대칭)');
  assert.match(sw, /sw\.verse = sw\.verse\.slice\(0, 8\)\.map\(stripTags\)/, '일생시 원소 소독');
  assert.match(sw, /birthStatement/, '탄생 문장 소독');
  assert.match(sw, /bornTod/, '時生 화이트리스트');
  assert.match(js, /SEN_REWARDS\.find\(r => r\.kanji === lr\.kanji/, '첨 결과 화이트리스트 (원본 객체 치환)');
  assert.match(js, /dt\.title = \(typeof dt\.title === 'string'\) \? stripTags/, 'daoTitle 소독');
});

test('v396 [11][23][10]: 소프트락 하한·융검 push·대국 승수 재매핑', () => {
  const body = afterDecl('function isStuck() {', 2200);
  // v397 리뷰 — 케이스 2 하한은 다시 SEAL_MIN_LEVEL. 일일 수입(첨·천시·정진)이 있는 한
  // 조각 고갈은 영구 사망이 아니므로, 유산 시작 검까지 「길의 끝」으로 선언하면
  // 회복 가능한 판을 파괴한다. 감지 확대는 지출 전 경고(forgeLeavesStuck)가 대신한다.
  assert.match(body, /state\.level < SEAL_MIN_LEVEL/, '케이스 2 하한 = SEAL_MIN_LEVEL (오탐 방지)');
  assert.doesNotMatch(body, /state\.level < minSealLevel\(\)/, '게임오버 하한 확대 재유입 금지 (v397)');
  const fb = afterDecl('function fuseSwords() {', 4500);
  assert.match(fb, /schedulePush\(\)/, '융검(점수 감소 액션) 후 자동 push — 구본 클라우드 롤백 차단');
  assert.match(fb, /state\.duelWins = remapped/, '대국 승수 키 재매핑 (guardianIdx와 동일 규칙)');
});

test('v396 [12][18][24][26]: 전당 집계 통일·주보 단조·클라우드 복원 단일 진원', () => {
  const tc = afterDecl('function trialCount() {', 700);
  assert.match(tc, /allSealedSwords\(\)\.length/, 'trialCount — 전당 포함 (v350 규율)');
  const en = afterDecl('function enshrineSeal(', 1500);
  // v397 리뷰 — 진열은 매각이 아니다 (조각 0). sealed에 합치면 記錄 「검 판매」·페르소나·
  // 칭호 임계가 과대 집계되므로 별도 카운터로 세고, 주보 단조 누적에서만 합산한다.
  assert.match(en, /bumpStat\('enshrined'\)/, '전당 진열은 별도 카운터');
  assert.doesNotMatch(en, /bumpStat\('sealed'\)/, '매각 카운터 혼입 금지 (v397)');
  assert.match(js, /sealedCum: \(stats\.sealed \|\| 0\) \+ \(stats\.enshrined \|\| 0\)/, '주보 스냅샷 — 단조 카운터(매각+진열)');
  const pIdx = js.indexOf("$('btn-cloud-pull').addEventListener");
  assert.ok(pIdx >= 0, '수동 클라우드 복원 핸들러 존재');
  const pull = js.slice(pIdx, pIdx + 1600);
  assert.match(pull, /applyCloudState\(r\.data\)/, '복원 — normalizeState 경유 (부분 보정 우회 금지)');
  assert.match(pull, /challenge \|\| rescueWindow \|\| voidPending/, '복원 — 회수/도전 중 차단');
});

test('v396 [14][16][17][19][20][21][22][9]: 타이머·오디오·모션·시그니처 배선', () => {
  assert.match(js, /void ringCircle\.getBoundingClientRect\(\)/, '회수 ring 강제 reflow (진행 표시 소생)');
  assert.match(js, /checkDawn\(bootGapMs\)/, '여명 — 부트 직후 포착한 gap 전달');
  assert.match(js, /const bootGapMs = /, '여명 — 어떤 save보다 먼저 gap 포착');
  assert.match(js, /checkWeekendGreeting\(\); checkDailyStreak\(\)/, '練日 — 매시간 자정 경계 재확인');
  assert.match(js, /audioCtx\.resume\(\)/, '오디오 suspended 복구 (무음 고착 해소)');
  const hiddenGuards = (js.match(/if \(document\.hidden\) return;/g) || []).length;
  assert.ok(hiddenGuards >= 5, '숨은 탭 오디오/명상 가드 5+ (현재 ' + hiddenGuards + ')');
  assert.match(js, /function motionReduced\(\)/, '모션 감소 공통 게이트');
  const gates = (js.match(/if \(motionReduced\(\)\) return;/g) || []).length;
  assert.strictEqual(gates, 5, 'WAAPI spawner 게이트 5곳 (버스트/파편/보상/유산/합류)');
  const sp = afterDecl('function spawnSeasonParticle() {', 1000);
  assert.match(sp, /getSetting\('particles'\)/, '계절 입자 — 설정 존중');
  assert.match(sp, /challenge \|\| rescueWindow \|\| moonGazing/, '계절 입자 — 오버레이 차단');
  assert.match(js, /showSwordDetail\(state\.sealedSwords\[idx\], idx \+ 1\)/, '별자리·계보 — 올바른 시그니처');
});

// ─────────────────────────────────────────────────────────────
// v397 敵手 — 판정 축과 난이도 축의 단일성 (구조 잠금)
// 규율: 승부를 판정하는 값(지금 검)과 난이도를 굴리는 값은 같은 축이어야 한다.
// ─────────────────────────────────────────────────────────────
test('v397 敵手: 강도 앵커 단일성 — 도전 강도에 최고 기록 부재', () => {
  const { extractFunction } = require('./harness');
  const fn = extractFunction(js, 'rollChallengeStrength');
  assert.match(fn, /state\.level/, 'rollChallengeStrength는 지금 검을 앵커로');
  assert.ok(!/bestLevel/.test(fn), '최고 기록 참조 없음 (재건 구간 전패 회귀 차단)');
  const demonIdx = js.indexOf('if (type.isDemon)');
  assert.ok(demonIdx > 0, '劍鬼 분기 존재');
  const demonBlock = js.slice(demonIdx, demonIdx + 800);
  assert.ok(!/state\.bestLevel \+ 5/.test(demonBlock), '劍鬼 강도에 도달 불가 공식 재유입 금지');
  assert.match(demonBlock, /strength = Math\.max\(1, state\.level/, '劍鬼도 지금 검 기준');
});

test('v397 敵手: 名 대면 조건 — 이길 수 있는 강화도에서만 등장', () => {
  const { extractFunction } = require('./harness');
  const fn = extractFunction(js, 'pendingNamedFoe');
  assert.match(fn, /state\.level >= f\.strength/, '대면 조건 — 지금 검이 보스 강도 이상');
  assert.match(fn, /state\.bestLevel >= f\.trigger/, '해금 조건 — 최고 기록 유지');
});

test('v397 敵手: 처치 보고서의 대면 안내가 실제 등장 조건과 일치 (표시≠실제 차단)', () => {
  const rf = afterDecl('function renderFoes() {', 1600);
  assert.match(rf, /state\.level >= f\.strength/, '대면 조건 — pendingNamedFoe와 같은 식');
  assert.doesNotMatch(rf, /출현 가능/, '해금만으로 등장한다는 옛 문구 재유입 금지');
});

test('v397 敵手: 記錄 모달 도전 승률 행 (확률 정직성)', () => {
  const idx = js.indexOf("row('도전 승률'");
  assert.ok(idx > 0, '記錄에 도전 승률 행');
  // 산식 블록(행 선언 *앞*)만 검사 — 뒤쪽에는 별개의 물러남 행이 이어진다
  const block = js.slice(Math.max(0, idx - 700), idx);
  assert.match(block, /s\.defeats/, '분모에 꺾인 판 포함');
  // v397 리뷰 — 분자는 권위 카운터 단일 진원 (유형별 합산은 名 처치를 빠뜨려 승률이 낮게 나왔다)
  assert.match(block, /state\.totalSlain/, '분자는 totalSlain 단일 진원');
  assert.ok(!/s\.fled/.test(block), '물러남은 싸움이 아니므로 분모 밖');
});

// ─────────────────────────────────────────────────────────────
// v398 掌中 — 상시 표식은 corner-stack 소속 (좌표 손배치 금지의 JS 경로 봉쇄)
// v380이 CSS 좌표 손배치를 금지했지만, JS에서 style.cssText로 만들어진 표식들이
// 그 규율을 통째로 우회했다 (실측: 시진이 메뉴 버튼과 정확히 같은 좌표에 겹침).
// ─────────────────────────────────────────────────────────────
test('v398 掌中: 상시 표식 5종이 corner-stack 소속 (JS 인라인 좌표 우회 차단)', () => {
  const stackIdx = html.indexOf('<div id="corner-stack">');
  assert.ok(stackIdx > 0, 'corner-stack 존재');
  const stackEnd = html.indexOf('<div id="meditation-mark">', stackIdx);
  assert.ok(stackEnd > stackIdx, 'corner-stack 종료 지점');
  const stackHtml = html.slice(stackIdx, stackEnd);
  ['sidin-mark', 'weekend-mark', 'streak-mark', 'festival-mark', 'eternity-mark'].forEach(id => {
    assert.ok(stackHtml.includes('id="' + id + '"'), id + ' 는 corner-stack 소속 (정적 선언)');
  });
  const inlineCorner = (js.match(/cssText = 'position:fixed;top:\d+px;(?:left|right):\d+px/g) || []);
  assert.strictEqual(inlineCorner.length, 0,
    '상시 표식의 JS 인라인 픽셀 좌표 0 (현재 ' + inlineCorner.length + ' — corner-stack에 넣을 것)');
});

test('v398 掌中: 일언은 흐름 요소 · 명상 중 호흡 안내 은폐', () => {
  const dsIdx = html.indexOf('<div id="daily-saying"></div>');
  assert.ok(dsIdx > 0, '일언 정적 선언 (흐름)');
  const sealIdx = html.indexOf('id="btn-seal-direct"');
  const footIdx = html.indexOf('<div id="footer">');
  assert.ok(dsIdx > sealIdx && dsIdx < footIdx, '일언은 팔기 버튼 아래·하단 버튼 위 (겹침 불가)');
  const rd = afterDecl('function renderDailySaying() {', 800);
  assert.doesNotMatch(rd, /position:fixed/, '일언 고정 좌표 재유입 금지');
  assert.match(rd, /dataset\.wired/, '배선 1회 가드 (정적 요소)');
  assert.match(html, /body\.meditation #advice-line/, '명상 중 호흡 안내 은폐 (표식과 겹침)');
});

// ─────────────────────────────────────────────────────────────
// v399 遺失 — 도달할 수 없는 콘텐츠 차단
// v397에서 「판정식이 참이 될 수 없는 적」을 발견한 것과 같은 계열: 임계가 상한을 넘거나,
// 우선순위·엣지 조건 때문에 영원히 선택되지 않는 콘텐츠를 구조적으로 막는다.
// ─────────────────────────────────────────────────────────────
test('v399 遺失: 검명 접미 8종이 모두 도달 가능 (나이가 혼 단계보다 위)', () => {
  const NS = extractConst('NAME_SUFFIX');
  const at = k => NS.findIndex(s => s.key === k);
  assert.strictEqual(NS.length, 8, '접미 8종');
  // 강화 시도 1회마다 혼 +1이 붙으므로 시도 50회엔 이미 각성(34), 100회엔 이미 본(67)을 가진다.
  // 나이 접미가 혼 접미보다 아래면 첫 매칭이 언제나 혼 쪽이라 그 슬롯은 영원히 빈다.
  assert.ok(at('구') < at('각성'), '구는 각성보다 위 (시도 50 시점엔 이미 각성 보유)');
  assert.ok(at('고') < at('본'), '고는 본보다 위 (시도 100 시점엔 이미 본 보유)');
  assert.ok(at('고') < at('구'), '고가 구보다 위 (더 오랜 검이 우선)');
});

test('v399 遺失: 명문 사전이 실제 새겨지는 키를 전부 담는다', () => {
  const INS = extractConst('INSCRIPTIONS');
  const keys = new Set(INS.map(i => i.key));
  // 名 처치 명문은 처치 시점에 직접 push된다 — 사전에 없으면 도감에서 영영 안 보이고
  // 진척 표시의 분모(INSCRIPTIONS.length)에서도 빠져 초과 표시가 가능했다.
  extractConst('NAMED_FOES').forEach(f => {
    assert.ok(keys.has(f.inscription), '名 명문 ' + f.inscription + ' 이 사전에 등재');
  });
  assert.ok(keys.has('역전'), '역전이 사전에 등재');
  // 접미 우선순위가 참조하는 키도 전부 실재해야 한다
  extractConst('NAME_SUFFIX').forEach(s => {
    assert.ok(keys.has(s.key), '접미가 참조하는 명문 ' + s.key + ' 실재');
  });
});

test('v399 遺失: 역전은 안내가 아니라 실제로 새겨진다', () => {
  assert.match(js, /adversityReady = false; grantInscription\('역전'\)/, '역경 역전 시 명문 부여');
  const inscribeOnly = (js.match(/announceInscription\('역전'/g) || []).length;
  assert.strictEqual(inscribeOnly, 0, '페이드 안내만 하고 새기지 않던 경로 재유입 금지');
});

test('v399 遺失: 혼 단계 명문이 직접 대입 경로에서도 정합', () => {
  assert.match(js, /function syncSoulInscriptions\(\)/, '혼 단계 정합 헬퍼 존재');
  const sync = afterDecl('function syncSoulInscriptions() {', 400);
  assert.match(sync, /s >= SOUL_AWAKEN/, '각성 임계 — 상수 단일 진원');
  assert.match(sync, /s >= SOUL_TRUE/, '본 임계 — 상수 단일 진원');
  const ci = afterDecl('function checkInscriptions() {', 700);
  assert.match(ci, /syncSoulInscriptions\(\)/, '새 검·융검·재련이 거치는 지점에서 호출');
});

test('v399 遺失: 청룡 조건도 allSealedSwords 단일 진원 (전당 누락 차단)', () => {
  const idx = js.indexOf("key:'seiryu'");
  assert.ok(idx > 0, '청룡 정의 존재');
  const block = js.slice(idx, idx + 600);
  assert.match(block, /allSealedSwords\(\)\.length >= 10/, '조건 — 봉인+전당 합산');
  assert.doesNotMatch(block, /state\.sealedSwords \|\| \[\]\)\.length/, '배열 직접 참조 재유입 금지');
});

test('v398 掌中: 손가락 치수 — 폰 폭에서 44px 확보', () => {
  const mIdx = html.indexOf('@media (max-width: 480px)');
  assert.ok(mIdx > 0, '폰 폭 미디어 쿼리');
  const block = html.slice(mIdx, mIdx + 420);
  assert.match(block, /#footer \.footer-btn \{ min-height: 44px/, '하단 버튼 44px');
  assert.match(block, /#menu-toggle \{ min-width: 44px; min-height: 44px/, '메뉴 버튼 44px');
  assert.match(block, /#protect-row/, '보호권 행 터치 영역 확대');
});

test('v400 實戰: 객체 배열의 비객체 항목이 진입점에서 제거된다 (부팅 사망 차단)', () => {
  // 실행 하니스가 잡은 결함: sealedSwords/enshrined 에 null 하나가 섞이면 v117 四道의
  // getWayFormCounts 가 부팅 중 던져 게임 전체가 죽었다 (강화·메뉴 전부 무반응).
  const nm = js.match(/function normalizeState\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(nm, 'normalizeState 본문');
  const body = nm[1];
  const fm = body.match(/\[([^\]]*?)\]\.forEach\(k => \{\s*if \(Array\.isArray\(state\[k\]\)\) \{/);
  assert.ok(fm, '객체 배열 일괄 필터가 normalizeState 안에 존재');
  assert.match(body, /typeof v === 'object'/, '항목이 객체인지 검사');
  assert.match(body, /!Array\.isArray\(v\)/, '배열 항목도 배제');
  // 항목을 객체로 전제해 순회하는 컬렉션이 전부 목록에 있어야 한다
  ['sealedSwords', 'enshrined', 'fallenSwords', 'nemesesArchive', 'eras',
    'rubbings', 'userDiary', 'guestSwords', 'recentLog'].forEach(k => {
    assert.ok(fm[1].includes("'" + k + "'"), '객체 배열 필터 대상 누락: ' + k);
  });
  // 문자/수 배열은 대상이 아니다 (필터가 내용을 지워버린다)
  assert.ok(!fm[1].includes("'userSeal'"), 'userSeal(문자 배열)은 필터 대상이 아니다');
  assert.ok(!fm[1].includes("'hourActivity'"), 'hourActivity(수 배열)는 필터 대상이 아니다');
});

test('v400 實戰: sanitizeSword 가 soul 범위도 강제 (무덤과의 비대칭 해소)', () => {
  const idx = js.indexOf('const sanitizeSword = (sw) => {');
  assert.ok(idx > 0, 'sanitizeSword 존재');
  const block = js.slice(idx, idx + 2600);
  assert.match(block, /if \(sw\.soul != null\) sw\.soul = clampInt\(sw\.soul, 0, 100\)/,
    'soul 범위 강제 — 봉인·전당·현재 검 공통');
  // v388 이 무덤에 건 같은 클램프가 여전히 살아 있어야 한다 (한쪽만 남는 재발 방지)
  assert.match(js, /f\.soul = clampInt\(f\.soul, 0, 100\)/, '무덤 soul 클램프 유지');
});

test('v400 實戰: 간결 모드가 「살 수는 있는데 쓸 수 없는」 도구를 만들지 않는다', () => {
  // 조합소는 간결 모드에서도 숫돌·영석·점복석을 판다. 그러므로 무장 토글은
  // 「하나라도 지녔을 때」 반드시 드러나야 한다 (0개일 때만 숨긴다).
  assert.match(html, /body\.simple-mode:not\(\.has-stones\) #stone-row \{ display: none !important; \}/,
    '조건부 은폐 규칙');
  assert.doesNotMatch(html, /body\.simple-mode #stone-row,/, '무조건 은폐 재유입 금지');
  assert.match(js, /classList\.toggle\('has-stones',/, '보유 여부를 body 클래스로 반영');
  const ap = js.match(/function applySettings\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(ap, 'applySettings 본문');
  assert.match(ap[1], /ownsStones \? \['auto-check'\]/,
    '보유 중일 땐 숫돌·영석·점복 무장을 해제하지 않는다 (보이는 도구는 사용자의 것)');
});

test('v400 實戰: 실행 관문이 테스트 열거에 등록되어 있다', () => {
  const pkg = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '..', 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.test.includes('tests/play.test.js'), 'play.test.js 가 npm test 에 열거되어야 한다');
  ['domshim.js', 'player.js'].forEach(f => {
    assert.ok(fs.existsSync(require('node:path').join(__dirname, f)), '하니스 파일 존재: ' + f);
  });
  // 하니스는 의존성 0 규율을 지켜야 한다 (게임과 동일)
  ['domshim.js', 'player.js'].forEach(f => {
    const src = fs.readFileSync(require('node:path').join(__dirname, f), 'utf8');
    const reqs = [...src.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]);
    const external = reqs.filter(r => !r.startsWith('.') && !['fs', 'path', 'vm', 'node:test', 'node:assert'].includes(r));
    assert.deepStrictEqual(external, [], f + ' 가 외부 의존성을 끌어들였다: ' + external.join(', '));
  });
});

test('v400 實戰: 결정이 잠긴 동안 주 행동 버튼도 잠긴다 (조용한 무반응 차단)', () => {
  // #challenge 는 #stage 만 덮으므로 그 아래 #actions 의 버튼들은 화면에 남는다.
  // 잠그지 않으면 평소 라벨 그대로 활성인데 enhance()/sealSword()/fuseSwords() 가 조용히 return 한다.
  assert.match(js, /function lockActionButtons\(\)/, '잠금 헬퍼 존재');
  const lb = afterDecl('function lockActionButtons() {', 500);
  ['btnEnhance', "btn-seal-direct", "btn-fusion"].forEach(t =>
    assert.ok(lb.includes(t), '잠금 대상 누락: ' + t));
  assert.match(lb, /b\.disabled = true/, '실제로 비활성화');
  assert.match(lb, /b\.title = why/, '잠긴 사유 제공');
  // 세 전이 지점 + render 말미에서 호출 (해제는 render 가 진짜 조건을 재계산)
  assert.match(afterDecl('function showChallenge() {', 700), /lockActionButtons\(\)/, '도전 등장 시 잠금');
  assert.match(afterDecl('function showVoid(', 900), /lockActionButtons\(\)/, '회수창 진입 시 잠금');
  assert.match(js, /setTimeout\(\(\) => showVoid\(destroyedLevel\), 350\);\s*\n\s*lockActionButtons\(\)/,
    '파괴~회수창 갭에서도 잠금');
  assert.match(js, /if \(challenge \|\| rescueWindow \|\| voidPending\) lockActionButtons\(\)/,
    'render 말미에서 잠금 유지 (렌더가 되살리지 않게)');
  assert.match(afterDecl('function endChallenge() {', 600), /render\(\)/,
    '도전 종료 시 render 로 잠금 해제 (영구 잠금 방지)');
});

test('v400 實戰: 소독 대칭 — 나중에 붙은 컬렉션도 정규화에서 문자열이 훑인다', () => {
  const nm = js.match(/function normalizeState\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(nm, 'normalizeState 본문');
  const body = nm[1];
  assert.match(body, /const scrubStrings = \(o, depth\) =>/, '항목 전수 소독 헬퍼');
  assert.match(body, /o\[k\] = stripTags\(v\)/, '문자열 값 태그 제거');
  assert.match(body, /if \(Array\.isArray\(state\.rubbings\)\) state\.rubbings\.forEach/,
    '탁본 — 배열 확인 후 소독 (normalizeState는 단일 try — 여기서 던지면 이후 정규화가 통째로 건너뛴다)');
  assert.match(body, /if \(Array\.isArray\(state\.recentLog\)\) state\.recentLog\.forEach/, '최근 일지 소독');
  assert.match(body, /lastReportSnapshot\.week = ''/, '주보 스냅샷 week 형식 강제');
  // 주보는 사용자 조작 0회로 부팅 3초 후 자동으로 열린다 — 삽입 지점 escape 필수
  assert.match(js, /escapeHtml\(String\(prevWeek == null \? '' : prevWeek\)\)/, '주보 표시 시 escape');
});

test('v400 實戰: auto-repeat 가 결정을 대신 내리지 않는다 (5초 침묵 보호)', () => {
  const idx = js.indexOf("if (e.key === ' ' || e.key === 'Enter') {");
  assert.ok(idx > 0, 'Space/Enter 핸들러');
  const block = js.slice(idx, idx + 1500);
  assert.match(block, /if \(e\.repeat\) \{ e\.preventDefault\(\); return; \}/, 'auto-repeat 차단');
  // 모달이 도전/회수창을 덮고 있으면 베기·회수도 막는다 (v370r 이 enhance 만 막던 것 확장)
  assert.match(block, /if \(modalOpen\) return;\s*\n\s*if \(challenge\)/,
    '모달 은폐 중 slay/rescue 차단 — modalOpen 검사가 challenge 분기보다 앞');
  assert.doesNotMatch(block, /!btnEnhance\.disabled && !modalOpen/, '구 조건 재유입 금지');
});

test('v400 實戰: 겁이 바뀔 때 옛 도전을 데려가지 않는다', () => {
  const rb = afterDecl('function restartFromGameOver() {', 500);
  assert.match(rb, /if \(challenge\) endChallenge\(\);/, '재시작 시 활성 도전 정리');
  assert.ok(rb.indexOf('endChallenge()') < rb.indexOf('archiveEra()'),
    '도전 정리가 겁 아카이브·새 검보다 먼저');
});

test('v400 實戰: 조합소 게이트 — 초영이 누를 수 있는 상태가 존재한다', () => {
  // 옛 구조: 입장 조건(level === 0)과 초영 조건(level >= CHALLENGE_MIN_LEVEL)이 상호 배타 →
  // v375 기능 전체가 사문. 입장 게이트를 항목 게이트로 옮겨 두 조건이 공존 가능해졌다.
  const idx = js.indexOf("$('btn-forge').addEventListener('click'");
  assert.ok(idx > 0, '조합소 버튼 핸들러');
  const block = js.slice(idx, idx + 700);
  assert.match(block, /if \(!state\.hasSword\)/, '검 없음은 여전히 입장 차단');
  assert.doesNotMatch(block, /if \(state\.level > 0\) \{/, '입장 레벨 게이트 재유입 금지 (초영이 다시 사문이 된다)');
  // 「도구는 +0 에서만」 의도는 각 도구 레시피의 check 로 보존
  ['protection', 'protection10', 'whetstone', 'spiritstone', 'divinationstone'].forEach(k => {
    const ri = js.indexOf('    ' + k + ': {');
    assert.ok(ri > 0, k + ' 레시피 존재');
    assert.match(js.slice(ri, ri + 260), /check: \(\) => state\.level === 0/, k + ' 에 +0 게이트 없음');
  });
  assert.match(js, /btn\.title = ok \? \(enough \? '' :/, '비활성 사유를 title 로 노출');
});

test('v400 實戰: 무장 토글이 확률 표시를 갱신한다', () => {
  // 표시 계산은 armed 상태를 반영하는데 토글에 리스너가 없어 화면이 굳어 있었다.
  assert.match(js, /\['whet-check', 'spirit-check', 'divination-check', 'protect-check'\]\.forEach\(id => \{\s*\n\s*const el = \$\(id\);\s*\n\s*if \(el\) el\.addEventListener\('change', \(\) => render\(\)\);/,
    '네 토글 모두 change → render 배선');
});

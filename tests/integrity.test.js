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
  ['guardianBonus', 'soulEffects', 'getResolve', 'schoolSuccessBonus', 'breathBonus',
   'adversityReady', 'whet-check'].forEach(src =>
    assert.ok(body.includes(src), '성공 분해에 ' + src + ' 출처 누락'));
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

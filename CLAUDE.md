# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

원작: **검 강화하기 (NBS, vidkidz.tistory.com/5291)** — 클리커/강화 시뮬레이션의 *클로닝 + 증류 (distillation)* 버전.

증류 방향: 광고/꾸미기/펫 등 곁가지 제거, **"다음 한 번만 더" 도박 충동 + 파괴 후 5초 회수 윈도우의 침묵**이라는 본질적 드라마만 응축. 시각은 미니멀 흑금(따뜻한 다크 `--bg #1f1a14` 배경, `--accent #e8c454` 강조), 한국어 인터페이스.

## 빠른 오리엔테이션

새 인스턴스가 첫 5분 안에 잡을 그림:

- **파일**: `index.html` (인라인) + `server.js` (Express 정적 서버) + `package.json` + `render.yaml` + `supabase/schema.sql`. 누적 약 700KB 인라인 JS / 약 928KB index.html (단일 파일 — 읽기 전 규모 인지). git 추적 (`main` 브랜치, GitHub remote). Render Web Service 배포 가능, Supabase 연결.
- **루프**: 강화(`enhance`) → 파괴 시 5초 회수(`showVoid`) → 강화 성공 시 그림자(`maybeTriggerChallenge`, 4종 변종) → 베기(`slay`) → 자발 봉인(`sealSword`, 도 검은 컷씬) → 새 검(`newSword`) + 명문(`checkInscriptions`) + 첫 강화 시 검의 형(`decideForm`).
- **결정 차원**: 강화 / 방지권 / 회수 / 베기 / 물러남 / 봉인 / 숫돌 / 영석.
- **상태 진입점**: `let state = {...}` 한 객체. `localStorage['reinforce_sword_v1']`. 음소거는 별도 키 `reinforce_sword_muted`.
- **휘발성 상태**: 모듈 스코프 변수 — `challenge`, `rescueWindow`, `inscribeQueue`, `audioCtx`, `muted`. 새로고침 시 사라짐 (의도) / muted는 별도 보존.
- **렌더 모델**: 매 액션 후 `save()` → `render()` 풀 리렌더. 부분 업데이트 없음.
- **시각 톤** (`:root` 라이브 값): `--bg #1f1a14` / `--bg-2 #2a221b` / `--fg #f0ece0` / `--dim #968d80` / `--accent #e8c454` / `--danger #d04830` / `--safe #6a9a6a` / `--line #3a322a`. 한국어 미니멀(한자→한글 음역 마이그레이션 ~99.5% 완료, 시스템 카탈로그의 한자명은 개념·역사 참조), 자간으로 호흡. 색은 항상 CSS 변수(var(--accent) 등) 사용 — 하드코딩 hex(#d4af37 등 레거시)는 테마 전환을 안 따르므로 금지. theme-* 변형이 --accent 등을 재정의.
- **소리**: Web Audio API 톤 합성, 외부 파일 0. 첫 사용자 인터랙션 후 `audioCtx` lazy 시작. M키 음소거.

## 개발 / 실행

빌드 시스템 없음 — 단일 `index.html`.

```bash
# 실행
open index.html

# JS parse 검증 (편집 후 필수) — npm run lint:parse 와 동일
node -e "
const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);
new Function(m[1]);
console.log('OK', m[1].length, 'bytes');
"

# 회귀 테스트 (편집 후 필수) — node --test, 의존성 0
npm test
```

**테스트 (`tests/`, node --test — 파일 명시 열거, glob 금지):** 두 계층이다. ① **조각 검증** — `harness.js`가 인라인 스크립트에서 순수 함수/상수를 추출(`extractConst`/`loadFunctions`)해 격리 sandbox에서 검증한다 (pure/logic/load), 소스 텍스트 정규식(integrity), 재구현 모델 몬테카를로(simulation). ② **실행 검증 (v400)** — `domshim.js`(최소 DOM + 가상 시계 + 시드 난수)가 게임 IIFE를 통째로 부팅하고 `player.js`(자동 플레이어 로봇)가 실제로 조작한다 (play.test.js). index.html은 어느 쪽에도 비침투 보존. 새 `*.test.js` 추가 시 `package.json` test 스크립트에도 열거할 것 (v392 관문 테스트가 누락을 잡는다). CI(GitHub Actions, Node 20/22/24)가 push/PR마다 강제. 게임 곡선·dial·구조 불변식·**실제 실행 동작**이 ~414 테스트로 잠겨 있으니 **편집 후 `npm test` 필수** (약 50초). 잠긴 항목 예: TABLE / SHADOW_TYPES / sealReward·sealRewardBase / enhanceCost·successChanceNow·effectiveDestroyChance 분해 완전성 / breathBonus(呼吸)·soulEffects(魂)·RESOLVE(覺悟)·guardianBonus(守)·MASTERY_TIERS(流派)·affinity(形相剋) / escapeHtml(공유데이터 XSS) / 동명 함수 중복 금지 / 레시피·砥 라벨 == 실제값. 새 dial/보너스 추가 시 해당 테스트도 갱신.

진행도 초기화는 게임 내 "초기화" 버튼(`location.reload()` 방식 — v289) 또는 DevTools에서 `localStorage.removeItem('reinforce_sword_v1')`.

## 아키텍처 — 단일 파일 단일 IIFE

전체 게임이 `index.html` 하나에 들어있다. CSS / SVG 검 / JS 모두 인라인. JS는 `(function(){...})()` IIFE로 감싸 전역 오염 없음. 빌드 0, npm 의존성은 서버(express)뿐. CDN은 선택적 향상 2종만 — Supabase(v82 클라우드)와 Noto Serif KR 서체(v393) — 둘 다 오프라인/file://에서 조용히 폴백 (게임 로직 무의존).

### 핵심 상태 (`state`)

```js
{ level, shards, protections, hasSword, bestLevel,
  totalDestroyed, totalSlain,
  sealedSwords: [{level, inscriptions, form?, soul?, name?}],
  currentSword: { enhanceAttempts, slainCount, inscriptions, form, soul },
  whetstones, spiritstones,
  firstWayReached,  // v16 — 첫 道 도달 후 영구
  stats: { enhanceAttempts, enhanceSuccess, challengesAppeared,
           slainNormal/Flee/Steel/Demon, fled, evaded,
           rescued, rescueFailed, sealed, wayReached },
  seenHelp }
// sealedSwords 항목에 v15에서 verse, slainCount 추가됨
```

`level`은 현재 검 강화도(0~MAX). `hasSword=false`는 파괴 후 새 검을 빚기 전 상태 — 강화 버튼이 "새 검 빚기" 모드로 전환되고 융검/재련의 길이 열림 (조합소는 검없음에서 입장 차단, v390). `sealedSwords`는 자발적으로 봉인한 검의 계보 (검 한 자루의 *생애* 기록). `currentSword`는 현재 검의 일대기 — 봉인 시 `sealedSwords`로 옮겨지고 새 검 시작 시 리셋. `localStorage[SAVE_KEY]`에 매 액션 후 `save()`. `load()`는 `Object.assign`으로 기본값 병합 후 `sealedSwords` / `currentSword.inscriptions` 배열 형변환 보정.

### 강화 테이블 (`TABLE`)

`TABLE[lv]`는 `lv → lv+1` 강화의 룰 한 줄: `{ success, destroy, downgrade, cost }`. `success + (실패 시 destroy / downgrade / 유지)` 구조. `destroy + downgrade <= 1` 불변식, 나머지는 "유지". `cost`는 **조각** (골드 통화 없음 — 증류 결정).

테이블을 손볼 때 주의:
- `+0→+1`은 `cost: 0, success: 1.00` 유지 (튜토리얼)
- `destroy`가 처음 등장하는 지점이 **드라마의 시작**. 현재 +5(5%). 이걸 옮기면 게임 곡선 자체가 바뀜
- `bestLevel`은 한 번 도달하면 영구 — 테이블 어렵게 바꾸면 기존 저장 파일이 박제됨

### 빈 검집 (`showVoid` / `rescueWindow`)

파괴 → `voidEl.classList.add('active')` → 5초 카운트다운 → `rescueCircle` 클릭으로 조각 회수. v1 Quantum Leap. `setInterval` 100ms tick + `setTimeout` 5000ms 안전망 이중. `rescued` flag로 더블클릭 보호. `rescueWindow`는 모듈 스코프 변수 — 활성화/null만 토글.

윈도우 중에는 강화 UI 자체가 `swordWrap.opacity=0`으로 가려진다. 단 `footer` 버튼(조합소 / 초기화)은 노출 — 의도된 긴장 (모달 열어도 타이머는 흐름).

### 一閃 (`challenge` / `slay` / `flee`) — v2

강화 성공 직후 `maybeTriggerChallenge()` 호출. 등장 확률 = `min(CHALLENGE_MAX_CHANCE, (0.13 + level * 0.018) * seasonMul * solarChallengeMul())` — 검이 강할수록 그림자가 끌어들임. 기본 곡선은 `min(0.45, 0.13 + level * 0.018)`이고 여기에 季節(v37)·절기(v263) 곱항이 추가로 변조한다. `CHALLENGE_MIN_LEVEL=1` (검 +0 보호). `state.hasSword` 필수.

도전은 **휘발성** — `challenge` 모듈 스코프 변수만 사용, `state`에 저장 안 함. 새로고침 시 사라짐 (도망친 셈). 영구 통계 `state.totalSlain`만 보존.

판정: `state.level >= challenge.strength` → 베어냄 (조각·명성 +1, 강도≥8이면 35%로 보너스 방지권). 아니면 검 흔들림 — 방지권 `ceil((strength - level) / 2)`개로 차단 가능, 없으면 `level -= 1`.

UI 흐름: `showChallenge`는 `swordWrap.opacity=0`로 검 stage 숨기고 `#challenge.active`로 오버레이. `slay()` 시작 시 `challenge = null` 즉시 잠금 → 더블클릭 안전. `endChallenge()`는 결과 애니메이션 후 호출 (성공 900ms, 실패 500ms).

가드: `enhance()` 초입에 `if (challenge || rescueWindow) return;` — 동시 활성 차단.

### 렌더 (`render`)

모든 상태 변경 후 `render()` 호출 — 통계 / SVG 검 외형 / 강화 정보 / 방지권 row 전부 재계산. 부분 업데이트 없음, 단순함이 우선.

검 외형은 `state.level`에 따라 (v40+ path 기반 재설계 — `buildSwordBody(level, form, seal)`가 5 Tier별 SVG 문자열을 동적 생성, `applyLevelVisual()`에서 주입):
- 칼날: tier별 Bézier path + `blade-grad-1~5` 그라데이션, tier≥4는 `strong-glow` 필터
- `swordSvg` class `glow-0/low/mid/high/divine` (`applyLevelVisual`에서 setAttribute)
- 가드 장식 / 폼멜 / 보석은 tier별로 path 문자열 안에 포함 (별도 정적 요소 아님)
- 주의: v40 이전 정적 요소 `blade` / `guard-deco` / `pommel` / `blade-shine`은 제거됨 — `$()`로 잡지 말 것 (항상 null). integrity.test.js가 재유입 차단.

### 조합소 (`recipes`)

`recipes` 객체에 레시피 정의 (`cost` / `check?` / `run` / `isSpecial?`). DOM에는 `data-recipe="<key>"` 속성으로 매핑. `isSpecial:true`면 cost 체크 건너뜀 (봉인처럼 보상을 주는 항목용). 새 레시피 추가 시: HTML `.recipe` 블록 + `recipes` 객체 항목 두 곳만 손대면 됨. `updateForgeButtons()`는 모달 열 때 호출 — 동적 desc(예: `recipe-seal-desc`) 갱신은 여기서.

### 封印 / 剛氣 (`sealSword` / `newSword` / `startBonus`) — v3

자발적 종결 차원. `state.level >= SEAL_MIN_LEVEL(3)` 일 때 조합소에서 봉인 가능 → 검이 `state.sealedSwords`에 들어가고, `sealReward(lv) = floor(lv^1.65 * 3) + lv` 만큼 조각 환원, 새 검 자동 생성. 새 검의 시작 단계는 `startBonus() = min(6, floor(legacyStrength() / 25))` — 누적 강기에 따른 작은 영구 보너스. `START_BONUS_CAP=6`으로 점수 인플레이션 차단.

`newSword()`는 봉인 후·메인 화면 새 검 빚기(newsword 모드)·융검·재련·게임오버 재시작에서 호출되는 통합 진입점 — 시작 보너스 일관 적용. `bestLevel`도 여기서 함께 갱신. (조합소 `newsword` 레시피는 v390에서 제거 — 조합소 입장이 검없음에서 차단되어 도달 불가였던 죽은 UI.)

가드: `sealSword()` 초입에 `if (challenge || rescueWindow) return;` — 도전/회수 활성 중 봉인 차단.

계보 모달 (`renderLegacy`): footer "계보" 버튼 → 봉인된 검 목록 (최신순) + 강기·다음 시작 보너스 요약. 비어있을 때 안내 메시지.

**검 없음 상태 흐름 (v31+ 보강):** 검 파괴 → 회수 실패 시 `hasSword=false`. 흐름 단절 방지:
- 강화 버튼이 자동으로 "새 검 빚 기 · 조각 50"으로 전환 (`btnEnhance.dataset.mode = 'newsword'`)
- 조각 부족 시 라벨에 사유: "조 각 부 족 (50 필요 / 보유 N)"
- 회수 실패 직후 `inscribeQueue`로 "失 — 검을 잃었다 · 새 검을 빚어라" 큰 페이드 (재활용)
- 검 보유 중 강화 시 조각 부족이면 "조 각 부 족 (N 필요 / 보유 M)" 명시 — 왜 비활성인지 즉시 인지

`btnEnhance`는 두 모드 — `dataset.mode` 분기로 클릭 시 enhance() 또는 newSword 빚기. 사용자가 조합소 모달 거치지 않고도 메인 화면에서 직접 빚기.

**검 팔기 진입점 (단일):** 봉인은 사실상 *검 매각* — 게임의 주된 자원 획득 경로. **메인 화면 직접 버튼** (`#btn-seal-direct`) 하나만 — 강화 버튼 바로 아래. 라벨 "팔 기 · {자동검명}  +N 조각"으로 보상과 검명을 직접 표시. 조건 미달(`< SEAL_MIN_LEVEL` 또는 검 없음) 시 사유 함께 비활성. +10 이상 검은 `confirm()` 한 번 (실수 방지). 조합소 모달의 중복 항목은 v40+ 정리에서 제거됨.

`renderSealButton()`이 매 `render()`마다 라벨/활성 갱신 — 봉인 보상은 형/道/유파/季節/久古 모두 반영한 *실제* 금액.

### 銘 (`INSCRIPTIONS` / `checkInscriptions`) — v4

검 한 자루의 일대기. 5개 명문은 검의 *경험*에 따라 자동 새겨짐:

| key | trigger | 효과 |
|---|---|---|
| 初刃 | `slainCount >= 1` | (서사) |
| 百鍊 | `enhanceAttempts >= 10` | (서사) |
| 剛體 | `state.level >= 10` | (서사) |
| 回魔 | `slainCount >= 5` | (서사) |
| 道 | `state.level >= MAX_LEVEL` | **봉인 보상 ×1.5** |

새 명문 추가 시: `INSCRIPTIONS` 배열에 `{key, label, trigger}` 한 줄 추가. trigger는 `() => boolean` — `state`와 `state.currentSword` 직접 참조. 서사 명문은 효과 없음 — *점수 인플레이션 회피*. 메커니즘 영향은 `道` 하나만 (`sealSword`의 1.5배 분기) — 추가 효과 명문이 정 필요하면 그 함수 자체를 수정해야 함 (도배 회피용 의도적 마찰).

호출 위치 (4곳):
- `enhance()` 성공 분기 직후 (`百鍊·剛體·道`)
- `enhance()` 실패 분기 끝 (`百鍊` — 실패도 시도로 카운트)
- `slay()` 성공 시 (`初刃·回魔`)
- `newSword()` 끝 (시작 보너스로 +10 진입 시 즉시 `剛體`)

새겨질 때 `inscribeQueue`로 순차 재생 (한 강화에 여러 명문 동시 트리거 가능 → 2.5초씩 순차). 화면 페이드 오버레이는 `#inscribe-overlay.active` 토글 + 강제 리플로우(`void el.offsetWidth`)로 애니메이션 재시작.

검 위 작은 표시는 `#sword-inscriptions` (`renderInscriptions()`가 `state.currentSword.inscriptions.join(' · ')`로 갱신). 봉인 후 계보 모달은 각 검의 명문 목록과 `道` 뱃지를 표시.

### 影의 種類 (`SHADOW_TYPES` / `rollShadowType`) — v5

도전 그림자 4종:

| key | 가중치 | 강도 | 보상 | 메커니즘 |
|---|---|---|---|---|
| `normal` (影) | 0.65 | 기본 | 기본 | — |
| `flee` (逃影) | 0.22 | ×0.85 | ×1.8 | `slayEvade: 0.35` — 베기 시 35% 도망 |
| `steel` (鋼影) | 0.10 | +3 | ×1.5 | 강철, 단단 |
| `demon` (劍鬼) | 0.03 | `bestLevel + 5` | `strength × 7` | 베면 `鬼斬` 보너스 명문 |

각 type은 `#shadow-form` class로 시각 차별화 (`flee-type`/`steel-type`/`demon-type`). 가중치 합 = 1.0 보장. 새 변종 추가 시 `SHADOW_TYPES` 배열에 한 항목 + CSS class 정의.

### 形 (`SWORD_FORMS` / `decideForm` / `getForm`) — v6

검의 천성. 첫 강화 시 4종 중 선택 (v109 選形 — `decideForm` → `showFormSelectModal`, 원래 v6 균일 랜덤에서 플레이어 선택으로 변경) — 봉인까지 유지. 각 형은 미세 편향:

| key | 효과 |
|---|---|
| `직` (直) | `successBonus: 0.03` (강화 성공률 +3%) |
| `곡` (曲) | `destroyReduce: 0.03` (파괴 확률 -3%) |
| `중` (重) | `costMul: 1.10`, `rewardMul: 1.20` (강화 비용 +10%, 도전 보상 +20%) |
| `속` (速) | `fleeFree: true` (물러남 무료) |

> `SWORD_FORMS`의 실제 키는 한글 `'직'/'곡'/'중'/'속'` (한자→한글 마이그레이션 완료). 코드 grep·`state.currentSword.form` 비교는 한글 키 사용. 위 한자는 개념 참조.

`getForm()`은 현재 검의 form 객체 반환. 메커니즘 영향 위치:
- `enhance()` — `successBonus`, `destroyReduce`, `costMul` (cost 표시도 갱신)
- `maybeTriggerChallenge()` — `rewardMul`
- `flee()` — `fleeFree`

`applyFormVisual()`은 `<polygon id="blade">`의 `points` 속성을 form별로 교체 — SVG 외형 변경.

### 儀式 (`playRitual`) — v7

道 명문이 있는 검을 봉인할 때만 발동. 5.5초 풀스크린 컷씬 — 形별 시구 + 명문 목록 + 강화도 + 회수 조각. `#ritual-overlay.active` 토글 + 강제 리플로우. 형별 시구는 `playRitual` 내부 `formVerse` 딕셔너리. SFX는 `SFX.ritual()` (저음 종 3중주).

### 砥·靈 (`whetstones` / `spiritstones`) — v8

일회용 강화 보조. 조합소에서 빚기 → 다음 강화 1회에만 영향:

| 아이템 | 비용 | 효과 |
|---|---|---|
| `whetstone` (砥) | 8 조각 | 성공률 +25% |
| `spiritstone` (靈) | 25 조각 | 파괴 확률 → 0 (이번 1회) |

UI: 강화 버튼 위 `#stone-row` 토글 2개. 비활성 조건:
- 砥: 보유 0개 → 비활성
- 靈: 보유 0개 OR `t.destroy === 0` → 비활성 (필요 없는 단계에서 자동 차단)

소모 시점: `enhance()` 비용 차감 시 함께. 매 강화 후 양쪽 체크 자동 해제.

### 響 (`SFX` / `tone` / `noise`) — v9

Web Audio API 톤 합성. 외부 음원 파일 0. `audioCtx`는 첫 사용자 인터랙션 후 lazy 생성 (브라우저 정책). `getAudio()`는 muted 시 null 반환 → 호출자가 안전하게 skip.

`tone(freq, dur, type, vol, freqEnd?)` — 단일 오실레이터 + 지수감쇠 envelope. `freqEnd` 주면 sweep (베기 일순용).
`noise(dur, vol)` — 화이트 노이즈 버퍼 + 선형감쇠 (파괴 시 깨짐 소리).

SFX 카탈로그 (11종):

| key | 위치 | 음 |
|---|---|---|
| `enhanceSuccess` | 강화 성공 | 660Hz → 990Hz 옥타브 (2음) |
| `enhanceFail` | 강화 실패 | 160Hz sawtooth 둔탁 |
| `destroy` | 검 파괴 | 노이즈 + 80Hz 저음 |
| `rescueSave` | 회수 성공 | 330Hz → 660Hz (안도) |
| `slash` | 베기 일순 | 2000Hz → 200Hz sweep (휩) |
| `challengeAppear` | 그림자 등장 | 240Hz → 180Hz 하강 (긴장) |
| `seal` | 일반 봉인 | 280Hz + 420Hz 종 |
| `inscribe` | 명문 새겨짐 | 1200Hz → 1600Hz 차임 |
| `ritual` | 道 봉인 컷씬 | 180/240/360Hz 저음 종 3중주 |
| `forge` | 조합소 빚기 | 520Hz 짧은 톤 |
| `formDecide` | 검의 형 결정 | 440Hz → 660Hz |

음소거: `muted` 변수 + `localStorage['reinforce_sword_muted']`. `toggleMute()` (M키 / footer 버튼). 새 SFX 추가 시 `SFX` 객체에 한 줄, 호출은 액션 핵심 분기에서 직접.

### 魂 (`addSoul` / `getSoulStage` / `soulEffects`) — v10

검의 후천적 의식. 0~100 게이지. 액션마다 충전:

- 강화 시도 +1, 베기 +6, 검귀 베기 추가 +10
- `addSoul(amount)` 호출. 임계 도달 시 명문 자동 부여 (`覺`/`本`)

단계 효과 (`soulEffects()`):

| 단계 | 임계 | 효과 |
|---|---|---|
| 평범 (plain) | 0~33 | — |
| 覺 (wake) | 34~66 | 강화 성공 +2% |
| 本 (true) | 67~100 | 강화 성공 +4%, 도전 보상 ×1.15 |

검 아래 `#soul-bar`/`#soul-fill` (단계별 색 변화) + `#soul-stage-label`. 봉인 시 `sealedSwords[i].soul`로 보존. 새 검은 0으로 시작.

### 銘名 (`makeSwordName`) — v11

봉인 시 자동 검명 부여. 우선순위: `道 > 鬼斬 > 本 > 剛體 > 覺 > 강화도(한자)`. 결과는 `form + suffix`. 예: `直道` (직검+도), `曲魔` (곡검+검귀베기), `重本` (중검+본질), `速七` (속검+강화7).

`NAME_SUFFIX` 배열 순서 = 우선순위. `NUM_KANJI` 0~15. 계보 모달은 검명을 굵게, `道` 의식 컷씬도 `makeSwordName` 출력.

### 流派 (`SCHOOLS` / `getActiveSchools`) — v12

같은 형의 검을 `SCHOOL_THRESHOLD(3)`자루 이상 봉인 시 유파 등극. 4유파:

| 유파 | 효과 함수 | 효과 |
|---|---|---|
| `直流` | `schoolSuccessBonus()` | 강화 성공 +1% |
| `曲流` | `schoolDestroyReduce()` | 파괴 -1% |
| `重流` | `schoolSealMul()` | 봉인 보상 ×1.10 |
| `速流` | `schoolRescueSec()` | 회수 +1.0초 |

유파는 봉인 시 등극 즉시 활성. `announceInscription`으로 등극 알림. 계보 모달 상단에 활성 유파 + 진행도 표시. 효과는 함수 호출로 합산 — 새 유파 추가 시 `SCHOOLS{}` 한 항목 + `school*Bonus()` 헬퍼 한 줄.

### 視覺 깊이 (`spawnDust` / stage aura) — v13

`#stage::before` 라디얼 그라데이션으로 검 주위 황금 빛. `lv >= 5` `aura-mid`, `>=10` `aura-high`, `>=15` `aura-divine`(호흡 애니). 劍鬼 등장 시 `stage.darken` 펄스 (0.7초). `setInterval(spawnDust, 900)`로 `lv >= 8` 검 주위에 황금 입자가 천천히 떠다님 (Web Animations API, 자동 정리). 점수 인플레이션 없음 — 순수 시각.

### 統計 (`state.stats` / `bumpStat` / `renderStats`) — v14

14종 누적 통계. `bumpStat(key)`로 안전 증가. footer "기록" 버튼 → 통계 모달. 강화 성공률, type별 격파 수, 회수 성공/실패, 봉인/道 도달 횟수 등.

새 통계 추가 시: `state.stats` 기본값 추가 + `load()` 보정 + 호출 위치에 `bumpStat('newKey')` + `renderStats()`에 `row(...)` 한 줄. 4곳.

### 一生詩 (`generateVerse`) — v15

道 검 봉인 시 검의 형/명문/강화도/슬레인으로 4행 시구를 자동 생성. 의식 컷씬과 계보 모달 양쪽에 표시. 생성 로직은 단순 조건 분기:

- 1행: `form` → "강직의 검 한 자루" 등
- 2행: 정점 명문 우선 (鬼斬+本 > 鬼斬 > 本 > 剛體 > 覺 > 百鍊 > 무명)
- 3행: `slainCount` 구간 (0 / 1 / <5 / <10 / 이상)
- 4행: "+N 의 봉인" 일정

새 시구 분기 추가 시: `generateVerse` 내 if/else 사슬에 한 줄. `sealedSwords[i].verse` 배열로 영구 저장.

### 始祖 (`firstWayReached` / `newSword`) — v16

첫 道 도달 시 `state.firstWayReached = true`. 영구 메타 변수. 이후 모든 `newSword()` 호출에서 새 검의 `currentSword.inscriptions = ['始祖']`, `soul = 10`. 시작부터 깨어남 직전에 도달 — 메타 정점 표시.

봉인 시 첫 道이면 컷씬 종료 5.8초 후 `announceInscription('始祖', ...)` 지연 알림.

### 呼吸 (`lastEnhanceTime` / `breathBonus`) — v17

강화 사이 시간 추적 (모듈 스코프 변수, 새로고침 시 0 → 첫 강화는 최대 보너스). 임계:

| 경과 | 보너스 | 라벨 |
|---|---|---|
| 60초+ | +10% | 깊은 호흡 |
| 20~60초 | +5% | 호흡 |
| 8~20초 | +2% | 얕은 호흡 |
| <8초 | 0 | — |

odds 표시(`oddsSuccess`)에 호흡 라벨 동적 추가. 3초마다 `setInterval`로 호흡 단계 변화 감지 → render 갱신. 강화 시도 시 `lastEnhanceTime = Date.now()`로 리셋. 휘발성이라 새로고침 = 깊은 호흡 가능 (악용 방지 X — 의도적 자유).

### 久 / 古 (검의 노쇠) — v18

`enhanceAttempts >= 50` → 久, `>= 100` → 古. 순수 정체성 명문 (효과 X). 검명 우선순위 표 (`NAME_SUFFIX`)에서 가장 낮음 — 道/鬼斬/本/剛/覺이 있으면 그쪽 우선.

### 命名 (사용자 검명) — v19

봉인 시 `state.level >= 5` 또는 道이면 `prompt()`로 사용자 입력 받음. 비우면 자동 검명 유지, 입력하면 덮어쓰기 (최대 16자). 작은 봉인은 흐름 방해 X. try/catch — prompt 차단 환경 안전.

### 銘詩 (`INSCRIPTIONS[].verse`) — v20

각 명문에 짧은 시구 한 줄. `runInscribeQueue()`가 label 아래 verse를 작은 텍스트로 표시. 11개 명문 모두 verse 보유.

새 명문 추가 시 verse 필드도 함께 추가.

### 達人 / 聖 (`newSword` 메타 단계) — v21

`stats.wayReached >= 5` → 達人, `>= 10` → 聖 명문이 모든 새 검에 자동. 시작 魂도 단계 보너스 (始祖 10 / 達人 20 / 聖 30 — `Math.max`로 단일 적용). 5번째/10번째 道 봉인 직후 의식 컷씬 종료에 맞춰 `announceInscription` 지연 알림.

### 詩集 (`renderAnthology` / `#anthology-modal`) — v22

道 검의 일생시(`verse`)만 모아 큰 활자로 보여주는 모달. footer "詩集" 버튼. `state.sealedSwords.filter(s => s.verse)` 필터링 — 道 명문 없는 검은 verse가 null이라 자동 제외. 사용자가 자기 검들의 *합창*을 읽는 차원.

### 銘刻 (`applyInscriptionVisual`) — v23

정점 명문이 검 SVG 자체에 새겨짐. SVG element 3개 조건부 opacity 토글:

| 명문 | SVG element | 표현 |
|---|---|---|
| 道 | `#mark-way` (`<line>`) | 칼날 중앙 황금 줄 발광 |
| 鬼斬 | `#mark-demon` (`<circle>`) | 칼끝 붉은 점 |
| 本 | `#mark-honest` (`<polygon>`) | 칼날 끝 푸른 마름모 |

`render()` 안에서 `applyInscriptionVisual()` 호출 — 명문 새겨지면 즉시 시각화.

### 命名 의식 (`askName` / `#name-modal`) — v24+v25

이전 v19의 `prompt()`를 in-app 모달로 대체. 게임 톤(흑금) 유지. Enter=확정 / Esc=자동 검명. `askName(autoName, form, ins, lv, reward, verse, callback)` — 모달 띄우고 입력 받은 후 callback. 봉인 흐름은 `sealSword()` → `askName()` → `doSeal()` 분리.

v25 미리 보기: 모달 상단에 검의 일생 요약 (형 · 명문 · 회수 조각 · 道이면 시구 4행). 사용자가 *결정의 무게*를 느끼고 봉인.

### 道魂 (`whisperFromAncestor`) — v26

도전 등장 1.2초 후 봉인된 道 검의 시구 한 줄이 화면 우측 상단에 5초 페이드. 같은 형 우선, 없으면 임의. 봉인된 道 검 0이면 발동 안 함. `#ancestor-whisper` 요소 + `.active` 클래스 토글.

### 季節 (`getSeason` / `applySeason`) — v27

누적 강화 시도 기반 4계절 — `body.season-*` 클래스로 배경 색조 점진 변화. 우측 상단 작은 `#season-mark` (春/夏/秋/冬). 4초 transition. 점수 인플레이션 X.

| 계절 | 임계 | 색조 |
|---|---|---|
| 春 | <50 | 기본 (var(--bg)) |
| 夏 | 50~149 | 따뜻한 회색 (#0d0b08) |
| 秋 | 150~399 | 황혼 (#0e0a08) |
| 冬 | 400+ | 깊은 침묵 (#08080c) |

### 안내 (도움말 모달 단축키 표) — v28

도움말 모달 끝에 4개 단축키 표시 (Space/Esc/P/M). footer "안내" 버튼으로 언제든 재열기. 기존 사용자(`seenHelp=true`)도 발견 가능.

### 봉인 버튼 검명 표시 (現劍) — v29

봉인 버튼 라벨에 자동 검명 포함 (예: "봉 인 · 直道  +414 조각"). 사용자가 검 보면서 *지금 봉인하면 무엇이 될지* 즉시 확인. `renderSealButton` 안에서 `makeSwordName` 호출.

### 敵流 (`SHADOW_ORIGINS` / `rollShadowOrigin`) — v30

도전마다 그림자에게 4학파 중 하나 부여:

| key | 시구 (whisper) |
|---|---|
| 夜流 | 밤에서 온 그림자 |
| 霧流 | 안개 속에서 솟은 그림자 |
| 骨流 | 뼈와 같이 마른 그림자 |
| 焰流 | 꺼진 불에서 남은 그림자 |

`challenge.origin`에 저장. 도전 stage `#shadow-strength`에 학파 표시. 베어내면 `state.shadowOriginsSlain[key]++` (영구). 4학파 모두 베면 **斷魔** 보너스 명문 자동 부여.

### 劍舞 (mouse/touch tilt) — v31

검 SVG가 `#sword-wrap` 위 마우스/터치 위치에 따라 ±8° 기울어짐. cosmetic only — 게임 메커니즘 영향 X. mouseleave/touchend 시 0°로 복귀. 도전/회수 활성 시 무력화 (다른 UI가 stage 가림).

### 回顧 (`showSwordDetail` / `#sword-detail-modal`) — v32

계보 모달 봉인 검 클릭 → 상세 회고 모달. 검 한 자루의 *전체 일생*:
- 검명 + 인덱스 + 형(한자+한글)
- 강화도, 魂, 베어낸 그림자 수
- 모든 명문 + 각 명문의 시구
- 일생시 (道 검만)

`item.dataset.swordIdx` + 이벤트 위임. 도(道) 검만이 아닌 *모든* 봉인 검에 회고 가능 — 평범한 봉인도 한 자루의 검.

### 계보 필터 (`legacyFilter`) — v32 동반

계보 모달 상단에 형별/道별 필터 버튼 (`all / 直 / 曲 / 重 / 速 / 道`). 봉인 검 많아질 때 유용. 0개 형은 자동 숨김 (`filter(f => f.count > 0)`).

### 傳授 (`heritageInscription`) — v33

道 검 봉인 시 그 검의 *희귀 명문 1개*가 다음 검에 자동 전수. 우선순위: `斷魔 > 鬼斬 > 古 > 久`. 始祖/達人/聖은 메타라 *전수 대상 외* (그 자체가 영원). 효과 X — 순수 서사. `state.heritageInscription`에 임시 저장 → `newSword()`에서 push & null.

봉인 직후 `announceInscription(heritage, '다음 검에 전수되었다')` 알림 — 사용자에게 *이 명문이 자손에 깃든다* 인지.

### 斬 의식 (一閃 결과 페이드) — v34

베기 성공: `斬 · {그림자 type} · 조각 +N` 큰 페이드. 실패: `失 · 베기 실패 · 검 강화도 -1` 또는 `盾 · 방지권 N — 흔들림 방어`. `inscribeQueue` 재활용 — 명문 시스템과 동일 페이드 UI.

### 신규 마일스톤 (`maybeMilestone`) — v35

한 번씩만 표시되는 페이드 안내. `state.milestonesShown[key]`로 영구 추적:

| key | 한자 | 트리거 | 안내 |
|---|---|---|---|
| `first1` | 一 | 첫 +1 | 첫 강화 — 검의 일생이 시작된다 |
| `firstSeal` | 封 | 첫 +3 | 봉인하여 매각 가능 |
| `firstChallenge` | 影 | 첫 도전 등장 | 베거나 물러서라 |
| `firstDestroy` | 破 | 첫 검 파괴 | 다섯 호흡 안에 조각 회수 |

새 마일스톤 추가 시: 호출 위치에 `maybeMilestone('key', 'kanji', '안내')` 한 줄. INSCRIPTIONS와 분리 — 한자만 페이드 표시되고 verse 없음.

### 修練 (자동 강화) — v36

토글 ON 시 `AUTO_INTERVAL(800ms)`마다 `autoStep()` — 강화 실행. 자동 중지 조건 (4가지):
- 검 없음 → 중지
- 현재 단계 `t.destroy > 0` (파괴 위험) → 중지 (게임 본질 유지)
- `state.level >= MAX_LEVEL` (도 도달) → 중지
- 조각 부족 → 중지

도전/회수 활성 시는 *대기* (중지 X) — 사용자 결정 후 자동 재개. `autoEnhanceTimer` 모듈 변수 + `auto-check` checkbox. 휘발성 — 새로고침 시 OFF.

### 季節·久古 효과 — v37

v27 季節과 v18 久/古의 *시각만* → *기능* 통합. 모두 페널티+보상 균형:

| 季節 | 효과 |
|---|---|
| 春 | 강화 비용 ×0.95 |
| 夏 | 도전 등장 확률 ×1.05 |
| 秋 | 봉인 보상 ×1.05 |
| 冬 | 회수 윈도우 +1.0초 |

| 노쇠 | 효과 |
|---|---|
| 久 | 강화 비용 ×1.05, 봉인 보상 ×1.05 |
| 古 | 강화 비용 ×1.10, 봉인 보상 ×1.10 |

`getSeason()`은 객체 반환 (`{key, name, costMul, challengeMul, sealMul, rescueSec}`). `getAgeEffect()`도 동일 패턴. 강화 비용은 `t.cost * formCostMul * seasonCostMul * ageCostMul` 곱셈 누적. 봉인 보상은 각 단계별 `Math.floor` 적용. *모든* 효과를 점수 인플레이션 회피로 균형 ±10% 이내.

### footer 정리 / 햄버거 메뉴 — v38

footer 7개 버튼 → 3개 (조합소·계보·詩集) + 우상단 ≡ 메뉴 (기록·안내·소리·초기화). `#menu-drop` 드롭다운 — 클릭 외부 시 자동 닫힘, 메뉴 항목 클릭 후 자동 닫힘. 모바일 가독성 ↑.

### 정점 검 발산 — v39

本 또는 道 명문 보유 시 `#sword-wrap.transcendent` 클래스 부여 → 3.5초 호흡 애니메이션으로 SVG 전체 발광. `applyInscriptionVisual()`에서 토글.

### 검 형태 진화 — v40

강화도별 칼날 *길이* 변화. `tipY` 동적 계산:
- 기본: `y=8`
- +10 이상: `y=4` (길어짐)
- +14 이상: `y=2` (더 길고 가늘)

각 형(直/曲/重/速)의 polygon points가 tipY 기반으로 재구성 — 형 + 강화도가 *합성*된 검 외형. 曲 형은 중앙 굴곡점도 tipY 비율로 조정.

### v40+ 시각/음향 강화 (정점 정리)

**검 디자인 퀀텀 변경 (v40+)**:
- SVG `<defs>` 도입 — 5개 칼날 그라데이션 (`blade-grad-1~5`), 5개 보석 라디얼 (red/green/blue/white/purple), 가드 그라데이션 3개, 글로우 필터 2개
- 칼날: polygon → **path Bézier 곡선** (form×tier별 동적 생성)
- **5 Tier 검 디자인**:
  - Tier 1 (+0~+2) 단검 — fuller + 5줄 감기 + 라운드 폼멜
  - Tier 2 (+3~+5) 사벨 — D자형 가드 + 다이아 감기 + 붉은 보석 폼멜
  - Tier 3 (+6~+9) 양손검 — 큰 십자 가드 + 황금 띠 + 다층 폼멜 + 룬 3개
  - Tier 4 (+10~+13) 마법사 검 — 천사 날개 가드 + 다보석 + 다이아 폼멜 + 큰 보석
  - Tier 5 (+14~+15) 신검 — 거대 날개 + 깃털 라인 + 이중 다이아 + 8각별 폼멜 + 칼끝 별

**검귀 시각 강화 (v41)**: `#demon-detail` SVG (얼굴/발톱/핵 새김). 검귀 도전 시에만 표시.

**道 의식 컷씬 시각 강화 (v42)**: `#ritual-overlay::before` (회전 빛 광선, 8초 conic-gradient), `::after` (호흡 황금 원), `#ritual-form`에 3중 text-shadow + breathe 애니메이션. 게임 정점의 *시각적 임팩트*.

**음향 깊이 (v43)**: `chord(freqs, dur, type, vol)` 헬퍼 — 다층 oscillator 동시. 핵심 SFX:
- `enhanceSuccess`: C-E-G → G-B-D (메이저 화음 상승)
- `seal`: C#-F-G# → F-C-G# (봉인 화음)
- `ritual`: 5음 펜타토닉 × 3중주 + 저음 풀 (3초 길이)

**통계 시각화 (v44)**: `bar(label, val, max, color)` 헬퍼 — 4px 막대 그래프. 기록 모달이 4 카테고리(강화/그림자/생사/정점)로 정리 + 그림자 4종 비율 시각 비교.

**강화도 한자 단계명 (v45)**: level-badge에 강화도 + 한자 부제 — `+0 始`, `+1~2 初`, `+3~5 鍊`, `+6~9 強`, `+10~13 靈`, `+14 聖`, `+15 道`. 사용자 직관 강화.

### v46+ 사용자 가치 도약

**v46 명명 모달 검 SVG 미리 보기**: `askName` 모달에 작은 SVG (60x120) — `buildSwordBody`로 실제 검 모습 재구성, 정점 명문 마크 포함. 사용자가 *팔게 될 검*을 시각적으로 확인.

**v47 진행도 백업/복원**: 메뉴에 JSON export/import. 백업은 `state` 전체 → 타임스탬프 파일명. 복원은 파일 선택 → confirm → `Object.assign` 병합 + load() 보정 재실행. 게임 오버 상태도 해제. 브라우저 캐시 초기화/다른 기기 이동 안전.

**v48 회고 모달 검 SVG**: `showSwordDetail`에 `buildDetailSwordSVG` 결과 삽입 — 봉인된 검의 *그 당시* 모습 (form + level). 박물관 유물 시각.

**v49 검귀 베어낸 큰 의식**: `#demon-slay-overlay` — 빨간 빛 슬래시 라인 + `鬼斬` 96px 한자 펄스 + 보상 메시지. 2.5초 페이드. `slay()` isDemon 분기에서 발동.

**v50 사용자 페르소나 (`getPersonas`)**: 통계 기반 자동 분류 8종 (귀살자/봉인가/도의 추구자/달인/구원자/도박꾼/바람의 검/집착자/초보). 統計 모달 상단에 표시 — 게임의 거울.

### v51+ 깊이 추가

**v51 검 일생 그래프**: `state.currentSword.levelHistory` 배열 (최대 100점). `recordLevelHistory()`가 enhance 후 호출. 봉인 시 보존. `buildLevelChart`가 회고 모달에 SVG 라인 차트 (280x50) — 시작/끝/강화 횟수 표시.

**v52 守 (수호자)**: `state.guardianIdx` — 봉인된 道 검 1자루 선택. 형별 패시브:
- 直: 강화 +2% / 曲: 파괴 -2% / 重: 도전 보상 ×1.10 / 速: 회수 +1초

`getGuardian()` + `guardianBonus()` — 道 명문 검만 가능. 회고 모달에 지정/해제 버튼.

**v53 메인 화면 수호자 표시**: `#guardian-display` stage 좌측 상단 — 30x60 SVG + 검명 + 보너스. `renderGuardianDisplay()`가 매 render마다 갱신.

**v54 화면 흔들림**: `screenShake(heavy)` — `#game.screen-shake-{light,heavy}` 클래스 토글. 베기 실패=light(0.35s), 검 파괴/검귀 등장=heavy(0.55s).

**v55 명문 사전 모달** (`renderCodex`): INSCRIPTIONS 배열 전체 (현재 32개) — 한자/라벨/시구/상태. 미획득은 opacity 0.35. 상단 진척도 (N/INSCRIPTIONS.length). 메뉴 진입. (label 단일 출처 — 별도 conditions 룩업은 v4 당시 14개 한정으로 절반 미커버 stale → 제거됨.)

**v56 도전 결정 명료**: 베기 버튼에 보상 텍스트 (`+N 조각`) + challenge-stakes에 검/그림자 강도 막대 비교.

### v57+ 진행 가시화

**v57 道 카운터**: `level-badge`에 `道까지 N` 표시 + 검 아래 `#way-progress` 15 dot (현재까지 황금, MAX_LEVEL=흰 발광).

**v58 그림자 3종 SVG**: 검귀 외 逃影(작은 눈+발), 鋼影(갑옷 5줄), 影(소용돌이) — `#flee-detail`/`#steel-detail`/`#normal-detail` SVG, `showChallenge`에서 type별 toggle.

**v59 봉인 검 정렬**: `legacySort` 모듈 변수 — recent/level-desc/level-asc/inscriptions 4종. 필터 후 정렬 적용. 계보 모달 정렬 버튼.

**v60 강화 성공 큰 파티클**: 강화도별 차등 — 기본 `12+lv*2`, +10~12: 40, +13~14: 60+25 흰, +15(道): 80+50 흰+30 주황 3중 폭발.

**v61 첫 진입 인트로**: `seenHelp=false` 시 도움말 *전*에 `劍 → 始` 페이드 (2.8초) 후 도움말 모달.

**v62 道 도달 stage 황금 빛**: `#stage.way-flash` 5초 keyframe — rgba(255,245,192,0.7) → 점진 약화. 道 도달 시에만 발동.

### v63+ 시각 깊이 (액션의 무게)

**v63 강화 merge**: `#sword-wrap.merge` 0.9s 키프레임 (떠올라 빛나며 안착) + level-badge `merge-pop` 1.35배 (0.7s) + `spawnMergeRays` 6방향 빛줄 사방에서 검으로.

**v64 봉인 dissolve**: 일반 봉인 시 `#sword-wrap.dissolve` 0.8s (솟구쳐 빛으로 사라짐, scale 1.7, opacity 0) + 새 검 `appear` 0.6s (아래에서 솟아 안착). 道 봉인은 의식 컷씬으로 가려져 별도 X.

**v65 회수 ring**: `#rescue-ring-circle` SVG (r=46) strokeDashoffset 0→289 transition. `totalSec`에 맞춰 (速流/冬/守 보너스 반영) 동적 transition 시간. 시간 흐름 시각화.

**v66 선대 강기 빛 모임**: `spawnLegacyRays(count)` — newSword 시 始祖(15)/達人(15)/聖(20) 입자 사방에서 검으로 모임. 1.2s cubic-bezier, 자동 정리.

**v67 도전 zoom-in**: `#challenge.active` 0.45s `challenge-appear` 키프레임 (scale 0.88→1.02→1, cubic-bezier).

**v68 명문 사전 페이드 미리 보기**: 한자 클릭 시 `inscribeQueue` push → 새겨질 때 페이드 재생. hover scale 1.15.

**v69/v70 칼날 한자 새김**: `#mark-kanji` SVG text — 칼날 중앙(y=80, 10px) 한자 새김. 우선순위 `getPrimaryKanji`: 道(흰) > 鬼斬(주황) > 本(푸른) > 聖 > 斷魔. 메인 검 + 회고 모달 + 명명 미리 보기 모두 일관 적용.

### v71+ 진행 가시화 / 컬렉션

**v71 메인 미니 그래프** (`renderCurrentChart`): stats 아래 280x24 SVG sparkline — `state.currentSword.levelHistory` 실시간 반영. history ≥ 4 일 때만 표시 (의미있는 흐름).

**v72 검명 컬렉션**: 4 form × 7 suffix = 28 슬롯 그리드 (통계 모달). 봉인된 검에서 검명 재구성 → `collectedNames` Set 비교. 획득은 황금, 미획득 흐림.

**v73 베기 보상 시각화** (`spawnRewardShards`): 베기 성공 시 그림자 위치 → stats 조각 카운터로 입자 흐름. 보상 크기에 따라 5~15개, 30ms 지연 순차.

**v74 명문 새김 칼날 빛**: `#sword-wrap.inscribe-stroke::after` 0.7s 키프레임 — 칼날 따라 빛 라인 위→아래 그어짐. `runInscribeQueue`에서 발동. SFX.inscribe + 칼날 시각 동기.

**v75 시간 일지** (`state.recentLog`, `recordEvent`, `formatTimeAgo`): 최근 10건 액션 기록 (검 파괴 / 판매 / 베기). 통계 모달 '최근 일지'에 시간 표시.

### v76+ 컬렉션 / 공유 / 안내

**v76 형 분포 차트**: 통계 모달 4 form (直/曲/重/速) 봉인 수 막대 — 형 편향 시각 인지. 한글 라벨 + 카운트 + %.

**v77 검 SVG 다운로드**: 메뉴 '현재 검 SVG 저장' — defs(gradient/filter) + body + 명문 마크 + 한자 새김 + 검명/강화도 레이블. 200x400 image/svg+xml Blob → 파일명 `{검명}_{강화도}.svg`.

**v78 봉인 직후 카드**: `#seal-card` — 봉인 후 3.5s 화면 하단 페이드. 검명 + 강화도 + 보상 + 명문. '계보 보기' 버튼 즉시 진입.

**v79 키보드 mini 안내**: footer 위 항상 표시 — `␣` 강화 / `Esc` 도망 / `P` 보호권 / `M` 소리. 9px opacity 0.5.

**v80 道 카운터**: 우측 상단 `道 × N` (wayReached ≥ 1 시). 황금 + 빛 그림자. season-mark 옆 (right: 60px).

### v81+ 호스팅 + 클라우드 (Render + Supabase)

**v81 Node + Express 서버** (v332+ 하드닝됨):
- `server.js` — Express. **catch-all로 index.html만 서빙** (v332: `express.static(__dirname)` 제거 — 루트 전체 서빙은 CLAUDE.md[숨은 메커니즘]·소스·schema.sql·tests/ 노출이었음. 게임은 인라인 단일 파일이라 로컬 자산 0 → index.html만 반환. **express.static 재도입 금지**). 보안 헤더: nosniff·Referrer-Policy·X-Frame-Options:DENY·Permissions-Policy (v334). index.html no-cache.
- `package.json` — express 4.x, `npm start`, node >=18. `package-lock.json` 커밋됨(v333, 재현 가능 설치).
- `render.yaml` — Render Blueprint (free, node 20, **`npm ci`**[v335 결정적] + `npm start`)
- `supabase/schema.sql` — leaderboard에 서버측 CHECK 제약(v331: 닉네임 1~16자·점수 ≥0·best_level≤15, anti-cheat). 신규 설치만 적용 — 기존 테이블은 주석의 ALTER 수동 실행.
- `README.md` — 게임 설명 + 호스팅/단축키 가이드 + 검증(npm test)

로컬: `npm install && npm start` (PORT 환경변수 지원, 기본 3000).

**v82 Supabase 통합 (코드)**:
- `head`: supabase-js@2.45.4 UMD CDN
- 상수: `SUPABASE_URL` / `SUPABASE_ANON_KEY` (publishable, 클라이언트 안전)
- IIFE 내 함수: `sbClient` / `sbGetUser` / `sbSignInWithEmail` (OTP) / `sbSignOut` / `sbPushState` / `sbPullState` / `sbSubmitScore` / `sbFetchLeaderboard`
- `supabase/schema.sql`: 2 테이블 (user_state JSONB, leaderboard) + RLS + updated_at 트리거

**v83 Supabase UI**:
- 메뉴: `☁ 로그인` (이메일 OTP) / `☁ 클라우드 저장` / `☁ 클라우드 복원` / `☁ 로그아웃` / `🏆 리더보드` — `updateCloudMenu()` 로그인 상태 동기
- `#login-modal`: 이메일 → 매직 링크 (Step 1 → OTP 대기)
- `#leaderboard-modal`: 상위 30 그리드 (#/닉네임/道/최고/베어냄), 1~3위 황금. 로그인 시 닉네임 등록/갱신 영역
- `onAuthStateChange`로 자동 UI 갱신 + 로그인 모달 자동 닫힘
- 道 도달 시 로그인 사용자에게 점수 등록 안내 log (7.5초 후)

### v87+ 자동 클라우드 동기화

**v87 봉인 시 자동 push**: `AUTOSYNC_KEY` localStorage 플래그 + `autosyncEnabled` 토글. `schedulePush()` — 3초 debounced push (연속 액션 시 1번만). 메뉴 '☁ 자동 동기화' 체크박스 (로그인 시만 표시). `doSeal()`에서 `schedulePush()` 호출.

**v88 로그인 시 자동 pull**: `progressScore(s)` — 처치/봉인검×100/최고강화×10 합산 비교 지표. `applyCloudState(cloud)` — 보정 + 게임오버 해제 + render. `autoPull()` — autosync ON일 때: 클라우드 비어있음→초기 push / 클라우드>로컬→자동 적용 / 로컬>클라우드→자동 push / 같음→silent. `autoPullRunning` 가드. `onAuthStateChange`: `SIGNED_IN`→300ms 후, `INITIAL_SESSION`→600ms 후 `autoPull`. v87(push)+v88(pull) = 완전 양방향 자동 동기화.

### v89 시련의 혼 (영구 메타 진행)

봉인 검 누적 수에 따라 영구 패시브 잠금 해제 — 게임오버 리셋 후에도 보존. `TRIALS` 5노드 (1/3/5/10/20 봉인):
- 초심의 인 (1) — 게임오버 후 부적 +1
- 혼의 그릇 (3) — 모든 새 검 시작 영혼 +20
- 장인의 손 (5) — 모든 강화 성공률 +1% 영구
- 수련의 결정 (10) — 게임오버 후 숫돌 +1
- 검선의 길 (20) — 모든 새 검 시작 강화 +1

헬퍼: `trialCount()` / `trialUnlocked(k)` / `trialSuccessBonus()` / `trialStartSoulBonus()` / `trialStartLevelBonus()` / `applyGameOverTrials()`. 통합: `newSword()`(시작 강화/영혼), `enhance()`(표시+주사위), `restartFromGameOver()`(부적/숫돌), `doSeal()`(봉인 전후 비교→새 시련 알림). UI: 메뉴 '시련의 혼' + `#trial-modal` (`renderTrial()`).

### v90 名 — 이름 있는 적 (Named Foes)

강화도 마일스톤마다 등장하는 1회성 보스. `NAMED_FOES` 5종 (黑風+5 / 銀月+8 / 千刃+11 / 鬼帝+13 / 龍+15) — 각 `{key, name, trigger, strength, reward, inscription, desc}`. 규칙: `bestLevel >= trigger && !foesSlain[key] && !currentSword.foesEncountered[key]` → 100% spawn (`pendingNamedFoe()`). 검 1자루당 각 보스 1회 만남, 도망쳐도 다음 검에서 재등장. 베면 `state.foesSlain[key]=true` (영구) + 영구 명문 (해당 검) + 영혼 +15 + 검귀 컷씬 재활용 (`demon-slay-kanji` 동적 교체). `triggerNamedFoe()` 는 기존 challenge 객체 패턴 사용 (`type.isNamed`, `namedFoeKey`). UI: 메뉴 '처치 보고서' + `#foes-modal` (`renderFoes()`).

### v91 覺悟 — 강화 마음가짐 3택

원작 "다음 한 번만 더" 도박 충동에 *결정 차원* 부여. `RESOLVE` 3종 (휘발성 모듈 변수 `resolveMode`, 새로고침 시 `normal`):
- 平常 — 변화 없음
- 一心 — `successAdd:+0.08`, `destroyMul:1.5` (올인 도박)
- 保身 — `successAdd:-0.10`, `destroyMul:0`, `downgradeMul:0.5`, `costMul:1.5` (신중)

`getResolve()` 반환 객체. 통합: `enhance()` 비용/주사위/`effectiveDestroy`/`effectiveDowngrade` 전 경로, `render()` 성공률/파괴/하락/비용 표시 + `.resolve-btn` active 토글. 검 없을 때 `#resolve-row`/`#resolve-desc` 자동 숨김. 靈石(보유 한정)과 차별 — 保身은 즉시·무한·비용 트레이드. 강화 버튼 위 3택 버튼 UI.

### v92 融劍 — 두 봉인 검 합체

검 없음 상태에서 봉인된 검 2자루를 선택해 *합체*, 더 강한 검으로 새출발. `FUSION_COST = 60` 조각. `FUSION_PRIORITY` 배열 (道/龍斬/帝斬/.../久 순서)로 두 검의 최우선 명문 비교 (**단 `FUSION_NO_INHERIT`의 「도」는 건너뛴다 — v400**; 배열 자체에는 남겨 둔다, 후보 목록의 명문 *표시* 필터로도 쓰이기 때문) → 높은 쪽 명문 + 높은 쪽 형 + 두 영혼 평균 + 높은 강화도로 시작. `fusionPreview()` — 리스트 선택 시 결과 미리 보기 (형/명문/시작 강화/조각 비용). `fuseSwords()` — 높은 인덱스부터 splice 후 `newSword()` → form/inscriptions/soul override. 결과 검은 一생이력 0부터. 검명 모달(`askName`)에서 확정. `fusionSelected = []` 휘발성. UI: `#btn-fusion` 검 없음 && sealedSwords≥2 시 노출. `#fusion-modal` 계보와 유사 리스트 + 선택 2개 강조 + 미리 보기.

### v93 天命 — 현재 검의 목표

검 1자루당 1개 부여되는 랜덤 *숨겨진 목표*. 달성 시 보상 + `destinyFulfilled=true` 영구. `DESTINIES` 8종 (reach10/reach13/slay5/slay10/demon/enhance30/soul67/foe — 각 조각/영혼/방지권/숫돌/영석 보상). `assignDestiny()` — 미이행 중 랜덤 pick (newSword/fusion 시). `checkDestiny()` — destinyFulfilled 먼저 set 후 보상 (addSoul→checkDestiny 재귀 차단). 8 hook: enhance(success/fail), slay(success), addSoul + 시작(reach/foe 즉시). `#destiny-banner` 항상 표시 (달성 전: 목표/진행/보상, 달성 후: 황금 완료). `doSeal()` 봉인 시 destiny/destinyFulfilled 보존. `showSwordDetail` 회고에 천명 블록.

### v94 天時 — 일일 도전 시스템

날짜 기반 1일 1목표. `DAILY_CHALLENGES` 7종 (강화성공8/베기5/봉인2/+10도달/회수2/도전발동8/강화시도20). `todayStr()` → YYYY-MM-DD 로컬. `dailySeed(dateStr)` 해시 → 오늘의 도전 결정적 선택. `ensureDailyTrial()` — 날짜 바뀌면 리셋. `bumpDaily(track, val)` — reachLevel은 `Math.max` (검 파괴로 감소 X). 8 hook 위치. 완료 시 `grantDailyReward()` — `40 + ch.target*8` 조각 + `state.dailyCompletedCount++`. 기록 모달 상단 배너 (`#daily-trial-banner`) + 메뉴 '天時'. 새벽 자정 자동 갱신 (다음 강화 시 `ensureDailyTrial()` 자동 체크).

### v95 生氣 — 살아있는 배경 드론

Web Audio API 기반 실시간 반응 사운드스케이프. 외부 파일 0, 기존 `audioCtx` 재활용.

드론 구조: 메인 사인 오실레이터(55Hz base) + 서브 옥타브 오실레이터 + LFO(tremolo용). `ambientNodes = { osc, subOsc, subGain, lfo, lfoGain, masterGain }` 모듈 스코프.

4 모드:
- `idle`: `55*1.8^(lv/15)` Hz 베이스 드론, 강화도↑ → 음조·볼륨↑ (0.035~0.08)
- `crisis` (도전 등장): 5.5Hz LFO 떨림 + 음조 ×1.18, 긴장
- `void` (검 파괴): 0.7초 페이드 침묵
- `way` (道 도달): 음조 ×1.5 (완전5도) + 0.12Hz 느린 LFO, 신성 화음

훅 위치: `getAudio()` 첫 audioCtx 생성 후 450ms, `toggleMute()`, `showVoid()`, `endVoid()`, `showChallenge()`, `endChallenge()`, `enhance()` 성공, `newSword()`, `checkInscriptions()` 道 추가. `setAmbientLevel(lv)` — crisis/way 모드 중엔 주파수 변경 안 함.

### v96 厄運轉機 — 연속 실패 역전

비파괴 강화 실패 누적 → 다음 강화 확률 역전. `failStreak`, `adversityReady` 모듈 변수 (휘발성).

- 2연패~: `#adversity-banner` '역경 ●●○○○' 채움 표시
- 5연패 (ADVERSITY_THRESHOLD): `adversityReady=true` → '逆' 황금 배너 + sword-wrap 복합 glow + `announceInscription('逆', ...)`
- 역전 강화: `adversityAdd=0.40` 성공률, `adversityDestroyReduce=0.12` 파괴 감소 → 사용 후 즉시 `adversityReady=false; failStreak=0`
- 성공 시: '逆轉' 명문 페이드. 파괴 시: streak 리셋(새 검)
- `checkAdversity()` — downgrade/hold 후 임계 도달 시 호출. `renderAdversity()` — render()마다 배너 갱신.

### v97 梵境 — 무대가 검의 역사를 기억한다

봉인된 검 수·유파에 따라 stage가 살아 변모. `ECHO_POSITIONS` 8개 좌표 + 회전각 + 스케일. `updateStageBg()` — render()마다 호출.

- **에코 검**: 봉인 검 1개마다 `#stage-bg` 내 반투명 SVG 검 실루엣 등장 (최대 8개). 각 echo는 다른 위치·회전·투명도 + `echo-pulse` 느린 opacity 펄스. 누적 15개↑ → 밝기 추가 강화.
- **유파 색조**: 활성 유파 → `#stage[data-school="*"]::after` CSS radial gradient. 직류(파랑) / 곡류(황토) / 중류(초록) / 속류(청록). 5초 CSS transition.
- `#stage-bg`: `position:absolute;inset:0;z-index:0;overflow:hidden` — 검 뒤 레이어.

### v247~v252 정체성·서사 군집 (이번 세션 추가 — 모두 메커니즘 효과 0, 순수 narrative, 기존 데이터 파생)

검 한 자루의 정체성을 다차원으로 응결하는 군집. **모두 점수 인플레이션 0** (서사/식별만). 단위·통합 테스트는 `tests/logic.test.js`.

- **v247 性情 (`deriveTemperament(sword)`)**: 플레이 방식 → 기질 4종. `slainCount`=剛 / `scars*2`=靜 / `max(0,level-7)`=賭, 최댓값 기질(동점 剛>靜>賭), 무행동=和. 形/魂/銘과 직교하는 정체성 축. 상태 저장 불필요(기존 stats 파생, 하위호환). 표시: 一代記 문장 + 회고 뱃지 + 계보 카드/분포 + 修練 중 현재 검(`renderInscriptions`, 和는 비표시) + 수호자(守) + 記錄 「검 중의 검」.
- **v248 遺言 (`generateLastWords(sword)`)**: 검의 1인칭 마지막 말(道 전용 / 性情별, 강화도 기반 결정적). 회고 「遺言」 + 詩集(`renderAnthology`) 遺言 섹션(전체 봉인 검 최근 20).
- **v249 波瀾 (`deriveJourney`/`levelDropCount`)**: `levelHistory` 하락 횟수 → 기복 서술. 회고 일생 그래프 아래 캡션. `levelDropCount`는 `collectionHighlight`(記錄 「검 중의 검」)와 공유.
- **v250 검 중의 검 (`collectionHighlight(sealed, scoreFn)`)**: 컬렉션 최고 검 선택(강한/많이 벤/기복). 記錄 모달, 봉인 3+.
- **v251 影格 (`shadowTier(strength)`)**: 그림자 강도 등급 형용(여린/굳센/강대한/흉험한). 도전 표시 + 斬 베기 페이드. 적 측 정체성.
- **v252 時生 (`bornTod`)**: 검이 빚어진 시각(朝/晝/夕/夜, `getTimeOfDay` 재사용). `newSword`에서 기록 → `doSeal` 보존 → 회고 時生 + 一代記 개막 문장. 신규 검만(하위호환).

### v372 宿敵 — 나를 이긴 그림자가 이름을 얻는다

도박 드라마의 반대편 서사. 기존엔 베기 실패로 검이 꺾여도 그 그림자는 휘발됐다(휘발성 challenge 설계) — 이제 검 단계를 **실제로 꺾은** 그림자(보호권 차단 시 제외)가 이름을 얻고 `state.nemesis`로 영구화된다.

- **탄생** (`noteNemesisDefeat`, slay 실패 분기): 일반/도망/강철만 — 검귀·야차·名은 각자의 길. 숙적은 한 번에 하나. 이름은 `makeNemesisName(origin, typeKey)` — 학파 글자(야류=월/무류=무/골류=백/염류=염) + 유형 글자(영/풍/갑), 결정적 12조합.
- **재등장** (`maybeTriggerChallenge`): 기존 spawn 롤 **통과 후 대체** (총 도전 빈도 불변). 확률 `nemesisReturnChance(wins)` = min(0.35, 0.15+wins×0.05). 강도는 저장값 그대로 (재롤 없음), 보상 = 기본×`nemesisGrudgeMul(wins)` = min(2.5, 1+wins×0.35) → 이후 기존 보상 캐스케이드 전부 적용. 名 100% spawn이 우선.
- **원한 심화**: 숙적에게 또 지면 wins+1, strength+1 (cap `MAX_LEVEL` — 설욕 불가능 고착 방지). 도망(slayEvade)·flee·대치·새로고침으로는 원한 불변.
- **설욕** (`resolveNemesisSlain`, slay 성공 분기): `nemesis=null`, `nemesesSlain++`, 魂+8, `설욕` 명문(서사, 효과 0), 검귀 컷씬 재활용.
- **UI**: `#nemesis-mark` 우상단 원한 표식 (`renderNemesisMark`, render마다) / 도전 화면 `nemesis-type` 핏빛 아우라 + 원한 안내 / 記錄 모달 숙적·설욕 행 + `복수자` 페르소나.
- **튜닝**: `NEMESIS_TUNING` 단일 진원 (returnBase/returnPerWin/returnCap/grudgePerWin/grudgeCap/soulOnRevenge). 세이브: 키 추가만(호환 ✅), `normalizeState`가 강도 cap·이름 태그 제거·범위 강제. 테스트: logic(이름 결정성·단조·cap) + integrity(훅 와이어링 4건).

### v373 劍塚(검총) — 부러진 검은 무덤을 얻는다

v372(나를 이긴 그림자가 이름을 얻는다)의 대구 — *나에게 진 검도 이름을 얻는다*. 봉인/전당 검은 22개 필드 + 一代記·遺言·일생시의 두터운 서사 계층을 갖지만, 핵심 드라마인 **파괴**는 `totalDestroyed` 정수 하나만 남기고 검의 일생을 소멸시켰다 (명명은 봉인 시점 의식이라 파괴 검은 무명으로 죽었음). 메커니즘 효과 0 — 순수 서사.

- **매장** (`recordFallenSword`, enhance 파괴 분기·showVoid 전): currentSword 스냅샷(level/form/inscriptions/soul/slainCount/enhanceAttempts/scars/bornTod/각오/ts)을 `state.fallenSwords`에 push. cap 30 (`FALLEN_TUNING.cap`) — 초과 시 가장 오래된 무덤부터 잊힘. `totalDestroyed`가 여전히 권위 카운터.
- **사후명** (`makePosthumousName(form, level)`): 형 접두 + 죽음의 격 (`FALLEN_TIER_CHAR` 진/절/쇄/운/통 — 塵/折/碎/殞/慟, 강화 tier 구획과 동일 경계 `fallenTier`). 결정적 2자, 4형×5격 20조합 무충돌. `recentLog`도 사후명 포함 (기존: 강화도 숫자만).
- **회수 확정** (`endVoid`): 마지막 무덤의 `rescued: null → true/false` 확정 + `검총에 한 자루가 묻혔다` log + `firstGrave` 마일스톤 (발견성). 保身은 파괴 0이라 각오는 평상/일심만 실재.
- **만가** (`generateElegy(f)`): 탄생(時生 v252)·담금질/베기·성정(v247 `deriveTemperament` 재사용)·각흔·부러진 지점(+N에서 +N+1)·일심 각오·회수 결과를 결정적 파생 행으로. 봉인 검 一代記/遺言의 파괴 측 대응물.
- **UI**: 메뉴 `검총` (전당 바로 아래 — 영광/상실 쌍) → `#graveyard-modal` (`renderGraveyard`, 최신 무덤 먼저, 클릭 시 만가 펼침, 전부 `escapeHtml`). 記錄 모달 「가장 높은 무덤」 행 (`collectionHighlight` 재사용).
- **세이브/방어**: 키 추가만 (호환 ✅). `normalizeState`가 배열·레벨 cap·태그 제거·상한 강제 + 오염된 사후명 결정적 재생성. **빈 배열이면 외부 상수 참조 0** — 격리 sandbox 행위 테스트(load.test.js) 호환 패턴 (nemesis 가드와 동일). 테스트: logic 2건(사후명 결정성·경계 / 만가 결정성·안전) + integrity 4건(스냅샷 순서·회수 확정·보정·UI 와이어링).

### v374 再鍊(재련) — 무덤에서 검을 다시 벼리다

v373 검총을 박물관에서 **결정의 장소**로 전환 — 파괴(v372 이전부터의 도박 대가) → 애도(v373) → **재기**의 3부작 완결. 융검(v92: 봉인 검 2자루 합성)의 무덤 측 대응물.

- **재련** (`reforgeSword(graveIdx)`, 검총 모달 무덤별 버튼): 검 없음 상태에서만 (융검과 동일 게이트), 무덤당 **1회** (`f.reforged` 잠금 — 혼 farming 차단). 비용 `reforgeCost(level) = REFORGE_TUNING.base(60) + level × perLevel(3)` — 새 검 빚기(50)보다 프리미엄 (재련이 기본 경로가 되는 경제 붕괴 방지). 가드: `challenge || rescueWindow || voidPending` (sealSword 동시성 규율 + v368 갭).
- **계승**: `newSword()` 경유 (시작 강화 = 일반 startBonus — **점수 인플레이션 0**) 후 override: 무덤의 형 그대로 (選形 생략 — *그 검이다*), 혼 절반 (`Math.max` 병합), `재련` 명문(서사, 효과 0), `currentSword.reforgedFrom = 사후명`.
- **혈통 보존**: `reforgedFrom`을 doSeal·전당 push 양쪽에 보존 (기존 field-set 대칭 자동 테스트가 강제). 一代記(`generateBiography`)에 "「직운」의 무덤에서 다시 벼려졌다" 줄 (융합 혈통 v371e와 공존 가능), 회고 모달에 재련 줄. `sanitizeSword`가 reforgedFrom stripTags (v370m).
- **UI**: 검총 무덤 항목에 "다시 벼리기 · N 조각" 버튼 (검 없음 && 미재련 시; 조각 부족이면 disabled) / 재련된 무덤은 "다시 벼려졌다" 표기 (무덤은 남는다 — 죽음은 사실). 위임 핸들러가 만가 토글보다 먼저 분기.
- 테스트: logic 2건(비용 단일 진원·단조·프리미엄 / 一代記 혈통 줄) + integrity 3건(가드 4중·newSword 경유 / 혈통 보존·sanitize / UI 와이어링·비용 단일 진원).

### v375 招影(초영) — 그림자를 부른다

一閃(도전) 차원의 첫 **능동 결정**. 기존 도전은 100% 수동(강화 성공 후 랜덤 spawn) — 특히 숙적(v372) 설욕은 기다림 외에 방법이 없었다. 조합소 레시피 `초영`(조각 15)으로 그림자를 부른다.

- **경로**: `maybeTriggerChallenge(forced)` — forced=true면 **spawn 롤만 우회**, 가드(검 보유/`CHALLENGE_MIN_LEVEL`/도전·회수 중복)·名 100% 우선·이후 파이프라인(숙적 대체·보상 캐스케이드·대치 예지) 전부 동일 경로. 레시피 `check`가 4중 가드 (`hasSword && level >= CHALLENGE_MIN_LEVEL && !challenge && !rescueWindow`).
- **인플레이션 차단**: 불려온 그림자의 전리품은 **절반** (`SUMMON_TUNING.rewardMul 0.5`, 배수 캐스케이드 *마지막*에 적용 — 반토막이 다시 배수로 부풀지 않게). 소환 farming으로 조각을 벌 수 없음 — 소환의 가치는 명문(회마/초인)·魂·학파(단마)·설욕·천명(slay 계열) *진행*이다. 도전 화면에 "전리품이 얇다" 안내 (결정 전 명시).
- **원한은 향을 맡는다**: 소환 시 숙적 응답 확률 = `summonNemesisChance(wins)` = min(cap 0.9, 자연 재등장 + bias 0.35) — **설욕을 능동적으로 추구 가능** (v372 완결). 단 확정 버튼은 아님 (cap < 1). 트레이드: 소환 설욕은 전리품 절반, 자연 재등장 설욕은 원한 배율 온전.
- **UI/통계**: 조합소 `.recipe` 블록 + `recipes.summon` (관례상 두 곳; cost는 recipes 숫자 리터럴 — 라벨 drift 테스트가 잠금). `stats.summoned` (state 기본값 + DEFAULT_STATS + 記錄 행). recipes에 선택적 `msg` 필드 추가 (generic 핸들러 log 커스텀).
- **디자인 (ui-ux-pro-max 스킬 적용)**: 흑금 팔레트·자간 미학은 유지하되 범용 원칙 채택 — 검총/융검 카드 hover 전환 0.2s, 만가 펼침 0.25s 페이드(즉발 상태 변화 금지), 재련 버튼 터치 타깃 확대(padding 10px 18px), 만가 본문 12px(가독), `prefers-reduced-motion` 전부 존중.

### v376 誓約(서약) — 검 일생의 맹세

"다음 한 번만 더" 도박 충동의 **반대편** — 자발적 제약. 각오(v91)가 강화 1회의 전술이라면 서약은 검 일생의 계율. **어기는 것을 막지 않는다** — 어기면 파계(破戒)가 기록될 뿐 (자유 + 대가, 검총/숙적과 같은 정직한 실패 미학). 메커니즘 효과 0.

- **계율 4종** (`OATHS`, 검당 1개): `무방`(방지권 금지) / `불퇴`(도망·대치 금지) / `맨손`(숫돌·영석 금지) / `일도`(도 이르기 전 매각 금지). **효과 필드 금지가 테스트로 잠김** — 보너스가 생기면 서약이 최적화 대상이 되어 서사가 죽는다.
- **맹세** (`swearOath`): 메인 화면 `#btn-oath`(점선 제안 → 실선 확정, 파계 시 danger색) → `#oath-modal` 4계율 카드. 시한 `OATH_MAX_ATTEMPTS(3)` — 강화 3회 미만만 (늦은 맹세는 맹세가 아니다 — 사후 맹세 게이밍 차단). `oath = {key, name, broken}` — **name 동봉**으로 만가/一代記가 OATHS 룩업 없이 자기완결.
- **파계** (`breakOath`) 훅 5곳 — armed가 아니라 *실제 소모/행위* 시점: 방지권 소모(무방) / 숫돌·영석 소모 2곳(맨손) / flee·stalemate(불퇴 — 대치도 물러섬) / `sealSword` 초입 lv<MAX 매각(일도 — **ins 캡처 전**에 새겨 봉인 기록에 파계 포함).
- **운명 기록**: 봉인·전당 push 양쪽 `oath` 보존 (field-set 대칭 잠금) + 무덤(`recordFallenSword`)에도 — 一代記 "맹세를 끝까지 지켰다/스스로 깨었다" 줄, 만가 "맹세를 지킨 채 부러졌다/깨어진 맹세를 안고 잠들었다" 행. `서약`/`파계` 명문 (서사). 파계 없는 봉인 = `oathsKept` (통계 3종 + 記錄 행 + `서약자` 페르소나 3지킴).
- **방어**: `sanitizeSword`·fallen forEach에 oath shape 강제 + name stripTags (v370m). 테스트: logic 2건(계율 유일성·효과 필드 금지 / 만가·一代記 결합·무맹세 불변) + integrity 3건(위반 훅 5곳·순서 / 기록 보존·통계·sanitize / 명문·UI·시한).

### v377 影史(영사) — 그림자 세계의 사서(史書)

검 측은 계보·전당·검총·회고의 두터운 기록 체계를 갖췄지만 게임의 절반인 그림자 세계는 흩어진 카운터뿐이었다. 특히 **설욕한 숙적은 이름째 소멸** (`nemesis = null` + 카운터) — 검총(v373)이 파괴를 완결했듯 설욕록이 v372를 완결한다. 메커니즘 효과 0, 전부 기존 데이터 파생.

- **설욕록** (`state.nemesesArchive`, cap `NEMESIS_TUNING.archiveCap(20)`): `resolveNemesisSlain`이 `state.nemesis` 소거 **전**에 {name, origin, typeKey, strength, wins, ts} 캡처 (순서가 integrity 테스트로 잠김 — null 이후엔 origin/strength 소실). `normalizeState` 방어: 검총 가드와 동일 "비어있으면 외부 상수 참조 0" 패턴 + 화이트리스트·범위·태그 제거·이름 결정적 재생성.
- **영사 모달** (`renderShadowLore` / `#shadowlore-modal`, 메뉴 처치 보고서 아래): 5부 구성 — ① 그림자 종 (**`SHADOW_TYPES` 배열 직접 순회** — 새 변종 자동 포함, 테스트 잠금; 출몰%·처치 수) + 야차 ② 학파 4종 (whisper 시구 + 처치 + 단마 진척) ③ 名 처치 진척 요약 (상세는 처치 보고서) ④ **형상극 상성 전역 공개** — 도전 화면의 개별 라벨(v129)과 달리 4형 전체 표, 현재 검의 형 강조, 배수는 `AFFINITY_*_MUL` 상수 보간 (하드코딩 금지 테스트 잠금) ⑤ 숙적 현재 원한 + 설욕록 (최근 먼저, escapeHtml).
- 테스트: logic 1건(normalizeState 행위 검증 — 손상 import 26항목 강제 보정: 필터·cap·화이트리스트·범위·태그) + integrity 3건(캡처 순서 / 도감 5부 커버리지·상성 단일 진원 / 모달·메뉴·정규화 와이어링).

### v378 放下(방하) — 놓아주는 손

게임의 본질인 **"파괴 후 5초 회수 윈도우의 침묵"** 그 자체에 세 번째 길. 기존 선택지는 줍기(탐욕)·도박(더 큰 탐욕)뿐이고 무행동은 그냥 실패였다 — **의식적으로 놓아주는** 내려놓음(放下著)이 완성한다: 줍기 / 도박 / **방하**.

- **선택** (`rescueWindow.release`, `#rescue-release` — 도박 버튼 아래 무채색): 조각을 거두지 않고 즉시 종료. **보상 0 — 그것이 이 길의 전부** (`state.shards +=` 부재가 테스트로 잠김). rescue·gamble과 동일 `rescued` 플래그 잠금 + 타이머 정리. 색채 대비: 도박=핏빛 탐욕, 방하=무채색 고요.
- **장송**: 놓아주는 순간 부러진 검이 제 소리 시그니처(v229 `playSwordSignature`)로 마지막 작별을 노래한다.
- **실패가 아니다** (`endVoid(rescued, released)`): `rescueFailed` 미집계·慰(위로) 없음·'실' 대신 담담한 '장' 페이드 — 가드 `if (!rescued && !released)`. 기존 호출부(회수/도박/타임아웃)는 released=undefined로 무변경.
- **후장(厚葬)**: 무덤에 `grave.released = true` — 검총 목록 '후장' 표기 (전손보다 우선 분기 — released 무덤도 rescued=false이므로), 만가에 "조각은 바람에 놓아 보냈다 — 후하게 장사지낸 무덤" (전손 행 대체). `stats.released` + 記錄 행 + `firstRelease` 마일스톤.
- 세이브: `f.released` boolean 강제 (fallen forEach). 테스트: logic 1건(만가 3길 분기·하위호환) + integrity 3건(release 잠금·장송·보상 0 / endVoid 통계 분리·후장 / UI·통계·정규화·표시 우선순위).

### v379 走馬燈(주마등) — 죽어가는 검의 일생이 눈앞을 스친다

회수 윈도우(본질의 침묵)는 v378로 세 갈래 선택을 갖췄지만 화면엔 "검이 부서졌다"와 원 하나뿐 — **그 5초에 죽어가는 검의 삶을 흘려보낸다**. 줍기/도박/방하의 결정이 숫자가 아니라 *한 일생을 마주한 결정*이 되도록. 메커니즘 효과 0, 전부 매장 스냅샷(v373) 파생.

- **조각 빌더** (`buildLifeFlashFragments(f)`, 순수·결정적): 時生(v252) → 형 → 담금질 횟수 → 무훈 → 명문(최대 4) → 각흔 → 맹세(v376, 깨어졌으면 명시) → **사후명이 언제나 마지막** ("죽음의 순간에 무덤의 이름이 먼저 보인다" — 검총 시스템의 자연 발견 통로이기도).
- **연출** (`spawnLifeFlashes` / `.life-flash`): 회수 원 주변 타원 궤도에 **황금각(137.5°) 결정적 배치** (랜덤 아님 — 겹침 최소화), 0.5s 간격 stagger, 각 1.4s 페이드 (사후명은 1.8s·accent색·13px). 윈도우 길이(`totalSec` — 속류/冬/守 보너스 반영)에 맞춰 개수 제한하되 잘려도 사후명은 유지.
- **가드 3중**: `getSetting('reduceMotion')` (v228 設) / `!rescueWindow` (조기 회수·방하 후 예약분 차단) / `endVoid` 첫 줄 `clearLifeFlashes()` (타이머 해제 + 잔여 DOM 제거).
- **발동 조건**: showVoid에서 `flashGrave.rescued === null` — *이 파괴로 매장된* 무덤일 때만.
- 테스트: logic 1건(조각 결정성·순서·명문 cap·fallback — sandbox 배열은 host와 prototype이 달라 JSON 비교) + integrity 2건(발동 조건·정리 / 설정 존중·가드·용량·배치).

### v380 corner-stack — 텍스트 겹침 구조적 해소 (좌표 손배치 → flex 스택)

사용자 제보("텍스트끼리 겹침") 대응. 원인: 우상단 마커들이 `position:fixed` + top/right 픽셀 손배치로 누적되어 — way-counter(right:60)가 weather(90)/solar(110)를 덮고, **nemesis-mark와 path-progress가 정확히 같은 좌표**(top:68/right:18)에 겹침. 개별 픽셀 조정 대신 구조 전환:

- **`#corner-stack`**: 우상단 마커 9종(solar/weather/tod/season 1행 + era/gen 2행 + way-counter/path-progress/nemesis-mark 세로)을 flex column 스택으로 — **겹침이 구조적으로 불가능**, 비활성 마커는 `:empty` 규칙으로 자리도 차지 안 함 (자동 압축). 개별 CSS의 `position:fixed` 좌표 제거 (재유입은 integrity 테스트가 차단). `#ancestor-whisper`는 스택 아래(top:150px)로.
- **회수창 버튼 좌우 배치**: 방하(v378)를 도박 아래 세로 쌓기(-134px — 스테이지 아래 UI 침범)에서 도박과 **같은 띠 좌우 나란히** (`calc(50% ∓ 72px)`)로.
- **주마등 사다리 배치**: v379 초판 타원 궤도(회수 원·카운트다운과 근접)를 **좌우 측면 사다리**로 — 중앙 세로축(원·문구·버튼)을 완전히 비움, `min(150px, 36%)` 반응형, 사후명만 원 아래 빈 띠(78%) 중앙. 결정적 배치 유지.
- **카드 wrap**: 영사 lore-card·검총 헤더 행에 `flex-wrap` — 좁은 화면에서 이름/메타가 밀려 겹치는 대신 줄바꿈.
- **신규 UI 규율**: 우상단 상시 마커를 새로 추가할 땐 좌표 손배치 금지 — `#corner-stack`에 넣을 것. 테스트: integrity 1건 (9종 스택 소속 + fixed 좌표 잔존 금지 + whisper/버튼 배치 잠금).

### v381 劍傳(검전) — 한 자루의 일생을 족자로

검의 정체성 층위(성정·솔성·서약·혈통·재련·일생시·유언·명문·궤적)는 모달 안에만 갇혀 있었다 — **전부를 한 장의 세로 족자 SVG로 응축해 게임 밖으로** (공유 가능한 유물). v77(검 그림만)의 완전판. 메커니즘 효과 0.

- **`wrapText(text, maxChars)`** (순수): 한국어 줄바꿈 — 공백 우선, 공백 없는 장문은 글자 단위 강제 분할. 결정적·글자 무손실 (테스트 잠금).
- **`buildScrollSVG(s)`**: 세로 족자 조립 — 제목(검명·劍傳) → 검 그림(`buildSwordBody` + 정점 마크 + 한자 새김, `#sword-svg defs` 재사용) → 정체성 줄(형·혼·성정·솔성) → 명문 → 一代記 → 일생시(도 검) → 유언 → 서약 운명 → 혈통(융합/재련) → levelHistory 궤적 폴리라인 → 세대 푸터. **높이는 내용에 맞춰 동적**. 모든 텍스트 `escapeHtml` (import 유래 검명의 SVG 마크업 주입 차단). 전 층위 결합이 integrity 테스트로 잠김 — 새 정체성 층위 추가 시 족자에도 결합할 것.
- **진입**: 회고 모달(`showSwordDetail`)에 "검전 족자 저장" 버튼 — `lastDetailSword` 스태시 → `exportSwordScroll` (v77 Blob 다운로드 패턴, try/catch 실패 안전, 파일명 `검전_{검명}_+N.svg`). 봉인·전당 모든 검에 사용 가능.
- 테스트: logic 1건(wrapText 상한·무손실·강제 분할·결정성) + integrity 2건(전 층위 결합·XSS / 스태시·버튼·다운로드).

### v382 天秤(천칭) — 운의 원장

이 게임의 본질은 확률 도박인데, 체감("25%인데 4연속 실패!")과 실제 운 사이를 비추는 **객관적 거울이 없었다**. 매 강화 굴림마다 기대(확률 합)와 실제(성공 수)를 원장에 적는다 — 검마다 + 평생. 메커니즘 효과 0 — 도박 게임의 확률 정직성.

- **기록** (`recordLuck(chance, succeeded)`, 굴림 직후·성공 분기 *전*): 실제 굴림과 **같은 단일 진원 `successChance`·같은 판정식**으로 기록 (표시≠실제 드리프트 불가 — 순서가 integrity로 잠김). 보너스 누적으로 확률>1이면 기대도 1로 clamp (정직한 저울). `currentSword.luckExp/luckAct` + `stats.luckExp/luckAct` 동시.
- **결산 어휘** (`luckDelta(o)` = 실제−기대 / `luckWord(delta)`): ±1 미풍(바람이 등을 민/거스른) / ±3 하늘(총애한/빚진) / 중립 고른 바람. 서사 줄은 **±2부터만** (고른 바람은 침묵).
- **결합**: 봉인·전당 push + 무덤 보존 (field-set 대칭) → 一代記 "운이 그의 등을 밀어주었다/편이 아니었으나 여기까지 왔다" 줄, 만가 "바람은 끝내 그의 편이 아니었다/총애조차 부러짐을 막지는 못했다" 행, 회고·**족자(v381 전 층위 결합 규율)** 천칭 줄, 記錄 모달 평생 운 행, `천행`/`역풍` 페르소나(±5).
- **방어**: 원장 숫자 강제 (sanitizeSword·fallen·stats — 문자열 오염 시 `+` 연산이 문자열 연결로 붕괴하는 것 차단). **주의: getPersonas가 luckDelta 참조** — 격리 추출 시 함께 로드.
- 테스트: logic 2건(delta·어휘 임계·clamp·누적 / 만가·一代記 결산 줄·중립 침묵·하위호환) + integrity 3건(굴림 동일성·순서 / 보존·숫자 강제 / 표시 4처 결합).

### v383 꺾임의 儀式 — 패배도 의식이 된다

승리(귀참 v49/名 v90/설욕 v372)는 풀스크린 컷씬을 갖지만, 훨씬 자주 겪는 **베기 실패로 검이 꺾이는 순간은 로그 한 줄뿐**이었다 — 숙적 탄생(v372의 핵심 드라마)조차 900ms 페이드로 지나갔다. 메커니즘 효과 0.

- **의식** (`showDefeatRitual(c, nemInfo)`): 승리 컷씬 오버레이(`#demon-slay-overlay`)를 **핏빛 `defeat` 변형 클래스로 반전 재활용** — '꺾임' 대형 한자(danger) + 격 형용(v251 `shadowTier`) 메시지, 1.9s 후 페이드아웃 → 변형 해제. `SFX.defeat` (하강 이중주). 승리 컷씬 3처(설욕/귀참/名)는 방어적으로 `defeat` 클래스 해제 (붉은 승리 컷씬 방지 — 테스트 잠금).
- **숙적 드라마 결합**: `noteNemesisDefeat`가 **반환 계약** `{kind:'birth'|'deepen', name, wins} | null`을 갖게 리팩터 (기존 900ms inscribe 페이드 제거 — 의식이 대체) → `buildDefeatMessage`(순수)가 "그림자가 이름을 얻었다 · 숙적 「월풍」" / "「월풍」의 원한이 깊어졌다 · N승"을 컷씬 문구로. 숙적에게 진 패배는 이름으로 부른다.
- **통계**: `stats.defeats` (승리만 세던 비대칭 해소 — state 기본값 + DEFAULT_STATS + 記錄 그림자 섹션 행).
- 테스트: logic 1건(메시지 빌더 — 격 형용·탄생/심화/숙적 대면·결정성) + integrity 3건(실패 분기 순서 / 반환 계약·오버레이 재활용·CSS / 승리 3처 해제·통계).

### v384 劫(겁) — 시대의 연대기

아카이브 3부작 완결: 검이 죽으면 검총(v373), 숙적이 죽으면 설욕록(v377) — 가장 큰 죽음인 **시대의 끝(게임 오버)만 무(無)로 사라졌다**. 각 게임 오버를 하나의 겁으로 아카이브. 메커니즘 효과 0 (시련의 혼 v89 불변).

- **스냅샷/증분**: `state.eraStart`(개막 스냅샷: ts·generation·sealed(=`allSealedSwords().length` 단일 진원)·ways·slain·destroyed) → `currentEraSummary()`가 증분 계산 (음수 clamp — 손상 스냅샷 방어). `describeEra(e)` (순수): "검 7자루를 빚었다 · 도에 2번 이르렀다 · ..." — **이룬 것만 말한다** (0 항목 침묵), 빈 시대는 "짧은 시대였다".
- **커밋 규율**: 아카이브는 `restartFromGameOver`의 `archiveEra()` **단일 커밋 지점** (newSword 전 — 첫 검은 새 겁의 것). `showGameOver`는 `currentEraSummary()` **표시만** — 게임오버 화면에서 새로고침해도 이중 아카이브 불가 (테스트로 커밋 금지 잠금). cap `ERA_TUNING.cap(20)`.
- **표시**: 게임오버 화면 `#gameover-era` "제 N 겁이 저문다 — ..." / 記錄 모달 「겁의 연대기」 섹션 (최근 먼저).
- **방어**: `normalizeState` — 배열·정수 강제·idx 보정 + 첫 도입 시 개막 스냅샷 (`eraSnapshot()`을 **내부 try**로 — 격리 sandbox 행위 테스트에 의존 없음; 기존 세이브는 도입 시점부터 기록 시작).
- 테스트: logic 2건(증분·clamp·겁 번호·무스냅샷 / 연대기 문장·0 침묵·결정성) + integrity 2건(커밋 단일 지점·순서·표시 지점 커밋 금지 / 표시·방어 와이어링).

### v385 劍士傳(검사전) — 대장장이의 족자

v381 검전이 *검 한 자루*의 족자라면 이것은 **대장장이 자신의 일대기** — 호(v141)·페르소나(v50)·계보·무훈·설욕(v372)·서약(v376)·천칭(v382)·유파(v12)·겁의 연대기(v384)·세월(v174)을 한 장의 세로 족자 SVG로. 메뉴 "검사전 족자 저장". 메커니즘 효과 0.

- **구조 분리**: `collectSmithData()` (수집 — **단일 진원만**: `allSealedSwords`/`getPersonas`/`getActiveSchools`/`collectionHighlight`, 테스트로 잠김) → `buildSmithScrollLines(d)` (**순수 조립** — 테스트 가능) → `buildSmithScrollSVG()` (렌더 — 대표검 figure + v381 프레임 재사용 + `wrapText`/`escapeHtml`).
- **이룬 것만 말한다**: 무훈/서약/천칭/유파/대표검/겁 — 빈 항목 침묵 (신규 플레이어 족자가 0 나열이 되지 않게). 계보 요약만 항상 (0이어도 정직). 천칭 `luckDelta === null`(무기록)만 침묵 — **0은 "고른 바람"으로 표시** (0 ≠ 무기록).
- 다운로드: `검사전_{호}_{날짜}.svg` (v77 Blob 패턴, try/catch).
- 테스트: logic 1건(섹션 포함/침묵·delta 0 구분·결정성) + integrity 2건(수집 단일 진원·전 층위 결합 / 렌더·메뉴·다운로드·XSS).

### v386 九死一生(구사일생) — 생사의 원장

천칭(v382)은 성공의 운만 적었다 — 가장 격렬한 RNG 감정은 **파괴**인데 ("5%인데 두 번 연속!"), 그리고 그 반대편 **죽음이 터럭 차이로 비껴간 순간은 완전한 침묵**이었다. 확률 정직성의 완결. 메커니즘 효과 0.

- **생사의 원장** (`recordDeathLedger`): 파괴가 굴림에 실제로 걸린 판(강화 실패)마다 기대(`deathPossible` = 보호권 armed면 0, 아니면 실제 굴림의 `effectiveDestroy`)와 실제 부러짐 기록. **실패 4분기(열반/파괴/하락/유지) 전부 기록** — 한 분기라도 빠지면 저울이 기움 (호출 수 4·죽음 1이 테스트로 잠김). 열반 생환은 기대만 적혀 행운으로 결산.
- **구사일생** (`checkNearMiss`, 생존 2분기): `failRoll - deathPossible < NEARMISS_TUNING.margin(0.02)`이면 그 자리에서 "구사일생 — 죽음이 0.4% 차이로 비껴갔다" 페이드 + `stats.nearMisses` + `currentSword.closestCall` **최솟값 갱신** (가장 아슬했던 순간).
- **결산 어휘** (`deathLedgerWord`): +1.5 하늘이 가혹했다 / +0.5 칼끝이 자주 미끄러졌다 / 중립 저울이 고요했다 / −0.5 바람이 칼을 지켰다 / −1.5 죽음이 비껴 다녔다.
- **결합**: `closestCall` 봉인·전당·무덤 보존 → 一代記 "죽음이 터럭 하나 차이로 비껴갔다", 만가 "한 번은 터럭 차이로 살아남았었다", 검전·검사전 족자 (v381 전 층위 규율), 記錄 「파괴 천칭」·「구사일생」 행.
- 테스트: logic 3건(어휘·clamp / near-miss 임계·경계·최솟값 / 만가·一代記·하위호환) + integrity 2건(4분기 완전성·기대 단일 진원 / 보존 3처·방어·표시 결합).

### v387 簡(간결 모드) — 본질만 남긴 화면 (기본값 ON)

사용자 제보 **"게임이 너무 복잡해졌습니다"** 대응. ~45개 메뉴 버튼·조밀한 결정 표면이 원인 — **삭제가 아니라 숨김**: 시스템은 전부 살아있고, 설정 「간결 모드」를 끄면 전체 복귀. 새 시스템 leap(순례 초안)을 폐기하고 방향 전환한 결정.

- **설정**: `SETTINGS_DEFS`에 `simpleMode` (**def: true** — 신규·기존 모두 간결이 기본). `applySettings()`가 `body.simple-mode` 토글.
- **숨기는 것 (결정 표면)**: 각오 3택·숫돌/영석/점복 토글·수련·결계·서약 버튼·천명/역경 배너·잔향·미니 그래프·수호자 표시·심박·순위·키 힌트·우상단 글리프 마커 행(계절/절기/날씨/시진)·道 카운터·行 진행도. 메뉴는 `.menu-core` 태그(기록/안내/설정/소리/초기화/백업·복원/클라우드 ~11개)만 노출. inline display를 쓰는 요소가 있어 `!important`.
- **절대 숨기지 않는 것 (본질·드라마)**: 강화/팔기/융검 버튼·회수창(줍기/도박/방하)·도전·컷씬(귀참/꺾임)·주마등·숙적 표식 — 간결의 대상은 결정 *표면*이지 게임의 심장이 아니다. **테스트가 이 경계를 잠근다** (드라마 셀렉터가 간결 CSS에 나타나면 실패, menu-core 8~13개 범위 강제 — 과잉 태깅 방지, btn-settings core 필수 — 복귀 경로 보존).
- **신규 UI 규율 추가**: 새 상시 결정 UI를 추가하면 간결 모드 숨김 목록에 넣을지 반드시 판단할 것 (기본 화면은 본질 유지).

### v388 監査(감사) — v372~v387 적대적 정밀 감사 및 수정 (신규 기능 0)

병렬 감사(세이브/상태 + 런타임 상호작용)로 **실결함 11건** 발견·전량 수정. 수정 잠금 테스트 4건 추가.

- **[HIGH] 파괴~회수창 350ms 갭(v368) 유출**: `enhance()`·강화 버튼(newsword 모드)·`fuseSwords`·`sealSword`에 `voidPending` 가드가 없어 Space auto-repeat/연타가 갭에 새 검 구매(조각 -50)·강화·융검을 실행하고 그 위로 회수창이 겹침 → 4곳 가드 추가 + `showVoid` 재진입 차단 (기존 동시성 테스트의 `challenge || rescueWindow` 정규식을 깨지 않도록 **별도 줄** `if (voidPending) return`).
- **[HIGH] 일도 파계가 매각 취소에도 기록**: `sealSword`(askName 모달 *진입 전*)의 `breakOath('wayonly')`를 `doSeal`(확정 시점)로 이동 + 새겨진 파계를 캡처된 `ins`에도 push (봉인 기록 반영).
- **[MED] slay 실패/회피가 `endChallenge()` 미호출** (세션 이전부터): `body.challenge-active`(水鏡 은폐)·crisis 드론·도전 타이머 잔존 → 두 분기 모두 호출.
- **[MED] 컷씬 타이머 교차 절단**: 4개 컷씬(귀참/名/설욕/꺾임)이 익명 setTimeout으로 서로를 조기 제거 → 공유 `dsoTimer` + 꺾임 지속 1900→**2500ms** (CSS `demon-slay-fade 2.5s` 정렬).
- **[MED] 간결 모드의 보이지 않는 배율**: 숨겨진 각오(일심 ×1.5)/결계(×3)/armed 숫돌·영석이 무단서 지속 → `applySettings`가 간결 ON 시 휘발 상태 중화 (평상 복귀·결계 해제·체크 해제·수련 중지).
- **[MED×3 상태]**: 전당 진열이 `oathsKept` 미집계 (일도 완주 검이 유일하게 빠짐 — 집계 2곳 잠금) / 무덤 `soul` 무검증 → 재련의 SOUL_MAX 우회 / 무덤·검 `form` 무검증 → 재련 경유 raw innerHTML·FORM_AFFINITY 붕괴 (화이트리스트).
- **[MED] stats 카운터 문자열 폭주**: `Object.assign` 병합이 오염 값을 보존해 `bumpStat`의 `+1`이 문자열 연결("9"→"91"→"911") → 전 카운터 `clampInt` (원장 float 2키 제외).
- **[LOW×4]**: 초영 450ms 사이 상태 어긋남 시 조각 무고지 소실 → 재검사+환급 (`recipes.summon.cost` 단일 진원) / 겁 idx가 cap 후 중복 → 마지막 idx 기준 단조 / 주마등 off-by-2 → 사후명 표시 시간 역산 / `eraStart`·ts류·설정 boolean·`totalSlain/Destroyed` 강제.
- **교훈 (규율)**: ① 새 가드 조건은 기존 잠금 테스트의 정규식을 확인 후 별도 줄로 ② 공유 오버레이/타이머는 모듈 핸들로 ③ 상태 있는 UI를 숨길 땐 상태 중화 동반 ④ 새 배열 항목은 *모든* 필드를 normalizeState에서 강제.

### v389 監査 2차 — 문구 드리프트 감사 + 죽은 차원 부활 (신규 기능 0)

사용자 대면 텍스트 전수 감사(표시≠실제 드리프트 — 이 저장소 최다 버그 계열의 문구판)에서 **치명 발견**: 과거 커밋의 "검 없음 = 무조건 게임 오버"(`isStuck` 케이스 1)가 **검없음 차원 전체를 죽여 놓았었다** — 새 검 빚기(v31)·융검(v92)·재련(v374)이 전부 도달 불가, 안내 문구 6곳이 죽은 흐름을 가리키고, 회수한 조각도 리셋(`shards = NEWSWORD_COST`)으로 소멸해 **5초 회수 드라마의 물질적 의미가 없던 상태**.

- **[치명] 검없음 차원 부활**: `isStuck` 케이스 1 → **길이 하나라도 남으면 계속** (새 검 `shards ≥ 50` / 융검 `sealed ≥ 2 && shards ≥ 60` / 재련 `미재련 무덤 중 비용 도달`). 셋 다 끊겼을 때만 길의 끝 — 게임오버 화면의 "조각·도구 초기화"는 그때만 참. 세 갈래 검사가 테스트로 잠김.
- **게임오버 초기화 완전성**: `divinationStones`(점복석)만 이월되던 것 → 초기화 추가.
- **3지선다 안내 현행화**: 도움말·마일스톤이 회수(줍기/도박/방하)·도전(베기/대치/도망)을 2지선다로 안내하던 6곳 수정. "5초" → "기본 5초" (보너스로 최대 ~9.5초).
- **간결 모드 정합**: 안내 문구가 숨겨진 메뉴(검총·리더보드)로 사용자를 보내던 것 → 두 버튼 `.menu-core` 승격 (검총 = 파괴 서사의 종착점 = 본질; menu-core 13개 — 상한 내). 도움말에 "간결 모드를 끄면 깊은 선택지" 안내 추가.
- **기타 드리프트**: 서약 시한(강화 3회) 미고지 → 버튼/모달 명시 · 보신 desc에 '하락 절반' 누락 → 반영(aria 동기) · 단축키 Enter 미표기(도움말/key-hint/README/게임오버 버튼) · 영사 '출몰 %'가 야차 선점 롤 무시 → "(야차 외)" + 야차 확률 명시 · 게임오버 재시작 주석 ESC→Enter · README 현행화(3길/3택/길의 끝 규칙/간결 모드 기본/기록의 전당/족자).
- **규율**: 규칙을 바꾸는 커밋은 그 규칙을 전제한 문구·기능(검없음 흐름 6곳)도 함께 감사할 것 — 문구와 규칙이 어긋나면 한쪽은 반드시 옮긴다.

### v390 監査 3차 — 부활한 검없음 상태의 상호작용 검증 (신규 기능 0)

v389가 부활시킨 검없음 상태는 수백 버전 동안 실전 도달이 없었다 — 그 사이의 시스템들이 이 상태를 처리하는지 집중 감사, 결함 9건(med 4 / low 5) 전량 수정.

- **[MED] 함정 경계**: isStuck이 "길이 있다"(조각≥50)며 유도한 지출이, 유산 시작 +1~+2 검(첫 강화 유료)에선 정확히-소진 시 클릭 한 번 뒤 케이스 2 즉사 → `forgeLeavesStuck(cost)` (newSword와 동일 시작 공식 + `enhanceCost` 단일 진원) + 지출 3처(새 검/융검/재련) `confirm` 경고. 재련은 `f.reforged` 커밋 *전*에 경고.
- **[MED] 키보드**: Space/Enter가 `enhance()` 직접 호출이라 검없음(newsword 모드)에서 완전 무반응 (key-hint 약속 위반) → newsword 모드는 `btnEnhance.click()` 경유. / 게임오버 Enter가 같은 keydown으로 전역 단축키에 흘러 **재시작+즉시 강화 1회 이중 발화** (유산 +6 시작이면 첫 Enter에 10% 파괴) → `stopImmediatePropagation`.
- **[MED] 신사**: 검없음에서 유일하게 남은 조각 유출구 — 헌사로 여비(50)를 잃으면 다음 1초 틱에 무경고 길의 끝 → 여비 잠식 시 confirm.
- **[LOW]**: 조합소 `newsword` 레시피는 입장 차단과 상호 배타라 영구 도달 불가 → 제거 (메인 버튼 단일 진입점) / 검없음 분기에서 점복 토글만 disarm 누락 (armed가 새 검 첫 강화에 헛소모) / 정진·1시간 마일스톤이 검없음에서 주지 않는 보상을 표시 → 조각 폴백 / 유령 상수(`FORGE_NEW_SWORD_*`) 폴백 → `NEWSWORD_COST` 단일 진원 / isStuck 융검·재련 분기는 현행 비용에선 첫 줄에 포괄 — 비용 변경 대비 안전망으로 유지 (주석 명시).
- **이상 없음 확인**: 1초 interval류·render 전 경로(hasSword 가드)·초영 450ms 재검증·도전/회수·자동 시스템·v373→재련 실전 흐름 — 좀비 currentSword가 화면에 새는 곳 없음.

### v391 風洞(풍동) — 게임 곡선 시뮬레이터 (`tests/simulation.test.js`)

기존 테스트는 전부 **값**을 잠근다(TABLE 수치·라벨·와이어링) — 풍동은 **동역학**을 잠근다: 이 곡선으로 게임이 실제로 굴러가는가. 시드 고정(mulberry32) 몬테카를로라 완전 결정적. `npm test`에 자동 포함.

- **모델**: 증류된 핵심 루프만 — TABLE 확률·비용, `rescueShards`(추출), 봉인 보상은 CLAUDE 문서 곡선 대표점(실값은 기존 seal 테스트가 잠금). 보너스/형/유파 없음 — *맨 곡선*의 스냅샷.
- **불변식 3종**: ① **초반 생존성** — +5 판매(파괴 구간 회피)는 파산율 <1% (안전지대), +7 판매에선 회수 성공(100% vs 0%)이 파산율을 유의미하게 가른다 (5초 침묵의 경제적 의미 — v389의 직접 증명) ② **봉인 루프 수익성** — +5/+7 판매 전략의 장기 순증 양수 (경제 침몰 감지) ③ **도의 값** — 맨몸 등정 중앙값 >50만 조각 (정점은 맨손의 산이 아님 — 시뮬 실측 ~580만), 영석 상시 전략은 도 보상×3 초과 & <40만 (실전 등정로 확보).
- **다이얼 튜닝 시**: TABLE/비용을 바꾸면 풍동이 밴드 이탈로 실패할 수 있다 — 그것이 목적. 의도한 곡선 변화인지 판단 후 해당 밴드를 갱신할 것 (값 테스트와 달리 "게임이 질적으로 변했다"를 알린다).
- 발견 기록: 맨 TABLE의 도는 ~580만 조각 — **영석 없이 도는 없다** (파괴 93%가 지배). 초반 파산은 파괴 구간(+5→6부터) 진입 + 회수 실패의 곱에서만 온다.

### v392 關門(관문) — CI 파이프라인 + 테스트 이식성

359개 테스트는 로컬에서 기억날 때만 돌던 자산이었다 — **push/PR마다 강제되는 관문**으로 승격. 게임 코드 무변경.

- **`.github/workflows/ci.yml`**: push/PR(main) 시 Node **20/22/24 매트릭스**에서 `npm ci` → `lint:parse` → `npm test`. README 배지.
- **테스트 이식성**: `npm test`의 glob(`tests/**/*.test.js`)은 **Node 21+ 전용**이라 `engines >= 18` 선언과 모순 (Node 18/20에선 테스트가 아예 안 돌았음) → **파일 명시 열거**로 교체 (pure/logic/integrity/load/simulation).
- **열거 무결성 잠금**: 새 `*.test.js`를 만들고 스크립트에 안 넣으면 *조용히 실행되지 않는* 함정 → integrity 테스트가 tests/ 디렉토리와 스크립트 열거를 대조 + glob 미사용 + CI 워크플로 존재·내용 검증. **새 테스트 파일 추가 시 `package.json` test 스크립트에도 추가할 것** (잊으면 이 테스트가 잡는다).
- 후속: 기존 `test.yml`(v366, Node 20 고정)이 세션 첫 커밋의 glob 변경으로 **세션 내내 전 push 실패** 중이었음을 Actions 확인에서 발견 — v392 열거가 치유, 중복 워크플로 제거로 `ci.yml` 단일화. 교훈: **테스트 실행 방식을 바꾸면 `.github/workflows` 동반 확인 + push 후 Actions 상태 확인.**

### v393 書體(서체) — 의도된 활자의 실체화

게임 전체 **133처**가 `'Noto Serif KR'`을 선언하지만 **로드하는 코드는 0처**였다 — 로컬 설치 기기 밖에서는 흑금 서예 미학의 활자가 전부 폴백 세리프로 렌더되어 온 것. head에 Google Fonts 링크(preconnect ×2 + `display=swap`, 두께 200/400/700 — 대형 한자·본문·새김) 추가.

- **폴백 동일성**: `display=swap`이라 로드 전·오프라인·file://에서는 기존 폴백 그대로 (FOIT 없음, 동작 변화 0).
- **한계 (기록)**: 검전/검사전 **내보낸 SVG 족자**는 독립 파일이라 웹폰트를 로드하지 않음 — 보는 기기의 세리프로 렌더 (기존과 동일, 게임 내 표시는 이제 의도 서체).
- 테스트: integrity 1건 (링크·swap·두께·preconnect + 선언 광범위성 회귀 감지).

### v394 재방문 경량화 — 서버 캐시 정책 (라이브 실측 기반)

배포 실서버(`https://my-reinforce-sword.onrender.com`)를 처음 실측한 결과에서 나온 수정. **실측 기록 (2026-08)**: ① Render 자동 배포 정상 (push 후 수 분 내 last-modified 갱신 — v393 서체도 라이브 확인) ② 전송 압축은 **Render 엣지(Cloudflare)가 이미 Brotli 적용** — 824KB → **~288KB** (express compression 추가 불필요, 시도하지 말 것) ③ 그러나 `Cache-Control`의 저장-금지 지시어가 **ETag 조건부 재검증(304)까지 차단** — 재방문마다 288KB 전량 재전송.

- **수정**: `no-cache` 단독으로 — 브라우저가 캐시하되 매 방문 재검증 (미변경 304 ~0바이트, 갱신 배포 시 즉시 전파 — 신선도 보장 동일). Express `sendFile`이 ETag/Last-Modified를 자동 발행하므로 별도 작업 없음.
- 테스트: integrity 1건 (저장-금지 지시어 재유입 차단 + no-cache 존재). **주의**: 검사 문자열을 주석에 쓰면 자기 함정 (v390·v394에서 2회 겪음 — 주석은 한글로 풀어 쓸 것).

### v395 常在(상재) — PWA: 설치형 + 오프라인

게임은 100% 클라이언트 사이드(localStorage) — 오프라인 플레이가 본성인데 배포판은 네트워크 없이는 열리지도 않았다. 이제 한 번 방문하면 홈 화면 설치 + 완전 오프라인 플레이.

- **서버** (`server.js`): `/sw.js`·`/manifest.webmanifest`·`/icon.svg` 3라우트를 **인라인 문자열**로 캐치올보다 먼저 제공 — v332 "지정 파일 외 비노출" 원칙 유지 (저장소 파일 추가 없음). SW·manifest는 no-cache (배포 즉시 전파), 아이콘은 1일 캐시.
- **SW 전략 — network-first (안전 최우선)**: 항상 네트워크 먼저 → 성공한 내비게이션 응답만 캐시 갱신 → **오프라인일 때만** 캐시 폴백. 온라인 동작(304 재검증 포함)은 기존과 완전 동일 — *낡은 버전 고착이라는 클래식 SW 사고가 구조적으로 불가능*. CDN(서체/Supabase)은 불관여 (오프라인 시 각자 폴백 — 서체는 시스템 세리프, 클라우드는 원래 선택 기능).
- **클라이언트**: manifest 링크 + theme-color + SW 등록 (https/localhost 가드 — **file:// 더블클릭 실행은 완전 무변화**, 등록 실패 조용히).
- 테스트: integrity 2건 (라우트 순서·SW 전략 5요소 / manifest·프로토콜 가드). 배포 후 라이브 검증 필요: `/sw.js`·`/manifest.webmanifest` 200 확인.

### v396 大監査 4차 — 레거시 전 계층(v1~v371) 감사, 확정 30건 전량 수정 (신규 기능 0)

v388~v390 감사는 최근 버전(v372+)에 집중 — 그 이전 수백 버전의 레거시 계층은 체계 감사가 없었다. 39-에이전트 워크플로(차원별 발견 → 적대적 검증)로 v1~v371 전체를 감사, **확정 30건(HIGH 5 / MED 25) 전량 수정**. 잠금 테스트 10건(integrity 9 + logic 1) 추가 → 373 테스트.

- **[HIGH] 점복 무한 재롤 exploit**: 점복 armed 토글 재체크마다 새 굴림 — 좋은 괘가 나올 때까지 공짜 재롤로 사실상 확정 강화. → `divinationLockedLevel` — 같은 강화 단계에선 굴림 고정, 단계가 변해야 재롤. 언체크는 굴림을 버리지 않는다.
- **[HIGH] 결계 이중과금**: `maybeForceSanctumOff()`가 굴림 *전*에 호출되어 비용은 냈는데 보호가 소멸된 채 굴림 → **캡처-후-차감 규율**: `sanctumArmed`/`wishDR`를 비용 차감 전에 캡처, 만료 처리는 굴림 결산 후 3개 exit에서. (successChance 캡처와 같은 패턴 — recordLuck 표시≠실제 방지 순서가 테스트로 잠김.)
- **[HIGH] 유산검 소프트락 미감지**: isStuck 케이스 2가 `level >= 1 && level < SEAL_MIN_LEVEL` 대신 구식 조건 — 유산 시작 +1~+2 검이 조각 소진 시 길의 끝 감지 실패. → `minSealLevel()` 단일 진원 통일 + `forgeLeavesStuck` 면제 제거.
- **[HIGH] 융검 클라우드 롤백**: `fuseSwords`만 `schedulePush()` 누락 — autosync 사용자의 융검 직후 다른 기기 로그인이 구본을 자동 적용해 봉인 검 2자루 증발. → push 추가 + `duelWins` 인덱스 재매핑 (splice 후 인덱스 공간 붕괴).
- **[HIGH] 충전(刹那) 타이머의 모달 관통**: 충전 setTimeout이 익명 — 대기 중 팔기/명명 모달 진입 시 타이머가 관통해 매각 대상 검을 강화/파괴 (검 이중 존재). → `chargeTimer`/`cancelCharge()` 모듈 핸들 + `sealTransition` 플래그(봉인 dissolve 800ms 이중 매각 차단) + doSeal 진입 시 검 상태 재검증.
- **[MED] spawn-소모 → 성공-소모 이행**: 멸마·뇌신이 도전 *등장* 시점에 충전 소모 — 도망/새로고침으로 증발. → spawn은 배율만 적용(`usedMetsumao`/`usedWishSlay` 플래그), 소모는 slay 성공 시. 名 보스(`triggerNamedFoe`)에도 동일 적용 (기존엔 배율 자체가 누락).
- **[MED] 도전 타이머 교차**: slay 성공/대치의 지연 `endChallenge()`가 익명 setTimeout — 다음 도전을 조기 파괴. → `pendingEndTimer` 공유 핸들, showChallenge가 선해제. / 형 선택 모달 중 spawn된 도전이 모달 뒤에 숨음 → `formDeferredChallenge` 보류 후 선택 완료 시 발화, Esc는 형 선택 중 차단.
- **[MED] import XSS 4계열**: sanitizeSword가 `inscriptions[]`/`verse[]`/`birthStatement`/`bornTod` 미소독 + normalizeState가 `lastSenResult`/`daoTitle` 미검증 → stripTags·화이트리스트·길이 상한. 별자리 클릭은 잘못된 시그니처로 오검 열람 → 인덱스 범위 검증 + 올바른 인자.
- **[MED] enshrined 누락 잔재**: `trialCount()`가 sealedSwords만 집계 (전당 검이 시련의 혼에서 증발) → `allSealedSwords().length`. 주보(weekly) sealed 증분도 배열 길이 스냅샷 → 단조 카운터 `sealedCum`. enshrineSeal의 `bumpStat('sealed')`·시련 알림 누락 보수.
- **[MED] 복원 경로 이원화**: 클라우드 수동 pull·파일 복원이 각자 반쪽 보정 → `applyCloudState` 단일 진원 + `challenge || rescueWindow || voidPending` 가드 (도전/회수 중 복원으로 상태 붕괴 차단). 용린 축복의 MAX 도달이 도 의식(명문·엔딩·기록) 전부 생략 → 정식 캐스케이드 결합.
- **[MED] 오디오/시각 위생**: suspended AudioContext 영구 무음(resume 훅 + 첫 상호작용 리스너) / 숨은 탭에서 명상·시보·잔향 계속 발음(`document.hidden` 가드 5곳) / reduceMotion 설정이 WAAPI 입자 5종 무시(`motionReduced()` 게이트 — 정확히 5곳이 테스트로 잠김) / 계절 낙하 입자가 도전·회수 화면 관통 + 무상한(3중 가드 + cap 6) / 회수 ring 애니메이션이 display 토글 직후 transition 미발화(강제 리플로우).
- **[MED] 시간 경계**: 여명 인사가 부팅 직후 오탐(`bootGapMs` 실측 전달) / 출석·주말 마크가 자정 넘겨 켜둔 탭에서 미갱신(시간별 interval에 체크 4종 추가).
- **규율 (v396 추가)**: ① 소모성 자원은 **캡처-후-차감** — 굴림에 쓰는 값은 비용 차감 전에 지역 상수로 캡처, 만료/소모 처리는 결산 후 ② 소모는 **효과가 실현되는 시점**에 (spawn/armed 시점 소모 금지) ③ 지연 setTimeout이 게임 상태를 만지면 반드시 모듈 핸들 + 진입 지점 선해제 ④ 새 import 필드는 sanitizeSword/normalizeState **양쪽 대칭** 소독. 참고: `legacyStrength()`는 의도적으로 sealedSwords만 집계 유지 — 전당 검까지 합치면 startBonus 경제가 변한다 (점수 인플레이션 회피).

### v397 敵手(적수) — 이길 수 있는 적 (도전 승률 재설계)

사용자 제보 **"적이 나타났을 때 거의 지는 경우가 많다"**. 실측 결과 운이 아니라 설계 결함 — 도전 판정은 주사위 없는 단판(`state.level >= c.strength`)인데 **강도를 굴리는 축과 판정하는 축이 서로 달랐다**. 밸런스 조정은 사용자 승인 후 진행 (승률 밴드·名 대면 조건 모두 승인값).

- **[치명] 재건 구간 전패**: `rollChallengeStrength()`가 `floor(bestLevel × 0.65) + 0~3` — 강도는 *지난 정점*, 판정은 *지금 검*. 최고기록 12에서 검이 부서져 +3부터 다시 빚으면 승률 **0%** (+5에서 6%, +8에서야 55%). v389가 되살린 "부서진 뒤 다시 올라가는" 흐름과 정면 충돌 — 가장 약할 때 가장 센 적을 만나던 구조. → 앵커를 **`state.level - 3 + rand(0..4)`** (강화도 −3 ~ +1)로. 전 구간 일반 그림자 승률 **80% 고정**.
- **[치명] 劍鬼는 수학적으로 불가**: 강도 `bestLevel + 5`인데 `bestLevel`은 강화 성공 즉시 갱신되므로 `bestLevel >= level`이 **항상 참** → 판정식이 결코 참이 될 수 없었다. 鬼斬 명문·검귀 컷씬(v49)·검명 접미가 통째로 도달 불가 사문(死文)이었다. → **`level - 1 + rand(0..4)`** (−1 ~ +3, 승률 40%) — 최강 티어는 유지하되 넘어설 수 있다.
- **[치명] 名 보스 2종 불가**: 귀제 16·용 18 > `MAX_LEVEL`(15) → 제참·용참 명문과 700·1500 조각이 영구 미도달. → **14 / 15**로. 사다리 불변식 `trigger <= strength <= MAX_LEVEL`이 테스트로 잠김.
- **名 대면 조건**: `pendingNamedFoe`에 `state.level >= f.strength` 추가 — `trigger`는 **해금**(최고 기록), `strength`는 **대면**(지금 검). 단판 판정이라 넘어설 수 없는 강화도에서 만나게 하면 결정이 아니라 벌금(물러남 3조각)이 되고, 만남은 검 1자루당 1회 소모라 재건 중 기습당하면 그 검으로는 영영 그 보스를 벨 수 없었다.
- **확률 정직성** (v382/v386 계보): 記錄 모달에 **「도전 승률」** 행 — 벤 판 / (벤 판 + 꺾인 판). 물러남·대치·놓침은 싸움이 아니므로 분모 밖, 3판 미만은 침묵.
- **종합 승률**: 影 65%×0.8 + 逃影 22%×~1.0 + 鋼影 10%×0.2 + 劍鬼 3%×0.4 ≈ **77%**. 강도가 오르면 보상(`strength×4+6`)도 오르고 승률은 내려가므로 **정점 기대값은 대체로 중립** — 점수 인플레이션 회피.
- **규율 (v397 추가)**: **판정에 쓰는 축과 난이도를 굴리는 축은 같아야 한다.** 두 축이 갈리면 승률이 조용히 0 또는 1로 고착된다. 새 적/난이도 공식을 추가할 땐 ① 판정식이 참이 될 수 있는 값 범위인지 ② `MAX_LEVEL` 상한을 넘지 않는지 반드시 확인할 것.
- 세이브 호환: 공식 변경 + `stats.enshrined` 키 추가 (의미 변경 없음) ✅. 테스트: logic 3건(승률 밴드 전 구간·앵커 단일성·名 사다리) + integrity 3건(앵커에 최고 기록 부재·劍鬼 재유입 금지 / 대면 조건 / 記錄 산식) → **379 테스트**.

**코드 리뷰 반영 (v396 회귀 5건 수정)** — 이번 세션 v396 수정분에 대한 리뷰에서 발견:
- **[치명] 봉인 플래그 영구 잠금**: `doSeal`의 `sealTransition = true` 이후 의식·컷씬·`newSword()` 중 어떤 예외라도 나면 플래그가 latched — 강화·매각이 **동시에** 막혀 새로고침 외 복구 불가였다. → `armSealTransition()` (set + 5초 안전망 타이머)로 통합, 반드시 해제.
- **[치명] 회복 가능한 판을 끝냄**: v396 [11]이 게임오버 하한을 `minSealLevel()`로 넓혀, 유산 시작 +3~+7 검이 조각 마른 *순간* 「길의 끝」을 선언했다. 이 게임엔 조각 없이도 들어오는 일일 수입(첨·천시·정진)이 있어 **조각 고갈은 영구 사망이 아니다**. → `SEAL_MIN_LEVEL` 하한으로 되돌림. **규율: 파괴적 오탐보다 무해한 미탐이 낫다** — 함정 경고는 지출 *전*의 `forgeLeavesStuck` confirm이 담당 (그 개선은 유지).
- **점복 잠금이 검을 넘어 생존**: 굴림 잠금 키가 강화도뿐이라, 같은 강화도로 시작하는 새 검(유산 보너스)에 이전 검의 좋은 괘가 재사용됐다. → `newSword()`에서 `clearDivinationLock()`.
- **승률 분자 누락**: 유형별 카운터 합산이 名 처치를 빠뜨려(분모의 꺾임엔 名 패배 포함) 승률이 낮게 표시. → 권위 카운터 `state.totalSlain` 단일 진원 (v345와 동일 규율).
- **전당 진열이 「검 판매」로 집계**: v396 [12]가 `bumpStat('sealed')`를 `enshrineSeal`에 넣어, 조각 0인 진열이 매각 통계·봉인가 페르소나·칭호 임계를 부풀렸다. → `stats.enshrined` 별도 카운터, 주보 단조 누적에서만 합산.
- 오탐 1건 기각: 형 선택 모달 중 보류된 도전의 재굴림 — 보류는 spawn 롤 **이전**이라 이긴 굴림을 버리는 것이 아니다.

### v398 掌中(장중) — 손 안의 검: 실기 뷰포트 실측 기반 정비

v395가 홈 화면 설치(PWA)를 열었는데 **폰 화면에서 이 게임이 실제로 어떻게 보이는지는 한 번도 측정한 적이 없었다**. Chrome 동일 출처 iframe으로 390×844·360×640 실기 뷰포트를 만들어 DOM 사각형을 전수 대조(조상 투명도까지 계산해 오탐 제거)해 확정 결함을 수정.

- **근본 원인**: v380이 좌표 손배치를 금지하고 `#corner-stack`을 만들었지만, 그 잠금 테스트는 **CSS만 검사**했다 — `style.cssText`로 만들어지는 JS 인라인 표식들이 규율을 통째로 우회했다. 실측 결과 `#sidin-mark`(시진)가 `top:14px; left:18px`로 **메뉴 버튼 ≡ 과 정확히 같은 좌표**(전 폭에서 겹침), `#weekend-mark`(right:265px)·`#streak-mark`(right:170px)·`#festival-mark`(right:215px)가 좁은 화면에서 제목을 덮고, `#eternity-mark`(top:32px/right:18px)는 스택 둘째 줄과 같은 자리였다.
- **구조 전환**: 상시 표식 5종(시진·주말·연일·절·영겁)을 **`#corner-stack` 정적 소속**으로 — 인라인 좌표 제거, 비활성 시 `textContent=''`로 `:empty` 규칙이 자리까지 압축. 간결 모드(v387)의 `.corner-row` 은폐도 자동 적용 (시진이 간결 모드에서 안 숨던 결함 동시 해소). 도사 안내(`showAdvisorMessage`)는 `.advisor-msg` 클래스로 (스택·속삭임 아래 210px).
- **일언(日言)**: `position:fixed; bottom:54px` → **흐름 요소**로 (팔기 버튼 아래·하단 버튼 위). 고정 좌표 시절 팔기 버튼 위에 글자가 얹혔다. 배선은 `dataset.wired` 1회 가드.
- **명상**: `#meditation-mark`(top:14%)와 `#advice-line`이 겹쳤다 → 명상 중 호흡 안내 은폐 (명상 자체가 호흡이므로 표식이 대신한다).
- **손가락 치수**: 실측 하단 3버튼 34px·메뉴 30px·보호권 행 16px → `@media (max-width: 480px)`에서 44px 확보 (데스크톱 여백 불변).
- **규율 (v398 추가)**: **상시 표식은 `#corner-stack`에 정적 선언한다 — JS 인라인 `position:fixed` 픽셀 좌표 금지.** 잠금 테스트가 이제 CSS가 아니라 *생성 코드*까지 검사한다 (`cssText = 'position:fixed;top:Npx;left|right:Npx` 패턴 0건 강제). 전면 페이드(`top:NN%`)는 스택 대상이 아니라 제외.
- 테스트: integrity 3건(스택 소속 5종·인라인 좌표 0 / 일언 흐름 위치·배선 가드·명상 은폐 / 44px 미디어 쿼리) → **382 테스트**. 게임 로직 무변경 (세이브 영향 0).

### v399 遺失(유실) — 도달할 수 없는 것들 (미도달 콘텐츠 전수 감사)

v397에서 「판정식이 참이 될 수 없는 적」을 발견한 것이 우연이 아니라 **하나의 결함 계열**임을 확인. 조건으로 잠긴 콘텐츠(명문·천명·시련·칠성·업적·컬렉션·칭호)의 트리거와 수치 상한을 병렬로 전수 수집해 **임계가 상한을 넘거나 우선순위·엣지 때문에 영원히 선택되지 않는 것**을 찾아 수정. 메커니즘 효과 0 — *이미 설계된 것을 실제로 도달 가능하게* 만들 뿐.

- **[치명] 검명 컬렉션 32칸 중 8칸 영구 공란**: `NAME_SUFFIX`는 우선순위 배열이고 `makeSwordName`은 첫 매칭에서 즉시 반환한다. 그런데 강화 시도마다 혼이 +1씩 붙으므로(`enhance`의 `addSoul(1)`) 구(시도 50)에 이르면 이미 각성(혼 34), 고(시도 100)에 이르면 이미 본(혼 67)을 가진다 — 나이 접미가 혼 접미보다 **아래**라 첫 매칭이 언제나 혼 쪽이었다. → 순서를 `도 > 귀참 > 야차참 > **고 > 본 > 구** > 강체 > 각성`으로. 여덟 접미 전부 도달 가능 창이 생긴다 (각성 = 시도 34~49 / 구 = 50~66 / 본 = 67~99 / 고 = 100+).
- **[치명] 각성 명문이 四道 이후 획득 불가**: 혼 단계 명문은 `addSoul`의 **상승 엣지**로만 부여되는데, 새 검의 시작 혼은 soul에 **직접 대입**된다(시련 t2 +20 · 신사 d3 +5 · 쌍명 +20 · 사도 50). 사도를 이루면 모든 새 검이 혼 50으로 태어나 「34 미만 → 34 이상」 엣지가 영영 발생하지 않았다 (신무 축복만 수동 push로 우회 중이었다). → `syncSoulInscriptions()` — 임계를 이미 넘긴 상태를 사실대로 새긴다. `checkInscriptions()` 안에서 호출하므로 새 검·융검·재련 세 경로가 한 번에 정합.
- **[치명] 역전 명문이 존재할 수 없었다**: 역경 역전(5연패 후 성공)은 `announceInscription`으로 **페이드만** 띄우고 검에 새기지 않았다. 그런데 다섯 시스템(융검 우선순위·전수 순서·명예 뱃지·칠성 메타 제외 집합·한자 마이그레이션)이 그 키의 존재를 전제하고 있었다. → `grantInscription('역전')` + 사전 등재.
- **名 처치 명문 5종(풍참·월참·인참·제참·용참)이 명문 사전에 없었다**: 실제로 새겨지는데 `INSCRIPTIONS`에 정의가 없어 도감에 영영 나타나지 않고, 진척 분모(`INSCRIPTIONS.length`)에서도 빠져 「41 / 36」 같은 초과 표시가 가능했다. → 사전 등재 (부여는 기존대로 처치 시점 push).
- **검명 컬렉션 그리드 3중 drift**: 주석 7접미/28칸 vs 실제 8접미/32칸, 그리드는 7열 고정이라 형별 줄이 어긋나 흘렀다 → 열 수를 `suffixes.length`에 묶고 주석 정정.
- **청룡 조건의 잔존 outlier**: `state.sealedSwords.length >= 10` — 도 검을 전당에 진열할수록 진척이 되레 줄었다 (v350/v396이 통합한 것과 같은 계열) → `allSealedSwords()` 단일 진원.
- **규율 (v399 추가)**: **조건으로 잠긴 콘텐츠를 추가할 때 도달 가능성을 함께 증명할 것.** 특히 ① 임계가 상한(`MAX_LEVEL`·`SOUL_MAX`·배열 cap)을 넘지 않는지 ② 우선순위 배열에서 뒤에 있는 항목이 앞 항목과 **동시 성립하는 커플링**(시도↔혼처럼)으로 가려지지 않는지 ③ 상승 엣지로만 부여하는 값이 **직접 대입**되는 경로가 있는지. 새 명문 키는 반드시 `INSCRIPTIONS`에 등재 — 목록 밖 키는 도감·진척·우선순위에서 유령이 된다.
- 테스트: integrity 5건(접미 도달 가능성·사전 완전성(名/역전/접미 참조)·역전 부여 경로·혼 정합 헬퍼·청룡 단일 진원) → **388 테스트**. 세이브 호환: 키 추가 없음, 기존 봉인 검의 저장된 검명(`s.name`)은 불변 ✅

### v400 實戰(실전) — 게임을 실제로 실행하는 검증 계층

**구조적 공백**: v399 시점까지 388개 테스트 중 **게임을 통째로 실행하는 것은 0개**였다. 순수 함수 슬라이스(pure/logic), 소스 텍스트 정규식(integrity), 격리된 정규화 동작(load), 게임을 *재구현한* 모델(simulation) — 전부 조각이거나 모형이다. 부품을 조립했을 때만 드러나는 결함(부팅 예외 · 렌더 예외 · 이벤트 배선 누락 · 모달 교착 · 상태 붕괴 · 손상 세이브의 실제 관통)은 구조적으로 보이지 않았다.

**하니스 (`tests/domshim.js` + `tests/player.js`, 의존성 0)**
- `domshim.js` — index.html의 **실제 마크업을 파싱한 최소 DOM**(id 색인·클래스·data-*·부모자식·이벤트 버블링/캡처/once) + **가상 시계**(setTimeout/setInterval/rAF/Date/performance/AudioContext.currentTime이 전부 같은 시각축) + **시드 난수**(mulberry32). 게임 IIFE를 `vm`에서 부팅한다. 실행이 **완전히 결정적**이라 같은 시드 = 같은 플레이.
- `player.js` — 사람처럼 조작하는 로봇. 게임 내부 함수를 직접 부르지 않고 **버튼 클릭·키 입력**만 쓴다 (IIFE 밖에서 접근할 수도 없거니와, 플레이어가 실제로 밟는 표면만 밟는 것이 목적). 관문 모달(형 선택·명명·게임오버) 통과, 회수창 3길·도전 3택 정책, 등정 보급(`stockUp`/`armDefenses`), 매 걸음 상태 불변식 검사.
- 부팅에 필요한 호스트 전역은 정확히 6개(`document`/`window`/`location`/`navigator`/`MutationObserver`/`HTMLElement`) + 타이머류. `window.supabase`·`navigator.serviceWorker`는 **의도적으로 미제공** (오프라인 폴백 경로 검증).
- 셰임이 흉내내지 않는 것: 실제 CSS 적용/레이아웃(getBoundingClientRect 고정값)·네트워크(fetch 영원히 pending)·이미지 로드(그래서 `onerror` 는 실행되지 않는다 — **요소 생성 자체를 XSS 지표로 삼는다**).

**관문 (`tests/play.test.js`, 15건)**: 부팅 예외 0 / 첫 진입 흐름 / 장기 자동 플레이 3정책 × 220걸음 / 메뉴 56항목 × (신규·베테랑) / 회수창 3길 / 검없음 차원 / 손상 세이브 부팅+순회 / 누수 유계 / 도전 중 버튼 잠금 / 정점(道) 도달~엔딩~의식 완주 / **소독 전수**(세이브의 모든 문자열을 페이로드로 바꾸고 전 모달 순회) / auto-repeat 차단 / 모달 은폐 중 베기 차단 / 겁 교체 / 확률 표시 갱신.

**찾아낸 실결함 11건 (전량 수정, 잠금 동반)**

| # | 심각도 | 결함 |
|---|---|---|
| 1 | HIGH | `sealedSwords`/`enshrined` 에 `null` 항목 하나면 v117 四道의 `getWayFormCounts` 가 **부팅 중 던져 게임 전체가 죽는다** — 강화·메뉴 전부 무반응, 유일한 복구가 전 진행도 삭제. (rubbings/userDiary/guestSwords 는 해당 모달이 죽음.) → `normalizeState` 진입점에서 **객체 배열의 비객체 항목 일괄 제거** (단일 진원, 대상 9키; userSeal·hourActivity 는 문자/수 배열이라 제외) |
| 2 | HIGH | 손 안 댄 두 컬렉션의 **innerHTML 관통**: 탁본(v136) → 기정·탁본 모달, 최근 일지(v75) → 記錄(menu-core, 간결 모드에서도 열린다). → 항목의 *모든* 문자열을 훑는 `scrubStrings` (필드 열거 방식이 애초에 이 둘을 빠뜨린 원인) |
| 3 | HIGH | 주보 스냅샷의 `week` 가 raw 삽입 — **사용자 조작 0회 · 부팅 3초 후 자동으로 열리는 화면**이라 대가가 가장 크다 (활동이 있는 세이브에서만 발화해 최소 재현을 빠져나갔다). → 삽입 지점 `escapeHtml` + 정규화에서 ISO 주차 형식 강제 |
| 4 | HIGH | **Space 를 누르고 있으면 「파괴 후 5초의 침묵」이 1.3초에 태워진다** — auto-repeat(~33ms)가 조각 회수 → 새 검 구매(-50) → +7 강화까지 한 홀드로 연쇄. 이 게임의 본질이 그 침묵이다. → `if (e.repeat) return` (또박또박 누르는 것은 그대로; 연속 강화는 수련 토글이 그 용도) |
| 5 | HIGH | 모달이 도전을 덮고 있을 때 Space 한 번이 **보이지 않는 베기**를 확정 (실측 totalSlain +1) — 숙적이 화면 밖에서 태어날 수 있었다. v370r이 enhance만 막고 slay/rescue를 예외로 둔 탓. → `modalOpen` 검사를 challenge 분기보다 앞으로 |
| 6 | HIGH | **초영(v375) 전체가 사문** — 조합소 입장(`level === 0`)과 초영 조건(`level >= CHALLENGE_MIN_LEVEL`)이 상호 배타라 누를 수 있는 상태가 존재하지 않았다. → 입장 게이트를 **항목 게이트**로 이동 (「도구는 +0 에서만」 의도는 각 도구 레시피의 `check` 로 보존 + 비활성 사유 title) |
| 7 | HIGH | **무장 토글이 확률 표시를 갱신하지 않는다** — 표시 계산은 armed 숫돌·영석을 이미 반영하는데 리스너가 없어 화면이 굳어 있었다: 영석 25조각을 쓰고도 「파괴 10%」가 남고, 숫돌을 켜도 표시 63% vs 실제 굴림 88%. 이 게임에서 가장 중요한 숫자다. → 네 토글 `change → render()` |
| 8 | MED | 도전 중 `#challenge` 는 stage 만 덮는다 — 그 아래 강화·팔기·융검이 **평소 라벨 그대로 활성**인데 누르면 조용히 무시됐다. → `lockActionButtons()` (비활성 + 사유; 해제는 render 가 진짜 조건 재계산) |
| 9 | MED | `sanitizeSword` 가 level·form·운 원장은 강제하면서 **soul 만 빠졌다** — v388이 무덤에 건 클램프와 같은 비대칭. 손상 import의 soul=99999는 영구 本 단계(강화 +4%·보상 ×1.15)로 고정되고 봉인→융검(평균)·재련(절반)으로 번진다 |
| 10 | MED | **간결 모드(기본 ON)의 도구 함정** — 조합소는 숫돌·영석·점복석을 파는데 무장 행(`#stone-row`)은 그 모드에서 무조건 숨김이라, 신규 플레이어가 조각을 주고 산 물건을 영영 쓸 수 없었다. → 0개면 그대로 숨기고 **하나라도 지니면 드러난다** (구매가 곧 기능의 발견) |
| 11 | MED | 게임오버 재시작이 활성 도전을 정리하지 않아 옛 그림자가 새 겁의 무대를 덮은 채 남았다 → `restartFromGameOver` 초입에 `endChallenge()` |
| 15 | LOW | 중앙 페이드의 정적 부제 「검에 명문이 새겨졌다」가 **명문이 아닌 아홉 갈래**(구사일생·검 파괴·방하·베기·보호권·예지·마일스톤·인트로·길 재개)에도 붙어 매번 사실과 어긋났다 → 이미 계산하던 `def`(실제 명문 정의)로 조건부 표시 |
| 14 | MED | **「길의 끝」이 래치됐다** — `checkGameOver`가 `gameOverShown`이면 즉시 반환해 `isStuck()`을 다시 평가하는 경로가 없었다. 그런데 `isStuck()`의 설계 근거 자체가 「조각이 드는 행동 없이도 들어오는 수입(정진·연일·명절·첨)이 매일 있으므로 조각 고갈은 영구 사망이 아니다」다 — 그 수입이 구조적으로 도달할 수 없었다. 실측: 조각 10에 죽고 3시간 뒤 55(새 검 비용 50 초과)가 됐는데 오버레이는 그대로, 강화 버튼은 「보유 10」에 얼어붙은 채, 유일하게 보이는 탈출구를 누르면 그 수입(55→50)과 도구(영석 1→0)가 소멸했다 — **기다린 사람이 벌을 받는 구조**. → `hideGameOver()` (플래그·오버레이·드론·render 의 역연산) + 중앙 페이드 「개 · 길이 다시 열렸다」. 진짜 막힌 판은 그대로 유지된다 |
| 13 | HIGH | **융검이 「도」를 계승해 +3 검이 道 검의 대우를 전부 받았다** — 대조군 대비 실측: 매각 보상 21 → **31조각(×1.5)** · `wayReached++` · 검명 「직도」 접미 · 일생시 4행 · 의식 컷씬. 봉인 때 한 번 세어진 도가 융합으로 **재생산되는 루프**라 이 저장소 1순위 규율(점수 인플레이션 회피)에 정면으로 어긋난다. 도는 성질이 아니라 **성취 표식**(trigger: `level >= MAX_LEVEL`)인데 융합검은 +0 언저리에서 시작한다. → `FUSION_NO_INHERIT = ['도']` 로 계승 루프에서만 제외 (v33 傳授가 도를 전수 목록에서 빼고 始祖/達人/聖을 「메타라 전수 대상 외」로 둔 것과 같은 규율 — **두 계승 체계가 어긋나 있던 것을 맞췄다**). 배열 자체는 유지 — 후보 목록에서 어느 검이 道 검인지 사라지면 안 된다 |
| 12 | MED | **초영을 되살리자 함께 살아난 경로**: 초영의 450ms 지연이 매각 전환 창(dissolve 800ms · 명명 모달 대기)과 겹치면, 계보에 들어가고 대금까지 받은 검이 도전 판정(`level >= strength`)의 근거가 됐다 — 名 보스는 검 1자루당 1회 소모라 그 검으로 벤 보스가 명문 없이 영구 소멸했다. → `maybeTriggerChallenge`·`slay`에 `sealTransition` 가드 + 초영 450ms 재검사에 포함(어긋나면 환급). v396 규율 ③의 一閃 축 미적용 지점 |

**규율 (v400 추가)**
- **판정이 상태를 바꾸면 그 판정도 되돌릴 수 있어야 한다.** 한 번 참이 된 조건을 래치해 두면, 그 조건이 거짓이 된 뒤에도 화면이 거짓말한다 ([14]). 특히 화면 전체를 덮는 판정은 스스로 걷힐 길을 갖출 것 — 그 동안 `render()` 가 멈춘다는 점도 함께 고려해야 한다.
- **공용 연출의 정적 문구는 모든 사용처에서 참인지 확인하라** ([15]). 한 곳을 위해 쓴 부제가 나머지 여덟 곳에서 거짓이 된다.
- **성취 표식은 계승 대상이 아니다.** 「도」처럼 *조건 도달*로 얻는 명문을 상속·계승·전수 경로에 흘리면, 그 조건을 만족하지 않는 검이 그 대우를 받는다 ([13]). 성질(형·혼)과 성취(도·강체)를 구분할 것 — 효과가 걸린 것은 특히.
- **한 개념에 계승 체계가 둘 이상이면 규칙을 대조하라.** 傳授(v33)는 도를 제외했고 융검(v92)은 최상위에 뒀다 — 어긋난 쪽이 결함이었다.
- **죽은 코드를 되살릴 때는 그 경로의 동시성도 함께 되살아난다.** 초영을 도달 가능하게 만든 순간, 그 지연 발화가 매각 창과 겹치는 결함이 실재하게 됐다 ([12]). 사문을 살릴 땐 v390 이 「부활한 차원 재감사」로 남긴 교훈을 그대로 적용할 것.
- **잠긴 콘텐츠는 실행으로 증명한다.** v399가 「도달 가능성을 함께 증명할 것」을 규율로 세운 바로 다음 버전에, 조건이 상호 배타라 통째로 사문이던 기능(초영)이 실행 검증에서 나왔다. 정적 검사는 조건을 *읽을* 수는 있어도 **두 조건이 동시에 참인 상태가 존재하는지**는 실행해야 안다.
- **표시가 상태를 따라가려면 상태를 바꾸는 모든 입력에 갱신이 걸려야 한다.** 계산이 맞아도 갱신 트리거가 없으면 화면은 거짓말한다 (무장 토글 7건).
- **잠기는 결정은 잠긴 것처럼 보여야 한다.** 가드가 조용히 `return` 하면 활성 버튼이 무반응이 된다 — 비활성 + 사유가 이 저장소의 관용구다.
- **누르고 있는 손가락은 결정이 아니다.** 되돌릴 수 없는 행동에 `e.repeat` 를 흘리지 말 것.
- `normalizeState` 는 **전체가 하나의 try** 다 — 그 안에서 던지면 *이후 정규화가 통째로 건너뛴다*. 새 코드는 반드시 타입을 확인하고 접근할 것 (배열 아닌 오염값에 `forEach` 를 부르면 뒤가 전부 무방비가 된다).
- 새 상시 UI/컬렉션 추가 시: ① `#corner-stack`(v398) ② 간결 모드 은폐 판단(v387) ③ `normalizeState` 소독(v400 [1][2]) ④ **play.test.js 의 소독 전수 관문**이 자동으로 커버한다 — 통과하는지 확인할 것.
- **실행 관문은 시간대에 흔들린다.** 게임이 `new Date()` 로 로컬 시각을 읽어 계절·절기·시진·명절 분기를 타므로, 같은 시드라도 머신 TZ 가 다르면 활성 연출이 달라진다 (실측: 같은 플레이의 대기 타이머가 KST 88 · UTC 269 — 누수가 아니라 단명 연출 타이머의 버스트다). 연출이 만드는 순간값을 단언하지 말고 **정지 후 안정 상태**를 재라. CI 는 UTC 이므로 새 관문은 `TZ=UTC npm test` 로 확인할 것.

**실측 기록**: 맨 곡선 등정은 조각 9,000 · 방지권 300 · 영석 20 을 쏟아도 **+12 에서 멈춘다** (v391 풍동의 「영석 없이 도는 없다」의 확장 — 도구를 갖춰도 정점은 멀다). 세이브는 봉인 검 1자루당 약 390바이트로 **무한 성장**한다 (검총 30 · 설욕록 20 · 겁 20 · 전당 3 은 상한이 있는데 계보만 없다; 1,800걸음에 2.7KB → 130KB). 장기 실행에서 DOM 노드·타이머 누수는 없다.

### 봉인 균형 곡선 (참고)

| 검 강화도 | 봉인 보상 (조각) |
|----|----|
| +3 | 21 |
| +5 | 47 |
| +7 | 81 |
| +10 | 144 |
| +15 | 276 |

| 누적 강기 | 다음 시작 |
|----|----|
| 25 | +1 |
| 50 | +2 |
| 100 | +4 |
| 150+ | +6 (cap) |

곡선 조정 시: `sealReward` 지수(1.65)를 올리면 후반 보상 급증 → 후반 사이클 가속. `START_BONUS_DIVISOR`를 줄이면 보너스 누적 빠름 → cap에 빨리 도달. cap(6) 자체를 올리면 도(+15) 대비 시작 비율 변경.

### 조정 다이얼 (자주 손대는 상수)

| 상수 | 위치 | 영향 |
|---|---|---|
| `TABLE[lv]` | 강화 룰 | `success` / `destroy` / `downgrade` / `cost` — 게임 곡선의 척추 |
| `MAX_LEVEL` | `TABLE.length`로 결정 | 도(道)의 위치. 현재 15 |
| `CHALLENGE_BASE_CHANCE = 0.13` | 一閃 | 도전 등장 기본 확률 |
| `CHALLENGE_LEVEL_BONUS = 0.018` | 一閃 | 검 강할수록 끌어들임 (cap 0.45) |
| `CHALLENGE_MIN_LEVEL = 1` | 一閃 | +0 검 보호 |
| `rollChallengeStrength()` | 一閃 (v397) | 그림자 강도 = **현재 강화도** −3 ~ +1 (일반 승률 80%). 앵커를 최고 기록으로 되돌리면 재건 구간 승률이 0이 된다 — 테스트 잠금 |
| `NAMED_FOES[].strength` | 名 (v397) | 불변식 `trigger <= strength <= MAX_LEVEL`. 상한을 넘으면 그 보스는 영영 못 벤다 |
| `FLEE_COST = 3` | 一閃 | 물러남 조각 비용 |
| `SEAL_MIN_LEVEL = 3` | 봉인 | 봉인 가능 최소 강화도 |
| `START_BONUS_CAP = 6` | 봉인 | 시작 보너스 상한 (점수 인플레이션 차단) |
| `START_BONUS_DIVISOR = 25` | 봉인 | 누적 강기 → 시작 단계 변환율 |
| `INSCRIPTIONS[]` | 명문 | 명문 트리거 조건. 효과 갖는 항목은 `sealSword`에서 별도 분기 |
| `protectCost(lv)` | 방지권 | 강화 단계별 방지권 비용 계단 함수 |
| `rescueShards(level)` | 회수 | 파괴된 검에서 회수 가능 조각 (`max(3, floor(lv^2 * 0.7))` — 저레벨 최소 3 하한) |
| `SHADOW_TYPES[]` | 影 변종 | weight·강도Mul·보상Mul·특수 메커니즘 (slayEvade 등) |
| `NEMESIS_TUNING` | 宿敵 (v372) | 재등장 확률(base 0.15/승당 +0.05/cap 0.35)·원한 보상 배율(승당 +0.35/cap 2.5)·설욕 魂·설욕록 cap(20, v377) |
| `FALLEN_TUNING` | 劍塚 (v373) | 무덤 수 상한 (cap 30 — 초과 시 가장 오래된 무덤부터 잊힘, 저장 크기) |
| `REFORGE_TUNING` | 再鍊 (v374) | 재련 비용 (base 60 + 무덤 강화도 × 3 — 새 검 50보다 프리미엄 유지) |
| `SUMMON_TUNING` | 招影 (v375) | 소환 전리품 배율(0.5 — farming 차단)·숙적 응답 bias(+0.35)/cap(0.9). 비용은 `recipes.summon.cost(15)` |
| `OATHS[]` / `OATH_MAX_ATTEMPTS = 3` | 誓約 (v376) | 계율 4종 (효과 필드 금지 — 테스트 잠금) · 맹세 시한 (강화 3회 미만) |
| `SWORD_FORMS{}` | 검의 형 | 형별 successBonus / destroyReduce / costMul / rewardMul / fleeFree |
| `recipes.whetstone.cost = 8` | 砥石 | 다음 강화 +25% 성공 |
| `recipes.spiritstone.cost = 25` | 靈石 | 다음 강화 파괴 차단 |
| `SFX.*` | 響 | 톤 합성 정의 — freq / duration / type / vol / freqEnd |
| `SOUL_AWAKEN = 34` / `SOUL_TRUE = 67` | 魂 | 단계 진입 임계 |
| 강화 +1 / 베기 +6 / 검귀 +10 | 魂 | 액션별 충전량 (`enhance`/`slay`) |
| `SCHOOL_THRESHOLD = 3` | 유파 | 같은 형 봉인 누적 임계 |
| 입자 spawn 간격 900ms / lv≥8 | 視覺 | `setInterval(spawnDust, 900)` |
| 呼吸 임계 8/20/60초 → +2/5/10% | 呼吸 | `breathBonus()` 구간 |
| 久 50회 / 古 100회 | 노쇠 | `INSCRIPTIONS` trigger 임계 |
| 사용자 검명 임계 +5 또는 道 | 命名 | `sealSword()` 내 `askName` 조건 |
| 達人/聖 임계 5/10 道 | 메타 챕터 | `wayReached` 기반 `newSword` 자동 명문 |
| 시작 魂 始祖 10 / 達人 20 / 聖 30 | 메타 보너스 | `newSword` `Math.max` 적용 |

### 세이브 호환 정책

`localStorage['reinforce_sword_v1']`. `load()`는 기본 `state`에 `Object.assign`로 저장값 병합 → 누락 키 자동 채움.

| 변경 종류 | 호환 가능? | 조치 |
|---|---|---|
| 새 키 추가 (예: `state.foo = 0`) | ✅ | 기본 `state` 객체에 추가만. load 시 누락 키는 기본값 |
| 배열/객체 키 추가 | ✅ | `load()` 끝에 `if (!Array.isArray(...)) ... = []` 보정 한 줄 |
| 기존 키 의미 변경 (예: `level` 0~15 → 0~20 재해석) | ❌ | `SAVE_KEY`를 `_v2`로 올릴 것 |
| 기존 키 삭제 후 다른 의미 재사용 | ❌ | 위와 동일 |
| 강화 테이블 어렵게 변경 | ⚠️ | `bestLevel`이 박제됨 — 도전 강도 공식이 깨질 수 있음. 단순 cost 조정은 OK |

## 코드 컨벤션

- **단일 파일 보존** — galaga_clone 스타일. 모듈 분리하지 말 것. 외부 라이브러리 도입 금지.
- **편집 후 JS parse 검증 필수** — 위 `node -e` 스니펫.
- **점수 인플레이션 회피** — 새 시스템 추가 시 점수/통화 차원보다 **시각·오디오·서사** 차원 우선 (글로벌 지침).
- **기존 시스템 융합** — 새 메커닉(아이템/이벤트/보스)은 기존 강화 루프 + 방지권 + 회수 윈도우와 시너지 명시. 외딴 island 금지.
- **세이브 호환** — 위 "세이브 호환 정책" 표 참조. 키 추가는 자유, 의미 변경은 `_v2` 강제.
- **한국어 UI 톤** — 한자 + 한글 미니멀("劍", "강 화 의 도", "검 이 부 서 졌 다"). 영어 단어 자제. 자간(`letter-spacing`)으로 의식적 호흡감.
- **컬렉션 단일 진원** — 봉인 검 + 전당 검 통합 순회는 **`allSealedSwords()` 헬퍼만 사용**. `(sealedSwords||[]).concat(enshrined||[])` 또는 `[].concat(sealedSwords||[], enshrined||[])` 인라인 패턴은 v350-362 클러스터의 'enshrined 누락 버그 군집' 원인이라 integrity 가드가 차단. read-only 순회/필터링 전용.

## 작업 방법론 (글로벌 CLAUDE.md 위임)

사용자가 "의미있는 작업" / "다음 Quantum Leap" 요청 시 → 글로벌 5단계 프레임워크 (Q/A 10회 → Quantum Leap → 10 iteration → 카파시 edge case → Vision Delta) 적용. 본 프로젝트는 단일 HTML 게임이므로 글로벌 지침의 "단일 파일 보존" / "JS parse 검증" 항목이 그대로 1급 제약.

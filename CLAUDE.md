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

**테스트 (`tests/`, node --test):** `harness.js`가 인라인 스크립트에서 순수 함수/상수를 추출(`extractConst`/`loadFunctions`)해 격리 sandbox에서 검증한다 (index.html은 비침투 보존). 게임 곡선·dial·구조 불변식이 ~218 테스트로 잠겨 있으니 **편집 후 `npm test` 필수**. 잠긴 항목 예: TABLE / SHADOW_TYPES / sealReward·sealRewardBase / enhanceCost·successChanceNow·effectiveDestroyChance 분해 완전성 / breathBonus(呼吸)·soulEffects(魂)·RESOLVE(覺悟)·guardianBonus(守)·MASTERY_TIERS(流派)·affinity(形相剋) / escapeHtml(공유데이터 XSS) / 동명 함수 중복 금지 / 레시피·砥 라벨 == 실제값. 새 dial/보너스 추가 시 해당 테스트도 갱신.

진행도 초기화는 게임 내 "초기화" 버튼(`location.reload()` 방식 — v289) 또는 DevTools에서 `localStorage.removeItem('reinforce_sword_v1')`.

## 아키텍처 — 단일 파일 단일 IIFE

전체 게임이 `index.html` 하나에 들어있다. CSS / SVG 검 / JS 모두 인라인. JS는 `(function(){...})()` IIFE로 감싸 전역 오염 없음. 의존성 0, 빌드 0, CDN 0.

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

`level`은 현재 검 강화도(0~MAX). `hasSword=false`는 파괴 후 새 검을 빚기 전 상태 — 강화 버튼 잠기고 조합소만 동작. `sealedSwords`는 자발적으로 봉인한 검의 계보 (검 한 자루의 *생애* 기록). `currentSword`는 현재 검의 일대기 — 봉인 시 `sealedSwords`로 옮겨지고 새 검 시작 시 리셋. `localStorage[SAVE_KEY]`에 매 액션 후 `save()`. `load()`는 `Object.assign`으로 기본값 병합 후 `sealedSwords` / `currentSword.inscriptions` 배열 형변환 보정.

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

`newSword()`는 봉인 후와 조합소 `newsword` 레시피 양쪽에서 호출되는 통합 진입점 — 시작 보너스 일관 적용. `bestLevel`도 여기서 함께 갱신.

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

검 없음 상태에서 봉인된 검 2자루를 선택해 *합체*, 더 강한 검으로 새출발. `FUSION_COST = 60` 조각. `FUSION_PRIORITY` 배열 (道/龍斬/帝斬/.../久 순서)로 두 검의 최우선 명문 비교 → 높은 쪽 명문 + 높은 쪽 형 + 두 영혼 평균 + 높은 강화도로 시작. `fusionPreview()` — 리스트 선택 시 결과 미리 보기 (형/명문/시작 강화/조각 비용). `fuseSwords()` — 높은 인덱스부터 splice 후 `newSword()` → form/inscriptions/soul override. 결과 검은 一생이력 0부터. 검명 모달(`askName`)에서 확정. `fusionSelected = []` 휘발성. UI: `#btn-fusion` 검 없음 && sealedSwords≥2 시 노출. `#fusion-modal` 계보와 유사 리스트 + 선택 2개 강조 + 미리 보기.

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

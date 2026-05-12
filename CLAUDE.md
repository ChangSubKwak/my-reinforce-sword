# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

원작: **검 강화하기 (NBS, vidkidz.tistory.com/5291)** — 클리커/강화 시뮬레이션의 *클로닝 + 증류 (distillation)* 버전.

증류 방향: 광고/꾸미기/펫 등 곁가지 제거, **"다음 한 번만 더" 도박 충동 + 파괴 후 5초 회수 윈도우의 침묵**이라는 본질적 드라마만 응축. 시각은 미니멀 흑금(`#0b0b0d` 배경, `#d4af37` 강조), 한국어 인터페이스.

## 빠른 오리엔테이션

새 인스턴스가 첫 5분 안에 잡을 그림:

- **파일**: `index.html` 1개 (HTML/CSS/JS 인라인, IIFE). v1~v62 누적 약 116KB JS / 178KB total. git 추적 (`main` 브랜치, GitHub remote).
- **루프**: 강화(`enhance`) → 파괴 시 5초 회수(`showVoid`) → 강화 성공 시 그림자(`maybeTriggerChallenge`, 4종 변종) → 베기(`slay`) → 자발 봉인(`sealSword`, 道 검은 컷씬) → 새 검(`newSword`) + 명문(`checkInscriptions`) + 첫 강화 시 검의 形(`decideForm`).
- **결정 차원**: 강화 / 방지권 / 회수 / 베기 / 물러남 / 봉인 / 숫돌(砥) / 영석(靈).
- **상태 진입점**: `let state = {...}` 한 객체. `localStorage['reinforce_sword_v1']`. 음소거는 별도 키 `reinforce_sword_muted`.
- **휘발성 상태**: 모듈 스코프 변수 — `challenge`, `rescueWindow`, `inscribeQueue`, `audioCtx`, `muted`. 새로고침 시 사라짐 (의도) / muted는 별도 보존.
- **렌더 모델**: 매 액션 후 `save()` → `render()` 풀 리렌더. 부분 업데이트 없음.
- **시각 톤**: `--bg #0b0b0d` / `--fg #e8e6dd` / `--accent #d4af37` / `--danger #c0392b` / `--safe #4a7a4a`. 한국어 + 한자 미니멀, 자간으로 호흡.
- **소리**: Web Audio API 톤 합성, 외부 파일 0. 첫 사용자 인터랙션 후 `audioCtx` lazy 시작. M키 음소거.

## 개발 / 실행

빌드 시스템 없음 — 단일 `index.html`.

```bash
# 실행
open index.html

# JS parse 검증 (편집 후 필수)
node -e "
const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);
new Function(m[1]);
console.log('OK', m[1].length, 'bytes');
"
```

진행도 초기화는 게임 내 "초기화" 버튼 또는 DevTools에서 `localStorage.removeItem('reinforce_sword_v1')`.

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

강화 성공 직후 `maybeTriggerChallenge()` 호출. 등장 확률 = `min(0.45, 0.13 + level * 0.018)` — 검이 강할수록 그림자가 끌어들임. `CHALLENGE_MIN_LEVEL=1` (검 +0 보호). `state.hasSword` 필수.

도전은 **휘발성** — `challenge` 모듈 스코프 변수만 사용, `state`에 저장 안 함. 새로고침 시 사라짐 (도망친 셈). 영구 통계 `state.totalSlain`만 보존.

판정: `state.level >= challenge.strength` → 베어냄 (조각·명성 +1, 강도≥8이면 35%로 보너스 방지권). 아니면 검 흔들림 — 방지권 `ceil((strength - level) / 2)`개로 차단 가능, 없으면 `level -= 1`.

UI 흐름: `showChallenge`는 `swordWrap.opacity=0`로 검 stage 숨기고 `#challenge.active`로 오버레이. `slay()` 시작 시 `challenge = null` 즉시 잠금 → 더블클릭 안전. `endChallenge()`는 결과 애니메이션 후 호출 (성공 900ms, 실패 500ms).

가드: `enhance()` 초입에 `if (challenge || rescueWindow) return;` — 동시 활성 차단.

### 렌더 (`render`)

모든 상태 변경 후 `render()` 호출 — 통계 / SVG 검 외형 / 강화 정보 / 방지권 row 전부 재계산. 부분 업데이트 없음, 단순함이 우선.

검 외형은 `state.level`에 따라:
- `blade` 채움색 회색 → 황금 → 발광 (5 구간)
- `swordSvg` class `glow-0/low/mid/high/divine`
- `guardDeco` opacity (+5부터 황금 장식 등장)
- `pommel` 색 (+8부터 황금)

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

검의 천성. 첫 강화 시 4종 중 균일 랜덤 — 봉인까지 유지. 각 형은 미세 편향:

| key | 효과 |
|---|---|
| `直` | `successBonus: 0.03` (강화 성공률 +3%) |
| `曲` | `destroyReduce: 0.03` (파괴 확률 -3%) |
| `重` | `costMul: 1.10`, `rewardMul: 1.20` (강화 비용 +10%, 도전 보상 +20%) |
| `速` | `fleeFree: true` (물러남 무료) |

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

**v55 명문 사전 모달** (`renderCodex`): 14종 명문 전체 — 한자/라벨/조건/시구/상태. 미획득은 opacity 0.35. 상단 진척도 (N/14). 메뉴 진입.

**v56 도전 결정 명료**: 베기 버튼에 보상 텍스트 (`+N 조각`) + challenge-stakes에 검/그림자 강도 막대 비교.

### v57+ 진행 가시화

**v57 道 카운터**: `level-badge`에 `道까지 N` 표시 + 검 아래 `#way-progress` 15 dot (현재까지 황금, MAX_LEVEL=흰 발광).

**v58 그림자 3종 SVG**: 검귀 외 逃影(작은 눈+발), 鋼影(갑옷 5줄), 影(소용돌이) — `#flee-detail`/`#steel-detail`/`#normal-detail` SVG, `showChallenge`에서 type별 toggle.

**v59 봉인 검 정렬**: `legacySort` 모듈 변수 — recent/level-desc/level-asc/inscriptions 4종. 필터 후 정렬 적용. 계보 모달 정렬 버튼.

**v60 강화 성공 큰 파티클**: 강화도별 차등 — 기본 `12+lv*2`, +10~12: 40, +13~14: 60+25 흰, +15(道): 80+50 흰+30 주황 3중 폭발.

**v61 첫 진입 인트로**: `seenHelp=false` 시 도움말 *전*에 `劍 → 始` 페이드 (2.8초) 후 도움말 모달.

**v62 道 도달 stage 황금 빛**: `#stage.way-flash` 5초 keyframe — rgba(255,245,192,0.7) → 점진 약화. 道 도달 시에만 발동.

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
| `rescueShards(level)` | 회수 | 파괴된 검에서 회수 가능 조각 (`floor(lv^2 * 0.7)`) |
| `SHADOW_TYPES[]` | 影 변종 | weight·강도Mul·보상Mul·특수 메커니즘 (slayEvade 등) |
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

## 작업 방법론 (글로벌 CLAUDE.md 위임)

사용자가 "의미있는 작업" / "다음 Quantum Leap" 요청 시 → 글로벌 5단계 프레임워크 (Q/A 10회 → Quantum Leap → 10 iteration → 카파시 edge case → Vision Delta) 적용. 본 프로젝트는 단일 HTML 게임이므로 글로벌 지침의 "단일 파일 보존" / "JS parse 검증" 항목이 그대로 1급 제약.

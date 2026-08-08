# 검 강화 (Sword Enhancement Game)

[![CI](https://github.com/ChangSubKwak/my-reinforce-sword/actions/workflows/ci.yml/badge.svg)](https://github.com/ChangSubKwak/my-reinforce-sword/actions/workflows/ci.yml)

원작 [NBS의 검 강화하기](https://vidkidz.tistory.com/5291)의 **클로닝 + 증류 (distillation)** 버전.

단일 `index.html` (HTML/CSS/JS 인라인). 외부 의존성 0, 빌드 시스템 0. 80+개의 시스템이 누적된 깊이 있는 강화 사이클 게임.

## 핵심 메커니즘

- **강화** — 검을 +0부터 +15(도)까지. 단계가 오를수록 성공률 ↓, 파괴 위험 ↑
- **검 팔기 (봉인)** — +3 이상 검을 팔아 조각 회수. 검의 강기는 다음 검에 흐름
- **회수 윈도우** — 검 파괴 시 기본 5초 안에 결정: 줍기 · 도박(2배 or 0) · 놓아주기(방하)
- **길의 끝** — 검을 잃고 새 검·융검·재련 어느 길도 닿지 않으면 여정 종료 (조각·도구 초기화, 기록은 영구 보존)
- **도전 (그림자)** — 강화 성공 후 그림자 등장 (4종 + 밤의 야차 + 나를 이긴 숙적). 베거나, 양보(대치)하거나, 도망
- **명문 시스템** — 30여 종 한글 명문 (도, 귀참, 본, 용참 등) 자동 새겨짐
- **검의 형 (4종)** — 첫 강화 시 결정 (직/곡/중/속). 미세 능력 차이
- **유파 (4종)** — 같은 형 3자루 봉인 시 등극, 영구 보너스
- **수호자** — 봉인된 도 검 1자루 동행, 형별 패시브
- **계절·노쇠** — 누적 강화 따른 계절 변화 + 구/고 검 효과
- **기록의 전당** — 검총(부러진 검의 무덤과 만가) · 설욕록 · 겁의 연대기 · 운의 원장(천칭)
- **족자 내보내기** — 검 한 자루의 일생(검전) / 대장장이의 일대기(검사전)를 SVG 족자로

> **간결 모드가 기본입니다** — 처음 화면엔 본질(강화·팔기·회수·도전)만 보입니다.
> 설정 → 「간결 모드」를 끄면 각오·숫돌·결계·서약·수련 등 깊은 선택지와 전체 메뉴가 열립니다.

> **설치·오프라인 (PWA)** — 브라우저 메뉴의 「홈 화면에 추가/앱 설치」로 설치하면
> 네트워크 없이도 플레이할 수 있습니다 (저장은 원래 기기 안 localStorage).

## 실행

### 로컬

```bash
npm install
npm start
# http://localhost:3000
```

또는 단순히 `index.html`을 브라우저에서 직접 열어도 작동 (정적 파일).

### 검증 (기여 시)

```bash
npm run lint:parse   # 인라인 JS 구문 검증
npm test             # 회귀 테스트 (게임 곡선·dial·구조 불변식 + 풍동 시뮬레이터, 의존성 0)
```

push/PR마다 GitHub Actions CI가 Node 20/22/24 매트릭스에서 위 두 검증을 강제한다.

### Render 배포

이 저장소에 `render.yaml` 포함 — Render에서 **New Blueprint**로 즉시 배포 가능.

수동 설정 시:
- **Type**: Web Service
- **Runtime**: Node
- **Build Command**: `npm ci`  <!-- render.yaml과 일치 (커밋된 lockfile 결정적 설치) -->
- **Start Command**: `npm start`
- **Plan**: Free (무료 플랜 충분)

## 기술

- **Frontend**: Vanilla JS, 인라인 SVG, Web Audio API
- **Backend**: Express (정적 서빙 only)
- **저장**: localStorage (브라우저)
- **호스팅**: Render Web Service

## 키보드 단축키

| 키 | 액션 |
|---|---|
| `␣ Space` / `Enter` | 강화 / 베기 / 줍기 (게임 오버 화면에선 Enter = 다시 시작) |
| `Esc` | 열린 창 닫기 · (창 없을 때) 도전에서 도망 |
| `P` | 보호권 토글 |
| `M` | 소리 끄기/켜기 |

창은 배경(어두운 곳) 클릭으로도 닫힌다.

## 문서

- `CLAUDE.md` — 코드 구조, 시스템 80+개 설명, 작업 가이드

## 라이센스

MIT

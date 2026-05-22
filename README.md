# 검 강화 (Sword Enhancement Game)

원작 [NBS의 검 강화하기](https://vidkidz.tistory.com/5291)의 **클로닝 + 증류 (distillation)** 버전.

단일 `index.html` (HTML/CSS/JS 인라인). 외부 의존성 0, 빌드 시스템 0. 80+개의 시스템이 누적된 깊이 있는 강화 사이클 게임.

## 핵심 메커니즘

- **강화** — 검을 +0부터 +15(道)까지. 단계가 오를수록 성공률 ↓, 파괴 위험 ↑
- **검 팔기 (봉인)** — +3 이상 검을 팔아 조각 회수. 검의 강기는 다음 검에 흐름
- **회수 윈도우** — 검 파괴 시 5초 안에 조각 줍기
- **도전 (그림자)** — 강화 성공 후 4종 그림자 등장. 베어내거나 도망
- **명문 시스템** — 30여 종 한자 명문 (道, 鬼斬, 本, 龍斬 등) 자동 새겨짐
- **검의 형 (4종)** — 첫 강화 시 결정 (直/曲/重/速). 미세 능력 차이
- **유파 (4종)** — 같은 형 3자루 봉인 시 등극, 영구 보너스
- **수호자 (守)** — 봉인된 道 검 1자루 동행, 형별 패시브
- **계절·노쇠** — 누적 강화 따른 계절 변화 + 久/古 검 효과
- **자동 강화 (修練)** — 위험 단계 직전까지 자동
- **백업/복원** — JSON export/import (메뉴)
- **검 SVG 다운로드** — 현재 검을 SVG 파일로 저장

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
npm test             # 회귀 테스트 (게임 곡선·dial·구조 불변식, 의존성 0)
```

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
| `␣ Space` | 강화 / 베기 / 줍기 |
| `Esc` | 열린 창 닫기 · (창 없을 때) 도전에서 도망 |
| `P` | 보호권 토글 |
| `M` | 소리 끄기/켜기 |

창은 배경(어두운 곳) 클릭으로도 닫힌다.

## 문서

- `CLAUDE.md` — 코드 구조, 시스템 80+개 설명, 작업 가이드

## 라이센스

MIT

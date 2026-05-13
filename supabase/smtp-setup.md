# Supabase 외부 SMTP 연동 가이드 (rate limit 해결)

## 문제

Supabase 무료 플랜의 **built-in 이메일 SMTP는 시간당 3~4개**만 발송 가능. 사용자가 짧은 시간에 여러 번 로그인 시도하면 `email rate limit exceeded (code: 429)` 에러.

## 해결: 외부 SMTP 서비스 연동

외부 SMTP 사용 시 발송 한도가 훨씬 높아집니다 (대부분 일 100~300개 무료).

## 추천 SMTP 서비스 (무료 플랜)

| 서비스 | 무료 한도 | 한국어 지원 | 추천 |
|---|---|---|---|
| **Brevo** (Sendinblue) | 일 **300개** | ✅ | ⭐ 가장 추천 |
| **SendGrid** | 일 **100개** | ✅ | 글로벌 표준 |
| **AWS SES** | 월 **62,000개** (AWS 가입 시) | ✅ | 가장 저렴 |
| **Resend** | 일 **100개** | ✅ | 개발자 친화 |
| **Mailgun** | 일 **100개** (3개월 한정) | ✅ | 단순 |

가장 추천: **Brevo** — 일 300개 무료 + 한국어 + 카드 등록 불필요.

---

## Brevo 설정 (15분)

### 1. Brevo 가입

https://www.brevo.com → 무료 가입 (이메일만)

### 2. Sender 등록

- 좌측 메뉴 → **Senders, Domains & Dedicated IPs** → **Senders** 탭
- **Add a sender** 클릭
- From email: 본인 이메일 (예: `chang@gmail.com`)
- From name: `검 강화` 또는 원하는 이름
- 등록 후 이메일 확인 링크 클릭 → 인증

### 3. SMTP 키 발급

- 좌측 메뉴 → **SMTP & API** 탭
- **SMTP** 섹션의 정보 복사:
  - **SMTP Server**: `smtp-relay.brevo.com`
  - **Port**: `587`
  - **Login**: `xxx@smtp-brevo.com` (자동 생성된 username)
  - **SMTP key**: **Generate a new SMTP key** 버튼 → 새 키 생성 → 복사 (한 번만 보임)

### 4. Supabase에 SMTP 설정

https://supabase.com/dashboard/project/ouxohdlfzxsqniizxman 진입:

1. 좌측 **Settings** → **Authentication** (또는 **Authentication** → **Email Settings**)
2. **SMTP Provider** 섹션에서 **Enable Custom SMTP** 토글 **ON**
3. 입력:
   - **Sender email**: 위에서 인증한 sender 이메일 (예: `chang@gmail.com`)
   - **Sender name**: `검 강화`
   - **Host**: `smtp-relay.brevo.com`
   - **Port**: `587`
   - **Username**: Brevo에서 받은 username (`xxx@smtp-brevo.com`)
   - **Password**: Brevo에서 받은 SMTP key
   - **Minimum interval**: `60` (초, 기본값)
4. **Save** 클릭

### 5. 검증

- 게임에서 로그아웃 후 다시 로그인 시도
- 이메일 발송 — Brevo에서 통계 확인 가능
- 한도가 시간당 3~4 → 일 300개로 확장 (사실상 무제한)

---

## SendGrid 설정 (대안)

### 1. SendGrid 가입

https://sendgrid.com → 무료 가입

### 2. Sender Authentication

- **Settings** → **Sender Authentication** → **Single Sender Verification**
- 본인 이메일 등록 → 인증

### 3. API Key 발급

- **Settings** → **API Keys** → **Create API Key**
- Permission: **Full Access** 또는 **Restricted Access** (Mail Send만)
- 키 복사

### 4. Supabase 설정

- **Host**: `smtp.sendgrid.net`
- **Port**: `587`
- **Username**: `apikey` (문자 그대로)
- **Password**: 위에서 받은 API Key

---

## AWS SES 설정 (대량 사용 시 가장 저렴)

가입 후 24~48시간 sandbox 모드 → 인증 이메일만 발송 가능. **Production access** 요청 후 실제 사용.

- **Host**: `email-smtp.{region}.amazonaws.com` (예: `email-smtp.ap-northeast-2.amazonaws.com` = 서울)
- **Port**: `587`
- **Username/Password**: IAM 사용자 SMTP credentials

---

## 외부 SMTP 없이 임시 우회

위 설정 전까지:

1. **익명 게스트 가입** — 게임 내 "👤 익명 게스트로 시작" 버튼
2. **다른 이메일로 시도** — Gmail, 회사 이메일 등 분산
3. **1시간 대기** — Supabase 무료 SMTP rate limit 리셋

---

## 참고

- Supabase 무료 SMTP는 *개발용*. 프로덕션 환경에는 항상 외부 SMTP 권장.
- 외부 SMTP 사용 시 *Supabase rate limit 안 받음* (외부 서비스의 한도만 적용).
- 이메일 템플릿(`{{ .Token }}`)은 외부 SMTP 사용해도 그대로 작동.

# Supabase 이메일 템플릿 설정 (6자리 코드만 표시)

## 문제

Supabase 기본 이메일 템플릿은 **매직 링크만** 포함합니다. 6자리 OTP 코드는 본문에 없어, 사용자가 디바이스 간 로그인 (예: PC에서 게임 + 핸드폰에서 메일) 시 코드를 모릅니다.

## 해결

이메일 템플릿에서 매직 링크(`{{ .ConfirmationURL }}`)를 제거하고 6자리 코드(`{{ .Token }}`)만 표시합니다.

## 적용 절차

1. https://supabase.com/dashboard/project/ouxohdlfzxsqniizxman 진입
2. 좌측 **Authentication** → **Email Templates**
3. **Magic Link** 템플릿 선택 (또는 **Confirm signup** — 두 템플릿 모두 적용 권장)
4. **Subject heading** (제목):
   ```
   검 강화 — 로그인 코드
   ```
5. **Message body (HTML)** 전체를 아래 내용으로 교체:

```html
<div style="font-family: 'Noto Serif KR', serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #1f1a14; color: #f0ece0; text-align: center;">
  <h1 style="color: #e8c454; letter-spacing: 8px; font-size: 22px; margin-bottom: 24px;">검 강 화</h1>
  <p style="color: #968d80; font-size: 14px; letter-spacing: 2px; margin-bottom: 16px;">
    로그인하려면 아래 6자리 코드를 입력하세요.
  </p>
  <div style="background: #2a221b; border: 1px solid #e8c454; padding: 24px; margin: 24px 0; border-radius: 4px;">
    <span style="color: #f0ece0; font-size: 36px; letter-spacing: 12px; font-weight: 700;">{{ .Token }}</span>
  </div>
  <p style="color: #968d80; font-size: 11px; letter-spacing: 1px;">
    이 코드는 약 1시간 후 만료됩니다.<br>
    본인이 요청하지 않았다면 이 메일을 무시하세요.
  </p>
</div>
```

6. 우측 **Save changes** 버튼 클릭

## 확인

다음 로그인 시 이메일을 받으면 큰 황금 박스 안에 **6자리 코드** 만 보입니다. 매직 링크는 더 이상 표시되지 않습니다.

## 두 템플릿 모두 적용 권장

같은 HTML을 다음 두 곳에 적용:
- **Magic Link** 템플릿 (기존 사용자 로그인 시)
- **Confirm signup** 템플릿 (신규 사용자 가입 시)

이렇게 하면 가입과 로그인 모두 동일한 UX.

## 매직 링크 자체를 완전 차단하려면

이메일에서 링크를 *제거*해도, Supabase는 여전히 매직 링크 URL을 *생성*해 사용자가 알면 사용 가능. 완전 차단하려면:

1. **Authentication** → **URL Configuration**
2. **Site URL** 을 게임 URL과 *다른* 값으로 설정 (예: `https://example.com`)
3. 매직 링크 클릭 시 다른 사이트로 리다이렉트 → 인증 실패

또는 그냥 이메일에서 링크를 제거하는 것만으로도 *현실적으로* 충분.

## 변수 참고

Supabase 이메일 템플릿 사용 가능 변수:
- `{{ .Token }}` — 6자리 OTP 코드 (이걸 사용)
- `{{ .ConfirmationURL }}` — 매직 링크 URL (제거)
- `{{ .Email }}` — 사용자 이메일
- `{{ .SiteURL }}` — 사이트 URL

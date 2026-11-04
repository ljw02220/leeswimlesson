# 휴대폰 푸시 알림 설정

코드 배포만으로는 비밀키와 Supabase 서버 함수가 자동 생성되지 않습니다. 아래 작업은 최초 한 번만 하면 됩니다.

## 1. 데이터베이스 준비

Supabase SQL Editor에서 `supabase-web-push-migration.sql` 전체를 실행합니다.

## 2. VAPID 키 만들기

로컬 터미널에서 다음 명령을 실행합니다.

```bash
npx web-push generate-vapid-keys
```

출력된 Public Key와 Private Key를 따로 보관합니다. Private Key는 GitHub, 프론트엔드 파일, SQL 파일에 넣지 않습니다.

## 3. Edge Function 배포

Supabase CLI로 프로젝트를 연결한 뒤 함수를 배포합니다.

```bash
npx supabase login
npx supabase link --project-ref icfcwcqzbjqxkrgqyfha
npx supabase functions deploy web-push --no-verify-jwt
```

## 4. 서버 비밀값 등록

임의의 긴 문자열을 `PUSH_WEBHOOK_SECRET`으로 정한 다음 등록합니다.

```bash
npx supabase secrets set \
  VAPID_PUBLIC_KEY="발급받은 Public Key" \
  VAPID_PRIVATE_KEY="발급받은 Private Key" \
  VAPID_SUBJECT="mailto:ljw022072@gmail.com" \
  PUSH_WEBHOOK_SECRET="임의의 긴 비밀 문자열"
```

## 5. Database Webhook 연결

Supabase Dashboard의 Database Webhooks에서 다음 Webhook을 만듭니다.

- Table: `public.push_notification_events`
- Events: `INSERT`
- Type: Supabase Edge Functions
- Edge Function: `web-push`
- HTTP Header: `x-webhook-secret` = 4단계의 `PUSH_WEBHOOK_SECRET`

## 6. 휴대폰에서 켜기

- Android: 로그인 후 알림 버튼에서 `휴대폰 알림`을 켭니다.
- iPhone: Safari 공유 버튼에서 `홈 화면에 추가`하고, 홈 화면의 수영관리 아이콘으로 연 뒤 알림을 켭니다.

기기마다 한 번씩 켜야 합니다. 브라우저 알림 권한을 차단했다면 휴대폰 설정에서 해당 사이트의 알림 권한을 다시 허용해야 합니다.

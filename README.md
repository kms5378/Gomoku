# 오목 대전

방 코드를 공유해 실시간으로 오목을 둘 수 있는 Next.js + Supabase 앱입니다.

## 주요 기능

- 15x15 기본 오목, 5개 이상 연속이면 승리
- Supabase Anonymous Auth 기반 게스트 닉네임
- 방 코드 생성, 코드 입장, 2인 실시간 대전
- 같은 방에서 승패 결정 후 양쪽 재시작 요청으로 새 게임 시작
- 승 +3, 무 +1, 패 +0 누적 승점
- 서버 RPC에서 턴, 중복 착수, 범위, 종료 상태, 참가자 여부 검증
- 승인된 착수 후 Web Audio API 효과음 재생

## 로컬 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`에는 Supabase 프로젝트의 공개 값을 넣습니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

## Supabase 설정

1. Supabase 프로젝트에서 Authentication > Providers > Anonymous Sign-ins를 활성화합니다.
2. SQL editor 또는 Supabase CLI로 `supabase/migrations/202605160001_init_gomoku.sql`을 적용합니다.
3. Realtime은 migration에서 `rooms`, `moves`, `profiles` 테이블을 publication에 추가합니다.

Supabase CLI를 쓴다면:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

## Vercel 배포

Vercel 프로젝트를 만들고 아래 환경 변수를 Production/Preview/Development에 등록합니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

CLI를 쓴다면:

```bash
npm i -g vercel
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel --prod
```

## GitHub 연결

```bash
git init
git branch -M main
git remote add origin https://github.com/kms5378/Gomoku.git
git add .
git commit -m "feat: build realtime gomoku battle"
git push -u origin main
```

## 테스트

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

`npm run test:e2e`는 Supabase 환경 변수가 없으면 설정 안내 상태를 검증합니다. 실제 2인 대전 E2E는 Supabase 프로젝트와 환경 변수를 연결한 뒤 실행하세요.

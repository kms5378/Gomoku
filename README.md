# 오목 대전

방 코드를 공유해 실시간으로 오목을 둘 수 있는 Next.js + EC2 WebSocket 앱입니다.

## 구조

- 프론트엔드: Next.js App Router, Vercel 정적/서버리스 배포
- 실시간 서버: Node.js WebSocket 서버, EC2 systemd 서비스
- 저장소: SQLite
- 외부 기본 URL: `https://54.180.79.43.nip.io/gomoku`
- WebSocket 기본 URL: `wss://54.180.79.43.nip.io/gomoku/ws`

## 주요 기능

- 15x15 오목, 5개 이상 연속이면 승리
- 방 코드 생성, 코드 입장, 2인 실시간 대전
- 흑/백 자리 선택
- 흑 3x3, 4x4 금수 표시 및 서버 검증
- 같은 방에서 승패 결정 후 양쪽 재시작 요청으로 새 게임 시작
- 승 +3, 무 +1, 패 +0 누적 승점과 랭킹
- 게임 중 연결이 끊긴 플레이어 15초 후 패배 처리
- 서버가 승인한 착수 broadcast 이후 효과음 재생

## 로컬 프론트 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`은 기본 EC2 서버를 그대로 쓰면 생략할 수 있습니다.

```bash
NEXT_PUBLIC_GOMOKU_SERVER_URL=https://54.180.79.43.nip.io/gomoku
NEXT_PUBLIC_GOMOKU_WS_URL=wss://54.180.79.43.nip.io/gomoku/ws
```

## 로컬 실시간 서버 실행

Node.js `node:sqlite`를 사용하므로 Node 22.5 이상이 필요합니다.

```bash
npm install --prefix server
GOMOKU_DB_PATH=/tmp/gomoku.sqlite PORT=4174 npm --prefix server start
```

프론트를 로컬 서버에 붙이려면:

```bash
NEXT_PUBLIC_GOMOKU_SERVER_URL=http://127.0.0.1:4174
NEXT_PUBLIC_GOMOKU_WS_URL=ws://127.0.0.1:4174/ws
```

## EC2 배포

오목 서버는 기존 `poket-volley`와 섞지 않고 별도 서비스로 배포합니다.

권장 경로:

- 앱: `/opt/gomoku`
- DB: `/var/lib/gomoku/gomoku.sqlite`
- 내부 포트: `127.0.0.1:4174`
- systemd: `gomoku.service`
- Caddy path: `/gomoku/*`

예시 Caddy 설정:

```caddyfile
54.180.79.43.nip.io {
  reverse_proxy /ws 127.0.0.1:4173
  reverse_proxy /gomoku/ws 127.0.0.1:4174
  reverse_proxy /gomoku/api/* 127.0.0.1:4174
  reverse_proxy /gomoku/healthz 127.0.0.1:4174
}
```

예시 systemd:

```ini
[Unit]
Description=Gomoku realtime server
After=network.target

[Service]
WorkingDirectory=/opt/gomoku/server
Environment=HOST=127.0.0.1
Environment=PORT=4174
Environment=GOMOKU_DB_PATH=/var/lib/gomoku/gomoku.sqlite
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3
User=ubuntu

[Install]
WantedBy=multi-user.target
```

## Vercel 배포

Vercel 환경 변수는 기본 EC2 URL을 쓸 경우 없어도 동작합니다. 명시하려면 아래를 등록합니다.

- `NEXT_PUBLIC_GOMOKU_SERVER_URL=https://54.180.79.43.nip.io/gomoku`
- `NEXT_PUBLIC_GOMOKU_WS_URL=wss://54.180.79.43.nip.io/gomoku/ws`

```bash
vercel --prod
```

## 테스트

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

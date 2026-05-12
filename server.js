// 검 강화 게임 — Express 정적 서버
// Render Web Service 호환. 단일 index.html을 모든 경로에 서빙.

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 보안 헤더 (기본)
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Web Audio + localStorage 사용 — same-origin 정책 충분
  next();
});

// 정적 파일 (index.html, CLAUDE.md 등 루트 파일)
app.use(express.static(path.join(__dirname), {
  index: 'index.html',
  maxAge: '5m',
  setHeaders: (res, filePath) => {
    // index.html은 캐시 안 함 — 항상 최신 버전
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// SPA 폴백 — 어떤 경로든 index.html 반환
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log('[검 강화] 서버가 포트 ' + PORT + '에서 실행 중');
});

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

// v332 — 단일 파일 게임: 모든 경로에 index.html만 서빙.
// (이전엔 express.static(__dirname)으로 루트 전체를 공개 → CLAUDE.md[숨은 메커니즘·확률
//  전부]·server.js·supabase/schema.sql·tests/·package.json 이 노출됐다. 게임은 인라인
//  단일 index.html이고 Supabase는 외부 CDN·파비콘은 data-URI라 다른 로컬 자산이 없으므로
//  소스/문서/스키마 노출을 막기 위해 index.html만 서빙한다.)
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log('[검 강화] 서버가 포트 ' + PORT + '에서 실행 중');
});

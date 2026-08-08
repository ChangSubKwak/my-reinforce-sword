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
  // v334 — 클릭재킹 방지(게임은 iframe 임베드 불필요) + 미사용 강력 API 비활성
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  // Web Audio + localStorage 사용 — same-origin 정책 충분
  next();
});

// v395 常在 — PWA (설치형 + 오프라인). 게임은 100% 클라이언트 사이드(localStorage)라
// 오프라인 플레이가 본성에 맞다. v332의 "지정 파일 외 비노출" 원칙을 지키기 위해
// SW/manifest/아이콘을 저장소 파일이 아닌 인라인 문자열 라우트로 제공한다.
// SW 전략: network-first — 온라인 동작은 기존과 완전 동일(304 재검증 포함), 오프라인일 때만
// 마지막 성공 응답을 폴백. 낡은 버전에 갇히는 클래식 SW 사고가 구조적으로 불가능.
const SW_JS = [
  "const CACHE = 'sword-v1';",
  "self.addEventListener('install', () => { self.skipWaiting(); });",
  "self.addEventListener('activate', (e) => {",
  "  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));",
  "});",
  "self.addEventListener('fetch', (e) => {",
  "  const req = e.request;",
  "  if (req.method !== 'GET') return;",
  "  if (new URL(req.url).origin !== self.location.origin) return;  // CDN(서체/Supabase)은 관여하지 않음",
  "  e.respondWith(",
  "    fetch(req).then((res) => {",
  "      if (res && res.ok && req.mode === 'navigate') {",
  "        const copy = res.clone();",
  "        caches.open(CACHE).then((c) => c.put('/', copy));",
  "      }",
  "      return res;",
  "    }).catch(() => caches.match('/'))",
  "  );",
  "});",
].join('\n');

const MANIFEST = JSON.stringify({
  name: '검 강화 — 강화의 도',
  short_name: '검 강화',
  description: '다음 한 번만 더 — 미니멀 강화 시뮬레이션',
  start_url: '/',
  display: 'standalone',
  background_color: '#1f1a14',
  theme_color: '#1f1a14',
  icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
});

const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">' +
  '<rect width="128" height="128" rx="20" fill="#1f1a14"/>' +
  '<text x="64" y="92" font-size="84" text-anchor="middle" fill="#e8c454" font-family="serif">劍</text></svg>';

app.get('/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'text/javascript; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-cache');  // SW 갱신은 배포 즉시 전파
  res.send(SW_JS);
});
app.get('/manifest.webmanifest', (_req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(MANIFEST);
});
app.get('/icon.svg', (_req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml; charset=UTF-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(ICON_SVG);
});

// v332 — 단일 파일 게임: 모든 경로에 index.html만 서빙.
// (이전엔 express.static(__dirname)으로 루트 전체를 공개 → CLAUDE.md[숨은 메커니즘·확률
//  전부]·server.js·supabase/schema.sql·tests/·package.json 이 노출됐다. 게임은 인라인
//  단일 index.html이고 Supabase는 외부 CDN·파비콘은 data-URI라 다른 로컬 자산이 없으므로
//  소스/문서/스키마 노출을 막기 위해 index.html만 서빙한다.)
app.get('*', (_req, res) => {
  // v394 — 기존의 저장-금지 지시어가 sendFile의 ETag/Last-Modified 조건부 재검증(304)까지
  // 차단해 재방문마다 전량(엣지 br 기준 ~288KB) 재전송되던 결함. no-cache는 "캐시하되 매 방문
  // 재검증" — 미변경이면 304 ~0바이트, 갱신 배포 시 즉시 전파 (기존 신선도 보장 동일).
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log('[검 강화] 서버가 포트 ' + PORT + '에서 실행 중');
});

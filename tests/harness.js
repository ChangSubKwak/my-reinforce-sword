'use strict';
// 테스트 하니스 — index.html의 인라인 스크립트에서 순수 함수 소스를 추출해
// 격리된 샌드박스에서 평가한다. index.html은 단일 파일로 보존 (테스트 비침투).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML_PATH = path.join(__dirname, '..', 'index.html');

function readScript() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('인라인 <script> 블록을 찾을 수 없음');
  return m[1];
}

// 이름으로 함수 소스 텍스트 추출 (function NAME(...) { ... } — 균형 잡힌 중괄호)
function extractFunction(src, name) {
  const startRe = new RegExp('function\\s+' + name + '\\s*\\(');
  const startMatch = startRe.exec(src);
  if (!startMatch) throw new Error('함수 ' + name + ' 를 찾을 수 없음');
  let i = src.indexOf('{', startMatch.index);
  if (i < 0) throw new Error(name + ': 본문 시작 { 없음');
  let depth = 0, end = -1;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  if (end < 0) throw new Error(name + ': 본문 끝 } 없음');
  return src.slice(startMatch.index, end + 1);
}

// const NAME = <배열/객체 리터럴>; 을 추출해 eval (순수 데이터 상수 — TABLE/SHADOW_TYPES 등).
// 주석(// ...) 제거 후 평가. 첫 ';' 까지 lazy 매칭 (데이터 리터럴엔 내부 ';' 없음).
function extractConst(name) {
  const src = readScript();
  const m = src.match(new RegExp('const ' + name + '\\s*=\\s*([\\s\\S]*?);'));
  if (!m) throw new Error('상수 ' + name + ' 를 찾을 수 없음');
  // 괄호로 감싸 객체 리터럴 {...}도 블록이 아닌 표현식으로 평가 (배열 [...]도 안전)
  return eval('(' + m[1].replace(/\/\/[^\n]*/g, '') + ')');
}

// 지정한 함수들을 추출해, 주어진 의존성(sandbox 전역)과 함께 평가하고 함수 핸들 반환
function loadFunctions(names, deps) {
  const src = readScript();
  const bodies = names.map(n => extractFunction(src, n)).join('\n');
  const sandbox = Object.assign({
    Math, Date, JSON, Object, Array, String, Number, Boolean,
    isNaN, parseInt, parseFloat, btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    encodeURIComponent, decodeURIComponent,
  }, deps || {});
  // 함수들을 sandbox 스코프에 정의하고 export
  const exportObj = '({' + names.map(n => n + ':' + n).join(',') + '})';
  const code = bodies + '\n' + exportObj;
  vm.createContext(sandbox);
  return vm.runInContext(code, sandbox, { filename: 'extracted-functions.js' });
}

module.exports = { readScript, extractFunction, extractConst, loadFunctions, HTML_PATH };

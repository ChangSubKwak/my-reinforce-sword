'use strict';
// 헤드리스 실행 환경 셰임 (의존성 0) — v400 實戰
//
// 목적: index.html의 게임 IIFE를 **통째로** Node vm에서 부팅해 실제로 플레이한다.
// 기존 하니스(harness.js)는 함수 하나를 잘라 격리 평가하지만, 부품을 조립했을 때만
// 드러나는 결함(렌더 예외 / 모달 교착 / 타이머 누수 / 상태 붕괴)은 그 방식으로 볼 수 없다.
//
// 구성:
//   - 실제 마크업을 파싱한 최소 DOM 트리 (id 색인 · 클래스 · data-* · 부모자식 · 이벤트 버블링)
//   - 가상 시계 (setTimeout/setInterval/rAF/Date/performance/AudioContext.currentTime 전부 동일 시각축)
//   - 시드 고정 난수 (mulberry32 — simulation.test.js와 같은 규율)
// 따라서 실행이 완전히 결정적이다.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML_PATH = path.join(__dirname, '..', 'index.html');

// ---------------------------------------------------------------- 난수 (시드 고정)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- 가상 시계
class Clock {
  constructor(start) {
    this.now = start;
    this.seq = 1;
    this.timers = new Map();   // id -> {at, fn, args, interval}
    this.fired = 0;
  }
  set(fn, delay, args, interval) {
    const id = this.seq++;
    this.timers.set(id, { at: this.now + Math.max(0, delay || 0), fn, args: args || [], interval });
    return id;
  }
  clear(id) { this.timers.delete(id); }
  pending() { return this.timers.size; }
  // ms 만큼 시간을 진행시키며 만기 타이머를 순서대로 실행. onError 로 예외 수집.
  advance(ms, onError) {
    const target = this.now + ms;
    let guard = 0;
    for (;;) {
      let nextId = -1, nextAt = Infinity;
      for (const [id, t] of this.timers) {
        if (t.at < nextAt || (t.at === nextAt && id < nextId)) { nextAt = t.at; nextId = id; }
      }
      if (nextId < 0 || nextAt > target) break;
      if (++guard > 200000) throw new Error('가상 시계: 타이머 폭주 (200k회 초과)');
      const t = this.timers.get(nextId);
      this.now = nextAt;
      if (t.interval) t.at = nextAt + Math.max(1, t.interval);
      else this.timers.delete(nextId);
      this.fired++;
      try { t.fn.apply(null, t.args); }
      catch (e) { if (onError) onError(e, 'timer'); else throw e; }
    }
    this.now = target;
  }
}

// ---------------------------------------------------------------- HTML 파서 (태그 스캐너)
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TAGS = new Set(['script', 'style']);

function parseAttrs(s) {
  const attrs = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(s))) {
    const name = m[1];
    let val = '';
    if (m[2] !== undefined) val = m[4] !== undefined ? m[4] : (m[5] !== undefined ? m[5] : (m[6] || ''));
    attrs.push([name, val]);
  }
  return attrs;
}

// src 를 파싱해 parent 아래에 자식 노드를 채운다.
function parseInto(src, parent, doc) {
  const stack = [parent];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      const text = src.slice(i);
      if (text.trim()) stack[stack.length - 1].appendChild(doc.createTextNode(text));
      break;
    }
    if (lt > i) {
      const text = src.slice(i, lt);
      if (text.trim()) stack[stack.length - 1].appendChild(doc.createTextNode(text));
    }
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt);
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith('<!', lt)) {
      const end = src.indexOf('>', lt);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    const gt = src.indexOf('>', lt);
    if (gt < 0) break;
    const inner = src.slice(lt + 1, gt);
    if (inner[0] === '/') {
      const name = inner.slice(1).trim().toLowerCase();
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tagName.toLowerCase() === name) { stack.length = k; break; }
      }
      i = gt + 1;
      continue;
    }
    const selfClose = inner.endsWith('/');
    const body = selfClose ? inner.slice(0, -1) : inner;
    const sp = body.search(/[\s/]/);
    const tag = (sp < 0 ? body : body.slice(0, sp)).toLowerCase();
    const attrSrc = sp < 0 ? '' : body.slice(sp);
    const el = doc.createElement(tag);
    for (const [n, v] of parseAttrs(attrSrc)) el.setAttribute(n, v);
    stack[stack.length - 1].appendChild(el);
    i = gt + 1;
    if (RAW_TAGS.has(tag)) {
      const closeIdx = src.toLowerCase().indexOf('</' + tag, i);
      const raw = closeIdx < 0 ? src.slice(i) : src.slice(i, closeIdx);
      el.appendChild(doc.createTextNode(raw));
      i = closeIdx < 0 ? src.length : src.indexOf('>', closeIdx) + 1;
      continue;
    }
    if (!selfClose && !VOID_TAGS.has(tag)) stack.push(el);
  }
}

// ---------------------------------------------------------------- 선택자 (게임이 쓰는 범위 한정)
// 지원: 콤마 목록 / 자손 결합자(공백) / #id / .class(다중) / tag / [attr] / [attr="v"]
function parseCompound(text) {
  const c = { tag: null, id: null, classes: [], attrs: [] };
  const re = /([#.]?[-\w]+)|(\[[^\]]+\])/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[2]) {
      const inside = m[2].slice(1, -1);
      const eq = inside.indexOf('=');
      if (eq < 0) c.attrs.push([inside.trim(), null]);
      else c.attrs.push([inside.slice(0, eq).trim(), inside.slice(eq + 1).trim().replace(/^["']|["']$/g, '')]);
    } else {
      const t = m[1];
      if (t[0] === '#') c.id = t.slice(1);
      else if (t[0] === '.') c.classes.push(t.slice(1));
      else c.tag = t.toLowerCase();
    }
  }
  return c;
}
function parseSelector(sel) {
  return String(sel).split(',').map(part =>
    part.trim().split(/\s+/).filter(Boolean).map(parseCompound)
  ).filter(seq => seq.length);
}
function matchCompound(el, c) {
  if (el.nodeType !== 1) return false;
  if (c.tag && el.tagName.toLowerCase() !== c.tag) return false;
  if (c.id && el.getAttribute('id') !== c.id) return false;
  for (const cl of c.classes) if (!el.classList.contains(cl)) return false;
  for (const [n, v] of c.attrs) {
    if (!el.hasAttribute(n)) return false;
    if (v !== null && el.getAttribute(n) !== v) return false;
  }
  return true;
}
function matchSeq(el, seq) {
  if (!matchCompound(el, seq[seq.length - 1])) return false;
  let idx = seq.length - 2, node = el.parentNode;
  while (idx >= 0 && node) {
    if (node.nodeType === 1 && matchCompound(node, seq[idx])) idx--;
    node = node.parentNode;
  }
  return idx < 0;
}

// ---------------------------------------------------------------- 노드
let NODE_SEQ = 0;

class MiniNode {
  constructor(doc, nodeType) {
    this.ownerDocument = doc;
    this.nodeType = nodeType;
    this.parentNode = null;
    this.childNodes = [];
    this._uid = ++NODE_SEQ;
  }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const s = this.parentNode.childNodes;
    return s[s.indexOf(this) + 1] || null;
  }
  appendChild(node) {
    if (!node) return node;
    if (node.nodeType === 11) { node.childNodes.slice().forEach(c => this.appendChild(c)); return node; }
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    this.ownerDocument._index(node);
    return node;
  }
  insertBefore(node, ref) {
    if (!ref) return this.appendChild(node);
    const i = this.childNodes.indexOf(ref);
    if (i < 0) return this.appendChild(node);
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.splice(i, 0, node);
    this.ownerDocument._index(node);
    return node;
  }
  removeChild(node) {
    const i = this.childNodes.indexOf(node);
    if (i >= 0) { this.childNodes.splice(i, 1); node.parentNode = null; this.ownerDocument._deindex(node); }
    return node;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(node) {
    for (let n = node; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  get textContent() {
    if (this.nodeType === 3) return this._text;
    return this.childNodes.map(n => n.textContent).join('');
  }
  set textContent(v) {
    if (this.nodeType === 3) { this._text = String(v); return; }
    this.childNodes.slice().forEach(c => this.removeChild(c));
    if (v !== '' && v !== null && v !== undefined) this.appendChild(this.ownerDocument.createTextNode(String(v)));
  }
}

class MiniText extends MiniNode {
  constructor(doc, text) { super(doc, 3); this._text = String(text); this.tagName = '#text'; }
  get data() { return this._text; }
  set data(v) { this._text = String(v); }
}

class ClassList {
  constructor(el) { this._el = el; }
  get _list() {
    const c = this._el.getAttribute('class') || '';
    return c.split(/\s+/).filter(Boolean);
  }
  _write(list) { this._el.setAttribute('class', list.join(' ')); }
  add(...names) {
    const l = this._list;
    names.filter(Boolean).forEach(n => { if (!l.includes(n)) l.push(n); });
    this._write(l);
  }
  remove(...names) { this._write(this._list.filter(n => !names.includes(n))); }
  toggle(name, force) {
    const has = this.contains(name);
    const want = force === undefined ? !has : !!force;
    if (want) this.add(name); else this.remove(name);
    return want;
  }
  contains(name) { return this._list.includes(name); }
  get length() { return this._list.length; }
  item(i) { return this._list[i] || null; }
  toString() { return this._list.join(' '); }
  forEach(fn) { this._list.forEach(fn); }
}

function dashToCamel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
function camelToDash(s) { return s.replace(/[A-Z]/g, c => '-' + c.toLowerCase()); }

class MiniElement extends MiniNode {
  constructor(doc, tagName, ns) {
    super(doc, 1);
    this.tagName = String(tagName).toUpperCase();
    this.namespaceURI = ns || null;
    this._attrs = new Map();
    this._listeners = new Map();
    this.classList = new ClassList(this);
    this._styleProps = new Map();
    const el = this;

    this.style = new Proxy({}, {
      get(_t, k) {
        if (typeof k !== 'string') return undefined;
        if (k === 'cssText') {
          return Array.from(el._styleProps).map(([p, v]) => p + ':' + v).join(';');
        }
        if (k === 'setProperty') return (n, v) => el._styleProps.set(n, String(v));
        if (k === 'getPropertyValue') return (n) => el._styleProps.get(n) || '';
        if (k === 'removeProperty') return (n) => el._styleProps.delete(n);
        return el._styleProps.get(camelToDash(k)) || '';
      },
      set(_t, k, v) {
        if (k === 'cssText') {
          el._styleProps.clear();
          String(v).split(';').forEach(part => {
            const c = part.indexOf(':');
            if (c > 0) el._styleProps.set(part.slice(0, c).trim(), part.slice(c + 1).trim());
          });
          return true;
        }
        el._styleProps.set(camelToDash(k), String(v));
        return true;
      },
      has(_t, k) { return el._styleProps.has(camelToDash(String(k))); },
    });

    this.dataset = new Proxy({}, {
      get(_t, k) {
        if (typeof k !== 'string') return undefined;
        const v = el.getAttribute('data-' + camelToDash(k));
        return v === null ? undefined : v;
      },
      set(_t, k, v) { el.setAttribute('data-' + camelToDash(String(k)), String(v)); return true; },
      has(_t, k) { return el.hasAttribute('data-' + camelToDash(String(k))); },
      deleteProperty(_t, k) { el.removeAttribute('data-' + camelToDash(String(k))); return true; },
      ownKeys() {
        return Array.from(el._attrs.keys()).filter(k => k.startsWith('data-')).map(k => dashToCamel(k.slice(5)));
      },
      getOwnPropertyDescriptor() { return { enumerable: true, configurable: true }; },
    });
  }

  get checked() { return this._checked === undefined ? this.hasAttribute('checked') : this._checked; }
  set checked(v) { this._checked = !!v; }
  get disabled() { return this._disabled === undefined ? this.hasAttribute('disabled') : this._disabled; }
  set disabled(v) { this._disabled = !!v; if (v) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  get value() { return this._value === undefined ? (this.getAttribute('value') || '') : this._value; }
  set value(v) { this._value = String(v); }
  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', String(v)); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', String(v)); }

  getAttribute(n) { const v = this._attrs.get(String(n).toLowerCase()); return v === undefined ? null : v; }
  hasAttribute(n) { return this._attrs.has(String(n).toLowerCase()); }
  setAttribute(n, v) {
    const key = String(n).toLowerCase();
    const old = this._attrs.get(key);
    this._attrs.set(key, String(v));
    if (key === 'id' && this.ownerDocument) this.ownerDocument._reindexId(this, old, String(v));
  }
  removeAttribute(n) {
    const key = String(n).toLowerCase();
    const old = this._attrs.get(key);
    this._attrs.delete(key);
    if (key === 'id' && this.ownerDocument) this.ownerDocument._reindexId(this, old, null);
  }
  setAttributeNS(_ns, n, v) { this.setAttribute(n, v); }
  getAttributeNS(_ns, n) { return this.getAttribute(n); }
  get attributes() {
    return Array.from(this._attrs, ([name, value]) => ({ name, value }));
  }

  get innerHTML() { return this._serializeChildren(); }
  set innerHTML(html) {
    this.childNodes.slice().forEach(c => this.removeChild(c));
    if (html === '' || html === null || html === undefined) return;
    parseInto(String(html), this, this.ownerDocument);
  }
  get outerHTML() {
    const attrs = Array.from(this._attrs, ([n, v]) => ' ' + n + '="' + v + '"').join('');
    return '<' + this.tagName.toLowerCase() + attrs + '>' + this.innerHTML + '</' + this.tagName.toLowerCase() + '>';
  }
  _serializeChildren() {
    return this.childNodes.map(n => (n.nodeType === 3 ? n._text : n.outerHTML)).join('');
  }
  get innerText() { return this.textContent; }
  set innerText(v) { this.textContent = v; }

  insertAdjacentHTML(pos, html) {
    const frag = this.ownerDocument.createElement('div');
    parseInto(String(html), frag, this.ownerDocument);
    const kids = frag.childNodes.slice();
    if (pos === 'beforeend') kids.forEach(k => this.appendChild(k));
    else if (pos === 'afterbegin') kids.reverse().forEach(k => this.insertBefore(k, this.firstChild));
    else if (pos === 'beforebegin' && this.parentNode) kids.forEach(k => this.parentNode.insertBefore(k, this));
    else if (pos === 'afterend' && this.parentNode) kids.reverse().forEach(k => this.parentNode.insertBefore(k, this.nextSibling));
  }

  querySelectorAll(sel) {
    const seqs = parseSelector(sel);
    const out = [];
    const walk = (node) => {
      for (const c of node.childNodes) {
        if (c.nodeType === 1) {
          if (seqs.some(s => matchSeq(c, s))) out.push(c);
          walk(c);
        }
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  matches(sel) { return parseSelector(sel).some(s => matchSeq(this, s)); }
  closest(sel) {
    for (let n = this; n; n = n.parentNode) if (n.nodeType === 1 && n.matches(sel)) return n;
    return null;
  }

  addEventListener(type, fn, options) {
    if (typeof fn !== 'function') return;
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    const arr = this._listeners.get(type);
    const capture = options === true || (options && options.capture) || false;
    const once = !!(options && options.once);
    if (arr.some(r => r.fn === fn && r.capture === capture)) return;
    arr.push({ fn, capture, once });
  }
  removeEventListener(type, fn, options) {
    const arr = this._listeners.get(type);
    if (!arr) return;
    const capture = options === true || (options && options.capture) || false;
    const i = arr.findIndex(r => r.fn === fn && r.capture === capture);
    if (i >= 0) arr.splice(i, 1);
  }
  dispatchEvent(ev) {
    ev.target = ev.target || this;
    const path = [];
    for (let n = this; n; n = n.parentNode) path.push(n);
    for (const node of path) {
      const arr = node._listeners && node._listeners.get(ev.type);
      if (arr) {
        for (const rec of arr.slice()) {
          ev.currentTarget = node;
          if (rec.once) node.removeEventListener(ev.type, rec.fn, { capture: rec.capture });
          // 브라우저와 동일: 한 리스너가 던져도 나머지 리스너는 계속 돈다 (예외는 수집만).
          try { rec.fn.call(node, ev); }
          catch (e) {
            const sink = this.ownerDocument && this.ownerDocument._onError;
            if (sink) sink(e, 'listener:' + ev.type); else throw e;
          }
          if (ev._stopImmediate) return !ev.defaultPrevented;
        }
      }
      if (ev._stop || !ev.bubbles) break;
    }
    return !ev.defaultPrevented;
  }
  click() {
    // 실제 브라우저와 동일: 체크박스/라디오는 클릭 시 상태가 먼저 뒤집힌 뒤 이벤트가 흐른다.
    const type = (this.getAttribute('type') || '').toLowerCase();
    if (this.tagName === 'INPUT' && (type === 'checkbox' || type === 'radio')) {
      if (this.disabled) return;
      this.checked = type === 'radio' ? true : !this.checked;
      const ch = this.ownerDocument.defaultView._makeEvent('change', { bubbles: true });
      ch.target = this;
      const ev0 = this.ownerDocument.defaultView._makeEvent('click', { bubbles: true });
      ev0.target = this;
      this.dispatchEvent(ev0);
      this.dispatchEvent(ch);
      return;
    }
    const ev = this.ownerDocument.defaultView._makeEvent('click', { bubbles: true });
    ev.target = this;
    this.dispatchEvent(ev);
  }
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null; }
  select() {}
  scrollIntoView() {}

  getBoundingClientRect() {
    return { top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40, x: 0, y: 0 };
  }
  get offsetWidth() { return 100; }
  get offsetHeight() { return 40; }
  get offsetTop() { return 0; }
  get offsetLeft() { return 0; }
  get clientWidth() { return 100; }
  get clientHeight() { return 40; }
  get scrollHeight() { return 100; }
  get scrollWidth() { return 100; }

  animate() {
    const anim = {
      onfinish: null, oncancel: null, playState: 'finished',
      finished: Promise.resolve(),
      cancel() {}, finish() {}, pause() {}, play() {}, reverse() {},
      addEventListener(t, fn) { if (t === 'finish') anim.onfinish = fn; },
    };
    // 실제 브라우저처럼 다음 틱에 완료 콜백을 부른다 (입자 자동 정리 경로 유지).
    const win = this.ownerDocument.defaultView;
    win.setTimeout(() => { if (typeof anim.onfinish === 'function') anim.onfinish({ target: anim }); }, 1);
    return anim;
  }
  getAnimations() { return []; }
  get inert() { return this.hasAttribute('inert'); }
  set inert(v) { if (v) this.setAttribute('inert', ''); else this.removeAttribute('inert'); }
  cloneNode(deep) {
    const el = this.ownerDocument.createElement(this.tagName.toLowerCase());
    this._attrs.forEach((v, k) => el.setAttribute(k, v));
    if (deep) this.childNodes.forEach(c => el.appendChild(c.nodeType === 3
      ? this.ownerDocument.createTextNode(c._text) : c.cloneNode(true)));
    return el;
  }
}

// ---------------------------------------------------------------- Document
class MiniDocument extends MiniNode {
  constructor() {
    super(null, 9);
    this.ownerDocument = this;
    this._ids = new Map();
    this.hidden = false;
    this.visibilityState = 'visible';
    this.activeElement = null;
    this.title = '';
    this.cookie = '';
    this.readyState = 'complete';
    this._listeners = new Map();
  }
  _index(node) {
    if (node.nodeType === 1) {
      const id = node.getAttribute('id');
      if (id && !this._ids.has(id)) this._ids.set(id, node);
      node.childNodes.forEach(c => this._index(c));
    }
  }
  _deindex(node) {
    if (node.nodeType === 1) {
      const id = node.getAttribute('id');
      if (id && this._ids.get(id) === node) this._ids.delete(id);
      node.childNodes.forEach(c => this._deindex(c));
    }
  }
  _reindexId(node, oldId, newId) {
    if (oldId && this._ids.get(oldId) === node) this._ids.delete(oldId);
    if (newId) this._ids.set(newId, node);
  }
  createElement(tag) { return new MiniElement(this, tag, null); }
  createElementNS(ns, tag) { return new MiniElement(this, tag, ns); }
  createTextNode(t) { return new MiniText(this, t); }
  createDocumentFragment() { const f = new MiniNode(this, 11); f.tagName = '#fragment'; return f; }
  getElementById(id) {
    const el = this._ids.get(id);
    if (el && this.contains(el)) return el;
    if (el) { this._ids.delete(id); }
    return null;
  }
  getElementsByClassName(c) { return this.querySelectorAll('.' + c); }
  getElementsByTagName(t) { return this.querySelectorAll(t); }
  querySelectorAll(sel) { return MiniElement.prototype.querySelectorAll.call(this, sel); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  addEventListener(type, fn) { MiniElement.prototype.addEventListener.call(this, type, fn); }
  removeEventListener(type, fn) { MiniElement.prototype.removeEventListener.call(this, type, fn); }
  dispatchEvent(ev) { return MiniElement.prototype.dispatchEvent.call(this, ev); }
  execCommand() { return false; }
}

// ---------------------------------------------------------------- Web Audio 스텁
function makeAudioStubs(clock) {
  class Param {
    constructor(v) { this.value = v; }
    setValueAtTime(v) { this.value = v; return this; }
    linearRampToValueAtTime(v) { this.value = v; return this; }
    exponentialRampToValueAtTime(v) { this.value = v; return this; }
    setTargetAtTime(v) { this.value = v; return this; }
    setValueCurveAtTime() { return this; }
    cancelScheduledValues() { return this; }
  }
  class Node {
    constructor(ctx) { this.context = ctx; }
    connect(n) { return n; }
    disconnect() {}
  }
  class Ctx {
    constructor() {
      this.state = 'running';
      this.sampleRate = 44100;
      this.destination = new Node(this);
      this.listener = { setPosition() {} };
      this._t0 = clock.now;
    }
    get currentTime() { return (clock.now - this._t0) / 1000; }
    createOscillator() {
      const o = new Node(this);
      o.type = 'sine'; o.frequency = new Param(440); o.detune = new Param(0);
      o.start = () => {}; o.stop = () => {}; o.onended = null;
      o.addEventListener = () => {};
      return o;
    }
    createGain() { const g = new Node(this); g.gain = new Param(1); return g; }
    createBiquadFilter() {
      const f = new Node(this);
      f.type = 'lowpass'; f.frequency = new Param(350); f.Q = new Param(1); f.gain = new Param(0);
      return f;
    }
    createStereoPanner() { const p = new Node(this); p.pan = new Param(0); return p; }
    createDynamicsCompressor() {
      const c = new Node(this);
      ['threshold', 'knee', 'ratio', 'attack', 'release'].forEach(k => { c[k] = new Param(0); });
      c.reduction = 0;
      return c;
    }
    createConvolver() { const c = new Node(this); c.buffer = null; c.normalize = true; return c; }
    createDelay() { const d = new Node(this); d.delayTime = new Param(0); return d; }
    createAnalyser() {
      const a = new Node(this);
      a.fftSize = 2048; a.frequencyBinCount = 1024;
      a.getByteFrequencyData = () => {}; a.getByteTimeDomainData = () => {};
      return a;
    }
    createWaveShaper() { const w = new Node(this); w.curve = null; w.oversample = 'none'; return w; }
    createBuffer(ch, len, rate) {
      return {
        numberOfChannels: ch, length: len, sampleRate: rate, duration: len / rate,
        getChannelData: () => new Float32Array(len),
      };
    }
    createBufferSource() {
      const s = new Node(this);
      s.buffer = null; s.loop = false; s.playbackRate = new Param(1);
      s.start = () => {}; s.stop = () => {}; s.onended = null;
      return s;
    }
    createPeriodicWave() { return {}; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  return Ctx;
}

// ---------------------------------------------------------------- 환경 조립
function createEnvironment(opts) {
  opts = opts || {};
  const html = opts.html !== undefined ? opts.html : fs.readFileSync(opts.htmlPath || HTML_PATH, 'utf8');
  const clock = new Clock(opts.startTime === undefined ? Date.UTC(2026, 4, 12, 14, 30, 0) : opts.startTime);
  const errors = [];
  const logs = [];
  const record = (e, where) => { errors.push({ where, message: String(e && e.message || e), stack: String(e && e.stack || '') }); };

  const doc = new MiniDocument();
  const htmlEl = doc.createElement('html');
  doc.appendChild(htmlEl);
  const head = doc.createElement('head');
  const body = doc.createElement('body');
  htmlEl.appendChild(head);
  htmlEl.appendChild(body);
  doc.documentElement = htmlEl;
  doc.head = head;
  doc.body = body;

  // 실제 마크업의 <body> 내용을 파싱해 넣는다 (인라인 <script>는 텍스트로만 보관).
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  parseInto(bodyMatch ? bodyMatch[1] : html, body, doc);
  // body 자체의 class 속성도 반영
  const bodyTag = html.match(/<body([^>]*)>/i);
  if (bodyTag) for (const [n, v] of parseAttrs(bodyTag[1])) body.setAttribute(n, v);
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) parseInto(headMatch[1], head, doc);

  const store = new Map(Object.entries(opts.storage || {}));
  const localStorage = {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: (k) => { store.delete(String(k)); },
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; },
    _store: store,
  };

  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(clock.now);
      else super(...args);
    }
    static now() { return clock.now; }
  }

  const AudioCtx = makeAudioStubs(clock);
  const rng = mulberry32(opts.seed === undefined ? 12345 : opts.seed);
  const fakeMath = Object.create(Math);
  fakeMath.random = rng;

  const prompts = [];
  const win = {};

  win._makeEvent = (type, init) => {
    init = init || {};
    return {
      type, bubbles: init.bubbles !== false, target: init.target || null, currentTarget: null,
      defaultPrevented: false, _stop: false, _stopImmediate: false,
      key: init.key, code: init.code, keyCode: init.keyCode, repeat: !!init.repeat,
      clientX: init.clientX || 0, clientY: init.clientY || 0,
      shiftKey: !!init.shiftKey, ctrlKey: !!init.ctrlKey, metaKey: !!init.metaKey, altKey: !!init.altKey,
      touches: init.touches || [], changedTouches: init.changedTouches || [],
      detail: init.detail, dataTransfer: init.dataTransfer,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this._stop = true; },
      stopImmediatePropagation() { this._stop = true; this._stopImmediate = true; },
    };
  };

  const sandbox = {
    document: doc,
    window: win,
    localStorage,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
    navigator: {
      userAgent: 'headless-play-harness',
      language: 'ko-KR', languages: ['ko-KR'],
      onLine: true, maxTouchPoints: 0, platform: 'Win32',
      clipboard: { writeText: () => Promise.resolve() },
      share: undefined,
      // serviceWorker 는 의도적으로 미제공 — file:// 상당 환경 (등록 가드 검증)
    },
    location: { href: 'http://localhost/index.html', protocol: 'http:', hostname: 'localhost',
      search: '', hash: '', pathname: '/index.html', origin: 'http://localhost',
      reload() { sandbox.__reloaded = (sandbox.__reloaded || 0) + 1; },
      assign() {}, replace() {} },
    history: { pushState() {}, replaceState() {}, back() {} },
    console: {
      log: (...a) => logs.push(['log', a.map(String).join(' ')]),
      warn: (...a) => logs.push(['warn', a.map(String).join(' ')]),
      error: (...a) => logs.push(['error', a.map(String).join(' ')]),
      info: () => {}, debug: () => {},
    },
    setTimeout: (fn, d, ...a) => clock.set(fn, d, a, 0),
    setInterval: (fn, d, ...a) => clock.set(fn, d, a, Math.max(1, d || 1)),
    clearTimeout: (id) => clock.clear(id),
    clearInterval: (id) => clock.clear(id),
    requestAnimationFrame: (fn) => clock.set(() => fn(clock.now), 16, [], 0),
    cancelAnimationFrame: (id) => clock.clear(id),
    requestIdleCallback: (fn) => clock.set(() => fn({ timeRemaining: () => 5, didTimeout: false }), 1, [], 0),
    cancelIdleCallback: (id) => clock.clear(id),
    Date: FakeDate,
    Math: fakeMath,
    performance: { now: () => clock.now, mark() {}, measure() {} },
    AudioContext: AudioCtx,
    webkitAudioContext: AudioCtx,
    Image: function Image() { return { src: '', onload: null, onerror: null, width: 0, height: 0 }; },
    Blob: function Blob(parts, o) { this.parts = parts; this.type = (o && o.type) || ''; this.size = 0; },
    File: function File() {},
    FileReader: function FileReader() {
      this.readAsText = () => { const self = this; clock.set(() => { self.result = ''; if (self.onload) self.onload({ target: self }); }, 1, [], 0); };
      this.readAsDataURL = this.readAsText;
    },
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    IntersectionObserver: function () { return { observe() {}, unobserve() {}, disconnect() {} }; },
    MutationObserver: function () { return { observe() {}, disconnect() {}, takeRecords: () => [] }; },
    ResizeObserver: function () { return { observe() {}, unobserve() {}, disconnect() {} }; },
    getComputedStyle: (el) => ({
      getPropertyValue: (n) => (el && el._styleProps && el._styleProps.get(n)) || '',
      opacity: '1', display: 'block', visibility: 'visible',
    }),
    matchMedia: (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    alert: (m) => { prompts.push(['alert', String(m)]); },
    confirm: (m) => { prompts.push(['confirm', String(m)]); return opts.confirm === undefined ? true : !!opts.confirm; },
    prompt: (m, d) => { prompts.push(['prompt', String(m)]); return opts.promptValue === undefined ? null : opts.promptValue; },
    fetch: () => new Promise(() => {}),           // 결코 settle 되지 않음 — 오프라인 상당
    XMLHttpRequest: function () { this.open = () => {}; this.send = () => {}; this.setRequestHeader = () => {}; },
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
    TextEncoder, TextDecoder, URLSearchParams,
    Promise, JSON, Object, Array, String, Number, Boolean, Symbol, Error, TypeError, RangeError,
    Map, Set, WeakMap, WeakSet, Proxy, Reflect, RegExp, Function, Float32Array, Uint8Array, Int32Array, ArrayBuffer,
    isNaN, isFinite, parseInt, parseFloat, structuredClone: (o) => JSON.parse(JSON.stringify(o)),
    Intl,
    Node: MiniNode, Element: MiniElement, HTMLElement: MiniElement, SVGElement: MiniElement,
    Text: MiniText, DocumentFragment: MiniNode,
    Event: function Event(type, init) { return win._makeEvent(type, init); },
    CustomEvent: function CustomEvent(type, init) { return win._makeEvent(type, init); },
    KeyboardEvent: function KeyboardEvent(type, init) { return win._makeEvent(type, init); },
    MouseEvent: function MouseEvent(type, init) { return win._makeEvent(type, init); },
    // 게임이 존재를 검사하는 CDN 전역 — 미로드 상태 (오프라인 폴백 경로)
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;

  Object.assign(win, {
    document: doc, localStorage, location: sandbox.location, navigator: sandbox.navigator,
    innerWidth: 390, innerHeight: 844, outerWidth: 390, outerHeight: 844,
    devicePixelRatio: 2, scrollX: 0, scrollY: 0, pageYOffset: 0,
    setTimeout: sandbox.setTimeout, setInterval: sandbox.setInterval,
    clearTimeout: sandbox.clearTimeout, clearInterval: sandbox.clearInterval,
    requestAnimationFrame: sandbox.requestAnimationFrame,
    getComputedStyle: sandbox.getComputedStyle, matchMedia: sandbox.matchMedia,
    AudioContext: AudioCtx, webkitAudioContext: AudioCtx,
    scrollTo() {}, scrollBy() {}, open: () => null, close() {}, focus() {}, print() {},
    alert: sandbox.alert, confirm: sandbox.confirm, prompt: sandbox.prompt,
    addEventListener(type, fn) { MiniElement.prototype.addEventListener.call(win, type, fn); },
    removeEventListener(type, fn) { MiniElement.prototype.removeEventListener.call(win, type, fn); },
    dispatchEvent(ev) {
      const arr = win._listeners.get(ev.type);
      if (arr) arr.slice().forEach(rec => {
        ev.currentTarget = win;
        if (rec.once) win.removeEventListener(ev.type, rec.fn, { capture: rec.capture });
        try { rec.fn.call(win, ev); }
        catch (e) { if (doc._onError) doc._onError(e, 'listener:' + ev.type); else throw e; }
      });
      return true;
    },
  });
  win._listeners = new Map();
  win.parentNode = null;
  doc.defaultView = win;

  doc._onError = record;
  return { sandbox, doc, win, clock, localStorage, errors, logs, prompts, record, html, rng };
}

// 게임 IIFE를 부팅한다. 반환: 환경 + 조작 헬퍼
function boot(opts) {
  const env = createEnvironment(opts);
  const html = env.html;
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('인라인 <script> 를 찾을 수 없음');
  const context = vm.createContext(env.sandbox);
  try {
    vm.runInContext(m[1], context, { filename: 'game.js', timeout: 30000 });
  } catch (e) {
    env.record(e, 'boot');
    if (!opts || !opts.tolerateBootError) throw e;
  }
  // DOMContentLoaded / load 를 기다리는 코드가 있으면 발화
  const fire = (type, target) => {
    const ev = env.win._makeEvent(type, { bubbles: false });
    try { target.dispatchEvent(ev); } catch (e) { env.record(e, 'event:' + type); }
  };
  fire('DOMContentLoaded', env.doc);
  fire('load', env.win);
  return env;
}

module.exports = {
  boot, createEnvironment, mulberry32, Clock, parseInto, parseSelector,
  MiniDocument, MiniElement, HTML_PATH,
};

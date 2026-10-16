import {renderMarkdown} from './markdown.js';
import {decryptPrivatePayload, PRIVATE_MAX_BYTES, PRIVATE_UNLOCK_ERROR} from './private-crypto.js';

const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function erase(payload) {
  if (!payload) return;
  for (const key of Object.keys(payload)) {
    const list = payload[key];
    if (Array.isArray(list)) { for (const item of list) for (const k of Object.keys(item)) item[k] = null; list.length = 0; }
  }
}

export function mountPrivateLibrary(container, {payloadUrl, fetcher=globalThis.fetch}={}) {
  const doc = container.ownerDocument, view = doc.defaultView;
  const base = new URL(import.meta.env?.BASE_URL || './', doc.baseURI);
  const url = new URL(payloadUrl || 'private-library.json', base);
  if (url.origin !== new URL(doc.baseURI).origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('Encrypted content must use the same site origin');

  let payload = null, request = null, epoch = 0, disposed = false;
  let workId = null, articleId = null;

  // 富页面高度自适应：sandbox iframe 内 window.parent.postMessage({richHeight:N})，
  // 父页面校验 event.source 与消息形态后调整高度。不含其它数据交换，不授同源。
  function onRichResize(event) {
    if (disposed || !event || !event.source) return;
    const data = event.data;
    const height = data && typeof data === 'object' ? data.richHeight : null;
    if (!Number.isFinite(height) || height <= 0) return;
    const frames = container.querySelectorAll('[data-private-rich] iframe');
    for (const frame of frames) {
      if (frame.contentWindow === event.source) {
        frame.style.height = Math.max(320, Math.min(height, 12000)) + 'px';
        break;
      }
    }
  }
  view.addEventListener('message', onRichResize);

  function clear() {
    epoch++; request?.abort(); request = null; erase(payload); payload = null; workId = null; articleId = null;
    container.replaceChildren();
  }
  function locked(message = '') {
    if (disposed) return;
    container.innerHTML =
      '<div class="page-head"><span class="eyebrow">PRIVATE LIBRARY</span><h1>加密区</h1>' +
      '<p>存放内部源码的架构与发现（Sydney、Meshy、Copilot）。输入访问密码后在本页阅读，关闭或刷新页面后需重新解锁。</p></div>' +
      '<form class="lab-panel" data-private-form autocomplete="off"><label for="private-access-password">访问密码</label>' +
      '<input id="private-access-password" data-private-password type="password" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="1024" required>' +
      '<div class="notes-tools"><button class="button primary" type="submit">解锁</button><button class="button light" type="button" data-private-lock>清除</button></div>' +
      '<p role="status" aria-live="polite" data-private-status>' + esc(message) + '</p></form>';
    const form = container.querySelector('[data-private-form]');
    form.addEventListener('submit', unlock);
    container.querySelector('[data-private-lock]').addEventListener('click', lock);
  }
  function lock() { clear(); locked(); }

  async function readEnvelope(response, signal) {
    if (!response.ok || Number(response.headers.get('content-length')) > PRIVATE_MAX_BYTES) throw new Error(PRIVATE_UNLOCK_ERROR);
    const text = await response.text();
    if (new TextEncoder().encode(text).length > PRIVATE_MAX_BYTES || signal.aborted) throw new Error(PRIVATE_UNLOCK_ERROR);
    return JSON.parse(text);
  }
  async function unlock(event) {
    event.preventDefault();
    if (request || disposed) return;
    const input = container.querySelector('[data-private-password]');
    let password = input.value; input.value = '';
    if (!password) return;
    const current = ++epoch;
    const controller = new AbortController(); request = controller;
    const status = container.querySelector('[data-private-status]'); status.textContent = '正在解锁…';
    container.querySelector('button[type="submit"]').disabled = true;
    let opened = null;
    try {
      const response = await fetcher(url.href, {signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'});
      const envelope = await readEnvelope(response, controller.signal);
      if (current !== epoch || disposed || controller.signal.aborted) return;
      opened = await decryptPrivatePayload(envelope, password);
      password = null;
      if (current !== epoch || disposed || controller.signal.aborted) { erase(opened); opened = null; return; }
      payload = opened; opened = null; request = null;
      workId = payload.works[0]?.id || null;
      tree();
    } catch {
      erase(opened);
      if (current === epoch && !disposed) { request = null; erase(payload); payload = null; locked(PRIVATE_UNLOCK_ERROR); }
    } finally { password = null; }
  }

  const modulesOfWork = w => payload.modules.filter(m => m.work === w).sort((a, b) => a.order - b.order);
  const articlesOfWork = w => payload.articles.filter(a => a.work === w).sort((a, b) => a.order - b.order);
  const articlesOfModule = m => payload.articles.filter(a => a.module === m).sort((a, b) => a.order - b.order);

  function tree() {
    if (disposed || !payload) return;
    articleId = null;
    const works = payload.works.map(w => '<button class="button ' + (w.id === workId ? 'primary' : 'light') + '" data-private-work="' + esc(w.id) + '" aria-current="' + (w.id === workId ? 'page' : 'false') + '">' + esc(w.name) + '</button>').join('');
    const w = payload.works.find(x => x.id === workId);
    const modules = modulesOfWork(workId).map(m => {
      const items = articlesOfModule(m.id).map(a =>
        '<a class="tree-article" href="#/private" data-private-article="' + esc(a.id) + '">' +
        '<span class="mono">' + String(a.order).padStart(2, '0') + '</span>' + esc(a.title) + '</a>'
      ).join('');
      return '<section class="tree-module"><h3>' + esc(m.title) + '</h3><div class="tree-articles">' + (items || '<span class="empty">（待写）</span>') + '</div></section>';
    }).join('');
    container.innerHTML =
      '<div class="article-top"><span>已解锁 · 仅当前页面</span><button class="button light" data-private-lock>锁定资料</button></div>' +
      '<div class="notes-tools" role="tablist" aria-label="加密区项目">' + works + '</div>' +
      (w ? '<div class="article-heading"><h1>' + esc(w.name) + '</h1><p>' + esc(w.summary) + '</p><p class="hint">知识树：按模块自上而下拆解，点击文章进入。后期在此维护各项目模块。</p></div>' : '') +
      '<div class="tree">' + modules + '</div>';
    for (const b of container.querySelectorAll('[data-private-work]')) b.addEventListener('click', () => { workId = b.dataset.privateWork; tree(); });
    for (const a of container.querySelectorAll('[data-private-article]')) a.addEventListener('click', event => { event.preventDefault(); article(a.dataset.privateArticle); });
    container.querySelector('[data-private-lock]').addEventListener('click', lock);
    view?.scrollTo(0, 0);
  }

  function article(id) {
    if (disposed || !payload) return;
    const a = payload.articles.find(x => x.id === id);
    if (!a) return;
    articleId = id;
    const list = articlesOfWork(a.work);
    const idx = list.findIndex(x => x.id === id);
    const prev = idx > 0 ? list[idx - 1] : null, next = idx < list.length - 1 ? list[idx + 1] : null;
    const prereq = (a.prerequisites || []).map(p => {
      const pa = payload.articles.find(x => x.id === p);
      return pa ? '<button class="button light" data-private-article="' + esc(pa.id) + '">' + esc(pa.title) + '</button>' : esc(p);
    }).join(' ');
    container.innerHTML =
      '<div class="article-top"><button class="button light" data-private-tree>← 知识树</button><button class="button light" data-private-lock>锁定资料</button></div>' +
      '<div class="article-heading"><span class="eyebrow">' + esc((payload.modules.find(m => m.id === a.module) || {}).title || '') + ' · ' + esc((payload.works.find(w => w.id === a.work) || {}).name || '') + '</span><h1>' + esc(a.title) + '</h1><p>' + esc(a.summary) + '</p>' +
      (prereq ? '<div class="notes-tools"><span>先修：</span>' + prereq + '</div>' : '') + '</div>' +
      '<article class="prose" data-private-prose></article>' +
      (a.widget ? '<div class="rich-frame" data-private-rich><iframe title="' + esc(a.title) + ' · 交互演示" sandbox="allow-scripts" loading="lazy"></iframe></div>' : '') +
      '<nav class="article-nav" style="display:flex;gap:10px;justify-content:space-between">' +
      (prev ? '<button class="button light" data-private-article="' + esc(prev.id) + '">← ' + esc(prev.title) + '</button>' : '<span></span>') +
      (next ? '<button class="button light" data-private-article="' + esc(next.id) + '">' + esc(next.title) + ' →</button>' : '<span></span>') +
      '</nav>' +
      '<details class="lab-panel"><summary>本篇来源</summary><ul>' + a.sourceIds.map(sid => {
        const s = payload.sources.find(x => x.id === sid);
        if (!s) return '';
        const isHttp = /^https:\/\//i.test(s.url);
        return '<li>' + (isHttp
          ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title) + '</a>'
          : esc(s.title) + ' <span class="hint">' + esc(s.url) + '</span>') + (s.coverage ? '<p>' + esc(s.coverage) + '</p>' : '') + '</li>';
      }).join('') + '</ul></details>';
    for (const b of container.querySelectorAll('[data-private-article]')) b.addEventListener('click', () => article(b.dataset.privateArticle));
    container.querySelector('[data-private-tree]').addEventListener('click', tree);
    container.querySelector('[data-private-lock]').addEventListener('click', lock);
    renderMarkdown(a.markdown, {strict: true}).then(html => {
      if (disposed || articleId !== id) return;
      const prose = container.querySelector('[data-private-prose]');
      if (prose) prose.innerHTML = html;
      for (const link of prose.querySelectorAll('a')) {
        const href = link.getAttribute('href') || '';
        const anchor = /^#\/private(?:$|\?)/.test(href);
        if (anchor) { link.removeAttribute('href'); link.addEventListener('click', e => { e.preventDefault(); }); }
        else if (!/^https:\/\//i.test(href)) { link.removeAttribute('href'); }
      }
    }).catch(() => {});
    if (a.widget) {
      const frame = container.querySelector('[data-private-rich] iframe');
      if (frame) frame.srcdoc = a.widget;
    }
    view?.scrollTo(0, 0);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clear();
    view?.removeEventListener('message', onRichResize);
    view?.removeEventListener('pagehide', lock);
    view?.removeEventListener('pageshow', onPageShow);
  }
  function onPageShow(event) { if (event.persisted) lock(); }
  view?.addEventListener('pagehide', lock);
  view?.addEventListener('pageshow', onPageShow);
  locked();
  return Object.assign(dispose, {lock, dispose});
}

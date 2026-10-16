import './style.css';
import 'katex/dist/katex.min.css';
import {renderMarkdown} from './markdown.js';
import catalog from '../content/catalog.json';
import works from '../content/works.json';

const articles = import.meta.glob('../content/articles/*.md', {query:'?raw', import:'default', eager:true});

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const THEME_KEY = 'agent-anatomy.theme';

const workMap = Object.fromEntries(works.map(w => [w.id, w]));
const articleMap = Object.fromEntries(catalog.map(a => [a.id, a]));

// ---- 主题 ----
let theme = 'light';
try { theme = localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch {}
function applyTheme(t){
  theme = t;
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#16171a' : '#f6f5f1');
  const btn = document.querySelector('#theme-toggle');
  if (btn) { btn.textContent = t === 'dark' ? '☀ 日间' : '☾ 夜间'; btn.setAttribute('aria-label', t === 'dark' ? '切换到日间模式' : '切换到夜间模式'); }
}
applyTheme(theme);

// ---- 外壳 ----
function shell(active){
  document.querySelector('#app').innerHTML =
    '<a class="skip" href="#main">跳到正文</a>' +
    '<aside class="sidebar">' +
      '<a href="#/" class="brand"><span class="brand-mark">解</span><span>Agent 解剖台<small>AGENT ANATOMY</small></span></a>' +
      '<p class="nav-label">作品</p>' +
      '<nav>' + works.map(w =>
        '<a href="#/work/' + w.id + '" class="work-link' + (w.status === 'internal' ? ' internal' : '') + '">' +
          esc(w.name) + (w.status === 'internal' ? ' <em>本地</em>' : '') + '</a>'
      ).join('') + '</nav>' +
      '<div class="sidebar-bottom"><div class="small-badge">SOURCE-FAITHFUL</div><p>以源码为据，<br>把机制讲清楚。</p></div>' +
    '</aside>' +
    '<div class="workspace">' +
      '<header class="topbar">' +
        '<button id="menu" class="icon-btn" aria-label="切换导航">☰</button>' +
        '<span class="breadcrumb">Agent 作品解剖</span>' +
        '<button id="theme-toggle" class="theme-toggle" type="button" aria-label="切换颜色模式"></button>' +
      '</header>' +
      '<main id="main" tabindex="-1"></main>' +
      '<footer>Agent Anatomy <span>·</span> 以源码为据的 Agent 作品拆解</footer>' +
    '</div>';
  document.querySelector('#menu').onclick = () => document.body.classList.toggle('nav-open');
  applyTheme(theme);
  document.querySelector('#theme-toggle').onclick = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    applyTheme(next);
  };
}

// ---- 首页 ----
function home(){
  const byWork = {};
  for (const a of catalog){
    (byWork[a.work] = byWork[a.work] || []).push(a);
  }
  const cards = works.map(w => {
    const list = (byWork[w.id] || []).sort((x,y) => x.order - y.order);
    const items = list.map(a =>
      '<a class="lesson-card" href="#/article/' + a.id + '">' +
        '<span class="card-top"><span class="mono">' + String(a.order).padStart(2,'0') + '</span>' + (a.internal ? '<em class="kind">内部</em>' : '<em class="kind">公开</em>') + '</span>' +
        '<h3>' + esc(a.title) + '</h3><p>' + esc(a.summary) + '</p>' +
      '</a>'
    ).join('');
    return '<section class="work-block"><h2>' + esc(w.name) + (w.status === 'internal' ? ' <em class="internal-tag">仅本地</em>' : '') + '</h2>' +
      (w.note ? '<p class="work-note">' + esc(w.note) + '</p>' : '') +
      (items ? '<div class="lesson-grid">' + items + '</div>' : '<p class="empty">暂无文章</p>') +
      '</section>';
  }).join('');

  document.querySelector('#main').innerHTML =
    '<div class="hero"><h1>Agent 作品解剖</h1><p>以源码为据，自上而下拆解 Copilot/Sydney、meshy、Claude Code、DeepSeek Harness、LangChain 等优秀 Agent 作品：先给心智模型，再讲机制与取舍。</p></div>' +
    cards;
  document.querySelector('.breadcrumb').textContent = '全部作品';
}

// ---- 作品页 ----
function workPage(workId){
  const w = workMap[workId];
  if (!w) return home();
  const list = catalog.filter(a => a.work === workId).sort((x,y) => x.order - y.order);
  const items = list.map(a =>
    '<a class="lesson-card" href="#/article/' + a.id + '">' +
      '<span class="card-top"><span class="mono">' + String(a.order).padStart(2,'0') + '</span></span>' +
      '<h3>' + esc(a.title) + '</h3><p>' + esc(a.summary) + '</p>' +
    '</a>'
  ).join('');
  document.querySelector('#main').innerHTML =
    '<div class="hero slim"><h1>' + esc(w.name) + '</h1>' + (w.note ? '<p>' + esc(w.note) + '</p>' : '') + '</div>' +
    (items ? '<div class="lesson-grid">' + items + '</div>' : '<p class="empty">暂无文章</p>');
  document.querySelector('.breadcrumb').textContent = w.name;
}

// ---- 文章页 ----
async function articlePage(id){
  const a = articleMap[id];
  if (!a) return home();
  const raw = articles['../content/articles/' + id + '.md'];
  if (!raw) { document.querySelector('#main').innerHTML = '<p class="empty">正文缺失：' + esc(id) + '</p>'; return; }
  const srcIds = (a.sourceIds || []).map(sid => sid).join(', ');
  const prereq = (a.prerequisites || []).map(p => {
    const pa = articleMap[p];
    return pa ? '<a href="#/article/' + p + '">' + esc(pa.title) + '</a>' : esc(p);
  });
  const html = await renderMarkdown(raw);
  document.querySelector('#main').innerHTML =
    '<article class="prose">' +
      '<header class="article-head"><h1>' + esc(a.title) + '</h1>' +
      '<div class="meta">' + esc(a.updated || '') + (prereq.length ? ' · 先修：' + prereq.join('、') : '') + '</div></header>' +
      html +
    '</article>' +
    '<nav class="article-nav">' +
      (a.work ? '<a href="#/work/' + a.work + '">← 返回「' + esc((workMap[a.work] || {}).name || a.work) + '」</a>' : '') +
    '</nav>';
  document.querySelector('.breadcrumb').textContent = a.title;
  document.querySelector('#main').scrollTop = 0;
}

// ---- 路由 ----
function route(){
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  shell();
  if (parts.length === 0) return home();
  if (parts[0] === 'article' && parts[1]) return articlePage(parts[1]);
  if (parts[0] === 'work' && parts[1]) return workPage(parts[1]);
  return home();
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);
route();

import {marked, Renderer} from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import mermaid from 'mermaid';

mermaid.initialize({startOnLoad:false, theme:'default', securityLevel:'strict', fontFamily:'inherit'});

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const INLINE_MATH = /\$([^$\n]+?)\$/g;
const BLOCK_MATH = /\$\$([\s\S]+?)\$\$/g;

marked.setOptions({gfm:true, breaks:false});

// 外部链接新窗口打开。marked v16 的 renderer 方法签名是 (token) => string，
// 其中 link 的 token 为 {href, title, tokens}，文本需经 this.parser.parseInline 渲染。
const renderer = new Renderer();
renderer.link = function(token) {
  const href = token.href;
  const text = this.parser.parseInline(token.tokens);
  if (/^https?:\/\//i.test(href || '')) {
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  }
  return `<a href="${href}"${token.title ? ` title="${token.title}"` : ''}>${text}</a>`;
};
marked.use({renderer});

// 占位 token（纯文本，能安全穿过 DOMPurify，之后统一替换为 SVG）
let counter = 0;
function token(prefix){ return `\u0000${prefix}${counter++}\u0000`; }

export async function renderMarkdown(src){
  const maths = [];
  const mmds = [];

  // 1. 代码块里的 mermaid 先取出
  let text = src.replace(/```mermaid\s*\n([\s\S]*?)```/g, (_, code) => {
    const t = token('MMD');
    mmds.push({t, code: code.trim()});
    return t;
  });

  // 2. 数学公式先取出（先块后行内）
  text = text.replace(BLOCK_MATH, (_, tex) => { const t = token('MATH'); maths.push({t, tex, display:true}); return t; });
  text = text.replace(INLINE_MATH, (_, tex) => { const t = token('MATH'); maths.push({t, tex, display:false}); return t; });

  // 3. markdown -> html
  let html = marked.parse(text);

  // 4. 消毒（仅用户 markdown 产出的 HTML；公式/mermaid 的 SVG 在消毒后注入）
  html = DOMPurify.sanitize(html, {ADD_ATTR:['target']});

  // 5. 还原数学公式为 KaTeX
  for (const m of maths){
    let out;
    try { out = katex.renderToString(m.tex, {displayMode:m.display, throwOnError:false}); }
    catch { out = `<code>${esc(m.tex)}</code>`; }
    html = html.split(m.t).join(out);
  }

  // 6. 还原 mermaid 为 SVG
  for (const m of mmds){
    let out;
    try {
      const {svg} = await mermaid.render('mmd-' + Math.random().toString(36).slice(2,10), m.code);
      out = `<div class="mermaid-box">${svg}</div>`;
    } catch {
      out = `<pre class="mermaid-fallback"><code>${esc(m.code)}</code></pre>`;
    }
    html = html.split(m.t).join(out);
  }

  return html;
}

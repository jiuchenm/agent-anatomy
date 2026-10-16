// 公开内容红线检查：防止内部源码细节（路径、凭证、内部标识）泄入公开版。
// 供 export-pages.mjs 在导出时调用，也在公开 pages 仓库的构建里运行（node scripts/check-public.mjs [--dist]）。
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateEnvelope} from '../src/private-crypto.js';

// 内部/敏感标记：命中任一条即视为不可公开。
const RESTRICTED = /sharepoint\.com|dev\.azure\.com|visualstudio\.com|M365-Incubation|ai-microsoft|substrate\.office|sydney\.bing|miaonathan|C:[\\/]Users[\\/]|C:[\\/]M365|confidential|WorkIQ|EntityServe|SkDS|3SQuery|gim-home|meshy-release|gho_[A-Za-z0-9]|-----BEGIN (RSA|OPENSSH|PRIVATE)/i;

export function assertPublicText(text, label) {
  const m = String(text).match(RESTRICTED);
  if (m) throw new Error(`公开内容 ${label} 含敏感标记：${m[0]}`);
}

export function checkPublic(root, {includeDist = false} = {}) {
  root = resolve(root);

  // 1. 密文信封校验（存在才校验；公开版可仅含明文公开内容）
  const encrypted = join(root, 'public', 'private-library.json');
  if (existsSync(encrypted)) validateEnvelope(JSON.parse(readFileSync(encrypted, 'utf8')));

  // 2. public/ 只允许密文信封
  if (existsSync(join(root, 'public'))) {
    for (const name of readdirSync(join(root, 'public'))) {
      if (name !== 'private-library.json') throw new Error('public/ 出现未审查资源：' + name);
    }
  }

  // 3. 公开白名单与内容结构
  const read = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
  const catalog = read('content/catalog.json');
  const sources = read('content/sources.json');
  const publicIds = new Set(read('content/public-lessons.json'));
  const sourceIds = new Set(sources.map(s => s.id));

  if (catalog.length !== publicIds.size || catalog.some(a => !publicIds.has(a.id) || a.internal)) {
    throw new Error('公开白名单与 catalog 不匹配（只允许白名单内且非 internal 的文章）');
  }
  for (const a of catalog) {
    if ((a.prerequisites || []).some(id => !publicIds.has(id))) throw new Error('公开文章引用私有先修：' + a.id);
    if ((a.sourceIds || []).some(id => !sourceIds.has(id))) throw new Error('公开文章引用未登记来源：' + a.id);
    const md = readFileSync(join(root, 'content', 'articles', a.id + '.md'), 'utf8');
    assertPublicText(md, a.id);
  }
  for (const s of sources) {
    assertPublicText(JSON.stringify(s), s.id);
    if (new URL(s.url).protocol !== 'https:') throw new Error('公开来源必须为 HTTPS：' + s.id);
  }

  // 4. 站点源文件红线扫描（跳过本脚本自身，避免自匹配 RESTRICTED 字面量）
  for (const p of ['index.html', 'src/main.js', 'src/markdown.js', 'src/style.css', 'src/private-crypto.js', 'src/private-library.js', 'vite.config.js', 'README.md']) {
    if (existsSync(join(root, p))) assertPublicText(readFileSync(join(root, p), 'utf8'), p);
  }

  // 5. 可选：构建产物扫描
  if (includeDist && existsSync(join(root, 'dist'))) {
    const walk = dir => {
      for (const item of readdirSync(dir, {withFileTypes: true})) {
        const p = join(dir, item.name);
        if (item.isDirectory()) walk(p);
        else if (/\.(js|json|html|css|md|map|txt)$/.test(p)) assertPublicText(readFileSync(p, 'utf8'), p);
      }
    };
    walk(join(root, 'dist'));
  }

  console.log(`公开红线检查通过：${publicIds.size} 篇公开文章${includeDist ? '，构建产物已扫描' : ''}。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkPublic(process.cwd(), {includeDist: process.argv.includes('--dist')});
}

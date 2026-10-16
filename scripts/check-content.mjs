import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const errors = [];

const catalog = read('content/catalog.json');
const works = read('content/works.json');
const publicIds = read('content/public-lessons.json');
const sources = read('content/sources.json');

const ids = new Set();
for (const a of catalog){
  for (const k of ['id','title','work','order']) if (a[k] === undefined) errors.push(`catalog ${a.id || '?'} 缺少字段 ${k}`);
  if (ids.has(a.id)) errors.push(`catalog 重复 id: ${a.id}`);
  ids.add(a.id);
  if (!existsSync(join(root, 'content/articles', a.id + '.md'))) errors.push(`缺少正文: content/articles/${a.id}.md`);
  const workOk = works.some(w => w.id === a.work);
  if (!workOk) errors.push(`${a.id} 的 work '${a.work}' 不在 works.json`);
  for (const p of (a.prerequisites || [])) if (!ids.has(p)) errors.push(`${a.id} 的先修 ${p} 不存在`);
  for (const s of (a.sourceIds || [])) if (!sources.some(x => x.id === s)) errors.push(`${a.id} 的来源 ${s} 不在 sources.json`);
}

const workIds = new Set(works.map(w => w.id));
for (const a of catalog) if (!workIds.has(a.work)) errors.push(`catalog ${a.id} 引用了不存在的 work`);

if (new Set(publicIds).size !== publicIds.length) errors.push('public-lessons.json 有重复 id');
for (const id of publicIds){
  if (!ids.has(id)) errors.push(`public-lessons.json 的 ${id} 不在 catalog`);
  const a = catalog.find(x => x.id === id);
  if (a && a.internal) errors.push(`内部文章 ${id} 不应出现在 public-lessons.json`);
}

if (errors.length){
  console.error('内容校验失败：\n - ' + errors.join('\n - '));
  process.exit(1);
}
console.log(`内容校验通过：${catalog.length} 篇文章，${works.length} 个作品，${publicIds.length} 篇公开。`);

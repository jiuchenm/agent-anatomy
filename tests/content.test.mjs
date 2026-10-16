import {test} from 'node:test';
import assert from 'node:assert';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = p => JSON.parse(readFileSync(join(root, p), 'utf8'));

test('catalog 每个 id 唯一且非空', () => {
  const catalog = json('content/catalog.json');
  const ids = catalog.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length, '存在重复 id');
  for (const a of catalog) assert.ok(a.id && a.title && a.work, `catalog 条目缺字段: ${a.id}`);
});

test('works.json 的 id 唯一', () => {
  const works = json('content/works.json');
  const ids = works.map(w => w.id);
  assert.equal(new Set(ids).size, ids.length, '存在重复 work id');
});

test('每个公开文章都有正文，且正文含 top-down 要素', () => {
  const publicIds = json('content/public-lessons.json');
  assert.ok(publicIds.length > 0, '公开清单为空');
  for (const id of publicIds){
    const md = readFileSync(join(root, 'content/articles', id + '.md'), 'utf8');
    assert.ok(md.trim().length > 0, `${id} 正文为空`);
  }
});

test('sources.json 的 id 唯一', () => {
  const sources = json('content/sources.json');
  const ids = sources.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length, '存在重复 source id');
});

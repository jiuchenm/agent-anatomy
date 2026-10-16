// 可移植 WebCrypto 加密信封。发布的文件永远不含密码/密钥。
// 密码只存本地被忽略的 .runtime/ 目录，密文可公开，只有持密码者可解锁。
export const PRIVATE_FORMAT_VERSION = 1;
export const PRIVATE_MAX_BYTES = 12 * 1024 * 1024;
const MAX_PLAINTEXT_BYTES = 8 * 1024 * 1024;
const ITERATIONS = 600000;
const DOMAIN = 'agent-anatomy/private-library/v1';
export const PRIVATE_UNLOCK_ERROR = '无法解锁：密码不正确或加密内容已损坏。';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal:true});
const fail = () => { throw new Error(PRIVATE_UNLOCK_ERROR); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
const text = (value, max=10000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const identifier = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value);
const idArray = value => Array.isArray(value) && value.length <= 300 && value.every(identifier) && new Set(value).size === value.length;
function encode64(bytes) {
  let binary = '';
  for (let i=0; i<bytes.length; i+=32768) binary += String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode64(value, expected) {
  if (typeof value !== 'string' || value.length > PRIVATE_MAX_BYTES * 4 / 3 || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) fail();
  const binary = atob(value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4));
  const bytes = Uint8Array.from(binary,c=>c.charCodeAt(0));
  if ((expected !== undefined && bytes.length !== expected) || encode64(bytes) !== value) fail();
  return bytes;
}
export function validateEnvelope(envelope) {
  try {
    if (!exactKeys(envelope,['version','kdf','cipher','ciphertext']) || envelope.version !== PRIVATE_FORMAT_VERSION) fail();
    const {kdf,cipher} = envelope;
    if (!exactKeys(kdf,['name','hash','iterations','salt']) || kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256' || kdf.iterations !== ITERATIONS) fail();
    if (!exactKeys(cipher,['name','iv','tagLength','aad']) || cipher.name !== 'AES-GCM' || cipher.tagLength !== 128 || cipher.aad !== DOMAIN) fail();
    if (JSON.stringify(envelope).length > PRIVATE_MAX_BYTES) fail();
    decode64(kdf.salt,16); decode64(cipher.iv,12);
    if (decode64(envelope.ciphertext).length < 17) fail();
    return envelope;
  } catch { fail(); }
}
export function validatePrivatePayload(payload) {
  if (!exactKeys(payload,['version','works','modules','articles','sources']) || payload.version !== PRIVATE_FORMAT_VERSION) fail();
  if (encoder.encode(JSON.stringify(payload)).length > MAX_PLAINTEXT_BYTES) fail();

  const works = payload.works, modules = payload.modules, articles = payload.articles, sources = payload.sources;
  if (!Array.isArray(works) || works.length > 50 || !Array.isArray(modules) || modules.length > 200 || !Array.isArray(articles) || articles.length > 300 || !Array.isArray(sources) || sources.length > 500) fail();

  const workIds = new Set(), moduleIds = new Set(), articleIds = new Set(), sourceIds = new Set();
  for (const w of works) {
    if (!object(w) || !identifier(w.id) || workIds.has(w.id) || !text(w.name) || !text(w.summary)) fail();
    workIds.add(w.id);
  }
  for (const m of modules) {
    if (!object(m) || !identifier(m.id) || moduleIds.has(m.id) || !workIds.has(m.work) || !text(m.title) || !Number.isInteger(m.order)) fail();
    moduleIds.add(m.id);
  }
  for (const s of sources) {
    // 私有源允许内部路径或 https URL（加密内容仅持有密码者可见，不做协议强制）
    if (!object(s) || !identifier(s.id) || sourceIds.has(s.id) || !text(s.title) || !text(s.url,8192)) fail();
    sourceIds.add(s.id);
  }
  const usedSources = new Set();
  for (const a of articles) {
    if (!object(a) || !identifier(a.id) || articleIds.has(a.id) || a.internal !== true || !workIds.has(a.work) || !moduleIds.has(a.module)
      || !text(a.title) || !Number.isInteger(a.order) || !text(a.summary) || !text(a.markdown,1024*1024)
      || !idArray(a.prerequisites) || !idArray(a.sourceIds) || !a.sourceIds.length) fail();
    // 可选富页面 widget：自包含 HTML 片段（内联 CSS/JS + CSP），仅加密区可见。
    // 上限 2MB，超出说明体积失控（完整库/大数据应精简为脱敏结构摘要）。
    if (a.widget !== undefined && !text(a.widget, 2*1024*1024)) fail();
    for (const id of a.sourceIds) { if (!sourceIds.has(id)) fail(); usedSources.add(id); }
    articleIds.add(a.id);
  }
  // 先修必须指向加密区内的文章
  for (const a of articles) for (const p of a.prerequisites) if (!articleIds.has(p)) fail();
  if (sources.length && usedSources.size !== sourceIds.size) fail();
  return payload;
}
async function derive(password, salt, cryptoApi, usage) {
  if (!text(password,1024) || !cryptoApi?.subtle) fail();
  const bytes = encoder.encode(password);
  try {
    const base = await cryptoApi.subtle.importKey('raw',bytes,'PBKDF2',false,['deriveKey']);
    return await cryptoApi.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,[usage]);
  } finally { bytes.fill(0); }
}
export async function encryptPrivatePayload(payload,password,cryptoApi=globalThis.crypto) {
  validatePrivatePayload(payload);
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  let key = await derive(password,salt,cryptoApi,'encrypt');
  const plaintext = encoder.encode(JSON.stringify(payload));
  try {
    const ciphertext = new Uint8Array(await cryptoApi.subtle.encrypt({name:'AES-GCM',iv,tagLength:128,additionalData:encoder.encode(DOMAIN)},key,plaintext));
    return validateEnvelope({version:1,kdf:{name:'PBKDF2',hash:'SHA-256',iterations:ITERATIONS,salt:encode64(salt)},cipher:{name:'AES-GCM',iv:encode64(iv),tagLength:128,aad:DOMAIN},ciphertext:encode64(ciphertext)});
  } finally { plaintext.fill(0); key = null; }
}
export async function decryptPrivatePayload(envelope,password,cryptoApi=globalThis.crypto) {
  let plaintext, key;
  try {
    validateEnvelope(envelope);
    key = await derive(password,decode64(envelope.kdf.salt,16),cryptoApi,'decrypt');
    plaintext = new Uint8Array(await cryptoApi.subtle.decrypt({name:'AES-GCM',iv:decode64(envelope.cipher.iv,12),tagLength:128,additionalData:encoder.encode(DOMAIN)},key,decode64(envelope.ciphertext)));
    if (plaintext.length > MAX_PLAINTEXT_BYTES) fail();
    return validatePrivatePayload(JSON.parse(decoder.decode(plaintext)));
  } catch { fail(); }
  finally { plaintext?.fill(0); key = null; }
}

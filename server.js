import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { mkdir, readFile, writeFile, rename, unlink, readdir } from 'node:fs/promises';
import { createHash, randomBytes, createPublicKey, verify as verifySignature } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServerClient } from '@quranjs/api/server';
import { SearchMode } from '@quranjs/api';
import { demoChapters, demoFatiha, fallbackVerse } from './src/data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 8787);
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

let qfClient;
const userSessions = new Map();
const oauthRequests = new Map();
function configured() {
  return Boolean(process.env.QF_CLIENT_ID && process.env.QF_CLIENT_SECRET);
}
function getClient() {
  if (!configured()) throw new Error('Quran Foundation credentials are not configured. Add QF_CLIENT_ID and QF_CLIENT_SECRET to .env.');
  if (!qfClient) {
    const prelive = (process.env.QF_ENV || 'prelive').toLowerCase() !== 'production';
    qfClient = createServerClient({
      clientId: process.env.QF_CLIENT_ID,
      clientSecret: process.env.QF_CLIENT_SECRET,
      ...(prelive ? { services: { gatewayUrl: 'https://apis-prelive.quran.foundation', oauth2BaseUrl: 'https://prelive-oauth2.quran.foundation' } } : {}),
    });
  }
  return qfClient;
}
function normalizeList(result, keys = []) {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== 'object') return [];
  for (const key of keys) if (Array.isArray(result[key])) return result[key];
  if (Array.isArray(result.data)) return result.data;
  return [];
}
function messageFrom(error) {
  return String(error?.message || 'Request failed').slice(0, 400);
}

const syncCacheDir = path.join(__dirname, 'data', 'content-sync');
const syncResourceGroups = new Set(['quran_core', 'mushafs', 'translations', 'word_by_word_translations', 'word_by_word_transliterations', 'tafsirs', 'recitations', 'chapter_recitations', 'articles']);
function safeCacheName(value) { return String(value).replace(/[^a-zA-Z0-9_-]/g, '_'); }
function syncCacheFile(group, id) { return path.join(syncCacheDir, `${safeCacheName((process.env.QF_ENV || 'prelive').toLowerCase())}-${safeCacheName(group)}-${safeCacheName(id)}.json`); }
function syncStateFile(resources) { return path.join(syncCacheDir, `${safeCacheName((process.env.QF_ENV || 'prelive').toLowerCase())}-state-${createHash('sha256').update(String(resources)).digest('hex').slice(0, 20)}.json`); }
async function writeJsonAtomic(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, filename);
}
async function readJsonFile(filename, fallback = null) {
  try { return JSON.parse(await readFile(filename, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
function changeValue(change, ...keys) {
  for (const key of keys) if (change?.[key] !== undefined && change?.[key] !== null) return change[key];
  return undefined;
}
function normalizeMutationList(result) {
  for (const key of ['changes', 'mutations', 'items', 'results', 'data']) {
    if (Array.isArray(result?.[key])) return result[key];
  }
  return Array.isArray(result) ? result : [];
}
function recordKey(record) {
  if (!record || typeof record !== 'object') return '';
  const explicit = record.record_key ?? record.recordKey ?? record.key;
  if (explicit != null) return String(explicit);
  if (record.id != null) return String(record.id);
  if (record.word_id != null) return String(record.word_id);
  if (record.verse_id != null) return String(record.verse_id);
  if (record.chapter_id != null && record.verse_number != null) return `${record.chapter_id}:${record.verse_number}`;
  return '';
}
async function persistSnapshot(group, id, snapshot) {
  const records = Array.isArray(snapshot?.records) ? snapshot.records : Array.isArray(snapshot?.data?.records) ? snapshot.data.records : [];
  const document = { environment: (process.env.QF_ENV || 'prelive').toLowerCase(), group, resourceId: String(id), syncedAt: new Date().toISOString(), recordCount: records.length, needsSnapshotRefresh: false, snapshot };
  await writeJsonAtomic(syncCacheFile(group, id), document);
  return { group, id: String(id), records: records.length };
}
async function fetchAndPersistSnapshot(group, id) {
  const finder = getClient().resources?.findSnapshot;
  if (typeof finder !== 'function') throw Object.assign(new Error('The installed SDK does not expose resources.findSnapshot().'), { status: 501 });
  const snapshot = await finder.call(getClient().resources, group, Number(id));
  return persistSnapshot(group, id, snapshot);
}

function snapshotRecords(document) {
  const snap = document?.snapshot;
  if (Array.isArray(snap?.records)) return snap.records;
  if (Array.isArray(snap?.data?.records)) return snap.data.records;
  if (Array.isArray(document?.records)) return document.records;
  return [];
}
async function cachedChapterVerses(chapterId, translationId = Number(process.env.QF_TRANSLATION_ID || 131)) {
  const core = await readJsonFile(syncCacheFile('quran_core', 1), null).catch(() => null);
  if (!core) return [];
  const records = snapshotRecords(core);
  const typeOf = (row) => String(row?.record_type || row?.recordType || '').toLowerCase();
  const verses = records.filter((row) => typeOf(row) === 'verse' && Number(row.chapter_id ?? row.chapterId) === Number(chapterId));
  if (!verses.length) return [];
  const translationsDocument = await readJsonFile(syncCacheFile('translations', translationId), null).catch(() => null);
  const translations = snapshotRecords(translationsDocument);
  const words = records.filter((row) => typeOf(row) === 'word');
  return verses.sort((a, b) => Number(a.verse_number ?? a.verseNumber ?? 0) - Number(b.verse_number ?? b.verseNumber ?? 0)).map((verse) => {
    const id = String(verse.id ?? verse.verse_id ?? '');
    const key = String(verse.verse_key ?? verse.verseKey ?? `${chapterId}:${verse.verse_number ?? verse.verseNumber}`);
    const translation = translations.find((row) => String(row.verse_id ?? row.verseId ?? '') === id || String(row.verse_key ?? row.verseKey ?? '') === key);
    const verseWords = words.filter((row) => String(row.verse_id ?? row.verseId ?? '') === id || String(row.verse_key ?? row.verseKey ?? '') === key).sort((a, b) => Number(a.position ?? a.word_position ?? a.wordPosition ?? 0) - Number(b.position ?? b.word_position ?? b.wordPosition ?? 0));
    return {
      id: verse.id, verseKey: key, verse_key: key, verseNumber: verse.verse_number, verse_number: verse.verse_number,
      textUthmani: verse.text_uthmani || verse.textUthmani || verse.text_uthmani_tajweed || verse.text_imlaei || '',
      text_uthmani: verse.text_uthmani || verse.textUthmani || '',
      translations: translation ? [{ id: translation.id, text: translation.text || translation.translation || '' }] : [],
      words: verseWords.map((word, index) => ({ ...word, position: word.position ?? word.word_position ?? index + 1, text: word.text_uthmani || word.text || word.text_indopak || '' })),
      _source: 'content-sync-cache',
    };
  });
}
async function applySyncChange(change, stats) {
  const type = String(changeValue(change, 'type', 'changeType', 'change_type', 'eventType') || '').toUpperCase();
  const group = String(changeValue(change, 'resourceGroup', 'resource_group', 'group') || '');
  const id = String(changeValue(change, 'resourceId', 'resource_id', 'resourceID') ?? '');
  if (!syncResourceGroups.has(group) || !/^\d{1,8}$/.test(id)) return;
  const file = syncCacheFile(group, id);
  if (type === 'RESOURCE_CREATE' || type === 'RESOURCE_INVALIDATE') {
    const snap = await fetchAndPersistSnapshot(group, id);
    stats.snapshots.push(snap);
    return;
  }
  if (type === 'RESOURCE_DELETE') {
    try { await unlink(file); stats.deletedResources += 1; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return;
  }
  if (type === 'RESOURCE_UPDATE') {
    const cache = await readJsonFile(file, null);
    if (cache) { cache.updatedAt = new Date().toISOString(); await writeJsonAtomic(file, cache); }
    return;
  }
  if (type === 'ROW_CREATE' || type === 'ROW_UPDATE' || type === 'ROW_DELETE') {
    const cache = await readJsonFile(file, null);
    if (!cache || !Array.isArray(cache.snapshot?.records)) { stats.resourcesNeedingSnapshot.add(`${group}:${id}`); return; }
    const row = changeValue(change, 'record', 'row', 'recordData', 'record_data', 'value', 'data');
    const rowKey = String(changeValue(change, 'recordKey', 'record_key', 'key') ?? '');
    if (type === 'ROW_DELETE') {
      if (!rowKey) { cache.needsSnapshotRefresh = true; stats.resourcesNeedingSnapshot.add(`${group}:${id}`); }
      else {
        const before = cache.snapshot.records.length;
        cache.snapshot.records = cache.snapshot.records.filter((record) => recordKey(record) !== rowKey && String(record.id ?? '') !== rowKey);
        if (before === cache.snapshot.records.length) { cache.needsSnapshotRefresh = true; stats.resourcesNeedingSnapshot.add(`${group}:${id}`); }
        else stats.upsertedRows += 1;
      }
    } else if (row && typeof row === 'object' && !Array.isArray(row)) {
      const targetKey = recordKey(row) || rowKey;
      if (!targetKey) { cache.needsSnapshotRefresh = true; stats.resourcesNeedingSnapshot.add(`${group}:${id}`); }
      else {
        const index = cache.snapshot.records.findIndex((record) => recordKey(record) === targetKey || String(record.id ?? '') === targetKey);
        if (index >= 0) cache.snapshot.records[index] = row; else cache.snapshot.records.push(row);
        stats.upsertedRows += 1;
      }
    } else { cache.needsSnapshotRefresh = true; stats.resourcesNeedingSnapshot.add(`${group}:${id}`); }
    cache.recordCount = cache.snapshot.records.length;
    cache.syncedAt = new Date().toISOString();
    await writeJsonAtomic(file, cache);
  }
}


function isProductionEnvironment() { return (process.env.QF_ENV || 'prelive').toLowerCase() === 'production'; }
function qfAuthHost() { return isProductionEnvironment() ? 'https://oauth2.quran.foundation' : 'https://prelive-oauth2.quran.foundation'; }
function qfUserApiHost() { return isProductionEnvironment() ? 'https://apis.quran.foundation' : 'https://apis-prelive.quran.foundation'; }
function configuredRedirectUri() { return String(process.env.QF_REDIRECT_URI || '').trim(); }
function getCookie(req, name) {
  const header = String(req.headers.cookie || '');
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    if (pair.slice(0, idx).trim() === name) return decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return '';
}
function setCookie(res, name, value, maxAge = 28800) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}
function clearCookie(res, name) { setCookie(res, name, '', 0); }
function sessionForRequest(req) {
  const sid = getCookie(req, 'syxlor_sid');
  const session = sid ? userSessions.get(sid) : null;
  if (session && session.expiresAt && session.expiresAt < Date.now()) { userSessions.delete(sid); return null; }
  return session || null;
}
function decodeJwtPart(value) { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
async function verifyQfIdToken(idToken, expectedNonce) {
  if (!idToken) throw new Error('The OAuth provider did not return an ID token. Ensure the openid scope is approved.');
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('The identity token was malformed.');
  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  const issuer = qfAuthHost().replace(/\/$/, '');
  if (header.alg !== 'RS256' || !header.kid) throw new Error('The identity token uses an unsupported signing algorithm.');
  const response = await fetch(`${issuer}/.well-known/jwks.json`);
  if (!response.ok) throw new Error('Could not load the identity provider signing keys.');
  const jwks = await response.json();
  const jwk = (jwks.keys || []).find((item) => item.kid === header.kid);
  if (!jwk) throw new Error('Could not find the identity token signing key.');
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const signed = `${parts[0]}.${parts[1]}`;
  const valid = verifySignature('RSA-SHA256', Buffer.from(signed), publicKey, Buffer.from(parts[2], 'base64url'));
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!valid || !audience.includes(process.env.QF_CLIENT_ID) || payload.iss?.replace(/\/$/, '') !== issuer || !payload.exp || payload.exp * 1000 <= Date.now() || payload.nonce !== expectedNonce) {
    throw new Error('Identity token validation failed (signature, issuer, audience, expiry, or nonce).');
  }
  return payload;
}
async function refreshUserSession(session) {
  if (!session?.refreshToken) throw new Error('Your Quran Foundation session expired. Sign in again.');
  if (session.expiresAt > Date.now() + 60_000) return session;
  const host = qfAuthHost();
  const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken, client_id: process.env.QF_CLIENT_ID });
  const response = await fetch(`${host}/oauth2/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`${process.env.QF_CLIENT_ID}:${process.env.QF_CLIENT_SECRET}`).toString('base64')}` }, body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || 'Could not refresh your Quran Foundation session. Sign in again.');
  session.accessToken = payload.access_token;
  session.refreshToken = payload.refresh_token || session.refreshToken;
  session.expiresAt = Date.parse(payload.expires_at || '') || Date.now() + Number(payload.expires_in || 3600) * 1000;
  return session;
}
async function requestUserApi(req, method, resource, recordId = '') {
  const session = sessionForRequest(req);
  if (!session) throw Object.assign(new Error('Connect your Quran Foundation account first.'), { status: 401 });
  await refreshUserSession(session);
  const resourcePaths = {
    bookmarks: 'bookmarks', collections: 'collections', notes: 'notes', goals: 'goals', streaks: 'streaks',
    'reading-sessions': 'reading-sessions', 'activity-days': 'activity-days', preferences: 'preferences', tags: 'tags',
    'app-state': 'app-state', rooms: 'rooms', posts: 'posts', comments: 'comments', media: 'media', users: 'users',
    'connected-apps': 'connected-apps',
  };
  const slug = resourcePaths[resource];
  if (!slug) throw Object.assign(new Error('Unsupported user resource. See /api/user/resources for the allowlist.'), { status: 400 });
  if (recordId && !/^[a-zA-Z0-9_-]{1,128}$/.test(recordId)) throw Object.assign(new Error('Record ID contains unsupported characters.'), { status: 400 });
  const url = new URL(`${qfUserApiHost()}/auth/v1/${slug}${recordId ? `/${encodeURIComponent(recordId)}` : ''}`);
  for (const [key, value] of Object.entries(req.query || {})) if (typeof value === 'string') url.searchParams.set(key, value);
  const response = await fetch(url, {
    method,
    headers: { 'x-auth-token': session.accessToken, 'x-client-id': process.env.QF_CLIENT_ID, ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}) },
    ...(method !== 'GET' && method !== 'DELETE' ? { body: JSON.stringify(req.body || {}) } : {}),
  });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 2000) }; }
  if (!response.ok) throw Object.assign(new Error(data?.error_description || data?.message || data?.error || `Quran Foundation User API returned ${response.status}.`), { status: response.status, data });
  return { data, session };
}


app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'Syxlor Deen', configured: configured(), apiConfigured: configured(), environment: (process.env.QF_ENV || 'prelive').toLowerCase(), searchEnabled: process.env.QF_SEARCH_ENABLED === 'true' });
});

app.get('/api/chapters', async (_req, res) => {
  if (!configured()) return res.json({ items: demoChapters, source: 'demo', note: 'Showing chapter metadata for the interactive preview. Add API credentials to load Quran Foundation data.' });
  try {
    const result = await getClient().content.v4.chapters.list();
    const items = normalizeList(result, ['chapters', 'data']);
    res.json({ items: items.length ? items : demoChapters.slice(0, 2), source: 'quran-foundation', environment: process.env.QF_ENV || 'prelive' });
  } catch (error) {
    res.status(200).json({ items: demoChapters, source: 'demo', note: messageFrom(error) });
  }
});

app.get('/api/chapters/:id/verses', async (req, res) => {
  const id = String(req.params.id || '1');
  if (!/^\d{1,3}$/.test(id) || Number(id) < 1 || Number(id) > 114) return res.status(400).json({ error: 'Invalid chapter number.' });
  if (!configured()) {
    const cached = await cachedChapterVerses(Number(id));
    if (cached.length) return res.json({ items: cached, source: 'content-sync-cache', note: 'Loaded from a server-side Content Sync cache. Reconnect to refresh updates.' });
    if (id === '1') return res.json({ items: demoFatiha, source: 'demo', note: 'Sample verses for preview. Connect Quran Foundation API to fetch live content.' });
    return res.status(503).json({ error: 'Verse content is not available in demo mode. Configure credentials or sync an eligible public quran_core resource.' });
  }
  try {
    const translationId = Number(req.query.translationId || req.query.translation_id || process.env.QF_TRANSLATION_ID || 131);
    const options = { words: true, wordFields: { audio: true, location: true, translation: true, transliteration: true }, ...(Number.isFinite(translationId) && translationId > 0 ? { translations: [translationId] } : {}) };
    const result = await getClient().content.v4.verses.byChapter(id, options);
    const items = normalizeList(result, ['verses', 'data']);
    res.json({ items, source: 'quran-foundation', environment: process.env.QF_ENV || 'prelive' });
  } catch (error) {
    const cached = await cachedChapterVerses(Number(id), Number(req.query.translationId || process.env.QF_TRANSLATION_ID || 131)).catch(() => []);
    if (cached.length) return res.json({ items: cached, source: 'content-sync-cache', note: 'Live content request failed; serving a locally synced snapshot. Re-sync before relying on it as current.' });
    res.status(502).json({ error: messageFrom(error), hint: 'Pre-live only includes Al-Fatihah and Al-Baqarah. Check API access, environment, and translation resource settings.' });
  }
});

app.get('/api/verses/random', async (_req, res) => {
  if (!configured()) return res.json({ item: fallbackVerse, source: 'demo' });
  try {
    const item = await getClient().content.v4.verses.random();
    res.json({ item, source: 'quran-foundation' });
  } catch (error) {
    res.status(502).json({ error: messageFrom(error), item: fallbackVerse, source: 'demo' });
  }
});

app.get('/api/verses/:chapter-:verse', async (req, res) => {
  const key = `${req.params.chapter}:${req.params.verse}`;
  if (!/^\d{1,3}:\d{1,3}$/.test(key)) return res.status(400).json({ error: 'Verse key must look like 1:1.' });
  if (!configured()) {
    const item = demoFatiha.find((v) => v.verseKey === key);
    return item ? res.json({ item, source: 'demo' }) : res.status(503).json({ error: 'This verse requires live API credentials.' });
  }
  try {
    const result = await getClient().content.v4.verses.byKey(key, { words: true, translations: [Number(process.env.QF_TRANSLATION_ID || 131)] });
    const item = Array.isArray(result) ? result[0] : (result?.verse || result?.data || result);
    res.json({ item, source: 'quran-foundation' });
  } catch (error) {
    res.status(502).json({ error: messageFrom(error) });
  }
});

app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 160);
  if (!query) return res.status(400).json({ error: 'Enter a search term.' });
  if (!configured()) return res.status(503).json({ error: 'Search requires server credentials and Search API access. You can still search the chapters available in this preview.' });
  if (process.env.QF_SEARCH_ENABLED !== 'true') return res.status(403).json({ error: 'Search API access has not been enabled in this app configuration. Set QF_SEARCH_ENABLED=true after Search permission is approved in Developer Console.' });
  try {
    const advanced = String(req.query.mode || 'quick').toLowerCase() === 'advanced';
    const mode = advanced ? (SearchMode.Advanced || 'advanced') : SearchMode.Quick;
    const page = Math.min(500, Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1));
    const size = Math.min(50, Math.max(1, Number.parseInt(String(req.query.size || '20'), 10) || 20));
    const result = await getClient().search.v1.query({ query, mode, ...(advanced ? { page, size } : {}) });
    res.json({ result, mode: advanced ? 'advanced' : 'quick', page: advanced ? page : undefined, size: advanced ? size : undefined, source: 'quran-foundation' });
  } catch (error) {
    res.status(502).json({ error: messageFrom(error), hint: 'Search needs separate Search API permission in the Developer Console.' });
  }
});


app.get('/api/resources', async (_req, res) => {
  if (!configured()) return res.json({ source: 'demo', catalogs: {}, note: 'Resource catalogs load after Quran Foundation credentials are configured.' });
  const client = getClient();
  const catalogTasks = {
    translations: () => client.content.v4.resources.translations.list(),
    tafsirs: () => client.content.v4.resources.tafsirs.list(),
    languages: () => client.content.v4.resources.languages.list(),
    chapterInfos: () => client.content.v4.resources.chapterInfos.list(),
    recitations: () => client.content.v4.resources.recitations.list(),
    chapterReciters: () => client.content.v4.resources.chapterReciters.list(),
    recitationStyles: () => client.content.v4.resources.recitationStyles.list(),
    verseMedia: () => client.content.v4.resources.verseMedia.list(),
    mushafs: () => client.content.v4.resources.mushafs.list(),
    wordByWordTranslations: () => client.content.v4.resources.wordByWordTranslations.list(),
    wordByWordTransliterations: () => client.content.v4.resources.wordByWordTransliterations.list(),
    qiraat: () => client.content.v4.resources.qiraat.list(),
  };
  const pairs = await Promise.all(Object.entries(catalogTasks).map(async ([key, task]) => {
    try { return [key, { items: normalizeList(await task()), available: true }]; }
    catch (error) { return [key, { items: [], available: false, error: messageFrom(error) }]; }
  }));
  res.json({ source: 'quran-foundation', catalogs: Object.fromEntries(pairs) });
});

app.get('/api/juzs', async (_req, res) => {
  if (!configured()) return res.json({ items: Array.from({ length: 30 }, (_, i) => ({ id: i + 1, juzNumber: i + 1, name: `Juz ${i + 1}` })), source: 'demo', note: 'Preview list; configure API credentials for Quran Foundation juz metadata.' });
  try {
    const result = await getClient().content.v4.juzs.list();
    res.json({ items: normalizeList(result, ['juzs', 'data']), source: 'quran-foundation' });
  } catch (error) {
    res.status(502).json({ error: messageFrom(error) });
  }
});


app.get('/api/juzs/:id/verses', async (req, res) => {
  const id = String(req.params.id || '1');
  if (!/^\d{1,2}$/.test(id) || Number(id) < 1 || Number(id) > 30) return res.status(400).json({ error: 'Juz number must be between 1 and 30.' });
  if (!configured()) {
    if (id === '1') return res.json({ items: demoFatiha, source: 'demo', note: 'Showing sample verses, not the full Juz. Configure Quran Foundation credentials for live content.' });
    return res.status(503).json({ error: 'Juz content requires configured Quran Foundation credentials.' });
  }
  try {
    const translationId = Number(process.env.QF_TRANSLATION_ID || 131);
    const result = await getClient().content.v4.verses.byJuz(id, { words: true, ...(translationId > 0 ? { translations: [translationId] } : {}) });
    res.json({ items: normalizeList(result, ['verses', 'data']), source: 'quran-foundation' });
  } catch (error) { res.status(502).json({ error: messageFrom(error) }); }
});

app.get('/api/chapters/:id/info', async (req, res) => {
  const id = String(req.params.id || '1');
  if (!/^\d{1,3}$/.test(id) || Number(id) < 1 || Number(id) > 114) return res.status(400).json({ error: 'Invalid chapter number.' });
  if (!configured()) return res.status(503).json({ error: 'Chapter information resources require configured Quran Foundation credentials.' });
  try {
    const resourceId = req.query.resourceId ? Number(req.query.resourceId) : undefined;
    const result = await getClient().content.v4.chapters.getInfoResponse(id, { includeResources: true, ...(resourceId ? { resourceId } : {}) });
    res.json({ result, source: 'quran-foundation' });
  } catch (error) { res.status(502).json({ error: messageFrom(error) }); }
});

app.get('/api/hadith/:chapter-:verse', async (req, res) => {
  const key = `${req.params.chapter}:${req.params.verse}`;
  if (!/^\d{1,3}:\d{1,3}$/.test(key)) return res.status(400).json({ error: 'Verse key must look like 1:1.' });
  if (!configured()) return res.status(503).json({ error: 'Hadith references require configured Quran Foundation credentials.' });
  try {
    const [references, hadiths] = await Promise.allSettled([
      getClient().content.v4.hadithReferences.byAyah(key),
      getClient().content.v4.hadithReferences.hadithsByAyah(key, { language: 'en', limit: 5 }),
    ]);
    res.json({ key, references: references.status === 'fulfilled' ? references.value : null, hadiths: hadiths.status === 'fulfilled' ? hadiths.value : null, errors: [references, hadiths].filter((r) => r.status === 'rejected').map((r) => messageFrom(r.reason)), source: 'quran-foundation' });
  } catch (error) { res.status(502).json({ error: messageFrom(error) }); }
});

app.get('/api/answers/:chapter-:verse', async (req, res) => {
  const key = `${req.params.chapter}:${req.params.verse}`;
  if (!/^\d{1,3}:\d{1,3}$/.test(key)) return res.status(400).json({ error: 'Verse key must look like 1:1.' });
  if (!configured()) return res.status(503).json({ error: 'Quran Answers requires configured Quran Foundation credentials.' });
  try {
    const result = await getClient().content.v4.answers.byAyah(key, { language: 'en', page: 1, pageSize: 5 });
    res.json({ result, source: 'quran-foundation' });
  } catch (error) { res.status(502).json({ error: messageFrom(error) }); }
});

app.get('/api/audio/reciters', async (_req, res) => {
  if (!configured()) return res.json({ items: [], source: 'demo', note: 'Audio catalogue loads after API credentials are configured.' });
  try {
    const result = await getClient().content.v4.resources.chapterReciters.list();
    res.json({ items: normalizeList(result, ['reciters', 'resources', 'data']), source: 'quran-foundation' });
  } catch (error) {
    res.status(502).json({ error: messageFrom(error) });
  }
});

function findAudioRecord(payload) {
  const queue = [payload];
  const seen = new Set();
  while (queue.length) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) continue;
    seen.add(candidate);
    if (Array.isArray(candidate)) { queue.push(...candidate.slice(0, 20)); continue; }
    const audioUrl = candidate.audioUrl || candidate.audio_url || candidate.url || candidate.audioFileUrl || candidate.audio_file_url;
    if (typeof audioUrl === 'string' && audioUrl.trim()) return { ...candidate, audioUrl: audioUrl.trim() };
    for (const key of ['audioFile', 'audio_file', 'audio', 'audioFiles', 'audio_files', 'items', 'result', 'data']) {
      if (candidate[key] && typeof candidate[key] === 'object') queue.push(candidate[key]);
    }
  }
  return null;
}

app.get('/api/audio/chapter/:reciter/:chapter', async (req, res) => {
  const { reciter, chapter } = req.params;
  if (!/^\d+$/.test(reciter) || !/^\d+$/.test(chapter) || Number(chapter) < 1 || Number(chapter) > 114) return res.status(400).json({ error: 'Reciter and chapter IDs must be numeric; chapter must be 1–114.' });
  if (!configured()) return res.status(503).json({ error: 'Audio requires configured Quran Foundation credentials.' });
  try {
    const result = await getClient().content.v4.audio.chapterRecitation.get(reciter, chapter, { segments: true });
    const item = findAudioRecord(result);
    if (!item?.audioUrl) return res.status(404).json({ error: 'The chapter-recitation response did not contain a playable audio URL.', hint: 'Check the chapter-reciter ID from the Chapter Reciters catalogue and the selected chapter resource.' });
    res.json({ item, source: 'quran-foundation' });
  } catch (error) {
    res.status(error.status || 502).json({ error: messageFrom(error), hint: 'Use a chapter-reciter ID from the Chapter Reciters catalogue, not an ayah-recitation ID.' });
  }
});


// Verse-by-verse audio uses the recitation catalog, not chapter-reciter IDs.
app.get('/api/audio/verse-reciters', async (_req, res) => {
  if (!configured()) return res.json({ items: [], source: 'demo', note: 'Ayah recitation catalogue requires Quran Foundation credentials.' });
  try {
    const result = await getClient().content.v4.resources.recitations.list();
    res.json({ items: normalizeList(result, ['recitations', 'resources', 'data']), source: 'quran-foundation' });
  } catch (error) { res.status(502).json({ error: messageFrom(error), hint: 'Check Content API permission for ayah recitation resources.' }); }
});

app.get('/api/audio/verse/:recitation/:chapter-:verse', async (req, res) => {
  const { recitation, chapter, verse } = req.params;
  if (![recitation, chapter, verse].every((x) => /^\d+$/.test(x)) || Number(chapter) < 1 || Number(chapter) > 114 || Number(verse) < 1) return res.status(400).json({ error: 'Recitation, chapter, and verse identifiers must be positive numbers.' });
  if (!configured()) return res.status(503).json({ error: 'Verse recitation requires Quran Foundation credentials and an available audio resource.' });
  try {
    const result = await getClient().content.v4.audio.verseRecitation.byKey(`${chapter}:${verse}`, recitation, { fields: { id: true, chapterId: true, segments: true, format: true } });
    const item = findAudioRecord(result);
    if (!item?.audioUrl) return res.status(404).json({ error: 'No audio URL was returned for this verse and recitation.' });
    res.json({ item, source: 'quran-foundation' });
  } catch (error) { res.status(502).json({ error: messageFrom(error), hint: 'Use an ID from the Ayah Recitations catalogue, not the chapter-reciter catalogue.' }); }
});

app.get('/api/audio/verse-chapter/:recitation/:chapter', async (req, res) => {
  const { recitation, chapter } = req.params;
  if (![recitation, chapter].every((x) => /^\d+$/.test(x)) || Number(chapter) < 1 || Number(chapter) > 114) return res.status(400).json({ error: 'Recitation and chapter IDs must be numeric; chapter must be 1–114.' });
  if (!configured()) return res.status(503).json({ error: 'Verse recitations require Quran Foundation credentials.' });
  try {
    const result = await getClient().content.v4.audio.verseRecitation.byChapter(chapter, recitation);
    res.json({ result, source: 'quran-foundation' });
  } catch (error) { res.status(502).json({ error: messageFrom(error) }); }
});

app.get('/api/audio/word/:chapter-:verse/:wordIndex', async (req, res) => {
  const { chapter, verse, wordIndex } = req.params;
  if (![chapter, verse, wordIndex].every((x) => /^\d+$/.test(x))) return res.status(400).json({ error: 'Chapter, verse, and word index must be numeric.' });
  if (!configured()) return res.status(503).json({ error: 'Word audio requires Quran Foundation credentials.' });
  try {
    const raw = await getClient().content.v4.verses.byKey(`${chapter}:${verse}`, { words: true, wordFields: { audio: true, location: true } });
    const v = Array.isArray(raw) ? raw[0] : raw?.verse || raw?.data || raw;
    const word = (v?.words || []).find((w, i) => Number(w.position || w.wordNumber || w.word_number || i + 1) === Number(wordIndex));
    if (!word?.audioUrl) return res.status(404).json({ error: 'No pronunciation audio is available for this word.' });
    const audioUrl = new URL(String(word.audioUrl).replace(/^\/+/, ''), 'https://audio.qurancdn.com/').toString();
    res.json({ item: { audioUrl, word }, source: 'quran-foundation' });
  } catch (error) { res.status(502).json({ error: messageFrom(error) }); }
});

// Division browsing: one interface for every grouping supported by the SDK.
app.get('/api/divisions/:type', async (req, res) => {
  const type = String(req.params.type || '').toLowerCase();
  const methodByType = { juz: 'juzs', page: 'pages', hizb: 'hizbs', rub: 'rubElHizbs', ruku: 'rukus', manzil: 'manzils' };
  const method = methodByType[type];
  if (!method) return res.status(400).json({ error: 'Supported divisions: juz, page, hizb, rub, ruku, manzil.' });
  if (!configured()) {
    const count = { juz: 30, page: 604, hizb: 60, rub: 240, ruku: 556, manzil: 7 }[type];
    return res.json({ items: Array.from({ length: count }, (_, i) => ({ id: i + 1, number: i + 1, name: `${type[0].toUpperCase()}${type.slice(1)} ${i + 1}` })), source: 'demo', note: 'Division metadata is illustrative until live Content API access is configured.' });
  }
  try {
    const group = getClient().content.v4[method];
    if (!group || typeof group.list !== 'function') return res.status(501).json({ error: `The installed SDK does not expose the ${type} listing helper in this version.`, hint: 'Use the official REST reference for this division or update @quranjs/api.' });
    const result = await group.list();
    res.json({ items: normalizeList(result, [method, 'items', 'data']), source: 'quran-foundation' });
  } catch (error) { res.status(502).json({ error: messageFrom(error), hint: 'The endpoint may be unavailable under the current environment or app permissions.' }); }
});

app.get('/api/divisions/:type/:id/verses', async (req, res) => {
  const type = String(req.params.type || '').toLowerCase();
  const id = String(req.params.id || '1');
  const limits = { juz: 30, page: 604, hizb: 60, rub: 240, ruku: 556, manzil: 7 };
  if (!limits[type]) return res.status(400).json({ error: 'Unsupported division type.' });
  if (!/^\d+$/.test(id) || Number(id) < 1 || Number(id) > limits[type]) return res.status(400).json({ error: `Choose a ${type} between 1 and ${limits[type]}.` });
  if (!configured()) {
    if (type === 'juz' && id === '1') return res.json({ items: demoFatiha, source: 'demo', note: 'Sample only; this is not a full juz.' });
    return res.status(503).json({ error: 'Live verse content requires Quran Foundation credentials.' });
  }
  try {
    const client = getClient();
    const translationId = Number(process.env.QF_TRANSLATION_ID || 131);
    const options = { words: true, ...(translationId > 0 ? { translations: [translationId] } : {}) };
    const verseMethods = { juz: 'byJuz', page: 'byPage', hizb: 'byHizb', rub: 'byRub', ruku: 'byRuku', manzil: 'byManzil' };
    const method = verseMethods[type];
    const verseGroup = client.content.v4.verses;
    if (typeof verseGroup?.[method] !== 'function') return res.status(501).json({ error: `The current SDK does not expose verses.${method}().`, hint: 'Use the matching division API reference or upgrade @quranjs/api.' });
    const result = await verseGroup[method](id, options);
    res.json({ items: normalizeList(result, ['verses', 'data']), source: 'quran-foundation' });
  } catch (error) { res.status(502).json({ error: messageFrom(error) }); }
});

app.get('/api/resources/:catalog/:id/info', async (req, res) => {
  const catalog = String(req.params.catalog || '');
  const allowed = { translations: 'translations', tafsirs: 'tafsirs', recitations: 'recitations', chapterReciters: 'chapterReciters', chapterInfos: 'chapterInfos', recitationStyles: 'recitationStyles', verseMedia: 'verseMedia', languages: 'languages', mushafs: 'mushafs', wordByWordTranslations: 'wordByWordTranslations', wordByWordTransliterations: 'wordByWordTransliterations', qiraat: 'qiraat' };
  if (!allowed[catalog]) return res.status(400).json({ error: 'Unsupported resource catalogue.' });
  if (!configured()) return res.status(503).json({ error: 'Resource details require Quran Foundation credentials.' });
  try {
    const group = getClient().content.v4.resources[allowed[catalog]];
    if (typeof group?.getInfo !== 'function') return res.status(501).json({ error: `The current SDK does not expose a detail helper for ${catalog}.` });
    const result = await group.getInfo(String(req.params.id));
    res.json({ result, source: 'quran-foundation' });
  } catch (error) { res.status(502).json({ error: messageFrom(error) }); }
});

app.get('/api/content/verse/:chapter-:verse', async (req, res) => {
  const key = `${req.params.chapter}:${req.params.verse}`;
  const translationIds = String(req.query.translations || process.env.QF_TRANSLATION_ID || '131').split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 6);
  const tafsirIds = String(req.query.tafsirs || '').split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 4);
  if (!configured()) return res.status(503).json({ error: 'Live verse variants require Quran Foundation credentials.' });
  try {
    const result = await getClient().content.v4.verses.byKey(key, { words: req.query.words !== 'false', ...(req.query.words !== 'false' ? { wordFields: { audio: true, location: true, translation: true, transliteration: true } } : {}), ...(translationIds.length ? { translations: translationIds } : {}), ...(tafsirIds.length ? { tafsirs: tafsirIds } : {}) });
    res.json({ result, source: 'quran-foundation' });
  } catch (error) { res.status(502).json({ error: messageFrom(error) }); }
});

app.get('/api/content/footnote/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Footnote ID must be numeric.' });
  if (!configured()) return res.status(503).json({ error: 'Footnotes require Quran Foundation credentials.' });
  try {
    const group = getClient().content.v4.footnotes;
    const result = typeof group?.get === 'function' ? await group.get(req.params.id) : null;
    if (!result) return res.status(501).json({ error: 'The installed SDK does not expose the footnote helper.' });
    res.json({ result, source: 'quran-foundation' });
  } catch (error) { res.status(502).json({ error: messageFrom(error) }); }
});

app.get('/api/qiraat', async (_req, res) => {
  if (!configured()) return res.json({ items: [], source: 'demo', note: 'Qiraat resources require Content API access.' });
  try {
    const qiraat = getClient().content.v4.qiraat;
    const result = typeof qiraat?.list === 'function' ? await qiraat.list() : await getClient().content.v4.resources.qiraat.list();
    res.json({ items: normalizeList(result, ['qiraat', 'items', 'data']), source: 'quran-foundation' });
  } catch (error) { res.status(502).json({ error: messageFrom(error), hint: 'Qiraat availability and supported helpers depend on SDK version and access.' }); }
});

app.get('/api/content-sync/status', async (_req, res) => {
  const files = await readdir(syncCacheDir).catch(() => []);
  const prefix = `${safeCacheName((process.env.QF_ENV || 'prelive').toLowerCase())}-`;
  const cacheCount = files.filter((file) => file.startsWith(prefix) && !file.includes('-state-') && file.endsWith('.json')).length;
  res.json({ available: true, configured: configured(), cacheCount, note: 'Managed Content Sync stores snapshots and checkpoints on this server. Apply every page and refresh resources flagged after unresolved row mutations before relying on the cache offline.' });
});

// Interactive Content Sync API. The UI can bootstrap, page through mutations, and request snapshots.
// It deliberately does not pretend a sync is complete until every page and snapshot is applied by a durable store.
app.post('/api/content-sync/run', async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'Content Sync requires configured Quran Foundation credentials.' });
  const resources = String(req.body?.resources || 'quran_core:1').trim();
  const validGroups = new Set(['quran_core', 'mushafs', 'translations', 'word_by_word_translations', 'word_by_word_transliterations', 'tafsirs', 'recitations', 'chapter_recitations', 'articles']);
  if (!resources || resources.length > 1000) return res.status(400).json({ error: 'Provide a valid Content Sync resource filter.' });
  for (const item of resources.split(';')) {
    const match = item.trim().match(/^([a-z_]+):([0-9,*]+)$/);
    if (!match || !validGroups.has(match[1])) return res.status(400).json({ error: `Invalid sync filter segment: ${item}. Allowed groups: ${[...validGroups].join(', ')}.` });
  }
  const body = { resources, perPage: Math.min(100, Math.max(1, Number(req.body?.perPage) || 50)) };
  if (req.body?.bootstrap === true) body.bootstrap = true;
  if (typeof req.body?.syncToken === 'string' && req.body.syncToken.length < 4096) body.syncToken = req.body.syncToken;
  if (typeof req.body?.cursor === 'string' && req.body.cursor.length < 4096) body.cursor = req.body.cursor;
  try {
    const sync = getClient().content.v4.resources?.sync;
    if (typeof sync !== 'function') return res.status(501).json({ error: 'The installed @quranjs/api SDK does not expose resources.sync(). Update the SDK to a version that supports Content Sync.' });
    const result = await sync.call(getClient().content.v4.resources, body);
    res.json({ result, source: 'quran-foundation', resources, bootstrap: body.bootstrap === true, note: 'Continue pagination until hasMore/has_more is false. Apply snapshots before storing the final nextSyncToken/next_sync_token.' });
  } catch (error) { res.status(502).json({ error: messageFrom(error), hint: 'Use only public resources available in this environment. Pre-live does not publish the complete quran_core:1 canonical Quran dataset.' }); }
});

app.post('/api/content-sync/sync-managed', async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'Content Sync requires configured Quran Foundation credentials.' });
  const resources = String(req.body?.resources || '').trim();
  if (!resources || resources.length > 1000 || resources.split(';').some((item) => {
    const match = item.trim().match(/^([a-z_]+):([0-9,*]+)$/);
    return !match || !syncResourceGroups.has(match[1]);
  })) return res.status(400).json({ error: `Provide a valid filter such as translations:131;tafsirs:169. Supported groups: ${[...syncResourceGroups].join(', ')}.` });
  const mode = String(req.body?.mode || 'bootstrap');
  if (!['bootstrap', 'incremental', 'next'].includes(mode)) return res.status(400).json({ error: 'mode must be bootstrap, incremental, or next.' });
  const perPage = Math.min(100, Math.max(1, Number(req.body?.perPage) || 50));
  const maxPages = Math.min(20, Math.max(1, Number(req.body?.maxPages) || 5));
  const stateFile = syncStateFile(resources);
  let state = await readJsonFile(stateFile, { resources, syncToken: '', cursor: '', updatedAt: null });
  if (mode === 'bootstrap') state = { resources, syncToken: '', cursor: '', updatedAt: null };
  if (mode === 'incremental' && !state.syncToken) return res.status(400).json({ error: 'No final sync token is stored for this exact resource filter. Run Bootstrap first.' });
  if (mode === 'next' && !state.cursor) return res.status(400).json({ error: 'There is no pending page for this filter. Run Bootstrap or Incremental sync first.' });
  const stats = { pages: 0, changes: 0, snapshots: [], deletedResources: 0, upsertedRows: 0, resourcesNeedingSnapshot: new Set(), pageSummaries: [], hasMore: false };
  let cursor = mode === 'next' ? state.cursor : '';
  let lastResult = null;
  try {
    for (let page = 0; page < maxPages; page += 1) {
      const params = { resources, perPage };
      if (page === 0 && mode === 'bootstrap') params.bootstrap = true;
      else if (page === 0 && mode === 'incremental') params.syncToken = state.syncToken;
      if (cursor) params.cursor = cursor;
      const sync = getClient().content.v4.resources?.sync;
      if (typeof sync !== 'function') return res.status(501).json({ error: 'This SDK version does not expose Content Sync. Update @quranjs/api.' });
      const result = await sync.call(getClient().content.v4.resources, params);
      lastResult = result;
      const changes = normalizeMutationList(result);
      for (const change of changes) await applySyncChange(change, stats);
      stats.pages += 1;
      stats.changes += changes.length;
      stats.pageSummaries.push({ page: stats.pages, changes: changes.length, hasMore: Boolean(changeValue(result, 'hasMore', 'has_more')) });
      const hasMore = Boolean(changeValue(result, 'hasMore', 'has_more'));
      const nextPageUrl = String(changeValue(result, 'nextPageUrl', 'next_page_url') || '');
      let nextCursor = String(changeValue(result, 'cursor', 'nextCursor', 'next_cursor') || '');
      if (!nextCursor && nextPageUrl) {
        try { nextCursor = new URL(nextPageUrl, qfUserApiHost()).searchParams.get('cursor') || ''; } catch { nextCursor = ''; }
      }
      stats.hasMore = hasMore;
      if (hasMore && nextCursor) {
        cursor = nextCursor;
        state.cursor = nextCursor;
        state.updatedAt = new Date().toISOString();
        await writeJsonAtomic(stateFile, state);
        continue;
      }
      if (hasMore && !nextCursor) {
        state.cursor = '';
        stats.pageSummaries[stats.pageSummaries.length - 1].paginationWarning = 'The SDK indicated another page but did not expose a usable cursor; inspect this SDK version response shape.';
      }
      cursor = '';
      if (!hasMore) {
        const token = changeValue(result, 'nextSyncToken', 'next_sync_token', 'syncToken', 'sync_token');
        if (token) state.syncToken = String(token);
        state.cursor = '';
        state.updatedAt = new Date().toISOString();
      } else state.cursor = nextCursor || '';
      await writeJsonAtomic(stateFile, state);
      break;
    }
    const files = await readdir(syncCacheDir).catch(() => []);
    const cacheCount = files.filter((file) => file.startsWith(`${safeCacheName((process.env.QF_ENV || 'prelive').toLowerCase())}-`) && !file.includes('-state-') && file.endsWith('.json')).length;
    res.json({
      mode, resources, pagesProcessed: stats.pages, changesProcessed: stats.changes,
      snapshotsSaved: stats.snapshots, deletedResources: stats.deletedResources,
      rowChangesApplied: stats.upsertedRows, resourcesNeedingSnapshotRefresh: [...stats.resourcesNeedingSnapshot],
      hasMore: stats.hasMore, syncTokenStored: Boolean(state.syncToken), cursorStored: Boolean(state.cursor),
      cacheResources: cacheCount, updatedAt: state.updatedAt,
      pagination: stats.pageSummaries,
      note: stats.resourcesNeedingSnapshot.size ? 'Some row mutations did not contain enough record data to apply safely. Refresh the listed resource snapshots before relying on their local copies.' : 'Snapshots and supported row mutations were saved on this server. Continue paging while hasMore is true; the final sync token is stored only after the final page.'
    });
  } catch (error) {
    await writeJsonAtomic(stateFile, { ...state, resources, cursor: cursor || state.cursor, updatedAt: new Date().toISOString(), lastError: messageFrom(error) }).catch(() => {});
    res.status(error.status || 502).json({ error: messageFrom(error), resources, pagesProcessed: stats.pages, snapshotsSaved: stats.snapshots, hint: 'Content Sync state is stored on the server. Do not use the cache as an offline mirror until bootstrap snapshots and all pending pages have been applied.' });
  }
});

app.get('/api/content-sync/cache', async (_req, res) => {
  const files = await readdir(syncCacheDir).catch(() => []);
  const prefix = `${safeCacheName((process.env.QF_ENV || 'prelive').toLowerCase())}-`;
  const items = [];
  for (const file of files.filter((name) => name.startsWith(prefix) && !name.includes('-state-') && name.endsWith('.json'))) {
    const doc = await readJsonFile(path.join(syncCacheDir, file), null).catch(() => null);
    if (doc) items.push({ group: doc.group, id: doc.resourceId, recordCount: doc.recordCount || doc.snapshot?.records?.length || 0, syncedAt: doc.syncedAt, needsSnapshotRefresh: Boolean(doc.needsSnapshotRefresh), file });
  }
  res.json({ environment: (process.env.QF_ENV || 'prelive').toLowerCase(), count: items.length, items });
});

app.get('/api/content-sync/cache/:group/:id', async (req, res) => {
  const { group, id } = req.params;
  if (!syncResourceGroups.has(group) || !/^\d{1,8}$/.test(id)) return res.status(400).json({ error: 'Choose a supported resource group and numeric ID.' });
  try {
    const doc = await readJsonFile(syncCacheFile(group, id), null);
    if (!doc) return res.status(404).json({ error: 'No local snapshot is cached for this resource yet.' });
    const includeRecords = String(req.query.includeRecords || '') === 'true';
    res.json({ ...doc, snapshot: includeRecords ? doc.snapshot : { ...doc.snapshot, records: (doc.snapshot?.records || []).slice(0, 12), previewOnly: true }, omittedRecords: includeRecords ? 0 : Math.max(0, (doc.recordCount || 0) - 12) });
  } catch (error) { res.status(500).json({ error: messageFrom(error) }); }
});

app.post('/api/content-sync/snapshot', async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'Content Sync snapshots require configured Quran Foundation credentials.' });
  const group = String(req.body?.group || '');
  const id = String(req.body?.id || '');
  const allowed = new Set(['quran_core', 'mushafs', 'translations', 'word_by_word_translations', 'word_by_word_transliterations', 'tafsirs', 'recitations', 'chapter_recitations', 'articles']);
  if (!allowed.has(group) || !/^\d{1,8}$/.test(id)) return res.status(400).json({ error: 'Choose a supported resource group and numeric resource ID.' });
  try {
    const finder = getClient().resources?.findSnapshot;
    if (typeof finder !== 'function') return res.status(501).json({ error: 'This SDK version does not expose client.resources.findSnapshot(). Update the Quran Foundation SDK.' });
    const snapshot = await finder.call(getClient().resources, group, Number(id));
    const saved = await persistSnapshot(group, id, snapshot);
    const records = Array.isArray(snapshot?.records) ? snapshot.records : Array.isArray(snapshot?.data?.records) ? snapshot.data.records : [];
    res.json({ source: 'quran-foundation', group, id, cached: true, cache: saved, recordCount: records.length, sample: records.slice(0, 12), omittedRecords: Math.max(0, records.length - 12), note: 'The complete snapshot was written to the server cache. This response includes only a small preview to keep the browser responsive.' });
  } catch (error) { res.status(502).json({ error: messageFrom(error), hint: 'A snapshot is available only for a public resource bootstrap has made available in this environment.' }); }
});




async function getAnalyticsAccessToken() {
  const response = await fetch(`${qfAuthHost()}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`${process.env.QF_CLIENT_ID}:${process.env.QF_CLIENT_SECRET}`).toString('base64')}` },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'analytics.events.write' }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || payload.error || 'Could not obtain the analytics.events.write token.');
  return payload.access_token;
}

app.post('/api/analytics/events', async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'Analytics submission requires Quran Foundation application credentials.' });
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  if (!events.length || events.length > 100) return res.status(400).json({ error: 'Submit between 1 and 100 events per batch.' });
  if (events.some((event) => !event || typeof event.name !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(event.name) || typeof event.event_id !== 'string' || !event.event_id.length || event.event_id.length > 128 || !Number.isInteger(event.version) || event.version < 1 || !event.occurred_at)) return res.status(400).json({ error: 'Each event requires event_id, a namespaced name, occurred_at, and integer version.' });
  try {
    const token = await getAnalyticsAccessToken();
    const base = isProductionEnvironment() ? 'https://apis.quran.foundation' : 'https://apis-prelive.quran.foundation';
    const endpoint = String(process.env.QF_ANALYTICS_EVENTS_URL || `${base}/analytics/api/v1/events`);
    const upstream = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-auth-token': token, 'x-client-id': process.env.QF_CLIENT_ID }, body: JSON.stringify({ events }) });
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(data);
  } catch (error) { res.status(502).json({ error: messageFrom(error), hint: 'The Analytics API requires the analytics.events.write scope to be approved for your application. You can override QF_ANALYTICS_EVENTS_URL if the documented endpoint differs for your environment.' }); }
});

app.get('/api/auth/status', (req, res) => {
  const session = sessionForRequest(req);
  res.json({ oauthEnabled: Boolean(configuredRedirectUri()), signedIn: Boolean(session), user: session?.user ? { sub: session.user.sub, name: session.user.name, preferred_username: session.user.preferred_username, picture: session.user.picture } : null, scopes: session?.scope || '' });
});

app.get('/api/auth/login', (req, res) => {
  if (!configured() || !configuredRedirectUri()) return res.status(503).json({ error: 'OAuth login is not configured yet. Set QF_REDIRECT_URI and register that exact callback URL in the Quran Foundation Developer Console.' });
  const state = randomBytes(32).toString('hex');
  const nonce = randomBytes(32).toString('hex');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  oauthRequests.set(state, { state, nonce, verifier, createdAt: Date.now() });
  for (const [key, item] of oauthRequests) if (Date.now() - item.createdAt > 10 * 60_000) oauthRequests.delete(key);
  const url = new URL(`${qfAuthHost()}/oauth2/auth`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.QF_CLIENT_ID);
  url.searchParams.set('redirect_uri', configuredRedirectUri());
  url.searchParams.set('scope', process.env.QF_OAUTH_SCOPES || 'openid offline_access user');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // State/nonce/verifier are one-use and retained server-side; the state is bound to this browser.
  setCookie(res, 'syxlor_oauth_state', state, 600);
  res.redirect(302, url.toString());
});

app.get('/api/auth/callback', async (req, res) => {
  const appUrl = String(process.env.QF_APP_URL || process.env.BASE_URL || '/').replace(/\/$/, '');
  const fail = (message) => res.redirect(`${appUrl || '/'}${appUrl.includes('?') ? '&' : '?'}auth_error=${encodeURIComponent(message)}`);
  const state = String(req.query.state || '');
  const oauthRequest = oauthRequests.get(state);
  oauthRequests.delete(state);
  if (!oauthRequest || getCookie(req, 'syxlor_oauth_state') !== state || Date.now() - oauthRequest.createdAt > 10 * 60_000) return fail('The sign-in state expired or did not match. Please try again.');
  clearCookie(res, 'syxlor_oauth_state');
  if (req.query.error) return fail(String(req.query.error_description || req.query.error));
  const code = String(req.query.code || '');
  if (!code || !configuredRedirectUri()) return fail('The OAuth callback is missing a code or redirect URI configuration.');
  try {
    const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: configuredRedirectUri(), code_verifier: oauthRequest.verifier, client_id: process.env.QF_CLIENT_ID });
    const response = await fetch(`${qfAuthHost()}/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`${process.env.QF_CLIENT_ID}:${process.env.QF_CLIENT_SECRET}`).toString('base64')}` }, body: form });
    const token = await response.json().catch(() => ({}));
    if (!response.ok || !token.access_token) return fail(token.error_description || token.error || 'Token exchange failed.');
    const user = await verifyQfIdToken(token.id_token, oauthRequest.nonce);
    const sid = randomBytes(32).toString('base64url');
    const session = { accessToken: token.access_token, refreshToken: token.refresh_token || '', expiresAt: Date.parse(token.expires_at || '') || Date.now() + Number(token.expires_in || 3600) * 1000, idToken: token.id_token || '', user, scope: token.scope || '' };
    userSessions.set(sid, session);
    setCookie(res, 'syxlor_sid', sid, 30 * 24 * 60 * 60);
    res.redirect(`${appUrl || '/'}${appUrl.includes('?') ? '&' : '?'}auth=connected`);
  } catch (error) {
    console.error('[Syxlor OAuth]', messageFrom(error));
    fail('Sign-in could not be completed. Verify the registered callback, environment, scopes, and OAuth permissions.');
  }
});

app.post('/api/auth/logout', (req, res) => {
  const sid = getCookie(req, 'syxlor_sid');
  if (sid) userSessions.delete(sid);
  clearCookie(res, 'syxlor_sid');
  res.json({ ok: true, signedIn: false });
});

// QuranReflect post mutations use an authorized user session and the separate `post` scope.
function createUserScopedClient(accessToken) {
  const prelive = !isProductionEnvironment();
  return createServerClient({
    clientId: process.env.QF_CLIENT_ID,
    clientSecret: process.env.QF_CLIENT_SECRET,
    userSession: { accessToken },
    ...(prelive ? { services: { gatewayUrl: 'https://apis-prelive.quran.foundation', oauth2BaseUrl: 'https://prelive-oauth2.quran.foundation' } } : {}),
  });
}
app.post('/api/quranreflect/posts', async (req, res) => {
  const session = sessionForRequest(req);
  if (!session) return res.status(401).json({ error: 'Connect your Quran Foundation account before sending a reflection to QuranReflect.' });
  const body = String(req.body?.body || '').trim();
  if (body.length < 6 || body.length > 10000) return res.status(400).json({ error: 'A QuranReflect reflection must contain between 6 and 10,000 characters.' });
  const draft = req.body?.draft !== false;
  const references = Array.isArray(req.body?.references) ? req.body.references.slice(0, 10).map((ref) => ({ chapterId: Number(ref.chapterId), from: Number(ref.from), to: Number(ref.to ?? ref.from) })) : [];
  if (references.some((ref) => !Number.isInteger(ref.chapterId) || ref.chapterId < 1 || ref.chapterId > 114 || !Number.isInteger(ref.from) || ref.from < 1 || !Number.isInteger(ref.to) || ref.to < ref.from)) return res.status(400).json({ error: 'Verse references must use valid chapter and verse numbers.' });
  try {
    await refreshUserSession(session);
    const posts = createUserScopedClient(session.accessToken).quranReflect?.v1?.posts;
    if (typeof posts?.create !== 'function') return res.status(501).json({ error: 'The installed Quran Foundation SDK does not expose QuranReflect post creation. Update @quranjs/api.' });
    const result = await posts.create({ body, draft, mentions: [], references });
    res.status(201).json({ result, draft, note: draft ? 'Saved as a QuranReflect draft.' : 'Submitted to QuranReflect. Publication follows your account and API permissions.' });
  } catch (error) {
    res.status(error.status || 502).json({ error: messageFrom(error), hint: 'QuranReflect requires the signed-in user to grant the `post` scope. Add `post` to QF_OAUTH_SCOPES only after it has been approved for your app, then reconnect the account.' });
  }
});
app.get('/api/quranreflect/posts/:id', async (req, res) => {
  const session = sessionForRequest(req);
  if (!session) return res.status(401).json({ error: 'Connect your Quran Foundation account first.' });
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Post ID must be a positive integer.' });
  try {
    await refreshUserSession(session);
    const posts = createUserScopedClient(session.accessToken).quranReflect?.v1?.posts;
    if (typeof posts?.get !== 'function') return res.status(501).json({ error: 'The installed Quran Foundation SDK does not expose QuranReflect post retrieval.' });
    res.json({ result: await posts.get(id) });
  } catch (error) { res.status(error.status || 502).json({ error: messageFrom(error) }); }
});
app.patch('/api/quranreflect/posts/:id', async (req, res) => {
  const session = sessionForRequest(req);
  if (!session) return res.status(401).json({ error: 'Connect your Quran Foundation account first.' });
  const id = Number(req.params.id);
  const body = String(req.body?.body || '').trim();
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Post ID must be a positive integer.' });
  if (body.length < 6 || body.length > 10000) return res.status(400).json({ error: 'Post text must contain between 6 and 10,000 characters.' });
  try {
    await refreshUserSession(session);
    const posts = createUserScopedClient(session.accessToken).quranReflect?.v1?.posts;
    if (typeof posts?.update !== 'function') return res.status(501).json({ error: 'The installed Quran Foundation SDK does not expose QuranReflect post updates.' });
    res.json({ result: await posts.update(id, { body }) });
  } catch (error) { res.status(error.status || 502).json({ error: messageFrom(error), hint: 'Updating posts requires the matching QuranReflect permission and ownership of the post.' }); }
});

app.get('/api/user/resources', (_req, res) => res.json({ items: ['bookmarks', 'collections', 'notes', 'goals', 'streaks', 'reading-sessions', 'activity-days', 'preferences', 'tags', 'app-state', 'rooms', 'posts', 'comments', 'media', 'users', 'connected-apps'] }));
app.all('/api/user/:resource', async (req, res) => {
  const method = req.method.toUpperCase();
  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return res.status(405).json({ error: 'Method not supported.' });
  try {
    const { data } = await requestUserApi(req, method, req.params.resource);
    res.json(data ?? { ok: true });
  } catch (error) { res.status(error.status || 502).json({ error: messageFrom(error), details: error.data?.type || error.data?.error || undefined, hint: 'Ensure the user approved the matching OAuth scopes, and use the same pre-live/production environment for login and user data.' }); }
});
app.all('/api/user/:resource/:recordId', async (req, res) => {
  const method = req.method.toUpperCase();
  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return res.status(405).json({ error: 'Method not supported.' });
  try {
    const { data } = await requestUserApi(req, method, req.params.resource, req.params.recordId);
    res.json(data ?? { ok: true });
  } catch (error) { res.status(error.status || 502).json({ error: messageFrom(error), details: error.data?.type || error.data?.error || undefined, hint: 'Ensure the user approved the matching OAuth scopes, and use the same pre-live/production environment for login and user data.' }); }
});


app.get('/api/config', (_req, res) => {
  res.json({ appName: 'Syxlor Deen', configured: configured(), apiConfigured: configured(), environment: (process.env.QF_ENV || 'prelive').toLowerCase(), searchEnabled: process.env.QF_SEARCH_ENABLED === 'true', translationId: Number(process.env.QF_TRANSLATION_ID || 131), oauthEnabled: Boolean(process.env.QF_REDIRECT_URI), analyticsEnabled: process.env.QF_ANALYTICS_ENABLED === 'true', prayerTimesEnabled: true });
});

const dist = path.join(__dirname, 'dist');
app.use(express.static(dist));
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(dist, 'index.html'), (error) => { if (error) next(); });
});
app.use((err, _req, res, _next) => {
  console.error('[Syxlor Deen]', err?.message || err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Syxlor Deen API/server listening on http://localhost:${PORT}`);
  if (!configured()) console.log('Quran Foundation API is in demo mode. Copy .env.example to .env and configure credentials.');
});

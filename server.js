import 'dotenv/config';
import express from 'express';
import path from 'node:path';
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'Syxlor Deen', configured: configured(), environment: (process.env.QF_ENV || 'prelive').toLowerCase(), searchEnabled: Boolean(process.env.QF_SEARCH_ENABLED === 'true') });
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
    if (id === '1') return res.json({ items: demoFatiha, source: 'demo', note: 'Sample verses for preview. Connect Quran Foundation API to fetch live content.' });
    return res.status(503).json({ error: 'Verse content is not available in demo mode. Configure Quran Foundation credentials to load it.' });
  }
  try {
    const translationId = Number(process.env.QF_TRANSLATION_ID || 131);
    const options = { words: true, ...(Number.isFinite(translationId) && translationId > 0 ? { translations: [translationId] } : {}) };
    const result = await getClient().content.v4.verses.byChapter(id, options);
    const items = normalizeList(result, ['verses', 'data']);
    res.json({ items, source: 'quran-foundation', environment: process.env.QF_ENV || 'prelive' });
  } catch (error) {
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
    const result = await getClient().search.v1.query({ query, mode: SearchMode.Quick });
    res.json({ result, source: 'quran-foundation' });
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

app.get('/api/audio/chapter/:reciter/:chapter', async (req, res) => {
  const { reciter, chapter } = req.params;
  if (!/^\d+$/.test(reciter) || !/^\d+$/.test(chapter)) return res.status(400).json({ error: 'Reciter and chapter IDs must be numeric.' });
  if (!configured()) return res.status(503).json({ error: 'Audio requires configured Quran Foundation credentials.' });
  try {
    const item = await getClient().content.v4.audio.chapterRecitation.get(reciter, chapter);
    res.json({ item, source: 'quran-foundation' });
  } catch (error) {
    res.status(502).json({ error: messageFrom(error) });
  }
});

app.get('/api/config', (_req, res) => {
  res.json({ appName: 'Syxlor Deen', apiConfigured: configured(), environment: (process.env.QF_ENV || 'prelive').toLowerCase(), searchEnabled: process.env.QF_SEARCH_ENABLED === 'true', translationId: Number(process.env.QF_TRANSLATION_ID || 131) });
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

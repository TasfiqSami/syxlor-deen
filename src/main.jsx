import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, AudioLines, Bookmark, BookMarked,
  BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Compass, Copy,
  Download, Flame, Headphones, Heart, History, Home, Languages, Leaf, ListFilter,
  LoaderCircle, LockKeyhole, Menu, Moon, MoreHorizontal, Pause, Play, Plus, Search,
  Settings2, Share2, Sparkles, Sun, Target, Timer, Volume2, X, BookText, GraduationCap,
  NotebookPen, RotateCcw, CircleCheck, FileText, Quote, Hash, ShieldCheck, Wifi, WifiOff,
  Clock3, MapPin, Navigation, ExternalLink, RefreshCw, BellRing, LocateFixed, Sunrise, Sunset,
  CalendarDays, SlidersHorizontal, CheckCircle2,
} from 'lucide-react';
import { demoChapters, demoFatiha } from './data.js';
import './styles.css';

const NAV = [
  { id: 'home', label: 'Overview', icon: Home, group: 'workspace' },
  { id: 'reader', label: 'Read Quran', icon: BookOpen, group: 'workspace' },
  { id: 'discover', label: 'Explore', icon: Compass, group: 'workspace' },
  { id: 'resources', label: 'Study libraries', icon: FileText, group: 'workspace' },
  { id: 'prayer', label: 'Prayer times', icon: Clock3, group: 'workspace' },
  { id: 'hifz', label: 'Hifz companion', icon: GraduationCap, group: 'growth' },
  { id: 'progress', label: 'Your progress', icon: Activity, group: 'growth' },
  { id: 'reflections', label: 'Reflections', icon: NotebookPen, group: 'growth' },
  { id: 'saved', label: 'Saved ayat', icon: BookMarked, group: 'growth' },
  { id: 'api', label: 'API & account', icon: SlidersHorizontal, group: 'growth' },
];
const LS = {
  bookmarks: 'syxlor.bookmarks', notes: 'syxlor.reflections', learned: 'syxlor.learned', goal: 'syxlor.goal',
  last: 'syxlor.lastRead', settings: 'syxlor.settings', activity: 'syxlor.activity',
};
function readStore(key, fallback) {
  try { const value = localStorage.getItem(key); return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
}
function saveStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function verseKey(v, chapterId) { return v?.verseKey || v?.verse_key || `${chapterId}:${v?.verseNumber || v?.verse_number || v?.id || 1}`; }
function verseArabic(v) { return v?.textUthmani || v?.text_uthmani || v?.textUthmaniTajweed || v?.text || v?.text_indopak || ''; }
function verseTranslation(v) {
  const t = v?.translations?.[0];
  if (typeof t === 'string') return t;
  return t?.text || t?.translation || v?.translation?.text || v?.translation || 'Translation unavailable for this verse in the current API response.';
}
function unwrapArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.verses)) return payload.verses;
  if (Array.isArray(payload?.chapters)) return payload.chapters;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}
function chapterName(ch) { return ch?.nameSimple || ch?.name_simple || ch?.name || `Surah ${ch?.id}`; }
function chapterTranslation(ch) { return ch?.translatedName?.name || ch?.translatedName || ch?.translated_name?.name || ch?.englishName || ''; }
function apiErrorMessage(data, fallback = 'Could not complete that request.') { return data?.error || data?.hint || data?.note || fallback; }

function App() {
  const [active, setActive] = useState('home');
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState('quick');
  const [chapters, setChapters] = useState(demoChapters);
  const [apiStatus, setApiStatus] = useState({ configured: false, environment: 'prelive', searchEnabled: false, checked: false });
  const [source, setSource] = useState('demo');
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [verses, setVerses] = useState(demoFatiha);
  const [loadingVerses, setLoadingVerses] = useState(false);
  const [readerError, setReaderError] = useState('');
  const [selectedVerse, setSelectedVerse] = useState('1:1');
  const [showTranslation, setShowTranslation] = useState(true);
  const [fontScale, setFontScale] = useState(1);
  const [bookmarks, setBookmarks] = useState(() => readStore(LS.bookmarks, []));
  const [notes, setNotes] = useState(() => readStore(LS.notes, []));
  const [learned, setLearned] = useState(() => readStore(LS.learned, []));
  const [dailyGoal, setDailyGoal] = useState(() => readStore(LS.goal, 5));
  const [lastRead, setLastRead] = useState(() => readStore(LS.last, { chapterId: 1, verse: '1:1' }));
  const [activity, setActivity] = useState(() => readStore(LS.activity, {}));
  const [settings, setSettings] = useState(() => readStore(LS.settings, { theme: 'light', arabicSize: 'regular' }));
  const [toast, setToast] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [audioState, setAudioState] = useState({ url: '', title: '', loading: false, playing: false });
  const [activeWord, setActiveWord] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchMessage, setSearchMessage] = useState('Search chapters or try a theme such as mercy, patience, or gratitude.');
  const [showSettings, setShowSettings] = useState(false);
  const [verseReciters, setVerseReciters] = useState([]);
  const [chapterReciters, setChapterReciters] = useState([]);
  const [selectedChapterReciter, setSelectedChapterReciter] = useState(() => String(readStore('syxlor.chapterReciterId', '7')));
  const [translationResources, setTranslationResources] = useState([]);
  const [tafsirResources, setTafsirResources] = useState([]);
  const [translationId, setTranslationId] = useState(() => String(readStore('syxlor.translationId', '131')));
  const [selectedVerseRecitation, setSelectedVerseRecitation] = useState(() => String(readStore('syxlor.verseRecitationId', '7')));
  const [authStatus, setAuthStatus] = useState({ oauthEnabled: false, signedIn: false, user: null });
  const audioRef = useRef(null);
  const toastTimeout = useRef(null);

  const notify = useCallback((message) => {
    setToast(message);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(''), 2800);
  }, []);

  const fetchJson = useCallback(async (url, options) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(apiErrorMessage(data, `Request failed (${response.status})`)), { status: response.status, data });
    return data;
  }, []);

  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  useEffect(() => {
    fetchJson('/api/config').then((data) => setApiStatus({ ...data, checked: true })).catch(() => setApiStatus({ configured: false, environment: 'offline', searchEnabled: false, checked: true }));
    fetchJson('/api/auth/status').then(setAuthStatus).catch(() => {});
    fetchJson('/api/audio/verse-reciters').then((data) => { const list = unwrapArray(data); setVerseReciters(list); if (list.length && !list.some((item) => String(item.id) === String(readStore('syxlor.verseRecitationId', '7')))) { setSelectedVerseRecitation(String(list[0].id)); } }).catch(() => {});
    fetchJson('/api/audio/reciters').then((data) => { const list = unwrapArray(data); setChapterReciters(list); if (list.length && !list.some((item) => String(item.id) === String(readStore('syxlor.chapterReciterId', '7')))) { setSelectedChapterReciter(String(list[0].id)); } }).catch(() => {});
    fetchJson('/api/resources').then((data) => { const items = unwrapArray(data?.catalogs?.translations); const tafsirs = unwrapArray(data?.catalogs?.tafsirs); setTranslationResources(items); setTafsirResources(tafsirs); }).catch(() => {});
    fetchJson('/api/chapters').then((data) => {
      const list = unwrapArray(data);
      if (list.length) setChapters(list);
      setSource(data.source || 'demo');
    }).catch(() => setSource('demo'));
  }, [fetchJson]);

  const activeChapter = useMemo(() => chapters.find((c) => Number(c.id) === Number(selectedChapter)) || demoChapters.find((c) => Number(c.id) === Number(selectedChapter)) || demoChapters[0], [chapters, selectedChapter]);
  const readCountToday = activity[new Date().toISOString().slice(0, 10)] || 0;
  const progressPercent = Math.min(100, Math.round((readCountToday / Math.max(1, Number(dailyGoal))) * 100));
  const bookmarkedKeys = useMemo(() => new Set(bookmarks.map((b) => b.key)), [bookmarks]);
  const todayLabel = useMemo(() => new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()), []);

  const loadVerses = useCallback(async (chapterId, targetVerse) => {
    setLoadingVerses(true); setReaderError(''); setActiveWord(null);
    try {
      const data = await fetchJson(`/api/chapters/${chapterId}/verses?translationId=${encodeURIComponent(translationId)}`);
      const list = unwrapArray(data);
      if (!list.length) throw new Error(data?.note || 'No verse content was returned for this chapter.');
      setVerses(list); setSource(data.source || source);
      const initialKey = targetVerse || verseKey(list[0], chapterId);
      setSelectedVerse(initialKey);
      setLastRead({ chapterId: Number(chapterId), verse: initialKey }); saveStore(LS.last, { chapterId: Number(chapterId), verse: initialKey });
    } catch (error) {
      if (Number(chapterId) === 1) {
        setVerses(demoFatiha); setSelectedVerse(targetVerse || '1:1');
        setReaderError(error.message || 'Showing a sample while the API is unavailable.');
      } else {
        setVerses([]); setReaderError(error.message || 'This chapter is not available in the current API environment.');
      }
    } finally { setLoadingVerses(false); }
  }, [fetchJson, source, translationId]);

  useEffect(() => {
    if (active === 'reader') loadVerses(selectedChapter, selectedVerse);
  // Reload verse data when the translation changes as well as when the reader/chapter changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, selectedChapter, translationId]);

  useEffect(() => {
    if (audioRef.current && audioState.url) {
      audioRef.current.src = audioState.url;
      audioRef.current.load();
      audioRef.current.play().then(() => setAudioState((s) => ({ ...s, playing: true }))).catch(() => setAudioState((s) => ({ ...s, playing: false })));
    }
  }, [audioState.url]);

  useEffect(() => {
    saveStore(LS.bookmarks, bookmarks);
  }, [bookmarks]);
  useEffect(() => { saveStore(LS.notes, notes); }, [notes]);
  useEffect(() => { saveStore(LS.learned, learned); }, [learned]);
  useEffect(() => { saveStore(LS.goal, dailyGoal); }, [dailyGoal]);
  useEffect(() => { saveStore(LS.activity, activity); }, [activity]);
  useEffect(() => { saveStore(LS.settings, settings); }, [settings]);
  useEffect(() => { saveStore(LS.last, lastRead); }, [lastRead]);
  useEffect(() => {
    const handleKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); }
      if (event.key === 'Escape') { setSearchOpen(false); setShowSettings(false); setMobileNav(false); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const openReader = (chapterId = selectedChapter, key) => {
    const sameChapter = Number(chapterId) === Number(selectedChapter);
    const alreadyReading = active === 'reader';
    setSelectedChapter(Number(chapterId));
    setActive('reader'); setMobileNav(false);
    if (key) setSelectedVerse(key);
    // The active-page effect loads when entering Reader or changing chapters.
    // Only call directly for an already-open Reader, where that effect won't re-run.
    if (sameChapter && alreadyReading) loadVerses(chapterId, key);
  };

  const toggleBookmark = (verse) => {
    const key = verseKey(verse, selectedChapter);
    if (bookmarkedKeys.has(key)) {
      setBookmarks((old) => old.filter((item) => item.key !== key)); notify('Removed from saved ayat');
    } else {
      setBookmarks((old) => [{ key, arabic: verseArabic(verse), translation: verseTranslation(verse), chapterId: selectedChapter, chapterName: chapterName(activeChapter), savedAt: Date.now() }, ...old]);
      notify('Ayah saved to your collection');
    }
  };

  const markRead = (verse) => {
    const key = verseKey(verse, selectedChapter);
    setSelectedVerse(key); setLastRead({ chapterId: Number(selectedChapter), verse: key });
    const today = new Date().toISOString().slice(0, 10);
    setActivity((old) => ({ ...old, [today]: Math.min(Number(dailyGoal) * 3, (old[today] || 0) + 1) }));
  };

  const playChapter = async () => {
    setAudioState((s) => ({ ...s, loading: true }));
    try {
      const response = await fetchJson('/api/audio/reciters');
      const reciters = unwrapArray(response);
      if (!reciters.length) throw new Error(response.note || 'No reciters are available in this environment.');
      const reciter = reciters.find((r) => String(r.id) === String(selectedChapterReciter)) || reciters[0];
      const result = await fetchJson(`/api/audio/chapter/${reciter.id}/${selectedChapter}`);
      const item = result.item || result.audio || result;
      const url = item.audioUrl || item.audio_url || item.url;
      if (!url) throw new Error('The recitation response did not include an audio URL.');
      setAudioState({ url, title: `${chapterName(activeChapter)} · ${reciter.reciterName || reciter.name || 'Quran recitation'}`, loading: false, playing: true });
    } catch (error) {
      setAudioState((s) => ({ ...s, loading: false })); notify(error.message || 'Audio is not available in this environment.');
    }
  };

  const playVerse = async (verse) => {
    const key = verseKey(verse, selectedChapter);
    setAudioState((old) => ({ ...old, loading: true }));
    try {
      let choices = verseReciters;
      if (!choices.length) {
        const data = await fetchJson('/api/audio/verse-reciters');
        choices = unwrapArray(data); setVerseReciters(choices);
      }
      if (!choices.length) throw new Error('Ayah recitations are not available in this environment. Check Content API permissions and audio resources.');
      const reciter = choices.find((item) => String(item.id) === String(selectedVerseRecitation)) || choices[0];
      const data = await fetchJson(`/api/audio/verse/${reciter.id}/${key.replace(':', '-')}`);
      const item = data.item || data.audio || data;
      const url = item.audioUrl || item.audio_url || item.url;
      if (!url) throw new Error('No audio file was returned for this ayah.');
      setAudioState({ url, title: `${key} · ${reciter.reciterName || reciter.reciter_name || reciter.name || 'Ayah recitation'}`, kind: 'verse', loading: false, playing: true });
    } catch (error) { setAudioState((old) => ({ ...old, loading: false })); notify(error.message || 'Verse audio is unavailable.'); }
  };

  const playWord = async (verse, index) => {
    const key = verseKey(verse, selectedChapter);
    setAudioState((old) => ({ ...old, loading: true }));
    try {
      const data = await fetchJson(`/api/audio/word/${key.replace(':', '-')}/${Number(index) + 1}`);
      const url = data.item?.audioUrl || data.item?.audio_url;
      if (!url) throw new Error('Word pronunciation audio is not available for this word.');
      setAudioState({ url, title: `${key} · Word ${Number(index) + 1}`, kind: 'word', loading: false, playing: true });
    } catch (error) { setAudioState((old) => ({ ...old, loading: false })); notify(error.message || 'Word audio is unavailable.'); }
  };

  const runSearch = async (term = query, mode = searchMode) => {
    const clean = term.trim();
    if (!clean) { setSearchResults([]); setSearchMessage('Search chapters or try a theme such as mercy, patience, or gratitude.'); return; }
    setSearchBusy(true); setSearchMessage('Searching available Quran Foundation resources…');
    try {
      const data = await fetchJson(`/api/search?q=${encodeURIComponent(clean)}&mode=${encodeURIComponent(mode)}`);
      const root = data.result || data;
      const candidates = [
        root, root?.results, root?.verses, root?.matches, root?.data, root?.search?.results,
        root?.results?.verses, root?.results?.verse_results, root?.results?.items,
        root?.data?.verses, root?.data?.results, root?.data?.items,
        root?.verseResults, root?.verse_results, root?.verses?.results,
      ];
      let results = candidates.find(Array.isArray) || [];
      if (!results.length && root?.navigation && typeof root.navigation === 'object') {
        results = Object.entries(root.navigation).flatMap(([kind, value]) => {
          const rows = Array.isArray(value) ? value : Array.isArray(value?.results) ? value.results : Array.isArray(value?.items) ? value.items : [];
          return rows.map((item) => ({ ...item, _chapter: /chapter|surah/i.test(kind), _navigationKind: kind }));
        });
      }
      setSearchResults(results.slice(0, 20));
      setSearchMessage(results.length ? `Found ${results.length} available result${results.length === 1 ? '' : 's'}${data.mode ? ` · ${data.mode} search` : ''}.` : 'The API returned no results for this search.');
    } catch (error) {
      const chapterHits = chapters.filter((c) => `${chapterName(c)} ${chapterTranslation(c)} ${c.id}`.toLowerCase().includes(clean.toLowerCase())).slice(0, 12);
      const verseHits = demoFatiha.filter((v) => `${verseArabic(v)} ${verseTranslation(v)} ${v.verseKey}`.toLowerCase().includes(clean.toLowerCase())).map((v) => ({ ...v, verse_key: v.verseKey, text: v.textUthmani, snippet: verseTranslation(v), _demo: true }));
      setSearchResults([...verseHits, ...chapterHits.map((c) => ({ ...c, _chapter: true, title: chapterName(c), snippet: chapterTranslation(c) }))]);
      setSearchMessage(`${error.message} Showing matching chapter names and available preview verses instead.`);
    } finally { setSearchBusy(false); }
  };

  const addReflection = () => {
    if (!noteDraft.trim()) { notify('Write a small reflection first'); return; }
    const note = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title: noteTitle.trim() || 'A moment to reflect', body: noteDraft.trim(), date: new Date().toISOString(), verse: selectedVerse };
    setNotes((old) => [note, ...old]); setNoteDraft(''); setNoteTitle(''); notify('Reflection saved on this device');
  };

  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); notify('Copied to clipboard'); }
    catch { notify('Clipboard permission is unavailable in this browser'); }
  };

  const exportNotes = () => {
    const body = notes.map((n) => `# ${n.title}\n${new Date(n.date).toLocaleString()} · ${n.verse || 'Personal reflection'}\n\n${n.body}`).join('\n\n---\n\n');
    const blob = new Blob([body || 'No reflections saved yet.'], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'syxlor-deen-reflections.md'; a.click(); URL.revokeObjectURL(url); notify('Export prepared');
  };

  const renderSidebar = () => <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
    <div className="brand-lockup">
      <div className="brand-mark"><span className="brand-crescent">☾</span><span className="brand-dot" /></div>
      <div><div className="brand-name">syxlor<span>deen</span></div><div className="brand-subtitle">A return to what matters</div></div>
      <button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button>
    </div>
    <div className="sidebar-scroll">
      <div className="nav-heading">YOUR SPACE</div>
      {NAV.filter((item) => item.group === 'workspace').map((item) => <NavButton key={item.id} item={item} active={active === item.id} onClick={() => { setActive(item.id); setMobileNav(false); }} />)}
      <div className="nav-heading nav-heading-spaced">GROW WITH THE QURAN</div>
      {NAV.filter((item) => item.group === 'growth').map((item) => <NavButton key={item.id} item={item} active={active === item.id} onClick={() => { setActive(item.id); setMobileNav(false); }} badge={item.id === 'saved' && bookmarks.length ? bookmarks.length : null} />)}
      <div className="sidebar-journey">
        <div className="journey-top"><span className="journey-icon"><Sparkles size={16} /></span><span>YOUR DAILY INTENTION</span></div>
        <p>Small, sincere steps. A heart that keeps returning.</p>
        <button onClick={() => setActive('hifz')}>Continue journey <ArrowRight size={14} /></button>
      </div>
    </div>
    <div className="sidebar-footer">
      <div className="api-light"><span className={`status-dot ${apiStatus.configured ? 'online' : 'offline'}`} /> <span>{apiStatus.configured ? 'Quran API connected' : 'Preview mode'}</span></div>
      <button className="user-profile" onClick={() => setShowSettings(true)}><div className="avatar">S</div><div className="profile-copy"><strong>Your space</strong><span>Saved on this device</span></div><MoreHorizontal size={18} /></button>
    </div>
  </aside>;

  return <div className={`app-shell ${settings.theme === 'dark' ? 'theme-dark' : ''}`}>
    {mobileNav && <button aria-label="Close navigation backdrop" className="mobile-backdrop" onClick={() => setMobileNav(false)} />}
    {renderSidebar()}
    <main className="main-panel">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20} /></button>
        <div className="breadcrumb"><span>Syxlor Deen</span><ChevronRight size={14} /><strong>{NAV.find((n) => n.id === active)?.label || (active === 'progress' ? 'Your progress' : 'Your space')}</strong></div>
        <div className="topbar-actions">
          <button className="search-trigger" onClick={() => { setSearchOpen(true); setSearchResults([]); }}><Search size={16} /><span>Search Quran, topics...</span><kbd>⌘ K</kbd></button>
          <button className="icon-button theme-toggle" onClick={() => setSettings((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))} aria-label="Toggle appearance">{settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
          <button className="icon-button settings-trigger" onClick={() => setShowSettings(true)} aria-label="Settings"><Settings2 size={18} /></button>
        </div>
      </header>

      <div className="page-content" key={active}>
        {active === 'home' && <HomePage todayLabel={todayLabel} chapter={activeChapter} lastRead={lastRead} chapters={chapters} dailyGoal={dailyGoal} setDailyGoal={setDailyGoal} readCount={readCountToday} progressPercent={progressPercent} bookmarks={bookmarks} notes={notes} learned={learned} apiStatus={apiStatus} source={source} onRead={() => openReader(lastRead.chapterId || 1, lastRead.verse)} onOpenReader={openReader} onNavigate={setActive} notify={notify} />}
        {active === 'reader' && <ReaderPage chapters={chapters} activeChapter={activeChapter} selectedChapter={selectedChapter} setSelectedChapter={setSelectedChapter} verses={verses} loading={loadingVerses} error={readerError} selectedVerse={selectedVerse} setSelectedVerse={setSelectedVerse} bookmarks={bookmarkedKeys} toggleBookmark={toggleBookmark} showTranslation={showTranslation} setShowTranslation={setShowTranslation} fontScale={fontScale} setFontScale={setFontScale} markRead={markRead} playChapter={playChapter} playVerse={playVerse} playWord={playWord} audioLoading={audioState.loading} verseReciters={verseReciters} selectedVerseRecitation={selectedVerseRecitation} setSelectedVerseRecitation={(id) => { setSelectedVerseRecitation(String(id)); saveStore('syxlor.verseRecitationId', String(id)); }} chapterReciters={chapterReciters} selectedChapterReciter={selectedChapterReciter} setSelectedChapterReciter={(id) => { setSelectedChapterReciter(String(id)); saveStore('syxlor.chapterReciterId', String(id)); }} onSearch={() => setSearchOpen(true)} loadVerses={loadVerses} onNotify={notify} activeWord={activeWord} setActiveWord={setActiveWord} source={source} translationResources={translationResources} tafsirResources={tafsirResources} translationId={translationId} setTranslationId={(id) => { const next = String(id); setTranslationId(next); saveStore('syxlor.translationId', next); }} />}
        {active === 'discover' && <DiscoverPage chapters={chapters} onRead={openReader} onSearch={(term) => { setQuery(term); setSearchOpen(true); runSearch(term); }} />}
        {active === 'resources' && <ResourcesPage onRead={openReader} notify={notify} />}
        {active === 'prayer' && <PrayerTimesPage notify={notify} />}
        {active === 'api' && <ApiExplorerPage apiStatus={apiStatus} authStatus={authStatus} setAuthStatus={setAuthStatus} notify={notify} onRead={openReader} />}
        {active === 'hifz' && <HifzPage learned={learned} setLearned={setLearned} chapters={chapters} onRead={openReader} notify={notify} />}
        {active === 'reflections' && <ReflectionsPage notes={notes} noteDraft={noteDraft} setNoteDraft={setNoteDraft} noteTitle={noteTitle} setNoteTitle={setNoteTitle} addReflection={addReflection} exportNotes={exportNotes} deleteNote={(id) => { setNotes((n) => n.filter((x) => x.id !== id)); notify('Reflection deleted'); }} selectedVerse={selectedVerse} authStatus={authStatus} notify={notify} />}
        {active === 'saved' && <SavedPage bookmarks={bookmarks} removeBookmark={(key) => { setBookmarks((old) => old.filter((x) => x.key !== key)); notify('Removed from saved ayat'); }} onRead={openReader} copyText={copyText} />}
        {active === 'progress' && <ProgressPage dailyGoal={dailyGoal} setDailyGoal={setDailyGoal} readCount={readCountToday} progressPercent={progressPercent} activity={activity} learned={learned} bookmarks={bookmarks} notes={notes} onNavigate={setActive} />}
      </div>
      <footer className="app-footer"><span>Made with intention by <strong>Syxlor</strong></span><span><span className="footer-dot">✦</span> A space for reflection, not a replacement for trusted scholarship.</span></footer>
    </main>

    {audioState.url && <div className="audio-dock"><div className="audio-art"><AudioLines size={21} /></div><div className="audio-meta"><strong>{audioState.title || 'Quran recitation'}</strong><span>Now playing · {audioState.kind === 'verse' ? 'Ayah recitation' : audioState.kind === 'word' ? 'Word pronunciation' : 'Chapter recitation'}</span></div><audio ref={audioRef} controls onPlay={() => setAudioState((s) => ({ ...s, playing: true }))} onPause={() => setAudioState((s) => ({ ...s, playing: false }))} onEnded={() => setAudioState((s) => ({ ...s, playing: false }))} /><button className="icon-button" onClick={() => { audioRef.current?.pause(); setAudioState({ url: '', title: '', kind: 'chapter', loading: false, playing: false }); }} aria-label="Close audio player"><X size={17} /></button></div>}
    {searchOpen && <SearchModal query={query} setQuery={setQuery} searchMode={searchMode} setSearchMode={setSearchMode} onClose={() => setSearchOpen(false)} onSearch={(term) => runSearch(term, searchMode)} busy={searchBusy} results={searchResults} message={searchMessage} chapters={chapters} onRead={(chapterId, key) => { setSearchOpen(false); openReader(chapterId, key); }} />}
    {showSettings && <SettingsModal settings={settings} setSettings={setSettings} apiStatus={apiStatus} onClose={() => setShowSettings(false)} onOpenProgress={() => { setActive('progress'); setShowSettings(false); }} />}
    {toast && <div className="toast" role="status"><CircleCheck size={17} />{toast}</div>}
  </div>;
}

function NavButton({ item, active, onClick, badge }) {
  const Icon = item.icon;
  return <button className={`nav-item ${active ? 'nav-active' : ''}`} onClick={onClick}><Icon size={18} strokeWidth={active ? 2.2 : 1.8} /><span>{item.label}</span>{badge ? <span className="nav-badge">{badge}</span> : active ? <span className="nav-active-dot" /> : null}</button>;
}

function SectionTitle({ eyebrow, title, subtitle, action }) {
  return <div className="section-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

function HomePage({ todayLabel, lastRead, chapters, dailyGoal, setDailyGoal, readCount, progressPercent, bookmarks, notes, learned, apiStatus, source, onRead, onOpenReader, onNavigate, notify }) {
  const last = chapters.find((c) => Number(c.id) === Number(lastRead.chapterId)) || demoChapters[0];
  const [dailyIntention, setDailyIntention] = useState(() => localStorage.getItem('syxlor.intention') || 'Read with presence');
  const [dailyVerse, setDailyVerse] = useState({ verseKey: '20:114', textUthmani: 'رَبِّ زِدْنِي عِلْمًا', translations: [{ text: 'My Lord, increase me in knowledge.' }] });
  const [randomVerseBusy, setRandomVerseBusy] = useState(false);
  const refreshDailyVerse = async () => {
    setRandomVerseBusy(true);
    try {
      const response = await fetch('/api/verses/random');
      const data = await response.json();
      if (!response.ok && !data.item) throw new Error(data.error || 'Could not retrieve a random verse.');
      if (data.item) setDailyVerse(data.item);
    } catch (error) { notify(error.message || 'Could not retrieve a new verse.'); }
    finally { setRandomVerseBusy(false); }
  };
  useEffect(() => { refreshDailyVerse(); }, []);
  const dailyVerseKey = dailyVerse.verseKey || dailyVerse.verse_key || '20:114';
  const dailyVerseParts = dailyVerseKey.split(':');
  const dailyVerseChapter = chapters.find((c) => Number(c.id) === Number(dailyVerseParts[0]));
  const intentions = ['Read with presence', 'Learn one new word', 'Reflect with gratitude', 'Revise what I know'];
  const chooseIntention = (item) => { setDailyIntention(item); localStorage.setItem('syxlor.intention', item); notify('Your intention has been set'); };
  return <div className="home-page view-enter">
    <div className="welcome-row"><div><div className="eyebrow welcome-eyebrow"><span className="eyebrow-spark">✧</span> YOUR SPACE TO RETURN</div><h1>Assalamu alaikum<span className="greeting-dot">.</span></h1><p className="welcome-subtitle">A little time with the Quran can change the shape of your day.</p></div><div className="date-chip"><span className="date-moon">☾</span><div><strong>{todayLabel}</strong><span>Make today meaningful</span></div></div></div>
    <section className="hero-card">
      <div className="hero-noise" /><div className="hero-glow hero-glow-one" /><div className="hero-glow hero-glow-two" />
      <div className="hero-content"><div className="hero-kicker"><Sparkles size={14} /> A MOMENT WITH THE QURAN</div><h2>Come closer,<br /><em>one ayah at a time.</em></h2><p>Find stillness in recitation, clarity in reflection, and consistency in the small things.</p><div className="hero-actions"><button className="button button-gold" onClick={onRead}><BookOpen size={17} /> Continue reading <ArrowRight size={16} /></button><button className="button button-glass" onClick={() => onNavigate('discover')}><Compass size={16} /> Explore Quran</button></div><div className="hero-footnote"><span className="hero-line" /> Your journey, at your pace</div></div>
      <div className="hero-art" aria-hidden="true"><div className="art-arch art-arch-outer" /><div className="art-arch art-arch-mid" /><div className="art-arch art-arch-inner" /><div className="art-moon">☾</div><div className="art-star star-one">✦</div><div className="art-star star-two">✧</div><div className="art-star star-three">·</div><div className="art-glow" /><div className="art-book"><div className="book-page page-left"><span /><span /><span /><span /><span /></div><div className="book-page page-right"><span /><span /><span /><span /><span /></div><div className="book-spine" /></div><div className="art-pedestal" /></div>
      <div className="hero-corner">سُبْحَانَ اللَّهِ</div>
    </section>

    <div className="daily-grid">
      <div className="daily-progress card-surface"><div className="card-heading"><div><span className="eyebrow">YOUR DAILY RHYTHM</span><h3>A little, every day.</h3></div><div className="circle-icon icon-emerald"><Target size={19} /></div></div><div className="progress-main"><div className="progress-ring" style={{ '--progress': `${progressPercent}%` }}><div className="progress-ring-inner"><strong>{progressPercent}%</strong><span>today</span></div></div><div className="progress-summary"><strong>{readCount} of {dailyGoal} ayat</strong><span>{progressPercent >= 100 ? 'Your daily intention is complete.' : 'Every small step counts. Keep your pace gentle.'}</span><div className="mini-progress"><span style={{ width: `${progressPercent}%` }} /></div></div></div><div className="goal-controls"><span>Daily ayah goal</span><div className="stepper"><button onClick={() => setDailyGoal((g) => Math.max(1, Number(g) - 1))} aria-label="Decrease daily goal">−</button><strong>{dailyGoal}</strong><button onClick={() => setDailyGoal((g) => Math.min(50, Number(g) + 1))} aria-label="Increase daily goal">+</button></div></div></div>
      <div className="last-read card-surface"><div className="card-heading"><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h3>Your last reading</h3></div><div className="circle-icon icon-sand"><History size={19} /></div></div><div className="last-read-chapter"><div className="surah-number">{last.id || 1}</div><div className="last-read-copy"><strong>{chapterName(last)}</strong><span>{chapterTranslation(last) || 'Continue your reading'} · Ayah {String(lastRead.verse || '1:1').split(':')[1] || 1}</span></div><div className="last-arabic">{last.id === 1 ? 'الْفَاتِحَة' : 'الْقُرْآن'}</div></div><button className="text-link" onClick={onRead}>Continue reading <ArrowRight size={15} /></button></div>
    </div>

    <div className="home-lower-grid">
      <section className="quick-journey"><SectionTitle eyebrow="YOUR NEXT STEP" title="Choose your intention" subtitle="There is no perfect pace. Just a sincere return." /><div className="intention-list">{intentions.map((item, i) => <button key={item} onClick={() => chooseIntention(item)} className={`intention-row ${dailyIntention === item ? 'intention-selected' : ''}`}><span className={`intention-number intention-n-${i}`}>{['01','02','03','04'][i]}</span><span className="intention-label">{item}</span>{dailyIntention === item ? <span className="intention-check"><Check size={14} /></span> : <ArrowDownRight size={16} className="intention-arrow" />}</button>)}</div></section>
      <section className="daily-verse card-surface"><div className="verse-card-header"><span className="verse-ribbon"><Quote size={14} /> A VERSE TO SIT WITH</span><button className="icon-button mini-icon" onClick={refreshDailyVerse} disabled={randomVerseBusy} aria-label="Get another random verse">{randomVerseBusy ? <LoaderCircle className="spin" size={16}/> : <RotateCcw size={16}/>}</button></div><div className="verse-arabic">{verseArabic(dailyVerse) || 'رَبِّ زِدْنِي عِلْمًا'}</div><p className="verse-translation">“{verseTranslation(dailyVerse) || 'My Lord, increase me in knowledge.'}”</p><div className="verse-reference"><span>{dailyVerseChapter ? chapterName(dailyVerseChapter) : `Surah ${dailyVerseParts[0]}`} · {dailyVerseKey}</span><span className="verse-gold-dot" /></div><div className="verse-card-footer"><span>Take a breath. Reflect. Return.</span><button className="icon-button" onClick={() => { onOpenReader(Number(dailyVerseParts[0]) || 1, dailyVerseKey); }} aria-label="Open verse"><ArrowRight size={17} /></button></div></section>
    </div>
    <div className="feature-strip"><button className="feature-tile" onClick={() => onNavigate('hifz')}><div className="feature-icon feature-icon-gold"><GraduationCap size={20} /></div><div><strong>Memorize gently</strong><span>Build a revision habit</span></div><ArrowRight size={16} /></button><button className="feature-tile" onClick={() => onNavigate('reflections')}><div className="feature-icon feature-icon-green"><NotebookPen size={20} /></div><div><strong>Reflect & write</strong><span>Capture what stays with you</span></div><ArrowRight size={16} /></button><button className="feature-tile" onClick={() => onNavigate('saved')}><div className="feature-icon feature-icon-rose"><Bookmark size={20} /></div><div><strong>Your saved ayat</strong><span>{bookmarks.length} verses kept close</span></div><ArrowRight size={16} /></button><button className="feature-tile" onClick={() => onNavigate('progress')}><div className="feature-icon feature-icon-blue"><Activity size={20} /></div><div><strong>Your progress</strong><span>{learned.length} revisions marked · {notes.length} reflections</span></div><ArrowRight size={16} /></button></div>
    <div className="connection-note"><span className={`status-dot ${apiStatus.configured ? 'online' : 'offline'}`} /><span>{apiStatus.configured ? `Connected to Quran Foundation · ${apiStatus.environment || 'prelive'} environment` : 'Interactive preview · connect Quran Foundation credentials to load live Quran content'} </span><span className="source-pill">{source === 'quran-foundation' ? 'LIVE CONTENT' : 'PREVIEW DATA'}</span></div>
  </div>;
}

function ReaderPage({ chapters, activeChapter, selectedChapter, setSelectedChapter, verses, loading, error, selectedVerse, setSelectedVerse, bookmarks, toggleBookmark, showTranslation, setShowTranslation, fontScale, setFontScale, markRead, playChapter, playVerse, playWord, audioLoading, verseReciters, selectedVerseRecitation, setSelectedVerseRecitation, chapterReciters, selectedChapterReciter, setSelectedChapterReciter, onSearch, loadVerses, onNotify, activeWord, setActiveWord, source, translationResources, tafsirResources, translationId, setTranslationId }) {
  const [chapterQuery, setChapterQuery] = useState('');
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const [studyBusy, setStudyBusy] = useState(false);
  const [studyData, setStudyData] = useState(null);
  const [studyTafsirId, setStudyTafsirId] = useState('');
  const filteredChapters = chapters.filter((c) => `${chapterName(c)} ${chapterTranslation(c)} ${c.id}`.toLowerCase().includes(chapterQuery.toLowerCase()));
  const currentIndex = Math.max(0, chapters.findIndex((c) => Number(c.id) === Number(selectedChapter)));
  const selectedVerseObj = verses.find((v) => verseKey(v, selectedChapter) === selectedVerse);
  useEffect(() => { setStudyData(null); setStudyOpen(false); }, [selectedVerse]);
  const goPrev = () => { const next = chapters[Math.max(0, currentIndex - 1)]; if (next) setSelectedChapter(Number(next.id)); };
  const goNext = () => { const next = chapters[Math.min(chapters.length - 1, currentIndex + 1)]; if (next) setSelectedChapter(Number(next.id)); };
  const loadVerseStudy = async () => {
    if (!/^\d{1,3}:\d{1,3}$/.test(selectedVerse || '')) { onNotify('Choose a valid ayah first.'); return; }
    const [chapter, ayah] = selectedVerse.split(':');
    const params = new URLSearchParams({ translations: String(translationId || ''), words: 'true' });
    if (studyTafsirId) params.set('tafsirs', studyTafsirId);
    setStudyOpen(true); setStudyBusy(true); setStudyData(null);
    try {
      const response = await fetch(`/api/content/verse/${chapter}-${ayah}?${params}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.hint || `Study lookup failed (${response.status}).`);
      setStudyData(data.result || data);
    } catch (error) { setStudyData({ error: error.message, hint: 'Live verse variants and tafsir require a configured Content API environment and an available resource.' }); }
    finally { setStudyBusy(false); }
  };
  const studyRoot = studyData?.verse || studyData?.data?.verse || studyData?.data || studyData;
  const studyTranslations = Array.isArray(studyRoot?.translations) ? studyRoot.translations : Array.isArray(studyRoot?.verse?.translations) ? studyRoot.verse.translations : [];
  const studyTafsirs = Array.isArray(studyRoot?.tafsirs) ? studyRoot.tafsirs : Array.isArray(studyRoot?.verse?.tafsirs) ? studyRoot.verse.tafsirs : [];
  const studyText = (item) => String(typeof item === 'string' ? item : item?.text || item?.content || item?.body || item?.translation || item?.name || '').replace(/<\/?[a-z][^>]*>/gi, ' ').replace(/\s+/g, ' ').trim();
  return <div className="reader-page view-enter"><div className="reader-intro"><div><div className="eyebrow"><BookOpen size={13} /> QURAN READER</div><h1>A moment with the <em>Quran.</em></h1><p>Read at your own pace. Let each ayah have the space it deserves.</p></div><div className="reader-source-badge"><span className={`status-dot ${source === 'quran-foundation' ? 'online' : 'offline'}`} />{source === 'quran-foundation' ? 'Quran Foundation' : 'Preview content'}</div></div>
    <div className="reader-toolbar card-surface"><button className="chapter-select" onClick={() => setChapterPickerOpen((x) => !x)}><div className="surah-number">{activeChapter.id}</div><div><strong>{chapterName(activeChapter)}</strong><span>{chapterTranslation(activeChapter) || 'Surah'} · {activeChapter.versesCount || activeChapter.verses_count || '—'} ayat</span></div><ChevronDown size={17} className={chapterPickerOpen ? 'rotated' : ''} /></button><div className="reader-tool-actions"><button className="tool-button" onClick={onSearch}><Search size={16} /><span>Find ayah</span></button><button className={`tool-button ${showTranslation ? 'tool-selected' : ''}`} onClick={() => setShowTranslation((v) => !v)}><Languages size={16} /><span>Translation</span></button><div className="font-control"><button onClick={() => setFontScale((s) => Math.max(.8, +(s - .1).toFixed(1)))} aria-label="Decrease font size">A−</button><span>{Math.round(fontScale * 100)}%</span><button onClick={() => setFontScale((s) => Math.min(1.8, +(s + .1).toFixed(1)))} aria-label="Increase font size">A+</button></div>{translationResources?.length > 0 && <label className="translation-select" aria-label="Quran translation"><Languages size={14}/><select value={translationId} onChange={(e) => setTranslationId(e.target.value)} title="Choose a translation">{translationResources.map((r) => <option key={r.id} value={String(r.id)}>{r.name || r.translatedName?.name || r.translated_name?.name || r.authorName || r.author_name || `Translation ${r.id}`}{r.languageName || r.language_name ? ` · ${r.languageName || r.language_name}` : ''}</option>)}</select></label>}{verseReciters.length > 0 && <label className="reciter-select" aria-label="Ayah reciter"><Headphones size={14}/><select value={selectedVerseRecitation} onChange={(e) => setSelectedVerseRecitation(e.target.value)} title="Choose ayah reciter">{verseReciters.map((r) => <option key={r.id} value={String(r.id)}>{r.reciterName || r.reciter_name || r.name || `Reciter ${r.id}`}</option>)}</select></label>}{chapterReciters.length > 0 && <label className="reciter-select" aria-label="Chapter reciter"><AudioLines size={14}/><select value={selectedChapterReciter} onChange={(e) => setSelectedChapterReciter(e.target.value)} title="Choose chapter reciter">{chapterReciters.map((r) => <option key={r.id} value={String(r.id)}>{r.reciterName || r.reciter_name || r.name || `Chapter reciter ${r.id}`}</option>)}</select></label>}</div></div>
    {chapterPickerOpen && <div className="chapter-picker card-surface"><div className="picker-search"><Search size={16} /><input value={chapterQuery} onChange={(e) => setChapterQuery(e.target.value)} placeholder="Find a surah..." autoFocus /><span>{filteredChapters.length} surahs</span></div><div className="chapter-picker-list">{filteredChapters.map((c) => <button key={c.id} className={Number(c.id) === Number(selectedChapter) ? 'picker-chapter active' : 'picker-chapter'} onClick={() => { setSelectedChapter(Number(c.id)); setChapterPickerOpen(false); setChapterQuery(''); }}><span className="surah-number small-number">{c.id}</span><span><strong>{chapterName(c)}</strong><small>{chapterTranslation(c)}</small></span><span className="picker-meta">{c.versesCount || c.verses_count || '—'} ayat</span>{Number(c.id) === Number(selectedChapter) && <Check size={16} />}</button>)}</div></div>}
    <div className="reader-navigation"><button className="text-link" onClick={goPrev} disabled={currentIndex === 0}><ChevronLeft size={15} /> Previous surah</button><span className="reader-progress-text">Surah {selectedChapter} <span>of</span> 114</span><button className="text-link" onClick={goNext} disabled={currentIndex >= chapters.length - 1}>Next surah <ChevronRight size={15} /></button></div>
    <div className="bismillah-card"><div className="bismillah-ornament">✧</div><div>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div><span>In the name of Allah, the Most Compassionate, the Most Merciful</span><div className="bismillah-ornament">✧</div></div>
    {error && <div className="inline-notice"><CircleHelp size={17} /><span>{error}</span></div>}
    {loading ? <div className="loading-panel card-surface"><LoaderCircle className="spin" size={24} /><strong>Preparing your reading space</strong><span>Fetching chapter content...</span></div> : verses.length ? <div className="verses-list">{verses.map((verse, index) => { const key = verseKey(verse, selectedChapter); const isSelected = selectedVerse === key; const words = Array.isArray(verse.words) ? verse.words : []; return <article key={key} className={`verse-row ${isSelected ? 'verse-row-selected' : ''}`} onClick={() => { setSelectedVerse(key); markRead(verse); }}><div className="verse-row-top"><span className="verse-key"><span className="verse-key-mark">✧</span>{key}</span><div className="verse-actions"><button className={`verse-action ${bookmarks.has(key) ? 'is-bookmarked' : ''}`} onClick={(e) => { e.stopPropagation(); toggleBookmark(verse); }} aria-label={bookmarks.has(key) ? 'Remove bookmark' : 'Bookmark verse'}><Bookmark size={16} fill={bookmarks.has(key) ? 'currentColor' : 'none'} /></button><button className="verse-action" onClick={(e) => { e.stopPropagation(); playVerse(verse); }} aria-label="Play verse audio"><Play size={15} /></button><button className="verse-action" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(`${verseArabic(verse)}\n${verseTranslation(verse)}\n— ${key}`).then(() => onNotify('Ayah copied')).catch(() => onNotify('Clipboard unavailable')); }} aria-label="Copy verse"><Copy size={15} /></button></div></div><div className="verse-arabic-line" dir="rtl" style={{ fontSize: `${2.12 * fontScale}rem` }}>{words.length ? words.map((word, wi) => <button key={`${key}-w-${wi}`} className={`arabic-word ${activeWord?.key === key && activeWord?.index === wi ? 'word-active' : ''}`} onClick={(e) => { e.stopPropagation(); setActiveWord({ key, index: wi, word }); }} title="Explore this word">{word.textUthmani || word.text_uthmani || word.text || word.charTypeName || ''}</button>) : verseArabic(verse)}<span className="ayah-end">۞<small>{String(key).split(':')[1]}</small></span></div>{showTranslation && <p className="verse-translation-line">{verseTranslation(verse)}</p>}{activeWord?.key === key && <div className="word-detail"><div><strong>{activeWord.word.translation?.text || activeWord.word.translation?.name || activeWord.word.translations?.[0]?.text || activeWord.word.text || 'Selected word'}</strong>{(activeWord.word.transliteration?.text || activeWord.word.transliteration) && <em>{activeWord.word.transliteration?.text || activeWord.word.transliteration}</em>}<span>{activeWord.word.root || activeWord.word.rootArabic ? `Root: ${activeWord.word.root || activeWord.word.rootArabic}` : 'Word-level meaning and transliteration depend on the selected resource.'}</span></div><button className="word-audio-button" onClick={(e) => { e.stopPropagation(); playWord(verse, activeWord.index); }} aria-label="Hear word pronunciation"><Volume2 size={15}/><span>Hear word</span></button><button onClick={(e) => { e.stopPropagation(); setActiveWord(null); }} aria-label="Close word details"><X size={15} /></button></div>}<div className="verse-row-bottom"><span>{isSelected ? <><span className="selected-indicator" /> Currently selected</> : `Ayah ${String(key).split(':')[1]}`}</span>{isSelected && <span className="verse-reading-status"><Check size={13} /> Added to your reading activity</span>}</div></article>; })}</div> : <div className="empty-state card-surface"><BookOpen size={29} /><h3>This chapter isn't available in the current environment</h3><p>New Quran Foundation projects start with pre-live content for Al-Fatihah and Al-Baqarah. Production access enables the full Quran.</p><button className="button button-primary" onClick={() => setSelectedChapter(1)}>Open Al-Fatihah</button></div>}
    <section className="ayah-study-launch"><div><span className="eyebrow">GO DEEPER</span><strong>Study the selected ayah</strong><p>Request available translation variants, word details and a chosen tafsir from Quran Foundation.</p></div><button className="button button-secondary" onClick={loadVerseStudy} disabled={studyBusy}>{studyBusy ? <LoaderCircle className="spin" size={15}/> : <BookText size={15}/>} {studyBusy ? 'Loading study data…' : 'Open ayah study'}</button></section>
    {studyOpen && <section className="ayah-study-panel card-surface"><div className="ayah-study-panel-head"><div><span className="eyebrow">AYAH STUDY</span><h3>{selectedVerse}</h3><p>Source-returned material only. Resource availability varies by environment and rights.</p></div><button className="icon-button" onClick={() => setStudyOpen(false)} aria-label="Close ayah study"><X size={17}/></button></div><div className="ayah-study-controls"><label><span>Tafsir resource</span><select value={studyTafsirId} onChange={(e) => setStudyTafsirId(e.target.value)}><option value="">No tafsir selected</option>{tafsirResources.map((resource) => <option value={String(resource.id)} key={resource.id}>{resource.name || resource.translatedName?.name || resource.translated_name?.name || `Tafsir ${resource.id}`}</option>)}</select></label><button className="button button-primary button-small" onClick={loadVerseStudy} disabled={studyBusy}>{studyBusy ? <LoaderCircle className="spin" size={14}/> : <RefreshCw size={14}/>} Refresh study</button></div>{studyBusy ? <div className="monthly-loading"><LoaderCircle className="spin" size={16}/> Loading available verse resources…</div> : studyData?.error ? <div className="inline-notice"><CircleHelp size={16}/><span>{studyData.error} {studyData.hint || ''}</span></div> : <div className="ayah-study-columns"><article><h4>Translation variants</h4>{studyTranslations.length ? studyTranslations.map((item, idx) => <div className="ayah-study-entry" key={item.id || idx}><span>{item.resourceName || item.resource_name || item.name || item.languageName || item.language_name || `Translation ${item.id || idx + 1}`}</span><p>{studyText(item) || 'This source returned metadata but no plain-text field.'}</p></div>) : <p className="api-tool-note">No translation variants returned in this response. The reader's currently selected translation remains available above.</p>}</article><article><h4>Tafsir & commentary</h4>{studyTafsirs.length ? studyTafsirs.map((item, idx) => <div className="ayah-study-entry" key={item.id || idx}><span>{item.resourceName || item.resource_name || item.name || item.tafsirName || item.tafsir_name || `Tafsir ${item.id || idx + 1}`}</span><p>{studyText(item) || 'This source returned metadata but no plain-text field.'}</p></div>) : <p className="api-tool-note">No tafsir content returned. Choose an available tafsir resource and refresh, or verify resource access and licensing.</p>}</article></div>}</section>}
    <div className="reader-bottom-actions"><button className="button button-secondary" onClick={() => { setSelectedChapter(1); }}><RotateCcw size={16} /> Return to Al-Fatihah</button><button className="button button-primary" onClick={playChapter} disabled={audioLoading}>{audioLoading ? <LoaderCircle className="spin" size={16} /> : <Headphones size={17} />}{audioLoading ? 'Finding recitation…' : 'Listen to this surah'}</button></div>
    <div className="reader-disclaimer"><ShieldCheck size={16} /><span>Quran text and translation availability depends on your approved Quran Foundation resources. Translations are interpretations; consult trusted scholarship for deeper study.</span></div>
  </div>;
}

function DiscoverPage({ chapters, onRead, onSearch }) {
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const categories = ['All', 'Meccan', 'Medinan'];
  const filtered = chapters.filter((c) => (filter === 'All' || String(c.revelationPlace || c.revelation_place || '').toLowerCase() === filter.toLowerCase()) && `${chapterName(c)} ${chapterTranslation(c)}`.toLowerCase().includes(search.toLowerCase()));
  const themes = [
    { title: 'Mercy & hope', description: 'Verses to return to when you need gentleness.', tag: 'REFLECTION', icon: Heart, color: 'theme-rose', search: 'mercy' },
    { title: 'Patience & trust', description: 'Make room for sabr during uncertain days.', tag: 'GROWTH', icon: Leaf, color: 'theme-green', search: 'patience' },
    { title: 'Gratitude', description: 'Notice the blessings already around you.', tag: 'DAILY LIFE', icon: Sparkles, color: 'theme-gold', search: 'gratitude' },
    { title: 'Knowledge', description: 'Learn, reflect, and ask with humility.', tag: 'LEARNING', icon: GraduationCap, color: 'theme-blue', search: 'knowledge' },
  ];
  return <div className="discover-page view-enter"><div className="page-hero-simple"><div><div className="eyebrow"><Compass size={13} /> DISCOVER & REFLECT</div><h1>Explore what speaks<br /><em>to your heart.</em></h1><p>Find a surah, begin a theme, or wander toward a new insight.</p></div><div className="explore-orbit"><div className="orbit-circle orbit-a"/><div className="orbit-circle orbit-b"/><div className="orbit-center">✧</div></div></div>
    <SectionTitle eyebrow="EXPLORE BY THEME" title="A place to begin" subtitle="These are starting points for study, not a substitute for scholarly tafsir." /><div className="theme-grid">{themes.map((t) => { const Icon = t.icon; return <button key={t.title} className={`theme-card ${t.color}`} onClick={() => onSearch(t.search)}><div className="theme-card-top"><span className="theme-icon"><Icon size={21} /></span><span className="theme-tag">{t.tag}</span></div><h3>{t.title}</h3><p>{t.description}</p><span className="theme-cta">Explore topic <ArrowRight size={14} /></span></button>; })}</div>
    <div className="chapter-library"><SectionTitle eyebrow="THE QURAN" title="Browse all surahs" subtitle="114 chapters, each a doorway to reflection." /><div className="chapter-library-controls"><div className="inline-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a surah by name..." /></div><div className="filter-pills">{categories.map((c) => <button key={c} className={filter === c ? 'filter-active' : ''} onClick={() => setFilter(c)}>{c}</button>)}</div></div><div className="chapter-grid">{filtered.map((c) => <button key={c.id} className="chapter-card" onClick={() => onRead(Number(c.id))}><span className="chapter-card-num">{String(c.id).padStart(2, '0')}</span><div className="chapter-card-copy"><strong>{chapterName(c)}</strong><span>{chapterTranslation(c) || 'Quran chapter'}</span><small>{c.versesCount || c.verses_count || '—'} ayat · {String(c.revelationPlace || c.revelation_place || 'Quran').replace(/^./, (x) => x.toUpperCase())}</small></div><span className="chapter-card-arabic">{c.nameArabic || '۞'}</span></button>)}</div><div className="library-endnote"><span className="status-dot offline" />{chapters.length < 114 ? `The API currently returned ${chapters.length} chapters. Pre-live access is limited; production access is needed for the full dataset.` : 'Chapter metadata shown for navigation. Open a surah to fetch available verses.'}</div></div>
  </div>;
}

function ResourcesPage({ onRead, notify }) {
  const [catalogs, setCatalogs] = useState({});
  const [catalogSource, setCatalogSource] = useState('demo');
  const [catalogNote, setCatalogNote] = useState('Loading available resources…');
  const [juzs, setJuzs] = useState([]);
  const [selectedJuz, setSelectedJuz] = useState(1);
  const [juzVerses, setJuzVerses] = useState([]);
  const [juzBusy, setJuzBusy] = useState(false);
  const [juzNote, setJuzNote] = useState('Select a juz to explore its available content.');
  const [catalogFilter, setCatalogFilter] = useState('');
  const [verseKeyInput, setVerseKeyInput] = useState('1:1');
  const [lookupKind, setLookupKind] = useState('hadith');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupData, setLookupData] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [expandedCatalog, setExpandedCatalog] = useState('translations');
  const [chaptersInfo, setChaptersInfo] = useState(null);
  const [chapterInfoBusy, setChapterInfoBusy] = useState(false);
  const [infoChapter, setInfoChapter] = useState(1);

  useEffect(() => {
    Promise.all([
      fetch('/api/resources').then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Resource catalogs unavailable'); return d; }),
      fetch('/api/juzs').then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Juz metadata unavailable'); return d; }),
    ]).then(([resources, juz]) => {
      setCatalogs(resources.catalogs || {}); setCatalogSource(resources.source || 'demo'); setCatalogNote(resources.note || 'Catalog resources returned from Quran Foundation.');
      setJuzs(unwrapArray(juz));
    }).catch((error) => setCatalogNote(error.message));
  }, []);

  const catalogDefinitions = [
    ['translations', 'Translations', 'Language-specific renderings of the Quran text', Languages],
    ['tafsirs', 'Tafsir resources', 'Commentary and explanation resources', BookText],
    ['languages', 'Languages', 'Languages supported by available content resources', Compass],
    ['recitations', 'Ayah recitations', 'Verse-by-verse audio resources', AudioLines],
    ['chapterReciters', 'Chapter reciters', 'Reciters with continuous surah audio', Headphones],
    ['recitationStyles', 'Recitation styles', 'Available recitation-style metadata', Volume2],
    ['chapterInfos', 'Chapter information', 'Surah-specific background and information resources', FileText],
    ['verseMedia', 'Verse media', 'Available media resources linked to verses', Sparkles],
    ['mushafs', 'Mushaf layouts', 'Available page/layout resources for Mushaf display', BookMarked],
    ['wordByWordTranslations', 'Word-by-word translations', 'Available language resources for individual Quran words', Languages],
    ['wordByWordTransliterations', 'Word-by-word transliterations', 'Pronunciation-oriented Latin-script resources for words', Languages],
    ['qiraat', 'Qiraat resources', 'Available recitation reading and Qiraat metadata, subject to access', AudioLines],
  ];

  const loadJuz = async (juzId = selectedJuz) => {
    setJuzBusy(true); setJuzNote('Loading juz content…'); setJuzVerses([]);
    try {
      const response = await fetch(`/api/juzs/${juzId}/verses`); const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.hint || 'This juz could not be loaded.');
      const list = unwrapArray(data); setJuzVerses(list); setJuzNote(data.note || `${list.length} verses returned · ${data.source === 'quran-foundation' ? 'Quran Foundation content' : 'Preview content'}.`);
    } catch (error) { setJuzNote(error.message); }
    finally { setJuzBusy(false); }
  };

  const loadVerseLinks = async () => {
    const key = verseKeyInput.trim();
    if (!/^\d{1,3}:\d{1,3}$/.test(key)) { setLookupError('Use a verse key in the format 1:1.'); return; }
    setLookupBusy(true); setLookupError(''); setLookupData(null);
    try {
      const url = `/api/${lookupKind}/${key.replace(':', '-')}`;
      const response = await fetch(url); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The lookup could not be completed.');
      setLookupData(data);
    } catch (error) { setLookupError(error.message); }
    finally { setLookupBusy(false); }
  };

  const loadChapterInfo = async () => {
    setChapterInfoBusy(true); setChaptersInfo(null);
    try { const response = await fetch(`/api/chapters/${infoChapter}/info`); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Chapter information unavailable'); setChaptersInfo(data.result || data); }
    catch (error) { setChaptersInfo({ error: error.message }); }
    finally { setChapterInfoBusy(false); }
  };

  const itemName = (item, idx) => item?.name || item?.nameSimple || item?.name_simple || item?.nameEnglish || item?.name_english || item?.translatedName?.name || item?.translated_name?.name || item?.languageName || item?.reciterName || item?.reciter_name || item?.slug || item?.title || `Resource ${item?.id || idx + 1}`;
  const itemDetails = (item) => [item?.languageName, item?.language_name, item?.translatedName?.name, item?.style, item?.slug, item?.id ? `ID ${item.id}` : null].filter(Boolean).join(' · ');

  return <div className="resources-page view-enter">
    <div className="page-hero-simple resources-hero"><div><div className="eyebrow"><FileText size={13}/> QURAN FOUNDATION RESOURCES</div><h1>Go deeper with <em>trusted sources.</em></h1><p>Explore translations, tafsir, recitation catalogues, juz navigation, and references linked to Quranic ayat.</p></div><div className="resources-emblem"><BookText size={38}/><span>✧</span></div></div>
    <div className="resource-status-row"><div className="resource-status"><span className={`status-dot ${catalogSource === 'quran-foundation' ? 'online' : 'offline'}`}/><div><strong>{catalogSource === 'quran-foundation' ? 'Connected resource catalogues' : 'Resource catalogue preview'}</strong><span>{catalogNote}</span></div></div><div className="resource-stat"><strong>{Object.values(catalogs).reduce((s, c) => s + (c.items?.length || 0), 0)}</strong><span>resources loaded</span></div></div>
    <section className="resource-catalog-section"><SectionTitle eyebrow="CONTENT CATALOGUES" title="Available study libraries" subtitle="Catalogues are loaded from the official Content API when credentials and access are available." /><div className="resource-filter"><Search size={15}/><input value={catalogFilter} onChange={(e) => setCatalogFilter(e.target.value)} placeholder="Filter resources by name or language..."/><span>{catalogDefinitions.length} catalogues</span></div><div className="resource-catalog-grid">{catalogDefinitions.map(([key, label, description, Icon]) => { const catalog = catalogs[key] || { items: [], available: false }; const items = catalog.items || []; const visible = items.filter((item, idx) => `${itemName(item, idx)} ${itemDetails(item)}`.toLowerCase().includes(catalogFilter.toLowerCase())); const expanded = expandedCatalog === key; return <article className={`resource-catalog-card card-surface ${expanded ? 'catalog-expanded' : ''}`} key={key}><button className="resource-catalog-head" onClick={() => setExpandedCatalog(expanded ? '' : key)}><span className="resource-catalog-icon"><Icon size={18}/></span><span className="resource-catalog-copy"><strong>{label}</strong><small>{description}</small></span><span className="resource-count">{items.length || (catalog.available === false ? '—' : 0)}</span><ChevronDown className={expanded ? 'rotated' : ''} size={16}/></button>{expanded && <div className="resource-catalog-body">{catalog.error && <div className="resource-inline-warning">{catalog.error}</div>}{visible.length ? visible.slice(0, 50).map((item, idx) => <div className="resource-item" key={`${key}-${item.id || idx}`}><span className="resource-item-dot">✧</span><div><strong>{itemName(item, idx)}</strong><small>{itemDetails(item) || 'Content resource'}</small></div><button onClick={() => { navigator.clipboard?.writeText(String(item.id ?? item.slug ?? itemName(item, idx))).then(() => notify('Resource reference copied')).catch(() => notify('Clipboard unavailable')); }} aria-label="Copy resource reference"><Copy size={14}/></button></div>) : <div className="resource-empty">{catalogFilter ? 'No matching resources in this catalogue.' : catalogNote || 'No catalogue items returned in this environment.'}</div>}{visible.length > 50 && <div className="resource-more">Showing the first 50 matches. Refine your search to find a specific resource.</div>}</div>}</article>; })}</div></section>

    <section className="juz-explorer-section"><SectionTitle eyebrow="QURAN DIVISIONS" title="Explore by juz" subtitle="Browse one of the 30 juz divisions and load its available verse data."/><div className="juz-explorer card-surface"><div className="juz-explorer-side"><div className="juz-wheel"><span>30</span><small>JUZ</small></div><div className="juz-select-copy"><strong>Choose a juz</strong><span>Start with a section of the Quran</span></div><div className="juz-button-grid">{juzs.map((j) => { const id = Number(j.id || j.juzNumber || j.juz_number); return <button className={selectedJuz === id ? 'juz-number-selected' : ''} key={id} onClick={() => setSelectedJuz(id)}>{String(id).padStart(2, '0')}</button>; })}</div><button className="button button-primary button-full" onClick={() => loadJuz(selectedJuz)} disabled={juzBusy}>{juzBusy ? <LoaderCircle size={15} className="spin"/> : <BookOpen size={15}/>} {juzBusy ? 'Loading verses…' : `Load Juz ${selectedJuz}`}</button></div><div className="juz-explorer-results"><div className="juz-results-head"><div><span className="eyebrow">SELECTED SECTION</span><h3>Juz {selectedJuz}</h3></div><span className="resource-result-note">{juzNote}</span></div>{juzVerses.length ? <div className="juz-verse-list">{juzVerses.slice(0, 8).map((v, idx) => <div className="juz-verse-row" key={verseKey(v, selectedJuz) || idx}><span>{verseKey(v, selectedJuz)}</span><div><strong dir="rtl">{verseArabic(v)}</strong><small>{verseTranslation(v)}</small></div><button onClick={() => { const key = verseKey(v, selectedJuz); const [chapter, verse] = key.split(':').map(Number); onRead(chapter || 1, key); }} aria-label="Open ayah in Quran reader"><ArrowRight size={15}/></button></div>)}{juzVerses.length > 8 && <button className="text-link juz-open-more" onClick={() => { const key = verseKey(juzVerses[0], selectedJuz); const [chapter] = key.split(':').map(Number); onRead(chapter || 1, key); }}>Open selected juz in reader <ArrowRight size={15}/></button>}</div> : <div className="juz-empty"><BookOpen size={24}/><p>{juzBusy ? 'Fetching the available verses for this section…' : juzNote}</p></div>}</div></div></section>

    <section className="linked-study-section"><SectionTitle eyebrow="LINKED REFERENCES" title="Study an ayah in context" subtitle="Check available hadith references and published answer threads linked to a specific verse."/><div className="linked-study card-surface"><div className="linked-study-form"><label htmlFor="verse-key-study">Verse reference</label><div className="verse-key-field"><Hash size={15}/><input id="verse-key-study" value={verseKeyInput} onChange={(e) => setVerseKeyInput(e.target.value)} placeholder="1:1" /></div><div className="study-kind-tabs"><button className={lookupKind === 'hadith' ? 'study-kind-active' : ''} onClick={() => { setLookupKind('hadith'); setLookupData(null); setLookupError(''); }}><BookOpen size={14}/> Hadith references</button><button className={lookupKind === 'answers' ? 'study-kind-active' : ''} onClick={() => { setLookupKind('answers'); setLookupData(null); setLookupError(''); }}><CircleHelp size={14}/> Quran Answers</button></div><button className="button button-primary button-full" onClick={loadVerseLinks} disabled={lookupBusy}>{lookupBusy ? <LoaderCircle size={15} className="spin"/> : <Search size={15}/>} {lookupBusy ? 'Looking up references…' : 'Find linked references'}</button></div><div className="linked-study-result">{lookupError ? <div className="api-error-panel"><CircleHelp size={19}/><strong>Reference lookup unavailable</strong><p>{lookupError}</p><small>These endpoints need Content API credentials and available data for the chosen ayah.</small></div> : lookupData ? <><div className="api-result-header"><span className="status-dot online"/><strong>{lookupKind === 'hadith' ? 'Hadith reference response' : 'Quran Answers response'}</strong><button className="text-link" onClick={() => { const [chapter, verse] = verseKeyInput.split(':').map(Number); onRead(chapter, verseKeyInput); }}>Open ayah <ArrowRight size={14}/></button></div><pre>{JSON.stringify(lookupData, null, 2)}</pre></> : <div className="study-empty"><div className="resource-catalog-icon"><Quote size={18}/></div><strong>Follow a verse beyond the page</strong><p>Enter an ayah reference and choose a source. Results depend on API access and the references available for that ayah.</p></div>}</div></div></section>

    <section className="chapter-info-section"><SectionTitle eyebrow="SURAH CONTEXT" title="Chapter background" subtitle="Some chapters have supplementary background resources available through the Content API."/><div className="chapter-info-card card-surface"><div><label htmlFor="chapter-info-id">Chapter number</label><select id="chapter-info-id" value={infoChapter} onChange={(e) => { setInfoChapter(Number(e.target.value)); setChaptersInfo(null); }}>{Array.from({length:114}, (_,i) => <option key={i+1} value={i+1}>{i+1} · {demoChapters[i]?.nameSimple || `Surah ${i+1}`}</option>)}</select></div><button className="button button-secondary" onClick={loadChapterInfo} disabled={chapterInfoBusy}>{chapterInfoBusy ? <LoaderCircle size={15} className="spin"/> : <FileText size={15}/>} Load background</button>{chaptersInfo && <pre className="chapter-info-output">{JSON.stringify(chaptersInfo, null, 2)}</pre>}</div></section>
  </div>;
}

function PrayerTimesPage({ notify }) {
  const today = new Date();
  const [location, setLocation] = useState(() => readStore('syxlor.prayer.location', { label: 'Dhaka, Bangladesh', lat: 23.8103, lng: 90.4125, city: 'Dhaka', country: 'Bangladesh' }));
  const [cityDraft, setCityDraft] = useState(() => readStore('syxlor.prayer.location', { city: 'Dhaka', country: 'Bangladesh' }).city || 'Dhaka');
  const [countryDraft, setCountryDraft] = useState(() => readStore('syxlor.prayer.location', { city: 'Dhaka', country: 'Bangladesh' }).country || 'Bangladesh');
  const [method, setMethod] = useState(() => readStore('syxlor.prayer.method', 1));
  const [school, setSchool] = useState(() => readStore('syxlor.prayer.school', 1));
  const [date, setDate] = useState(() => new Date());
  const [monthDate, setMonthDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [timingData, setTimingData] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [qibla, setQibla] = useState(null);
  const [loading, setLoading] = useState(false);
  const [monthLoading, setMonthLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [reminders, setReminders] = useState(() => readStore('syxlor.prayer.reminders', false));
  const [marked, setMarked] = useState(() => readStore('syxlor.prayer.marked', {}));

  const datePath = (d) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  const coordReady = Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng));
  const locationParams = () => coordReady
    ? `latitude=${encodeURIComponent(location.lat)}&longitude=${encodeURIComponent(location.lng)}`
    : `city=${encodeURIComponent(location.city || 'Dhaka')}&country=${encodeURIComponent(location.country || 'Bangladesh')}`;

  const loadTimes = async (overrideDate = date, overrideLocation = location, overrideMethod = method, overrideSchool = school) => {
    setLoading(true); setError('');
    const hasCoords = Number.isFinite(Number(overrideLocation.lat)) && Number.isFinite(Number(overrideLocation.lng));
    const base = hasCoords ? 'timings' : 'timingsByCity';
    const qs = hasCoords
      ? `latitude=${encodeURIComponent(overrideLocation.lat)}&longitude=${encodeURIComponent(overrideLocation.lng)}`
      : `city=${encodeURIComponent(overrideLocation.city || 'Dhaka')}&country=${encodeURIComponent(overrideLocation.country || 'Bangladesh')}`;
    try {
      const response = await fetch(`https://api.aladhan.com/v1/${base}/${datePath(overrideDate)}?${qs}&method=${overrideMethod}&school=${overrideSchool}&iso8601=true`);
      const payload = await response.json();
      if (!response.ok || payload.code !== 200 || !payload.data?.timings) throw new Error(payload.data?.status || payload.status || 'Prayer times could not be loaded.');
      setTimingData(payload.data);
      const meta = payload.data.meta || {};
      const lat = Number(meta.latitude); const lng = Number(meta.longitude);
      let resolved = overrideLocation;
      if (Number.isFinite(lat) && Number.isFinite(lng)) resolved = { ...overrideLocation, lat, lng, label: overrideLocation.city && overrideLocation.country ? `${overrideLocation.city}, ${overrideLocation.country}` : overrideLocation.label || 'Selected location' };
      setLocation(resolved); saveStore('syxlor.prayer.location', resolved);
    } catch (e) { setError(`${e.message || 'Prayer times unavailable.'} Check your internet connection or choose another city.`); }
    finally { setLoading(false); }
  };

  const loadMonth = async (month = monthDate, loc = location, calc = method, madhab = school) => {
    if (!Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lng))) return;
    setMonthLoading(true);
    try {
      const url = `https://api.aladhan.com/v1/calendar/${month.getFullYear()}/${month.getMonth() + 1}?latitude=${encodeURIComponent(loc.lat)}&longitude=${encodeURIComponent(loc.lng)}&method=${calc}&school=${madhab}&iso8601=true`;
      const response = await fetch(url); const payload = await response.json();
      if (!response.ok || payload.code !== 200) throw new Error(payload.status || 'Monthly timings unavailable.');
      setMonthly(Array.isArray(payload.data) ? payload.data : []);
    } catch (e) { setMonthly([]); notify(e.message || 'Monthly prayer timings could not be loaded.'); }
    finally { setMonthLoading(false); }
  };

  useEffect(() => { loadTimes(new Date(), location, method, school); }, []);
  useEffect(() => { saveStore('syxlor.prayer.method', method); saveStore('syxlor.prayer.school', school); }, [method, school]);
  useEffect(() => { if (coordReady) loadMonth(monthDate, location, method, school); }, [monthDate, location.lat, location.lng, method, school]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(id); }, []);
  useEffect(() => { saveStore('syxlor.prayer.reminders', reminders); }, [reminders]);
  useEffect(() => { saveStore('syxlor.prayer.marked', marked); }, [marked]);
  useEffect(() => {
    if (!reminders || !timingData?.timings || !('Notification' in window) || Notification.permission !== 'granted') return undefined;
    const checkPrayerReminder = () => {
      const zone = timingData.meta?.timezone;
      const options = { hour: '2-digit', minute: '2-digit', hour12: false, ...(zone ? { timeZone: zone } : {}) };
      const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(new Date());
      const currentTime = `${parts.find((p) => p.type === 'hour')?.value}:${parts.find((p) => p.type === 'minute')?.value}`;
      const dateParts = new Intl.DateTimeFormat('en-CA', { ...(zone ? { timeZone: zone } : {}), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      for (const name of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
        const raw = String(timingData.timings[name] || '');
        const match = raw.match(/(\d{1,2}:\d{2})/);
        const key = `syxlor.prayer.notified.${dateParts}.${name}`;
        if (match?.[1] === currentTime && !localStorage.getItem(key)) {
          try { new Notification(`Time for ${name}`, { body: `Prayer time for ${location.label || location.city || 'your selected location'}. Open Syxlor Deen to view the timetable.` }); localStorage.setItem(key, '1'); } catch { /* notification permission can change while this tab is open */ }
        }
      }
    };
    checkPrayerReminder();
    const timer = setInterval(checkPrayerReminder, 15000);
    return () => clearInterval(timer);
  }, [reminders, timingData, location.label, location.city]);
  useEffect(() => {
    if (coordReady) {
      fetch(`https://api.aladhan.com/v1/qibla/${location.lat}/${location.lng}`).then((r) => r.json()).then((d) => { if (d.code === 200) setQibla(d.data); }).catch(() => setQibla(null));
    }
  }, [location.lat, location.lng]);

  const getDateObj = (value, forDate = date) => {
    if (!value) return null;
    const raw = String(value);
    if (raw.includes('T')) { const parsed = new Date(raw); if (!Number.isNaN(parsed.getTime())) return parsed; }
    const match = raw.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hour = Number(match[1]); const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    const zone = timingData?.meta?.timezone;
    const year = forDate.getFullYear(); const month = forDate.getMonth(); const day = forDate.getDate();
    if (!zone) { const local = new Date(forDate); local.setHours(hour, minute, 0, 0); return local; }
    // Prayer API times are wall-clock times in the requested location, not necessarily
    // in the browser's timezone. Iteratively solve the wall-time to UTC conversion.
    const desiredWallTime = Date.UTC(year, month, day, hour, minute, 0, 0);
    let instant = desiredWallTime;
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
        const representedWallTime = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), 0, 0);
        const delta = desiredWallTime - representedWallTime;
        instant += delta;
        if (delta === 0) break;
      }
      return new Date(instant);
    } catch { const local = new Date(forDate); local.setHours(hour, minute, 0, 0); return local; }
  };
  const prayers = timingData?.timings ? [
    { name: 'Fajr', time: timingData.timings.Fajr, icon: Sunrise, desc: 'Dawn prayer', color: 'prayer-dawn' },
    { name: 'Sunrise', time: timingData.timings.Sunrise, icon: Sun, desc: 'Sunrise', color: 'prayer-sunrise' },
    { name: 'Dhuhr', time: timingData.timings.Dhuhr || timingData.timings.Zuhr, icon: Sun, desc: 'Midday prayer', color: 'prayer-noon' },
    { name: 'Asr', time: timingData.timings.Asr, icon: Sunrise, desc: 'Afternoon prayer', color: 'prayer-afternoon' },
    { name: 'Maghrib', time: timingData.timings.Maghrib, icon: Sunset, desc: 'Sunset prayer', color: 'prayer-sunset' },
    { name: 'Isha', time: timingData.timings.Isha, icon: Moon, desc: 'Night prayer', color: 'prayer-night' },
  ].filter((p) => p.time) : [];
  const requiredPrayers = prayers.filter((p) => p.name !== 'Sunrise');
  let nextPrayer = null;
  for (const p of requiredPrayers) { const dt = getDateObj(p.time); if (dt && dt.getTime() > now) { nextPrayer = { ...p, date: dt }; break; } }
  if (!nextPrayer && requiredPrayers.length) { const first = requiredPrayers[0]; const dt = getDateObj(first.time); if (dt) dt.setDate(dt.getDate() + 1); nextPrayer = { ...first, date: dt }; }
  const diff = nextPrayer?.date ? Math.max(0, nextPrayer.date.getTime() - now) : 0;
  const countdown = `${String(Math.floor(diff / 3600000)).padStart(2, '0')}:${String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0')}:${String(Math.floor((diff % 60000) / 1000)).padStart(2, '0')}`;
  const hijri = timingData?.date?.hijri;
  const dateLabel = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const fetchLocation = () => {
    if (!navigator.geolocation) { notify('This browser does not provide location services.'); return; }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition((pos) => {
      const next = { label: 'Your current location', city: 'Your location', country: '', lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocation(next); saveStore('syxlor.prayer.location', next); setCityDraft(''); setCountryDraft(''); setLocationLoading(false); notify('Location updated for prayer-time calculations.');
      loadTimes(new Date(), next, method, school);
    }, (e) => { setLocationLoading(false); notify(e.code === 1 ? 'Location permission was denied. You can enter a city instead.' : 'Could not detect your location. Enter a city instead.'); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  };
  const submitCity = async (e) => {
    e?.preventDefault?.();
    const city = cityDraft.trim(); const country = countryDraft.trim();
    if (!city || !country) { notify('Enter both a city and country.'); return; }
    const next = { label: `${city}, ${country}`, city, country };
    setLocation(next); setDate(new Date()); saveStore('syxlor.prayer.location', next); setMonthDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    await loadTimes(new Date(), next, method, school); notify(`Prayer times updated for ${city}, ${country}.`);
  };
  const toggleReminder = async () => {
    if (!reminders && !('Notification' in window)) { notify('This browser does not support prayer notifications.'); return; }
    if (!reminders && 'Notification' in window) {
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') { notify('Allow browser notifications to enable reminders while Syxlor Deen is open.'); return; }
    }
    setReminders((v) => !v); notify(!reminders ? 'Prayer reminders enabled while this website is open.' : 'Prayer reminders disabled.');
  };
  const prayersToCheck = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

  return <div className="prayer-page view-enter">
    <div className="prayer-hero"><div className="prayer-hero-orb orb-one"/><div className="prayer-hero-orb orb-two"/><div className="prayer-hero-copy"><span className="eyebrow"><Clock3 size={14}/> SALAH & DAILY RHYTHM</span><h1>Make room for <em>prayer.</em></h1><p>Prayer times for your location, alongside your daily Quran journey.</p><div className="prayer-location-label"><MapPin size={15}/><span>{location.label || `${location.city || 'Dhaka'}, ${location.country || 'Bangladesh'}`}</span><button onClick={fetchLocation} disabled={locationLoading}>{locationLoading ? <LoaderCircle size={14} className="spin"/> : <LocateFixed size={14}/>} Use my location</button></div></div><a className="prayer-external-pill" href="https://app.muslimpro.com/prayer-times" target="_blank" rel="noreferrer">Muslim Pro <ExternalLink size={13}/></a></div>
    <div className="prayer-toolbar card-surface"><div className="prayer-date-control"><div><span className="eyebrow">LOCAL PRAYER SCHEDULE</span><strong>{dateLabel}</strong><small>{hijri ? `${hijri.day} ${hijri.month?.en || hijri.month?.ar || ''} ${hijri.year} AH` : 'Hijri date appears with the timings response'}</small></div><div className="prayer-date-buttons"><button className="icon-button" onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d); loadTimes(d); }} aria-label="Previous day"><ChevronLeft size={17}/></button><button className="button button-secondary button-small" onClick={() => { const d = new Date(); setDate(d); loadTimes(d); }}>Today</button><button className="icon-button" onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d); loadTimes(d); }} aria-label="Next day"><ChevronRight size={17}/></button></div></div><form className="prayer-city-form" onSubmit={submitCity}><label><span>City</span><input value={cityDraft} onChange={(e) => setCityDraft(e.target.value)} placeholder="Dhaka"/></label><label><span>Country</span><input value={countryDraft} onChange={(e) => setCountryDraft(e.target.value)} placeholder="Bangladesh"/></label><button className="button button-primary" type="submit" disabled={loading}><Search size={15}/> Set location</button></form></div>
    {error && <div className="inline-notice prayer-error"><CircleHelp size={17}/><span>{error}</span><button className="text-link" onClick={() => loadTimes()}>Retry</button></div>}
    <div className="next-prayer-layout"><section className="next-prayer-card"><div className="next-prayer-ambient"/><div className="next-prayer-main"><span className="eyebrow"><span className="pulse-dot"/> NEXT SALAH</span><h2>{loading ? 'Updating…' : nextPrayer?.name || 'Prayer times'}</h2><p>{nextPrayer ? `${nextPrayer.desc} · ${nextPrayer.time}` : 'Load prayer times for your location.'}</p><div className="prayer-countdown"><Clock3 size={16}/><strong>{countdown}</strong><span>until {nextPrayer?.name || 'the next prayer'}</span></div></div><div className="next-prayer-art"><div className="prayer-art-moon">☾</div><div className="prayer-art-arch arch-back"/><div className="prayer-art-arch arch-front"/><div className="prayer-art-star star-a">✧</div><div className="prayer-art-star star-b">✦</div></div></section><section className="qibla-card card-surface"><div className="qibla-heading"><div className="prayer-mini-icon"><Compass size={18}/></div><div><span className="eyebrow">DIRECTION</span><h3>Qibla finder</h3></div></div><div className="qibla-compass" style={{ '--qibla-angle': `${Number(qibla?.direction || 0)}deg` }}><div className="compass-ring"><span className="compass-north">N</span><span className="compass-east">E</span><span className="compass-south">S</span><span className="compass-west">W</span><div className="compass-needle"><Navigation size={27} fill="currentColor"/></div><div className="compass-center">✦</div></div></div><strong className="qibla-angle">{qibla?.direction != null ? `${Number(qibla.direction).toFixed(1)}° from true north` : 'Set your location'}</strong><p>The arrow indicates the calculated bearing toward the Kaaba. Use device compass calibration when orienting physically.</p></section></div>
    <section className="prayer-times-section"><SectionTitle eyebrow="TODAY'S SCHEDULE" title="The five daily prayers" subtitle="Times are calculated by the selected method and may differ from your local mosque's timetable." action={<button className="button button-secondary button-small" onClick={() => loadTimes()} disabled={loading}>{loading ? <LoaderCircle className="spin" size={14}/> : <RefreshCw size={14}/>} Refresh</button>}/><div className="prayer-times-grid">{prayers.map((p) => { const Icon = p.icon; const isNext = nextPrayer?.name === p.name; const isMarked = marked[`${datePath(date)}:${p.name}`]; return <article className={`prayer-time-card card-surface ${p.color} ${isNext ? 'prayer-time-next' : ''}`} key={p.name}><div className="prayer-card-top"><div className="prayer-type-icon"><Icon size={17}/></div>{isNext && <span className="prayer-next-badge">NEXT</span>}</div><h3>{p.name}</h3><strong className="prayer-time-value">{p.time}</strong><p>{p.desc}</p>{prayersToCheck.includes(p.name) && <button className={`prayer-mark-button ${isMarked ? 'prayer-marked' : ''}`} onClick={() => { const key = `${datePath(date)}:${p.name}`; setMarked((old) => ({ ...old, [key]: !old[key] })); notify(isMarked ? `${p.name} mark removed.` : `${p.name} marked complete on this device.`); }}>{isMarked ? <CheckCircle2 size={14}/> : <Check size={14}/>} {isMarked ? 'Marked complete' : 'Mark complete'}</button>}</article>; })}</div></section>
    <section className="prayer-settings-grid"><div className="prayer-settings-card card-surface"><SectionTitle eyebrow="CALCULATION SETTINGS" title="Tune your timetable" subtitle="Choose a calculation convention and Asr juristic method."/><div className="prayer-setting-field"><label htmlFor="prayer-method">Calculation method</label><select id="prayer-method" value={method} onChange={(e) => { const next = Number(e.target.value); setMethod(next); loadTimes(date, location, next, school); }}><option value={1}>Karachi · University of Islamic Sciences</option><option value={2}>ISNA · North America</option><option value={3}>Muslim World League</option><option value={4}>Umm Al-Qura · Makkah</option><option value={5}>Egyptian General Authority of Survey</option><option value={13}>Diyanet · Türkiye</option><option value={15}>Moonsighting Committee Worldwide</option><option value={17}>JAKIM · Malaysia</option><option value={20}>KEMENAG · Indonesia</option></select></div><div className="prayer-setting-field"><label htmlFor="prayer-school">Asr calculation</label><select id="prayer-school" value={school} onChange={(e) => { const next = Number(e.target.value); setSchool(next); loadTimes(date, location, method, next); }}><option value={0}>Shafi'i / standard</option><option value={1}>Hanafi</option></select></div><div className="prayer-settings-actions"><button className={`button ${reminders ? 'button-primary' : 'button-secondary'}`} onClick={toggleReminder}><BellRing size={15}/>{reminders ? 'Reminders on' : 'Enable reminders'}</button><span>Notifications work while this site is open.</span></div><p className="prayer-calculation-note">Calculation method changes Fajr/Isha conventions; your local mosque or national authority may apply adjustments. Confirm important timings with a trusted local timetable.</p></div><div className="prayer-settings-card monthly-card card-surface"><div className="monthly-heading"><div><span className="eyebrow">PLAN AHEAD</span><h2>Monthly timetable</h2><p>{monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p></div><div><button className="icon-button" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft size={17}/></button><button className="icon-button" onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight size={17}/></button></div></div>{monthLoading ? <div className="monthly-loading"><LoaderCircle size={17} className="spin"/> Calculating monthly times…</div> : monthly.length ? <div className="monthly-table-wrap"><table className="monthly-table"><thead><tr><th>Date</th><th>Fajr</th><th>Dhuhr</th><th>Asr</th><th>Maghrib</th><th>Isha</th></tr></thead><tbody>{monthly.map((row, idx) => { const t = row.timings || {}; const gd = row.date?.gregorian || {}; const rowDay = Number(gd.day || idx + 1); const isToday = rowDay === new Date().getDate() && monthDate.getMonth() === new Date().getMonth() && monthDate.getFullYear() === new Date().getFullYear(); return <tr className={isToday ? 'monthly-today' : ''} key={`${gd.date || idx}`}><td>{rowDay} {gd.weekday?.en?.slice(0, 3) || ''}</td><td>{t.Fajr}</td><td>{t.Dhuhr || t.Zuhr}</td><td>{t.Asr}</td><td>{t.Maghrib}</td><td>{t.Isha}</td></tr>; })}</tbody></table></div> : <div className="monthly-loading">Monthly schedule appears after the location is resolved.</div>}<button className="text-link monthly-refresh" onClick={() => loadMonth()}><RefreshCw size={13}/> Refresh month</button></div></section>
    <div className="prayer-bottom-row"><div className="prayer-disclaimer"><ShieldCheck size={16}/><span>Prayer calculations are estimates. Syxlor Deen is independent of Muslim Pro and Quran Foundation. Confirm timings with your mosque or relevant authority.</span></div><a className="muslimpro-card card-surface" href="https://app.muslimpro.com/prayer-times" target="_blank" rel="noreferrer"><div className="muslimpro-icon"><Clock3 size={20}/></div><div><strong>Compare with Muslim Pro</strong><span>Open the prayer-times page on Muslim Pro</span></div><ExternalLink size={17}/></a></div>
  </div>;
}

function ApiExplorerPage({ apiStatus, authStatus, setAuthStatus, notify, onRead }) {
  const [division, setDivision] = useState('page');
  const [divisionNumber, setDivisionNumber] = useState('1');
  const [divisionRows, setDivisionRows] = useState([]);
  const [divisionBusy, setDivisionBusy] = useState(false);
  const [divisionNote, setDivisionNote] = useState('Choose a Quran division and load its verses.');
  const [resourceType, setResourceType] = useState('translations');
  const [resourceId, setResourceId] = useState('131');
  const [resourceResult, setResourceResult] = useState(null);
  const [resourceBusy, setResourceBusy] = useState(false);
  const [qiraat, setQiraat] = useState(null);
  const [qiraatBusy, setQiraatBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncResources, setSyncResources] = useState('translations:131;tafsirs:169;recitations:7');
  const [syncCache, setSyncCache] = useState({ count: 0, items: [] });
  const [syncCursor, setSyncCursor] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [snapshotGroup, setSnapshotGroup] = useState('translations');
  const [snapshotId, setSnapshotId] = useState('131');
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotResult, setSnapshotResult] = useState(null);
  const [analyticsName, setAnalyticsName] = useState('syxlor.manual_test');
  const [analyticsBusy, setAnalyticsBusy] = useState(false);
  const [analyticsResult, setAnalyticsResult] = useState(null);
  const [userResource, setUserResource] = useState('bookmarks');
  const [userMethod, setUserMethod] = useState('GET');
  const [userPathId, setUserPathId] = useState('');
  const [userPayload, setUserPayload] = useState('{\n  "verse_key": "1:1"\n}');
  const [userResult, setUserResult] = useState(null);
  const [userBusy, setUserBusy] = useState(false);
  const [userError, setUserError] = useState('');
  const [referenceKey, setReferenceKey] = useState('1:1');
  const [referenceKind, setReferenceKind] = useState('hadith');
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [referenceResult, setReferenceResult] = useState(null);
  const [referenceError, setReferenceError] = useState('');
  const divisionInfo = { page: { count: 604, label: 'Mushaf page' }, juz: { count: 30, label: 'Juz' }, hizb: { count: 60, label: 'Hizb' }, rub: { count: 240, label: 'Rub el Hizb' }, ruku: { count: 556, label: 'Ruku' }, manzil: { count: 7, label: 'Manzil' } };
  const userResources = ['bookmarks', 'collections', 'notes', 'goals', 'streaks', 'reading-sessions', 'activity-days', 'preferences', 'tags', 'app-state', 'rooms', 'posts', 'comments', 'media', 'users', 'connected-apps'];
  const families = [
    ['Chapters & verses', 'Surahs, ayat, word-level details, translation variants', 'content'],
    ['Audio recitation', 'Chapter, ayah-by-ayah and word pronunciation audio', 'audio'],
    ['Translations & tafsir', 'Language resources, vetted translations and commentary catalogues', 'resources'],
    ['Quran divisions', 'Pages, juz, hizb, rub el hizb, ruku and manzil', 'divisions'],
    ['Hadith references', 'Linked hadith references and linked hadith content', 'hadith'],
    ['Quran Answers', 'Published answer threads linked to ayat', 'answers'],
    ['Qiraat', 'Qiraat reference resources and related content', 'qiraat'],
    ['Chapter information', 'Surah backgrounds and supported chapter-info resources', 'chapter-info'],
    ['Search API', 'Quick/advanced content search; separate permission required', 'search'],
    ['Content Sync', 'Incremental public-resource updates and snapshots', 'sync'],
    ['OAuth2 & OpenID Connect', 'PKCE login, token exchange, refresh, identity validation, and logout', 'oauth'],
    ['User APIs', 'Bookmarks, collections, notes, goals, streaks, sessions, posts, profiles and tags', 'user'],
    ['QuranReflect', 'Source-referenced reflection drafts and authorized post operations', 'quranreflect'],
    ['Word study & variants', 'Word audio, transliteration, translation fields, footnotes and verse variants', 'word-study'],
    ['Mushaf & layout resources', 'Mushaf resource catalogues and division navigation for page-based study', 'mushaf'],
    ['Analytics events', 'Explicit application-level event submission with analytics.events.write', 'analytics'],
  ];

  useEffect(() => {
    fetch('/api/auth/status').then((r) => r.json()).then(setAuthStatus).catch(() => {});
    fetch('/api/qiraat').then((r) => r.json()).then((d) => setQiraat(d)).catch((e) => setQiraat({ error: e.message }));
    fetch('/api/content-sync/status').then((r) => r.json()).then(setSyncStatus).catch(() => {});
    fetch('/api/content-sync/cache').then((r) => r.json()).then(setSyncCache).catch(() => {});
  }, [setAuthStatus]);

  const loadDivision = async (e) => {
    e?.preventDefault?.();
    const n = Number(divisionNumber);
    if (!Number.isInteger(n) || n < 1 || n > divisionInfo[division].count) { setDivisionNote(`Enter a ${divisionInfo[division].label} from 1 to ${divisionInfo[division].count}.`); return; }
    setDivisionBusy(true); setDivisionRows([]); setDivisionNote('Requesting division content…');
    try { const response = await fetch(`/api/divisions/${division}/${n}/verses`); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'The division could not be loaded.'); const rows = unwrapArray(data); setDivisionRows(rows); setDivisionNote(data.note || `${rows.length} rows returned · ${data.source || 'API'}.`); }
    catch (e) { setDivisionNote(`${e.message} Verify production/pre-live access and the required Content API resources.`); }
    finally { setDivisionBusy(false); }
  };
  const loadResourceInfo = async (e) => {
    e?.preventDefault?.(); setResourceBusy(true); setResourceResult(null);
    try { const response = await fetch(`/api/resources/${resourceType}/${encodeURIComponent(resourceId)}/info`); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Resource detail could not be loaded.'); setResourceResult(data.result || data); }
    catch (e) { setResourceResult({ error: e.message }); }
    finally { setResourceBusy(false); }
  };
  const lookupReference = async (e) => {
    e?.preventDefault?.();
    if (!/^\d{1,3}:\d{1,3}$/.test(referenceKey.trim())) { setReferenceError('Use a verse key such as 2:255.'); return; }
    setReferenceBusy(true); setReferenceError(''); setReferenceResult(null);
    try { const [chapter, verse] = referenceKey.trim().split(':'); const response = await fetch(`/api/${referenceKind}/${chapter}-${verse}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Reference request failed.'); setReferenceResult(data); }
    catch (e) { setReferenceError(e.message); }
    finally { setReferenceBusy(false); }
  };
  const runUserRequest = async (e) => {
    e?.preventDefault?.(); setUserBusy(true); setUserError(''); setUserResult(null);
    try {
      let payload = {};
      if (['POST', 'PATCH', 'PUT'].includes(userMethod)) { try { payload = JSON.parse(userPayload || '{}'); } catch { throw new Error('Request body must be valid JSON.'); } }
      const path = `/api/user/${userResource}${userPathId.trim() ? `/${encodeURIComponent(userPathId.trim())}` : ''}`;
      const response = await fetch(path, { method: userMethod, headers: { 'content-type': 'application/json' }, ...( ['POST','PATCH','PUT'].includes(userMethod) ? { body: JSON.stringify(payload) } : {}) });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`); setUserResult(data); notify('User API request completed.');
    } catch (e) { setUserError(e.message); }
    finally { setUserBusy(false); }
  };
  const runContentSync = async (mode = 'bootstrap') => {
    setSyncBusy(true); setSyncResult(null);
    try {
      const response = await fetch('/api/content-sync/sync-managed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resources: syncResources, perPage: 100, maxPages: 5, mode }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Content Sync failed (${response.status}).`);
      setSyncResult(data); setSyncCursor(data.hasMore ? 'pending' : '');
      const cacheResponse = await fetch('/api/content-sync/cache');
      if (cacheResponse.ok) setSyncCache(await cacheResponse.json());
      notify(data.hasMore ? 'Sync page limit reached. Continue with Next page.' : 'Content Sync page(s) applied and the final token stored on the server.');
    } catch (e) { setSyncResult({ error: e.message }); }
    finally { setSyncBusy(false); }
  };
  const fetchSnapshot = async () => {
    setSnapshotBusy(true); setSnapshotResult(null);
    try { const response = await fetch('/api/content-sync/snapshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group: snapshotGroup, id: snapshotId }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `Snapshot request failed (${response.status}).`); setSnapshotResult(data); }
    catch (e) { setSnapshotResult({ error: e.message }); }
    finally { setSnapshotBusy(false); }
  };
  const sendAnalyticsTest = async () => {
    const name = analyticsName.trim();
    if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(name)) { setAnalyticsResult({ error: 'Use letters, numbers, dots, underscores, colons or hyphens in the event name.' }); return; }
    setAnalyticsBusy(true); setAnalyticsResult(null);
    const eventId = (crypto.randomUUID ? crypto.randomUUID() : `syxlor-${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 128);
    let anonymousId = readStore('syxlor.analytics.anonymousId', '');
    if (!anonymousId) { anonymousId = `anon-${eventId}`; saveStore('syxlor.analytics.anonymousId', anonymousId); }
    const payload = { events: [{ event_id: eventId, name, occurred_at: new Date().toISOString(), version: 2, anonymous_id: anonymousId, session_id: `session-${new Date().toISOString().slice(0, 10)}`, properties: { source: 'syxlor-deen', action: 'manual-test' } }] };
    try { const response = await fetch('/api/analytics/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || data.error || `Analytics API rejected the event (${response.status}).`); setAnalyticsResult(data); notify('Analytics event accepted.'); }
    catch (e) { setAnalyticsResult({ error: e.message, note: 'The analytics.events.write scope must be approved. This action sends one manual diagnostic event only.' }); }
    finally { setAnalyticsBusy(false); }
  };

  const connectAccount = async () => {
    try { const response = await fetch('/api/auth/status'); const data = await response.json(); setAuthStatus(data); if (!data.oauthEnabled) { notify('To enable sign-in, set QF_REDIRECT_URI and register the exact callback URL in the Developer Console.'); return; } window.location.assign('/api/auth/login'); }
    catch { notify('Could not check account configuration.'); }
  };
  const disconnectAccount = async () => { try { await fetch('/api/auth/logout', { method: 'POST' }); setAuthStatus({ ...authStatus, signedIn: false, user: null }); notify('Quran Foundation session cleared.'); } catch { notify('Could not sign out.'); } };

  return <div className="api-explorer-page view-enter">
    <div className="page-hero-simple api-explorer-hero"><div><div className="eyebrow"><SlidersHorizontal size={14}/> SYXLOR DEEN INTEGRATIONS</div><h1>Every tool, <em>one workspace.</em></h1><p>Explore supported Quran Foundation API families, test reads, browse divisions, inspect resources, and connect your authorized account.</p></div><div className="api-hero-mark"><SlidersHorizontal size={36}/><span>✦</span></div></div>
    <div className="api-overview-stats"><div className="api-stat card-surface"><span className={`status-dot ${apiStatus.configured ? 'online' : 'offline'}`}/><div><strong>{apiStatus.configured ? 'Content API credentials found' : 'Preview / offline mode'}</strong><small>{apiStatus.environment || 'prelive'} environment</small></div></div><div className="api-stat card-surface"><BookOpen size={18}/><div><strong>{families.length} API families</strong><small>Integrated, permission-gated or documented</small></div></div><div className="api-stat card-surface"><LockKeyhole size={18}/><div><strong>{authStatus.signedIn ? 'Account connected' : 'Private data protected'}</strong><small>{authStatus.signedIn ? (authStatus.user?.name || authStatus.user?.preferred_username || 'Quran Foundation user') : 'OAuth consent required for User APIs'}</small></div></div></div>
    <section className="api-family-section"><SectionTitle eyebrow="API COVERAGE MAP" title="What Syxlor can access" subtitle="Feature availability depends on your environment, credentials, registered scopes and permissions."/><div className="api-family-grid">{families.map(([title, description, key], idx) => <article className="api-family-card card-surface" key={key} style={{ '--stagger': `${idx * 35}ms` }}><span className="api-family-index">{String(idx + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{description}</p><span className={`api-family-status ${(['search'].includes(key) && !apiStatus.searchEnabled) || (key === 'user' && !authStatus.signedIn) ? 'permission' : 'integrated'}`}>{key === 'search' && !apiStatus.searchEnabled ? 'Permission-gated' : key === 'user' && !authStatus.signedIn ? 'Connect account' : 'Explore below'}</span></article>)}</div></section>
    <section className="api-tool-section"><SectionTitle eyebrow="QURAN NAVIGATION" title="Browse every division" subtitle="Page and section lookups load live verse content only when your Content API environment provides it."/><form className="api-tool-card card-surface" onSubmit={loadDivision}><div className="api-tool-controls"><label><span>Division type</span><select value={division} onChange={(e) => { setDivision(e.target.value); setDivisionRows([]); setDivisionNote('Choose a section and load its verses.'); }}><option value="page">Mushaf page · 604</option><option value="juz">Juz · 30</option><option value="hizb">Hizb · 60</option><option value="rub">Rub el Hizb · 240</option><option value="ruku">Ruku · 556</option><option value="manzil">Manzil · 7</option></select></label><label><span>Number (1–{divisionInfo[division].count})</span><input type="number" min="1" max={divisionInfo[division].count} value={divisionNumber} onChange={(e) => setDivisionNumber(e.target.value)}/></label><button className="button button-primary" type="submit" disabled={divisionBusy}>{divisionBusy ? <LoaderCircle className="spin" size={15}/> : <BookOpen size={15}/>} Load section</button></div><p className="api-tool-note">{divisionNote}</p>{divisionRows.length > 0 && <div className="api-verse-results">{divisionRows.slice(0, 12).map((v, idx) => { const key = verseKey(v, 1); const [ch, ayah] = key.split(':').map(Number); return <article className="api-verse-result" key={`${key}-${idx}`}><span>{key}</span><div><strong dir="rtl">{verseArabic(v)}</strong><p>{verseTranslation(v)}</p></div><button className="icon-button" type="button" onClick={() => onRead(ch || 1, key)} aria-label="Open verse in reader"><ArrowRight size={16}/></button></article>; })}{divisionRows.length > 12 && <p className="api-tool-note">Showing 12 of {divisionRows.length} verses to keep this interface responsive. Open a verse to continue in the reader.</p>}</div>}</form></section>
    <section className="api-tool-section"><SectionTitle eyebrow="RESOURCE CATALOGUE" title="Inspect a specific resource" subtitle="Get resource details such as a translation, tafsir or recitation metadata when the installed SDK and API access support it."/><form className="api-tool-card card-surface" onSubmit={loadResourceInfo}><div className="api-tool-controls"><label><span>Resource family</span><select value={resourceType} onChange={(e) => { const v = e.target.value; setResourceType(v); setResourceId(v === 'tafsirs' ? '169' : '131'); setResourceResult(null); }}><option value="translations">Translations</option><option value="tafsirs">Tafsir resources</option><option value="recitations">Ayah recitations</option><option value="chapterReciters">Chapter reciters</option><option value="chapterInfos">Chapter information resources</option><option value="recitationStyles">Recitation styles</option><option value="verseMedia">Verse media</option><option value="languages">Languages</option></select></label><label><span>Resource ID</span><input value={resourceId} onChange={(e) => setResourceId(e.target.value)} placeholder="Resource ID" required/></label><button className="button button-primary" type="submit" disabled={resourceBusy}>{resourceBusy ? <LoaderCircle className="spin" size={15}/> : <Search size={15}/>} Inspect resource</button></div>{resourceResult && <pre className="api-json-output">{JSON.stringify(resourceResult, null, 2)}</pre>}</form></section>
    <section className="api-tool-section"><SectionTitle eyebrow="VERSE REFERENCES" title="Research an ayah" subtitle="Retrieve linked hadith references or Quran Answers threads where supported."/><form className="api-tool-card card-surface" onSubmit={lookupReference}><div className="api-tool-controls"><label><span>Verse key</span><input value={referenceKey} onChange={(e) => setReferenceKey(e.target.value)} placeholder="2:255"/></label><label><span>Reference source</span><select value={referenceKind} onChange={(e) => { setReferenceKind(e.target.value); setReferenceResult(null); setReferenceError(''); }}><option value="hadith">Hadith references</option><option value="answers">Quran Answers</option></select></label><button className="button button-primary" type="submit" disabled={referenceBusy}>{referenceBusy ? <LoaderCircle className="spin" size={15}/> : <Search size={15}/>} Find references</button></div>{referenceError && <div className="inline-notice"><CircleHelp size={16}/>{referenceError}</div>}{referenceResult && <pre className="api-json-output">{JSON.stringify(referenceResult, null, 2)}</pre>}</form></section>
    <section className="api-tool-section"><SectionTitle eyebrow="QIRAAT & CONTENT SYNC" title="Specialised content tools" subtitle="Some advanced API families are available only with appropriate resources and permissions."/><div className="api-special-grid"><article className="api-special-card card-surface"><div className="api-special-head"><div className="resource-catalog-icon"><Languages size={18}/></div><div><h3>Qiraat</h3><p>Qiraat reference catalogue</p></div></div><span className={`api-family-status ${qiraat?.error ? 'permission' : 'integrated'}`}>{qiraat?.items?.length ? `${qiraat.items.length} resource(s)` : qiraat?.error || qiraat?.note || 'Request attempted'}</span>{qiraat && <pre className="api-json-output">{JSON.stringify(qiraat, null, 2)}</pre>}<button className="button button-secondary" onClick={async () => { setQiraatBusy(true); try { const r = await fetch('/api/qiraat'); setQiraat(await r.json()); } finally { setQiraatBusy(false); } }} disabled={qiraatBusy}>{qiraatBusy ? <LoaderCircle className="spin" size={14}/> : <RefreshCw size={14}/>} Refresh catalogue</button></article><article className="api-special-card card-surface"><div className="api-special-head"><div className="resource-catalog-icon"><RefreshCw size={18}/></div><div><h3>Content Sync</h3><p>Bootstrap, incremental changes, snapshots</p></div></div><p>{syncStatus?.note || 'Checking Content Sync availability…'} Server cache currently contains <strong>{syncCache?.count || 0}</strong> saved resource snapshot(s).</p><label className="api-json-label"><span>Resource filter</span><input value={syncResources} onChange={(e) => { setSyncResources(e.target.value); setSyncCursor(''); setSyncResult(null); }} placeholder="translations:131;tafsirs:169" /></label><div className="api-inline-actions"><button className="button button-primary" onClick={() => runContentSync('bootstrap')} disabled={syncBusy}>{syncBusy ? <LoaderCircle className="spin" size={14}/> : <RefreshCw size={14}/>} Bootstrap</button><button className="button button-secondary" onClick={() => runContentSync('incremental')} disabled={syncBusy}>{syncBusy ? 'Working…' : 'Incremental sync'}</button><button className="button button-secondary" onClick={() => runContentSync('next')} disabled={syncBusy || !syncCursor}>Next page</button></div><div className="api-sync-token"><span>Sync tokens and cursors are stored on the server for this environment and exact resource filter, not in browser storage.</span><button className="button button-secondary" onClick={async () => { const r = await fetch('/api/content-sync/cache'); if (r.ok) setSyncCache(await r.json()); }}><RefreshCw size={13}/> Refresh cache list</button></div>{syncCache?.items?.length > 0 && <div className="api-cache-list"><strong>Saved server snapshots</strong>{syncCache.items.slice(0, 10).map((item) => <div key={`${item.group}:${item.id}`}><span>{item.group}:{item.id}</span><span>{Number(item.recordCount || 0).toLocaleString()} rows</span><span>{item.needsSnapshotRefresh ? 'Refresh needed' : 'Cached'}</span></div>)}</div>}{syncResult && <pre className="api-json-output">{JSON.stringify(syncResult, null, 2)}</pre>}<div className="api-snapshot-tools"><strong>Get a full resource snapshot</strong><div className="api-tool-controls"><label><span>Resource group</span><select value={snapshotGroup} onChange={(e) => setSnapshotGroup(e.target.value)}>{['quran_core','mushafs','translations','word_by_word_translations','word_by_word_transliterations','tafsirs','recitations','chapter_recitations','articles'].map((x) => <option key={x} value={x}>{x}</option>)}</select></label><label><span>Resource ID</span><input value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)} /></label><button className="button button-secondary" onClick={fetchSnapshot} disabled={snapshotBusy}>{snapshotBusy ? <LoaderCircle className="spin" size={14}/> : <Download size={14}/>} Fetch snapshot</button></div>{snapshotResult && <pre className="api-json-output">{JSON.stringify(snapshotResult, null, 2)}</pre>}</div><a className="text-link" href="https://api-docs.quran.foundation/docs/tutorials/content-sync/getting-started/" target="_blank" rel="noreferrer">Read Content Sync guide <ExternalLink size={13}/></a></article></div></section>
    <section className="api-tool-section analytics-tools"><SectionTitle eyebrow="APPLICATION ANALYTICS" title="Test Analytics Events" subtitle="Sends one explicit diagnostic event to Quran Foundation. Requires analytics.events.write approval; nothing is sent automatically."/><div className="api-tool-card card-surface"><div className="api-tool-controls"><label><span>Event name</span><input value={analyticsName} maxLength={128} onChange={(e) => setAnalyticsName(e.target.value)} /></label><button className="button button-primary" onClick={sendAnalyticsTest} disabled={analyticsBusy}>{analyticsBusy ? <LoaderCircle className="spin" size={15}/> : <Activity size={15}/>} Send one test event</button></div>{analyticsResult && <pre className="api-json-output">{JSON.stringify(analyticsResult, null, 2)}</pre>}<p className="api-tool-note">The diagnostic contains only a generated event ID, timestamp, an anonymous browser ID, and a small source label. No verse notes, credentials, or secret tokens are sent.</p></div></section>
    <section className="api-tool-section user-api-section"><SectionTitle eyebrow="SIGNED-IN FEATURES" title="Connect your Quran Foundation account" subtitle="User APIs require an OAuth login and user consent. Server sessions keep tokens out of browser JavaScript."/><div className="api-account-card card-surface"><div className="api-account-status"><div className="api-account-avatar"><LockKeyhole size={21}/></div><div><h3>{authStatus.signedIn ? (authStatus.user?.name || authStatus.user?.preferred_username || 'Connected account') : 'Personal Quran data'}</h3><p>{authStatus.signedIn ? `Connected · ${authStatus.scopes || 'scope details unavailable'}` : authStatus.oauthEnabled ? 'Connect to use authorized bookmarks, notes, collections, goals and activity APIs.' : 'OAuth is not configured yet. Register the callback URL in Developer Console and set QF_REDIRECT_URI in your server .env.'}</p></div></div><div className="api-account-actions">{authStatus.signedIn ? <button className="button button-secondary" onClick={disconnectAccount}><X size={15}/> Disconnect account</button> : <button className="button button-primary" onClick={connectAccount}><LockKeyhole size={15}/> Connect Quran Foundation</button>}</div></div>{authStatus.signedIn && <form className="api-tool-card card-surface" onSubmit={runUserRequest}><div className="api-tool-controls"><label><span>User API resource</span><select value={userResource} onChange={(e) => setUserResource(e.target.value)}>{userResources.map((x) => <option key={x} value={x}>{x}</option>)}</select></label><label><span>HTTP action</span><select value={userMethod} onChange={(e) => setUserMethod(e.target.value)}><option>GET</option><option>POST</option><option>PATCH</option><option>PUT</option><option>DELETE</option></select></label><label><span>Record ID (optional)</span><input value={userPathId} onChange={(e) => setUserPathId(e.target.value)} placeholder="Record ID"/></label><button className="button button-primary" type="submit" disabled={userBusy}>{userBusy ? <LoaderCircle className="spin" size={15}/> : <RefreshCw size={15}/>} Send request</button></div>{['POST','PATCH','PUT'].includes(userMethod) && <label className="api-json-label"><span>JSON request body</span><textarea value={userPayload} onChange={(e) => setUserPayload(e.target.value)} rows={5}/></label>}{userError && <div className="inline-notice"><CircleHelp size={16}/>{userError}</div>}{userResult && <pre className="api-json-output">{JSON.stringify(userResult, null, 2)}</pre>}<p className="api-tool-note">Only use methods and body fields documented for the selected resource. A 403 commonly means the connected account has not approved the necessary scope.</p></form>}</section>
    <section className="api-docs-footer"><SectionTitle eyebrow="DOCUMENTATION" title="Build beyond the included UI" subtitle="Official references for every integrated API family and external prayer-time utility."/><div><a href="https://api-docs.quran.foundation/docs/api-reference/" target="_blank" rel="noreferrer">API Reference <ExternalLink size={13}/></a><a href="https://api-docs.quran.foundation/docs/user_related_apis_versioned/1.0.0/user-related-apis/" target="_blank" rel="noreferrer">User APIs <ExternalLink size={13}/></a><a href="https://api-docs.quran.foundation/docs/search_apis_versioned/1.0.0/quran-foundation-search-api/" target="_blank" rel="noreferrer">Search API <ExternalLink size={13}/></a><a href="https://api-docs.quran.foundation/docs/sdk/javascript/audio/" target="_blank" rel="noreferrer">Audio SDK <ExternalLink size={13}/></a><a href="https://api-docs.quran.foundation/docs/sdk/javascript/quranreflect-posts/" target="_blank" rel="noreferrer">QuranReflect <ExternalLink size={13}/></a><a href="https://api-docs.quran.foundation/docs/tutorials/content-sync/getting-started/" target="_blank" rel="noreferrer">Content Sync <ExternalLink size={13}/></a><a href="https://api-docs.quran.foundation/docs/analytics_apis_versioned/1.0.0/analytics-events-api/" target="_blank" rel="noreferrer">Analytics Events <ExternalLink size={13}/></a><a href="https://app.muslimpro.com/prayer-times" target="_blank" rel="noreferrer">Muslim Pro prayer times <ExternalLink size={13}/></a></div></section>
  </div>;
}

function HifzPage({ learned, setLearned, chapters, onRead, notify }) {
  const [targetKey, setTargetKey] = useState('1:1');
  const [sessionStarted, setSessionStarted] = useState(false);
  const candidates = ['1:1','1:2','1:3','1:4','1:5','1:6','1:7','2:255','112:1','112:2','112:3','112:4'];
  const completed = candidates.filter((x) => learned.includes(x)).length;
  const currentChapter = Number(targetKey.split(':')[0]);
  const onMark = () => {
    if (learned.includes(targetKey)) { setLearned((x) => x.filter((k) => k !== targetKey)); notify(`${targetKey} removed from revision list`); }
    else { setLearned((x) => [...x, targetKey]); notify(`${targetKey} marked as revised`); }
  };
  return <div className="hifz-page view-enter"><div className="page-hero-simple hifz-hero"><div><div className="eyebrow"><GraduationCap size={13} /> HIFZ COMPANION</div><h1>Memorize with <em>gentleness.</em></h1><p>Build a steady revision habit without turning worship into a race.</p><div className="hero-actions"><button className="button button-primary" onClick={() => setSessionStarted((x) => !x)}>{sessionStarted ? <Pause size={16} /> : <Play size={16} />}{sessionStarted ? 'Pause session' : 'Begin a revision session'}</button><button className="button button-secondary" onClick={() => onRead(currentChapter, targetKey)}><BookOpen size={16} /> Open in reader</button></div></div><div className="hifz-emblem"><div className="hifz-emblem-ring"><BookOpen size={43} /><span>✦</span></div><div className="hifz-emblem-caption">ONE AYAH AT A TIME</div></div></div>
    <div className="hifz-stats"><MetricCard icon={Target} label="Marked for revision" value={learned.length} caption="Verses you have reviewed" color="green"/><MetricCard icon={Flame} label="Session status" value={sessionStarted ? 'Active' : 'Ready'} caption={sessionStarted ? 'Take your time' : 'Start when you are ready'} color="gold"/><MetricCard icon={CircleCheck} label="Starter set progress" value={`${completed}/${candidates.length}`} caption="A small sample revision set" color="blue"/></div>
    <div className="hifz-content-grid"><section className="card-surface revision-card"><SectionTitle eyebrow="YOUR REVISION LIST" title="Choose an ayah" subtitle="Keep track of what you have revised. The list is stored on this device." /><div className="revision-pick-list">{candidates.map((key) => <button key={key} className={`revision-pick ${targetKey === key ? 'revision-pick-active' : ''} ${learned.includes(key) ? 'revision-is-done' : ''}`} onClick={() => setTargetKey(key)}><span className="revision-check">{learned.includes(key) ? <Check size={15} /> : key.split(':')[1]}</span><span><strong>{key}</strong><small>{Number(key.split(':')[0]) === 1 ? 'Al-Fatihah' : Number(key.split(':')[0]) === 2 ? 'Al-Baqarah' : Number(key.split(':')[0]) === 112 ? 'Al-Ikhlas' : 'An-Nas'}</small></span>{targetKey === key && <ChevronRight size={16} />}</button>)}</div><div className="revision-card-footer"><button className="button button-secondary" onClick={() => setLearned([])}><RotateCcw size={15} /> Reset list</button><button className="button button-primary" onClick={onMark}>{learned.includes(targetKey) ? 'Mark as not revised' : 'Mark as revised'} <Check size={15} /></button></div></section><section className="study-tips"><div className="tip-top"><Sparkles size={18} /><span>A GENTLE REMINDER</span></div><h3>Consistency over intensity.</h3><p>Try a simple loop: listen, read, repeat from memory, then return tomorrow. Your revision list is a personal aid, not a measure of your worth.</p><div className="tip-divider"/><div className="tip-row"><span className="tip-icon"><Headphones size={16} /></span><div><strong>Listen mindfully</strong><span>Use the reader's available recitation player.</span></div></div><div className="tip-row"><span className="tip-icon"><Timer size={16} /></span><div><strong>Keep sessions small</strong><span>Start with a few focused minutes.</span></div></div><div className="tip-row"><span className="tip-icon"><Heart size={16} /></span><div><strong>Return without guilt</strong><span>A missed day is a chance to begin again.</span></div></div></section></div></div>;
}

function MetricCard({ icon: Icon, label, value, caption, color }) { return <div className="metric-card card-surface"><div className={`metric-icon metric-${color}`}><Icon size={18} /></div><span>{label}</span><strong>{value}</strong><small>{caption}</small></div>; }

function ReflectionsPage({ notes, noteDraft, setNoteDraft, noteTitle, setNoteTitle, addReflection, exportNotes, deleteNote, selectedVerse, authStatus, notify }) {
  const prompts = ['What stood out to me today?', 'What do I want to remember?', 'Where can I practice patience?', 'What am I grateful for right now?'];
  const [quranReflectDraft, setQuranReflectDraft] = useState(true);
  const [quranReflectBusy, setQuranReflectBusy] = useState(false);
  const [quranReflectResult, setQuranReflectResult] = useState(null);
  const sendToQuranReflect = async () => {
    if (!authStatus?.signedIn) { notify('Connect your Quran Foundation account from API & account first.'); return; }
    const body = `${noteTitle.trim() ? `${noteTitle.trim()}\n\n` : ''}${noteDraft.trim()}`.trim();
    if (body.length < 6) { notify('Write at least six characters before sending.'); return; }
    const match = String(selectedVerse || '').match(/^(\d{1,3}):(\d{1,3})$/);
    setQuranReflectBusy(true); setQuranReflectResult(null);
    try {
      const response = await fetch('/api/quranreflect/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body, draft: quranReflectDraft, references: match ? [{ chapterId: Number(match[1]), from: Number(match[2]), to: Number(match[2]) }] : [] }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.hint || `QuranReflect request failed (${response.status}).`);
      setQuranReflectResult(data); notify(quranReflectDraft ? 'Reflection sent to QuranReflect drafts.' : 'Reflection submitted to QuranReflect.');
    } catch (error) { setQuranReflectResult({ error: error.message, note: 'The signed-in account must have the approved `post` scope.' }); }
    finally { setQuranReflectBusy(false); }
  };
  return <div className="reflections-page view-enter"><div className="page-hero-simple reflections-hero"><div><div className="eyebrow"><NotebookPen size={13} /> REFLECTIONS & NOTES</div><h1>Make room for <em>meaning.</em></h1><p>A private space to capture what you are learning, noticing, and carrying with you.</p></div><div className="journal-icon-art"><NotebookPen size={39}/><span>✧</span></div></div>
    <div className="reflection-layout"><section className="reflection-composer card-surface"><div className="composer-heading"><span className="eyebrow">A MOMENT TO YOURSELF</span><span className="private-label"><LockKeyhole size={13} /> Saved locally</span></div><input className="reflection-title-input" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Give this reflection a title..." maxLength={100} /><textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="What is on your heart today? Write a thought, a question, or something you would like to remember..." rows={7} maxLength={5000} /><div className="composer-footer"><span>{noteDraft.length}/5000 characters · {selectedVerse || 'No ayah linked'}</span><button className="button button-primary" onClick={addReflection}><Plus size={16} /> Save reflection</button></div><div className="writing-prompts"><span>NEED A STARTING POINT?</span>{prompts.map((p) => <button key={p} onClick={() => setNoteDraft((d) => d ? `${d}\n\n${p}\n` : `${p}\n`)}>{p} <ArrowDownRight size={13}/></button>)}</div>
      <div className="quranreflect-publish"><div className="quranreflect-copy"><strong><Share2 size={15}/> QuranReflect</strong><span>{authStatus?.signedIn ? 'You can send this reflection to your QuranReflect account.' : 'Connect an authorized Quran Foundation account to send reflections to QuranReflect.'}</span></div><label className="quranreflect-mode"><span>Delivery</span><select value={quranReflectDraft ? 'draft' : 'publish'} onChange={(e) => setQuranReflectDraft(e.target.value === 'draft')}><option value="draft">Save as draft</option><option value="publish">Publish post</option></select></label><button className="button button-secondary" onClick={sendToQuranReflect} disabled={quranReflectBusy || !authStatus?.signedIn || !noteDraft.trim()}>{quranReflectBusy ? <LoaderCircle className="spin" size={15}/> : <Share2 size={15}/>} {quranReflectDraft ? 'Send draft' : 'Publish reflection'}</button></div>
      {!authStatus?.signedIn && <div className="quranreflect-hint">First connect your account in <strong>API & account</strong>. Publishing is an external action; reflections stay private unless you choose “Publish post”.</div>}
      {quranReflectResult && <pre className="api-json-output">{JSON.stringify(quranReflectResult, null, 2)}</pre>}
      </section>
    <aside className="reflection-aside"><div className="reflection-quote"><Quote size={22} /><p>“And He found you lost and guided you.”</p><span>Quran 93:7 · Translation wording may vary</span><div className="quote-ornament">✦</div></div><div className="privacy-card"><LockKeyhole size={17}/><div><strong>Your reflections stay yours.</strong><p>Notes are stored in this browser on this device. They are not sent to Quran Foundation. Export them regularly if you want a backup.</p></div></div></aside></div>
    <section className="saved-reflections"><SectionTitle eyebrow="YOUR JOURNAL" title="Reflections you've kept" subtitle={`${notes.length} saved ${notes.length === 1 ? 'reflection' : 'reflections'}`} action={<button className="button button-secondary button-small" onClick={exportNotes}><Download size={15} /> Export notes</button>} />{notes.length ? <div className="reflection-list">{notes.map((note) => <article className="reflection-entry card-surface" key={note.id}><div className="reflection-entry-top"><div className="reflection-date"><span className="entry-date-day">{new Date(note.date).getDate()}</span><span>{new Date(note.date).toLocaleDateString('en', { month: 'short', year: 'numeric' })}</span></div><button className="icon-button" onClick={() => deleteNote(note.id)} aria-label="Delete reflection"><X size={16}/></button></div><h3>{note.title}</h3><p>{note.body}</p><div className="entry-footer"><span><BookOpen size={13}/> {note.verse || 'Personal reflection'}</span><span>{new Date(note.date).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</span></div></article>)}</div> : <EmptyPanel icon={NotebookPen} title="Your journal starts here" text="Write down a thought from your reading or use one of the prompts above. Your reflections will appear here." />}</section>
  </div>;
}

function SavedPage({ bookmarks, removeBookmark, onRead, copyText }) {
  return <div className="saved-page view-enter"><div className="page-hero-simple saved-hero"><div><div className="eyebrow"><Bookmark size={13} /> YOUR COLLECTION</div><h1>Keep the ayat that <em>stay with you.</em></h1><p>Saved verses live in this browser, ready when you want to return to them.</p></div><div className="saved-hero-mark"><BookMarked size={36}/><span>{bookmarks.length}</span></div></div><SectionTitle eyebrow="SAVED AYAT" title="Your collection" subtitle={`${bookmarks.length} ${bookmarks.length === 1 ? 'verse' : 'verses'} saved on this device.`} />{bookmarks.length ? <div className="saved-verse-grid">{bookmarks.map((b) => <article className="saved-verse-card card-surface" key={b.key}><div className="saved-verse-top"><span className="verse-reference-pill"><span>✧</span> {b.key}</span><button className="icon-button" onClick={() => removeBookmark(b.key)} aria-label="Remove saved ayah"><X size={16}/></button></div><div className="saved-arabic" dir="rtl">{b.arabic || 'النَّصُّ الْقُرْآنِيّ'}</div><p>{b.translation}</p><div className="saved-verse-footer"><span>{b.chapterName || `Surah ${b.key.split(':')[0]}`}</span><div><button className="text-link" onClick={() => onRead(Number(b.chapterId || b.key.split(':')[0]), b.key)}>Open <ArrowRight size={14}/></button><button className="icon-button" onClick={() => copyText(`${b.arabic}\n${b.translation}\n${b.key}`)} aria-label="Copy saved verse"><Copy size={15}/></button></div></div></article>)}</div> : <EmptyPanel icon={Bookmark} title="A collection waiting to grow" text="When a verse stays with you, bookmark it in the reader. It will be kept here for your next visit." actionLabel="Open Quran reader" onAction={() => onRead(1)} />}</div>;
}

function ProgressPage({ dailyGoal, setDailyGoal, readCount, progressPercent, activity, learned, bookmarks, notes, onNavigate }) {
  const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const dates = Array.from({ length: 28 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (27 - i)); return d; });
  const countTotal = Object.values(activity).reduce((sum, v) => sum + Number(v || 0), 0);
  return <div className="progress-page view-enter"><div className="page-hero-simple progress-hero"><div><div className="eyebrow"><Activity size={13} /> YOUR JOURNEY</div><h1>Notice how far <em>you've come.</em></h1><p>Track your habits, celebrate small returns, and set a pace that supports you.</p></div><div className="progress-hero-mark"><Activity size={36}/><span>✧</span></div></div><div className="progress-metrics"><MetricCard icon={BookOpen} label="Ayat marked read" value={countTotal} caption="Recorded on this device" color="green"/><MetricCard icon={Bookmark} label="Saved ayat" value={bookmarks.length} caption="Verses kept close" color="gold"/><MetricCard icon={NotebookPen} label="Reflections" value={notes.length} caption="Thoughts you captured" color="blue"/><MetricCard icon={GraduationCap} label="Revision markers" value={learned.length} caption="Verses marked as revised" color="rose"/></div><div className="progress-main-grid"><section className="activity-card card-surface"><SectionTitle eyebrow="THE LAST 4 WEEKS" title="Your reading rhythm" subtitle="Darker days mean more ayah interactions recorded."/><div className="activity-weekdays">{dayNames.map((d, i) => <span key={i}>{d}</span>)}</div><div className="activity-grid">{dates.map((d, i) => { const key = d.toISOString().slice(0, 10); const val = activity[key] || 0; return <div key={key} className={`activity-day ${val > 0 ? `activity-level-${Math.min(4, val)}` : ''}`} title={`${key}: ${val} ayat marked`} />; })}</div><div className="activity-legend"><span>Less</span>{[0,1,2,3,4].map((n) => <span key={n} className={`activity-day ${n ? `activity-level-${n}` : ''}`} />)}<span>More</span></div><div className="activity-note"><Sparkles size={16}/><span>Progress is only a gentle record of interactions, not a measure of faith or sincerity.</span></div></section><section className="goal-card card-surface"><div className="goal-card-top"><div className="circle-icon icon-emerald"><Target size={19}/></div><span className="eyebrow">DAILY READING GOAL</span></div><h3>Set a goal that feels sustainable.</h3><div className="goal-value"><strong>{dailyGoal}</strong><span>ayat per day</span></div><input type="range" min="1" max="30" value={dailyGoal} onChange={(e) => setDailyGoal(Number(e.target.value))} aria-label="Daily ayah goal"/><div className="range-labels"><span>1 · Gentle</span><span>30 · Ambitious</span></div><div className="goal-today"><div><span>Today's progress</span><strong>{readCount} / {dailyGoal}</strong></div><div className="mini-progress"><span style={{ width: `${progressPercent}%` }}/></div></div><p className="goal-caption">Choose a target you can return to consistently. You can adjust it any time.</p><button className="button button-primary button-full" onClick={() => onNavigate('reader')}>Continue reading <ArrowRight size={15}/></button></section></div></div>;
}

function EmptyPanel({ icon: Icon, title, text, actionLabel, onAction }) {
  return <div className="empty-state card-surface"><div className="empty-icon"><Icon size={25}/></div><h3>{title}</h3><p>{text}</p>{actionLabel && <button className="button button-primary" onClick={onAction}>{actionLabel} <ArrowRight size={15}/></button>}</div>;
}

function SearchModal({ query, setQuery, searchMode, setSearchMode, onClose, onSearch, busy, results, message, chapters, onRead }) {
  useEffect(() => { const t = setTimeout(() => document.querySelector('.search-modal-input')?.focus(), 40); return () => clearTimeout(t); }, []);
  const quick = ['mercy', 'patience', 'gratitude', 'knowledge'];
  return <div className="modal-overlay search-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="search-modal" role="dialog" aria-modal="true" aria-label="Search Quran"><div className="search-modal-top"><div className="search-modal-icon"><Search size={18}/></div><form onSubmit={(e) => { e.preventDefault(); onSearch(); }}><input className="search-modal-input" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }} placeholder="Search Quran, surahs, themes..." /><kbd>ENTER</kbd></form><button className="icon-button" onClick={onClose} aria-label="Close search"><X size={18}/></button></div><div className="search-mode-toggle" aria-label="Search mode"><span>SEARCH MODE</span><button className={searchMode === 'quick' ? 'search-mode-active' : ''} onClick={() => setSearchMode('quick')}>Quick</button><button className={searchMode === 'advanced' ? 'search-mode-active' : ''} onClick={() => setSearchMode('advanced')}>Advanced</button><small>{searchMode === 'advanced' ? 'Detailed, paginated search · requires Search API access' : 'Fast navigation and verse matches'}</small></div><div className="search-modal-body">{!query && <div className="search-quick"><span>TRY A THEME</span><div>{quick.map((x) => <button key={x} onClick={() => { setQuery(x); onSearch(x); }}>{x}</button>)}</div><span className="search-tip">Search is subject to API permissions. Chapter navigation always remains available.</span></div>}{busy ? <div className="search-loading"><LoaderCircle className="spin" size={20}/> Searching available resources...</div> : results.length ? <><div className="search-results-header">RESULTS <span>{results.length}</span></div><div className="search-results-list">{results.map((r, i) => { const key = r.verseKey || r.verse_key || (r.id && r._chapter ? String(r.id) : `${i}`); if (r._chapter) return <button key={`chapter-${r.id}`} className="search-result" onClick={() => onRead(Number(r.id))}><span className="result-kind"><BookOpen size={14}/></span><span className="result-copy"><strong>{r.title || chapterName(r)}</strong><small>{r.snippet || chapterTranslation(r)}</small></span><ArrowRight size={16}/></button>; return <button key={`${key}-${i}`} className="search-result" onClick={() => { const split = String(key).split(':'); onRead(Number(split[0] || 1), key.includes(':') ? key : undefined); }}><span className="result-kind"><BookText size={14}/></span><span className="result-copy"><strong>{key.includes(':') ? `Surah ${key}` : r.title || r.name || 'Quran result'}</strong><small>{r.snippet || r.text || r.translation?.text || (r.translations?.[0]?.text) || 'Open this result in the reader'}</small></span><ArrowRight size={16}/></button>; })}</div></> : <div className="search-message">{message}</div>}</div><div className="search-modal-footer"><span><kbd>ESC</kbd> to close</span><span><Sparkles size={13}/> Search with intention</span></div></section></div>;
}

function SettingsModal({ settings, setSettings, apiStatus, onClose, onOpenProgress }) {
  return <div className="modal-overlay settings-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings"><div className="settings-head"><div><span className="eyebrow">YOUR EXPERIENCE</span><h2>Settings</h2></div><button className="icon-button" onClick={onClose} aria-label="Close settings"><X size={18}/></button></div><div className="setting-row"><div className="setting-copy"><strong>Appearance</strong><span>Choose the mood of your reading space.</span></div><div className="appearance-options"><button className={settings.theme === 'light' ? 'appearance-selected' : ''} onClick={() => setSettings((s) => ({ ...s, theme: 'light' }))}><Sun size={15}/> Light</button><button className={settings.theme === 'dark' ? 'appearance-selected' : ''} onClick={() => setSettings((s) => ({ ...s, theme: 'dark' }))}><Moon size={15}/> Dark</button></div></div><div className="setting-row"><div className="setting-copy"><strong>Arabic font size</strong><span>Adjust the reading canvas.</span></div><select value={settings.arabicSize} onChange={(e) => setSettings((s) => ({ ...s, arabicSize: e.target.value }))}><option value="compact">Compact</option><option value="regular">Regular</option><option value="large">Large</option></select></div><div className="settings-api-card"><div className="settings-api-head"><span className={`status-dot ${apiStatus.configured ? 'online' : 'offline'}`}/><strong>Quran Foundation connection</strong></div><p>{apiStatus.configured ? `Credentials detected · ${apiStatus.environment} environment` : 'The app is running in preview mode. Add credentials to your server .env file to fetch live Quran content.'}</p><div className="api-facts"><span>Content API <b>{apiStatus.configured ? 'Configured' : 'Preview'}</b></span><span>Search API <b>{apiStatus.searchEnabled ? 'Enabled' : 'Permission required'}</b></span><span>Credentials <b>Server-side only</b></span></div></div><div className="settings-privacy"><LockKeyhole size={17}/><span>Bookmarks, goals, and reflections are stored in local browser storage. Clearing browser data may remove them.</span></div><button className="button button-primary button-full" onClick={onOpenProgress}>View your progress <ArrowRight size={15}/></button></section></div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);

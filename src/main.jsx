import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, AudioLines, Bookmark, BookMarked,
  BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Compass, Copy,
  Download, Flame, Headphones, Heart, History, Home, Languages, Leaf, ListFilter,
  LoaderCircle, LockKeyhole, Menu, Moon, MoreHorizontal, Pause, Play, Plus, Search,
  Settings2, Share2, Sparkles, Sun, Target, Timer, Volume2, X, BookText, GraduationCap,
  NotebookPen, RotateCcw, CircleCheck, FileText, Quote, Hash, ShieldCheck, Wifi, WifiOff,
} from 'lucide-react';
import { demoChapters, demoFatiha } from './data.js';
import './styles.css';

const NAV = [
  { id: 'home', label: 'Overview', icon: Home, group: 'workspace' },
  { id: 'reader', label: 'Read Quran', icon: BookOpen, group: 'workspace' },
  { id: 'discover', label: 'Explore', icon: Compass, group: 'workspace' },
  { id: 'resources', label: 'Study libraries', icon: FileText, group: 'workspace' },
  { id: 'hifz', label: 'Hifz companion', icon: GraduationCap, group: 'growth' },
  { id: 'reflections', label: 'Reflections', icon: NotebookPen, group: 'growth' },
  { id: 'saved', label: 'Saved ayat', icon: BookMarked, group: 'growth' },
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
    fetchJson('/api/config').then((data) => setApiStatus({ ...data, checked: true })).catch(() => setApiStatus({ configured: false, environment: 'offline', searchEnabled: false, checked: true }));
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
      const data = await fetchJson(`/api/chapters/${chapterId}/verses`);
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
  }, [fetchJson, source]);

  useEffect(() => {
    if (active === 'reader') loadVerses(selectedChapter, selectedVerse);
  // Intentionally load only when the selected chapter or reader tab changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, selectedChapter]);

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
    setSelectedChapter(Number(chapterId));
    setActive('reader'); setMobileNav(false);
    if (key) setSelectedVerse(key);
    if (Number(chapterId) === Number(selectedChapter)) loadVerses(chapterId, key);
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
      const reciter = reciters.find((r) => String(r.id) === '7') || reciters[0];
      const result = await fetchJson(`/api/audio/chapter/${reciter.id}/${selectedChapter}`);
      const item = result.item || result.audio || result;
      const url = item.audioUrl || item.audio_url || item.url;
      if (!url) throw new Error('The recitation response did not include an audio URL.');
      setAudioState({ url, title: `${chapterName(activeChapter)} · ${reciter.reciterName || reciter.name || 'Quran recitation'}`, loading: false, playing: true });
    } catch (error) {
      setAudioState((s) => ({ ...s, loading: false })); notify(error.message || 'Audio is not available in this environment.');
    }
  };

  const runSearch = async (term = query) => {
    const clean = term.trim();
    if (!clean) { setSearchResults([]); setSearchMessage('Search chapters or try a theme such as mercy, patience, or gratitude.'); return; }
    setSearchBusy(true); setSearchMessage('Searching available Quran Foundation resources…');
    try {
      const data = await fetchJson(`/api/search?q=${encodeURIComponent(clean)}`);
      const root = data.result || data;
      const results = Array.isArray(root) ? root : (root.search?.results || root.results || root.verses || root.matches || root.data || []);
      setSearchResults(Array.isArray(results) ? results.slice(0, 20) : []);
      setSearchMessage(results.length ? `Found ${results.length} available result${results.length === 1 ? '' : 's'}.` : 'The API returned no results for this search.');
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
        {active === 'reader' && <ReaderPage chapters={chapters} activeChapter={activeChapter} selectedChapter={selectedChapter} setSelectedChapter={setSelectedChapter} verses={verses} loading={loadingVerses} error={readerError} selectedVerse={selectedVerse} setSelectedVerse={setSelectedVerse} bookmarks={bookmarkedKeys} toggleBookmark={toggleBookmark} showTranslation={showTranslation} setShowTranslation={setShowTranslation} fontScale={fontScale} setFontScale={setFontScale} markRead={markRead} playChapter={playChapter} audioLoading={audioState.loading} onSearch={() => setSearchOpen(true)} loadVerses={loadVerses} onNotify={notify} activeWord={activeWord} setActiveWord={setActiveWord} source={source} />}
        {active === 'discover' && <DiscoverPage chapters={chapters} onRead={openReader} onSearch={(term) => { setQuery(term); setSearchOpen(true); runSearch(term); }} />}
        {active === 'resources' && <ResourcesPage onRead={openReader} notify={notify} />}
        {active === 'hifz' && <HifzPage learned={learned} setLearned={setLearned} chapters={chapters} onRead={openReader} notify={notify} />}
        {active === 'reflections' && <ReflectionsPage notes={notes} noteDraft={noteDraft} setNoteDraft={setNoteDraft} noteTitle={noteTitle} setNoteTitle={setNoteTitle} addReflection={addReflection} exportNotes={exportNotes} deleteNote={(id) => { setNotes((n) => n.filter((x) => x.id !== id)); notify('Reflection deleted'); }} selectedVerse={selectedVerse} />}
        {active === 'saved' && <SavedPage bookmarks={bookmarks} removeBookmark={(key) => { setBookmarks((old) => old.filter((x) => x.key !== key)); notify('Removed from saved ayat'); }} onRead={openReader} copyText={copyText} />}
        {active === 'progress' && <ProgressPage dailyGoal={dailyGoal} setDailyGoal={setDailyGoal} readCount={readCountToday} progressPercent={progressPercent} activity={activity} learned={learned} bookmarks={bookmarks} notes={notes} onNavigate={setActive} />}
      </div>
      <footer className="app-footer"><span>Made with intention by <strong>Syxlor</strong></span><span><span className="footer-dot">✦</span> A space for reflection, not a replacement for trusted scholarship.</span></footer>
    </main>

    {audioState.url && <div className="audio-dock"><div className="audio-art"><AudioLines size={21} /></div><div className="audio-meta"><strong>{audioState.title || 'Quran recitation'}</strong><span>Now playing · Chapter recitation</span></div><audio ref={audioRef} controls onPlay={() => setAudioState((s) => ({ ...s, playing: true }))} onPause={() => setAudioState((s) => ({ ...s, playing: false }))} onEnded={() => setAudioState((s) => ({ ...s, playing: false }))} /><button className="icon-button" onClick={() => { audioRef.current?.pause(); setAudioState({ url: '', title: '', loading: false, playing: false }); }} aria-label="Close audio player"><X size={17} /></button></div>}
    {searchOpen && <SearchModal query={query} setQuery={setQuery} onClose={() => setSearchOpen(false)} onSearch={runSearch} busy={searchBusy} results={searchResults} message={searchMessage} chapters={chapters} onRead={(chapterId, key) => { setSearchOpen(false); openReader(chapterId, key); }} />}
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

function ReaderPage({ chapters, activeChapter, selectedChapter, setSelectedChapter, verses, loading, error, selectedVerse, setSelectedVerse, bookmarks, toggleBookmark, showTranslation, setShowTranslation, fontScale, setFontScale, markRead, playChapter, audioLoading, onSearch, loadVerses, onNotify, activeWord, setActiveWord, source }) {
  const [chapterQuery, setChapterQuery] = useState('');
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false);
  const filteredChapters = chapters.filter((c) => `${chapterName(c)} ${chapterTranslation(c)} ${c.id}`.toLowerCase().includes(chapterQuery.toLowerCase()));
  const currentIndex = Math.max(0, chapters.findIndex((c) => Number(c.id) === Number(selectedChapter)));
  const selectedVerseObj = verses.find((v) => verseKey(v, selectedChapter) === selectedVerse);
  const goPrev = () => { const next = chapters[Math.max(0, currentIndex - 1)]; if (next) setSelectedChapter(Number(next.id)); };
  const goNext = () => { const next = chapters[Math.min(chapters.length - 1, currentIndex + 1)]; if (next) setSelectedChapter(Number(next.id)); };
  return <div className="reader-page view-enter"><div className="reader-intro"><div><div className="eyebrow"><BookOpen size={13} /> QURAN READER</div><h1>A moment with the <em>Quran.</em></h1><p>Read at your own pace. Let each ayah have the space it deserves.</p></div><div className="reader-source-badge"><span className={`status-dot ${source === 'quran-foundation' ? 'online' : 'offline'}`} />{source === 'quran-foundation' ? 'Quran Foundation' : 'Preview content'}</div></div>
    <div className="reader-toolbar card-surface"><button className="chapter-select" onClick={() => setChapterPickerOpen((x) => !x)}><div className="surah-number">{activeChapter.id}</div><div><strong>{chapterName(activeChapter)}</strong><span>{chapterTranslation(activeChapter) || 'Surah'} · {activeChapter.versesCount || activeChapter.verses_count || '—'} ayat</span></div><ChevronDown size={17} className={chapterPickerOpen ? 'rotated' : ''} /></button><div className="reader-tool-actions"><button className="tool-button" onClick={onSearch}><Search size={16} /><span>Find ayah</span></button><button className={`tool-button ${showTranslation ? 'tool-selected' : ''}`} onClick={() => setShowTranslation((v) => !v)}><Languages size={16} /><span>Translation</span></button><div className="font-control"><button onClick={() => setFontScale((s) => Math.max(.8, +(s - .1).toFixed(1)))} aria-label="Decrease font size">A−</button><span>{Math.round(fontScale * 100)}%</span><button onClick={() => setFontScale((s) => Math.min(1.8, +(s + .1).toFixed(1)))} aria-label="Increase font size">A+</button></div></div></div>
    {chapterPickerOpen && <div className="chapter-picker card-surface"><div className="picker-search"><Search size={16} /><input value={chapterQuery} onChange={(e) => setChapterQuery(e.target.value)} placeholder="Find a surah..." autoFocus /><span>{filteredChapters.length} surahs</span></div><div className="chapter-picker-list">{filteredChapters.map((c) => <button key={c.id} className={Number(c.id) === Number(selectedChapter) ? 'picker-chapter active' : 'picker-chapter'} onClick={() => { setSelectedChapter(Number(c.id)); setChapterPickerOpen(false); setChapterQuery(''); }}><span className="surah-number small-number">{c.id}</span><span><strong>{chapterName(c)}</strong><small>{chapterTranslation(c)}</small></span><span className="picker-meta">{c.versesCount || c.verses_count || '—'} ayat</span>{Number(c.id) === Number(selectedChapter) && <Check size={16} />}</button>)}</div></div>}
    <div className="reader-navigation"><button className="text-link" onClick={goPrev} disabled={currentIndex === 0}><ChevronLeft size={15} /> Previous surah</button><span className="reader-progress-text">Surah {selectedChapter} <span>of</span> 114</span><button className="text-link" onClick={goNext} disabled={currentIndex >= chapters.length - 1}>Next surah <ChevronRight size={15} /></button></div>
    <div className="bismillah-card"><div className="bismillah-ornament">✧</div><div>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div><span>In the name of Allah, the Most Compassionate, the Most Merciful</span><div className="bismillah-ornament">✧</div></div>
    {error && <div className="inline-notice"><CircleHelp size={17} /><span>{error}</span></div>}
    {loading ? <div className="loading-panel card-surface"><LoaderCircle className="spin" size={24} /><strong>Preparing your reading space</strong><span>Fetching chapter content...</span></div> : verses.length ? <div className="verses-list">{verses.map((verse, index) => { const key = verseKey(verse, selectedChapter); const isSelected = selectedVerse === key; const words = Array.isArray(verse.words) ? verse.words : []; return <article key={key} className={`verse-row ${isSelected ? 'verse-row-selected' : ''}`} onClick={() => { setSelectedVerse(key); markRead(verse); }}><div className="verse-row-top"><span className="verse-key"><span className="verse-key-mark">✧</span>{key}</span><div className="verse-actions"><button className={`verse-action ${bookmarks.has(key) ? 'is-bookmarked' : ''}`} onClick={(e) => { e.stopPropagation(); toggleBookmark(verse); }} aria-label={bookmarks.has(key) ? 'Remove bookmark' : 'Bookmark verse'}><Bookmark size={16} fill={bookmarks.has(key) ? 'currentColor' : 'none'} /></button><button className="verse-action" onClick={(e) => { e.stopPropagation(); onNotify('Verse audio becomes available when the audio endpoint is enabled.'); }} aria-label="Play verse"><Play size={15} /></button><button className="verse-action" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(`${verseArabic(verse)}\n${verseTranslation(verse)}\n— ${key}`).then(() => onNotify('Ayah copied')).catch(() => onNotify('Clipboard unavailable')); }} aria-label="Copy verse"><Copy size={15} /></button></div></div><div className="verse-arabic-line" dir="rtl" style={{ fontSize: `${2.12 * fontScale}rem` }}>{words.length ? words.map((word, wi) => <button key={`${key}-w-${wi}`} className={`arabic-word ${activeWord?.key === key && activeWord?.index === wi ? 'word-active' : ''}`} onClick={(e) => { e.stopPropagation(); setActiveWord({ key, index: wi, word }); }} title="Explore this word">{word.textUthmani || word.text_uthmani || word.text || word.charTypeName || ''}</button>) : verseArabic(verse)}<span className="ayah-end">۞<small>{String(key).split(':')[1]}</small></span></div>{showTranslation && <p className="verse-translation-line">{verseTranslation(verse)}</p>}{activeWord?.key === key && <div className="word-detail"><div><strong>{activeWord.word.translation?.text || activeWord.word.translation?.name || activeWord.word.text || 'Selected word'}</strong><span>Word-level data supplied by the current resource, if available.</span></div><button onClick={(e) => { e.stopPropagation(); setActiveWord(null); }}><X size={15} /></button></div>}<div className="verse-row-bottom"><span>{isSelected ? <><span className="selected-indicator" /> Currently selected</> : `Ayah ${String(key).split(':')[1]}`}</span>{isSelected && <span className="verse-reading-status"><Check size={13} /> Added to your reading activity</span>}</div></article>; })}</div> : <div className="empty-state card-surface"><BookOpen size={29} /><h3>This chapter isn't available in the current environment</h3><p>New Quran Foundation projects start with pre-live content for Al-Fatihah and Al-Baqarah. Production access enables the full Quran.</p><button className="button button-primary" onClick={() => setSelectedChapter(1)}>Open Al-Fatihah</button></div>}
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

function ReflectionsPage({ notes, noteDraft, setNoteDraft, noteTitle, setNoteTitle, addReflection, exportNotes, deleteNote, selectedVerse }) {
  const prompts = ['What stood out to me today?', 'What do I want to remember?', 'Where can I practice patience?', 'What am I grateful for right now?'];
  return <div className="reflections-page view-enter"><div className="page-hero-simple reflections-hero"><div><div className="eyebrow"><NotebookPen size={13} /> REFLECTIONS & NOTES</div><h1>Make room for <em>meaning.</em></h1><p>A private space to capture what you are learning, noticing, and carrying with you.</p></div><div className="journal-icon-art"><NotebookPen size={39}/><span>✧</span></div></div>
    <div className="reflection-layout"><section className="reflection-composer card-surface"><div className="composer-heading"><span className="eyebrow">A MOMENT TO YOURSELF</span><span className="private-label"><LockKeyhole size={13} /> Saved locally</span></div><input className="reflection-title-input" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Give this reflection a title..." maxLength={100} /><textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="What is on your heart today? Write a thought, a question, or something you would like to remember..." rows={7} maxLength={5000} /><div className="composer-footer"><span>{noteDraft.length}/5000 characters · {selectedVerse || 'No ayah linked'}</span><button className="button button-primary" onClick={addReflection}><Plus size={16} /> Save reflection</button></div><div className="writing-prompts"><span>NEED A STARTING POINT?</span>{prompts.map((p) => <button key={p} onClick={() => setNoteDraft((d) => d ? `${d}\n\n${p}\n` : `${p}\n`)}>{p} <ArrowDownRight size={13}/></button>)}</div></section>
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

function SearchModal({ query, setQuery, onClose, onSearch, busy, results, message, chapters, onRead }) {
  useEffect(() => { const t = setTimeout(() => document.querySelector('.search-modal-input')?.focus(), 40); return () => clearTimeout(t); }, []);
  const quick = ['mercy', 'patience', 'gratitude', 'knowledge'];
  return <div className="modal-overlay search-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="search-modal" role="dialog" aria-modal="true" aria-label="Search Quran"><div className="search-modal-top"><div className="search-modal-icon"><Search size={18}/></div><form onSubmit={(e) => { e.preventDefault(); onSearch(); }}><input className="search-modal-input" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }} placeholder="Search Quran, surahs, themes..." /><kbd>ENTER</kbd></form><button className="icon-button" onClick={onClose} aria-label="Close search"><X size={18}/></button></div><div className="search-modal-body">{!query && <div className="search-quick"><span>TRY A THEME</span><div>{quick.map((x) => <button key={x} onClick={() => { setQuery(x); onSearch(x); }}>{x}</button>)}</div><span className="search-tip">Search is subject to API permissions. Chapter navigation always remains available.</span></div>}{busy ? <div className="search-loading"><LoaderCircle className="spin" size={20}/> Searching available resources...</div> : results.length ? <><div className="search-results-header">RESULTS <span>{results.length}</span></div><div className="search-results-list">{results.map((r, i) => { const key = r.verseKey || r.verse_key || (r.id && r._chapter ? String(r.id) : `${i}`); if (r._chapter) return <button key={`chapter-${r.id}`} className="search-result" onClick={() => onRead(Number(r.id))}><span className="result-kind"><BookOpen size={14}/></span><span className="result-copy"><strong>{r.title || chapterName(r)}</strong><small>{r.snippet || chapterTranslation(r)}</small></span><ArrowRight size={16}/></button>; return <button key={`${key}-${i}`} className="search-result" onClick={() => { const split = String(key).split(':'); onRead(Number(split[0] || 1), key.includes(':') ? key : undefined); }}><span className="result-kind"><BookText size={14}/></span><span className="result-copy"><strong>{key.includes(':') ? `Surah ${key}` : r.title || r.name || 'Quran result'}</strong><small>{r.snippet || r.text || r.translation?.text || (r.translations?.[0]?.text) || 'Open this result in the reader'}</small></span><ArrowRight size={16}/></button>; })}</div></> : <div className="search-message">{message}</div>}</div><div className="search-modal-footer"><span><kbd>ESC</kbd> to close</span><span><Sparkles size={13}/> Search with intention</span></div></section></div>;
}

function SettingsModal({ settings, setSettings, apiStatus, onClose, onOpenProgress }) {
  return <div className="modal-overlay settings-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings"><div className="settings-head"><div><span className="eyebrow">YOUR EXPERIENCE</span><h2>Settings</h2></div><button className="icon-button" onClick={onClose} aria-label="Close settings"><X size={18}/></button></div><div className="setting-row"><div className="setting-copy"><strong>Appearance</strong><span>Choose the mood of your reading space.</span></div><div className="appearance-options"><button className={settings.theme === 'light' ? 'appearance-selected' : ''} onClick={() => setSettings((s) => ({ ...s, theme: 'light' }))}><Sun size={15}/> Light</button><button className={settings.theme === 'dark' ? 'appearance-selected' : ''} onClick={() => setSettings((s) => ({ ...s, theme: 'dark' }))}><Moon size={15}/> Dark</button></div></div><div className="setting-row"><div className="setting-copy"><strong>Arabic font size</strong><span>Adjust the reading canvas.</span></div><select value={settings.arabicSize} onChange={(e) => setSettings((s) => ({ ...s, arabicSize: e.target.value }))}><option value="compact">Compact</option><option value="regular">Regular</option><option value="large">Large</option></select></div><div className="settings-api-card"><div className="settings-api-head"><span className={`status-dot ${apiStatus.configured ? 'online' : 'offline'}`}/><strong>Quran Foundation connection</strong></div><p>{apiStatus.configured ? `Credentials detected · ${apiStatus.environment} environment` : 'The app is running in preview mode. Add credentials to your server .env file to fetch live Quran content.'}</p><div className="api-facts"><span>Content API <b>{apiStatus.configured ? 'Configured' : 'Preview'}</b></span><span>Search API <b>{apiStatus.searchEnabled ? 'Enabled' : 'Permission required'}</b></span><span>Credentials <b>Server-side only</b></span></div></div><div className="settings-privacy"><LockKeyhole size={17}/><span>Bookmarks, goals, and reflections are stored in local browser storage. Clearing browser data may remove them.</span></div><button className="button button-primary button-full" onClick={onOpenProgress}>View your progress <ArrowRight size={15}/></button></section></div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);

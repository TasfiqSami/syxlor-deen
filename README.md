# Syxlor Deen

**Read. Learn. Reflect. Grow.**

Syxlor Deen is an independent Quran and Islamic learning web app built with React, Vite, Node.js/Express, and the official `@quranjs/api` SDK. It combines Quran reading, audio, resource discovery, Quran-related references, personal study tools, Content Sync, OAuth-backed account features, QuranReflect posting, app analytics, and a prayer-times experience.

It is designed to be usable in preview mode and to unlock API-backed functions when your Quran Foundation project is configured and approved for the relevant environment and scopes.

## Features

### Quran reading and content

- Chapter list and interactive reader with Arabic text, translations, word data, font-size controls, verse selection, bookmarks, and a translation-resource selector.
- Chapter/ayah navigation and random verse of the day.
- Single-ayah, single-word, and chapter audio routes with distinct resource IDs for ayah recitations and chapter reciters.
- Resource catalogues for translations, tafsirs, languages, chapter information, recitations, chapter reciters, recitation styles, verse media, Mushafs, word-by-word translations/transliterations, and Qira'at when exposed by the installed SDK and available to the project.
- Surah background, Juz/other division browsing, hadith-reference lookup and Quran Answers lookups where the API provides the relevant data.
- Quick and advanced Search API modes with paging controls at the server route and a separate Search API permission toggle. Search is not silently simulated when the Search API is disabled.
- A Content Sync explorer that bootstraps, pages, incrementally syncs, fetches snapshots, stores snapshot JSON and sync checkpoints server-side, and exposes the cached resource list. Reader routes can use a synced `quran_core:1` snapshot when the live verse request is unavailable, provided that a usable local snapshot exists.
- A QuranReflect publishing action for reflections, using an explicitly chosen draft or public-post mode and the connected user's approved `post` scope.

### Personal learning tools

- Dashboard, continue-reading shortcut, daily intention, random ayah, progress indicators and daily reading target.
- Hifz/revision checklist.
- Private local reflection journal with prompts, saving, deletion and Markdown export.
- Saved ayat list with copy/open/remove actions.
- Browser-local progress and preferences.
- Light/dark theme, keyboard search shortcut (`Ctrl/Cmd+K`), reduced-motion support, toast feedback, loading/empty/error states, touch-friendly layouts and responsive navigation.
- Installable Progressive Web App (PWA) metadata and service-worker shell caching. Previously loaded same-origin static assets may be cached, but `/api/*` responses are intentionally not cached and full offline Quran access requires the separate Content Sync data path.

### Prayer times

- Location by city/country or browser geolocation.
- Current-day schedule, next-prayer countdown, calculation methods, Shafi'i/standard or Hanafi Asr choice, monthly table, Qibla bearing, local completion marks, and opt-in notification reminders while the site remains open and the browser has granted notification permission.
- A direct link to [Muslim Pro prayer times](https://app.muslimpro.com/prayer-times), as requested. Syxlor's prayer calculator is independently powered by AlAdhan; it is not an embedded Muslim Pro widget and does not claim to use Muslim Pro's private API.

Prayer calculations use the external [AlAdhan Prayer Times API](https://aladhan.com/prayer-times-api), not the Quran Foundation API. Timings can vary from a local mosque or national authority, so confirm locally.

## Feature coverage and honest limitations

This project integrates the documented API families that can reasonably be represented in an interactive web workspace: Content, Search, User APIs, OAuth2/OpenID Connect, Content Sync, Analytics Events, audio resources and QuranReflect. It exposes a catalogue browser and a generic signed-in User API console so that more approved resources can be explored without inventing unsupported endpoints. The Quran Foundation SDK and the project's approved scopes determine which remote operations actually work. This is not a claim that every endpoint in every future API version is implemented or enabled.

The UI is designed for desktop, tablet and narrow mobile layouts, with transitions, animated loading indicators, keyboard focus styles, reduced-motion handling and a light/dark theme. It includes installable PWA metadata and static-shell caching. API data is deliberately excluded from the service-worker cache; use Content Sync for supported, license-permitted offline content.

## Requirements

- Node.js 20.19+ or 22.12+ recommended.
- npm.
- A Quran Foundation Developer Console project with credentials for the chosen environment.

## Run locally

1. Extract the ZIP and open a terminal in the `syxlor-deen` folder.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and replace the placeholder credentials with a **rotated** client ID and client secret. Do not paste secrets into `src/`, `VITE_*` variables, or frontend code.
4. Start the app:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:5173`. Vite proxies `/api` calls to the Express server on port `8787`.

For a production-style local run:

```bash
npm run build
npm start
```

Then open `http://localhost:8787`.

## Environment configuration

| Variable | Purpose |
| --- | --- |
| `QF_CLIENT_ID` | Quran Foundation application client ID. |
| `QF_CLIENT_SECRET` | Confidential server-side secret. Never expose it publicly. |
| `QF_ENV` | `prelive` or `production`; use matching credentials and permissions. |
| `QF_TRANSLATION_ID` | Default translation resource ID used by the reader. Confirm the resource is available in your environment. |
| `QF_SEARCH_ENABLED` | Set `true` only after Search API access is approved. |
| `QF_REDIRECT_URI` | Exact OAuth callback URL registered in Developer Console. Local example: `http://localhost:8787/api/auth/callback`. |
| `QF_APP_URL` | App URL to redirect to after OAuth. Local example: `http://localhost:5173`. Adjust for deployment. |
| `QF_OAUTH_SCOPES` | Space-separated list of OAuth scopes approved for this application/environment. Defaults to `openid offline_access user`. Add only scopes that have been approved. |
| `QF_ANALYTICS_EVENTS_URL` | Optional override for the Analytics Events API endpoint if required by the assigned API environment. |
| `PORT` | Express server port; defaults to `8787`. |

For User APIs such as bookmarks, collections, notes, goals, activity days and app state, add the relevant approved scopes to `QF_OAUTH_SCOPES` and reconnect after changing them. QuranReflect publishing additionally requires the `post` scope. Analytics requires the application-level `analytics.events.write` scope. Qira'at access may require production and `qiraat.read` permission. Search requires Search access.

The local OAuth session store is in memory. It is acceptable for local testing and a single-process prototype, but production deployments should use a persistent shared session store, rate limiting, CSRF protection on state-changing routes, structured security logging without secrets, and secret management supplied by the hosting platform.

## Important environment and offline-content facts

- Quran Foundation pre-live content currently includes Al-Fatihah and Al-Baqarah, not the complete canonical Quran. Complete `quran_core:1` is a production resource that requires approved production access.
- Content API feature support does not mean all resource IDs are published in every environment. A resource catalogue or snapshot may return no data until your application and environment are authorized for it.
- Content Sync is the required path for maintaining offline copies of resources covered by Content Sync terms. The app caches snapshots and tracks pagination/checkpoints on the server. If the console reports resources needing a snapshot refresh after a row mutation, refresh them before relying on the cache. Sync at least every seven days when connected, as described in the official terms.
- Snapshot files and server-side sync checkpoints are written under `data/content-sync/`, which is git-ignored. Back up this folder if you intentionally maintain a server-side mirror; do not redistribute resource copies unless the applicable Developer Terms and resource license permit it.
- Local bookmarks, Hifz marks, settings and journal entries are stored in the browser. They do not automatically sync with a Quran Foundation account; the account connection enables the available User APIs separately.
- Publishing a QuranReflect post is an external action. The UI defaults to a draft and requires the user to select the public-post option explicitly.
- This project does not bundle an LLM. The Quran Foundation API provides retrieval/content primitives, not a turnkey generative AI model. A Quran AI feature would require a separately configured model and source-grounding safeguards.

## API routes implemented

| Route | Purpose |
| --- | --- |
| `GET /api/health`, `GET /api/config` | Runtime/configuration status without returning credentials. |
| `GET /api/chapters` | Chapter list. |
| `GET /api/chapters/:id/verses?translationId=...` | Chapter verses, word data and selected translation. |
| `GET /api/verses/random`, `GET /api/verses/:chapter-:verse` | Random or keyed verse. |
| `GET /api/search?q=...` with `mode=quick` or `mode=advanced&page=1&size=20` | Quick/advanced Search API, gated by configuration and permission. |
| `GET /api/resources` | Resource catalogues, individually marked if unavailable. |
| `GET /api/resources/:catalog/:id/info` | Resource-specific info where the SDK supports it. |
| `GET /api/chapters/:id/info` | Chapter background information. |
| `GET /api/juzs`, `GET /api/juzs/:id/verses` | Juz list and verses. |
| `GET /api/divisions/:type`, `GET /api/divisions/:type/:id/verses` | Metadata and verses for pages, juz, hizb, rub, ruku, manzil where the installed SDK supports them. |
| `GET /api/audio/reciters`, `GET /api/audio/chapter/:reciter/:chapter` | Chapter audio metadata. |
| `GET /api/audio/verse-reciters`, `GET /api/audio/verse/:recitation/:chapter-:verse`, `GET /api/audio/verse-chapter/:recitation/:chapter` | Ayah recitation resources, single-ayah audio and chapter-wide ayah-recitation results. |
| `GET /api/audio/word/:chapter-:verse/:wordIndex` | Word pronunciation audio. |
| `GET /api/hadith/:chapter-:verse` | Hadith references/related hadith records for an ayah. |
| `GET /api/answers/:chapter-:verse` | Quran Answers linked to an ayah. |
| `GET /api/qiraat` | Qira'at resource lookup when available and authorized. |
| `GET /api/content/verse/:chapter-:verse`, `GET /api/content/footnote/:id` | Extended verse content and footnote lookup where helper support exists. |
| `GET /api/content-sync/status` | Content Sync availability and cache status. |
| `POST /api/content-sync/run` | Single-page SDK sync request. |
| `POST /api/content-sync/sync-managed` | Managed paginated sync, snapshot application and server-side checkpoints. |
| `POST /api/content-sync/snapshot` | Fetch and cache a resource snapshot; response includes a bounded preview. |
| `GET /api/content-sync/cache`, `GET /api/content-sync/cache/:group/:id` | Inspect saved server-side sync resources. Add `?includeRecords=true` to request a complete cached snapshot. |
| `POST /api/analytics/events` | Submit 1–100 validated application events with approved application analytics scope. |
| `GET /api/auth/login`, `GET /api/auth/callback`, `GET /api/auth/status`, `POST /api/auth/logout` | OAuth login and session status. |
| `GET/POST/PATCH/PUT/DELETE /api/user/:resource[/recordId]` | Generic allowlisted User API console proxy for authorized user data. |
| `POST /api/quranreflect/posts`, `GET/PATCH /api/quranreflect/posts/:id` | Create draft/public QuranReflect post, read or update a post with a valid signed-in user session and `post` scope. |

All endpoint groups have environment, scope, resource-availability or SDK-version caveats. A visible button is not proof that the remote provider has approved that capability for this client.

## Quality and deployment checklist

1. Rotate the credential secret that was previously pasted into chat. Do not reuse it.
2. Keep `.env` out of Git. The `.gitignore` excludes it and server content-sync cache.
3. Start with pre-live. Switch to production only after access is approved and the right production keys are installed.
4. Register the exact callback URL and request only scopes approved by Quran Foundation.
5. Check translations, tafsir and recitation licenses, attribution requirements, and storage terms before publishing or bundling any resource.
6. Use HTTPS in production, a persistent shared session store, rate limiting and server-side secrets.
7. Test prayer times against your local mosque timetable; prayer calculations are not a substitute for local authority guidance.

## Documentation links

- [Quran Foundation API Reference](https://api-docs.quran.foundation/docs/api-reference/)
- [Quran Foundation Developer Journey](https://api-docs.quran.foundation/docs/developer-journey/)
- [JavaScript SDK](https://api-docs.quran.foundation/docs/sdk/javascript/)
- [Audio SDK guide](https://api-docs.quran.foundation/docs/sdk/javascript/audio/)
- [QuranReflect Posts guide](https://api-docs.quran.foundation/docs/sdk/javascript/quranreflect-posts/)
- [Content Sync guide](https://api-docs.quran.foundation/docs/tutorials/content-sync/getting-started/)
- [Analytics Events API](https://api-docs.quran.foundation/docs/analytics_apis_versioned/1.0.0/analytics-events-api/)
- [AlAdhan Prayer Times API](https://aladhan.com/prayer-times-api)
- [OAuth scopes](https://api-docs.quran.foundation/docs/user_related_apis_versioned/scopes/)
- [Muslim Pro prayer times](https://app.muslimpro.com/prayer-times)

Syxlor Deen is an independent project concept and is not an official Quran.com, Quran Foundation or Muslim Pro product.

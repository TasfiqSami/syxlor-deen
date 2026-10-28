# Syxlor Deen

**A quieter way to read, learn, reflect, and grow with the Quran.**

Syxlor Deen is a responsive React website with a server-side Quran Foundation API integration. It is built to start in an interactive preview mode, and it upgrades to authenticated Quran Foundation content when server credentials and permissions are configured.

## Included features

- Responsive overview dashboard and adaptive navigation.
- Quran reader with chapter picker, Arabic text, available translations, verse selection, reading activity, font sizing, translation visibility, and bookmarking.
- Quran Foundation Content API integration for chapters, chapter verses, random verses, and chapter recitation resources.
- Quran Foundation Search API integration (only when search permission is granted and explicitly enabled in config).
- Audio catalogue and chapter recitation URL lookup, plus a persistent browser audio player.
- Chapter discovery with Meccan/Medinan filters and topic search entry points.
- Hifz/revision checklist, adjustable daily ayah goal, and activity tracking.
- Reflections/journal with prompts, local saving, deletion, and Markdown export.
- Saved ayat collection with copy/open/remove actions.
- Light/dark appearance setting, keyboard shortcut (Ctrl/Cmd+K), toast feedback, loading states, API status display, reduced-motion support.
- Local browser persistence for bookmarks, daily goals, activity, hifz checkmarks, settings, last reading, and reflections.
- Graceful preview content and API error messages for environments with limited permissions.

## Requirements

- Node.js 20.19+ or 22.12+ recommended (Node.js 22 is recommended).
- npm.
- A Quran Foundation Developer Console backend/server app for live Content API data.

## Run locally

1. Extract this folder.
2. Install packages:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env`.
4. Enter your **rotated** Quran Foundation credentials in `.env`:

   ```dotenv
   QF_CLIENT_ID=your_client_id
   QF_CLIENT_SECRET=your_rotated_client_secret
   QF_ENV=prelive
   QF_TRANSLATION_ID=131
   QF_SEARCH_ENABLED=false
   PORT=8787
   ```

5. Start the frontend and API server together:

   ```bash
   npm run dev
   ```

6. Open the Vite URL printed by the terminal, normally `http://localhost:5173`.

For a production-style local start:

```bash
npm run build
npm start
```

Then open `http://localhost:8787`.

## API configuration notes

- The app uses the official `@quranjs/api` SDK from a Node.js backend.
- For `QF_ENV=prelive`, the SDK is explicitly configured to use `https://apis-prelive.quran.foundation` and `https://prelive-oauth2.quran.foundation` so it matches pre-live credentials.
- Keep `QF_ENV=prelive` when using pre-live keys. Switch to `production` only after production credentials and permissions are approved, and update both credentials and environment together.
- Quran Foundation documents that pre-live currently has only Al-Fatihah and Al-Baqarah in its Quran content dataset. The site still displays chapter metadata in preview, but it does not fabricate verse text for unavailable chapters.
- Search API access is separate. After the Search API scope/permission is approved for the same environment, change `QF_SEARCH_ENABLED=true`.
- `QF_TRANSLATION_ID` is configurable because the translation/resource ID must match a resource available to your app. Confirm the intended translation and its distribution terms in the Quran Foundation resource catalog before publication.
- Chapter recitation resources may not be enabled/available in every environment. When audio data is unavailable, the site shows a toast instead of inventing a URL.
- User-specific Quran Foundation data (OAuth login, remote bookmarks/collections/goals) is not automatically activated by client-credentials access. The current app deliberately stores personal UI state locally. OAuth user account integration is a separate step that requires a configured redirect URI, Authorization Code + PKCE flow, server-side code exchange/session handling, and the relevant User API scopes.
- Content Sync/offline dataset synchronization, a live translation selector, Qira'at endpoint UI, QuranReflect posting, OAuth account connection, and remote App State are potential next expansions; they are not represented as fully implemented features in this starter. Resource catalogs, juz verse reads, chapter background, hadith references, and Quran Answers lookups are included.

## API routes included

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Liveness and whether credentials are configured |
| `GET /api/config` | Client-safe app/API configuration status (never returns credentials) |
| `GET /api/chapters` | Chapter metadata from Content API or preview metadata |
| `GET /api/chapters/:id/verses` | Chapter verses, Arabic text, word data, configured translation |
| `GET /api/verses/random` | Random verse from API, or preview fallback |
| `GET /api/verses/:chapter-:verse` | Single verse by key, e.g. `/api/verses/1-1` |
| `GET /api/search?q=mercy` | Search API query, requires explicit Search permission and configuration |
| `GET /api/audio/reciters` | Chapter reciter catalogue |
| `GET /api/audio/chapter/:reciter/:chapter` | Chapter recitation metadata and URL |

## Security checklist before deployment

1. **Rotate the client secret** that was pasted into a chat. Do not reuse an exposed secret.
2. Store credentials only in your hosting provider's environment-variable/secret settings or in an untracked local `.env` file.
3. Never put `QF_CLIENT_SECRET` in React code, `VITE_*` environment variables, frontend bundles, public source control, or browser local storage.
4. Never commit `.env`. The `.gitignore` excludes it.
5. Enable production access and only the specific scopes you actually use.
6. Add rate limits and request logging without logging secrets/tokens before public launch.
7. Review the licensing and attribution requirements for each translation, tafsir, audio recitation, and supplemental resource.
8. Implement a real OAuth2 Authorization Code + PKCE flow before claiming that users can sign in and sync their Quran Foundation bookmarks or goals.

## Project structure

```text
syxlor-deen/
├── index.html
├── server.js
├── package.json
├── vite.config.js
├── .env.example
├── README.md
├── public/
│   ├── favicon.svg
│   └── manifest.webmanifest
└── src/
    ├── main.jsx
    ├── data.js
    └── styles.css
```

## Documentation

- Quran Foundation API docs: https://api-docs.quran.foundation/docs/api-reference/
- Developer journey: https://api-docs.quran.foundation/docs/developer-journey/
- JavaScript server quickstart: https://api-docs.quran.foundation/docs/sdk/javascript/server-quickstart/
- Full-stack quickstart: https://api-docs.quran.foundation/docs/sdk/javascript/full-stack/
- Search API quickstart: https://api-docs.quran.foundation/docs/sdk/javascript/search/
- Content Sync: https://api-docs.quran.foundation/docs/tutorials/content-sync/getting-started/

---

Syxlor Deen is an independent community project concept, not an official Quran.com or Quran Foundation product.

# Book Automation System

Next.js 14 (App Router) + Prisma/PostgreSQL + Groq, Gemini and Tavily. Research a niche, build an author blueprint, outline and draft chapters, design covers, and repurpose chapters into social posts.

## Setup

```bash
npm install                      # also runs prisma generate
cp .env.example .env.local       # fill in DATABASE_URL and the API keys
npm run db:push                  # create tables (loads .env.local)
npm run dev
```

Required: `DATABASE_URL`, `GROQ_API_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Create the Google OAuth client (type Web application) at console.cloud.google.com/apis/credentials and add `<NEXTAUTH_URL>/api/auth/callback/google` as an authorized redirect URI. `TAVILY_API_KEY` is needed for web research, `GEMINI_API_KEY` for cover images.

## Flow

1. **Overview**: create a project (title + niche).
2. **Ikigai Core**: answer four prompts (typing or dictation). The model writes `author_blueprint.md`; edits you save are what later generations read.
3. **Research**: web search via Tavily or upload `.txt/.md/.pdf`. Produces an Outlier Score (1-100, computed in code from model-assessed sub-scores in `lib/frameworks/outlier-evaluator.ts`), market gaps, competitors, and a strategy report.
4. **Content Studio**: generate an outline, draft chapters with the 7-step narrative opening, rewrite selections with AI.
5. **Marketing**: Gemini covers/promo images, and LinkedIn/X posts passed through the anti-AI formatter (`lib/anti-ai.ts`).
6. **Tutorial**: a guided walkthrough, feature guides and FAQ (content lives in `lib/tutorial.ts`). New authors are pointed to it from the Overview and after creating their first project.

## Content Studio features

- **Versions and snapshots**: every chapter keeps earlier versions (before redrafts, AI rewrites, splits, merges, restores, and periodically while editing), with a word-level comparison and restore. Whole-project snapshots (brief, instructions, blueprint, chapters) are taken before Autopilot, before deleting chapters and before a merge, and can be saved by hand. See `lib/versions.ts`, `lib/snapshots.ts`.
- **Autosave**: text saves a few seconds after typing stops; the editor warns before the tab is closed with unsaved text.
- **Chapter structure**: move chapters up and down, split a chapter at the cursor, merge with the next one (`lib/structure.ts`, `POST /api/chapters/structure`). Chapter order is unique per project, so shifts go through a parking range to avoid collisions.
- **Continuity check**: exact scans (repeated wording, same openings, lopsided lengths, unknown names) plus an AI reading of each chapter's plan, opening and closing for contradictions and dropped threads (`lib/continuity.ts`). The AI part works from excerpts, so its findings are leads to verify. If the model is unavailable the exact scans still return.
- **Progress**: a per-book word goal (`Project.wordGoal`), chapter lengths and a writing streak worked out from chapter edits (`GET /api/progress`).
- **YouTube references**: Research can search YouTube for videos matching the book brief and import transcripts as reference documents (`lib/youtube-search.ts`, Tavily limited to youtube.com).

## Updating an existing install

Pull the latest code, then run `npm install` and `npm run db:push`. The schema has grown (chapter versions, project snapshots and a word goal) and the new features need those tables and columns. `db:push` only adds them. Restart the dev server afterwards so the regenerated Prisma client is picked up; on Windows, stop the server before `npm install` or `prisma generate` or the engine file will be locked.

## When something is rate limited or out of credit

The app explains which service stopped the work and what to do (`lib/errors.ts`): Groq (writing), Tavily (search), Gemini or Pollinations (images), the database or the network. A banner stays on screen with a countdown for rate limits, and long jobs such as Write the whole book pause and retry on their own for per-minute limits but stop with the reason for a used-up allowance, a bad key or an outage.

## Accessibility and mobile

The dashboard uses a menu drawer on phones. Dialogs (history, delete confirmation, menu, listen player) trap focus, close on Escape and return focus to what opened them (`components/ui/Modal.tsx`). There is a skip link, visible keyboard focus rings, labelled form fields and reduced-motion support. This was reviewed by reading the code, not with an automated audit or a screen reader, so run Lighthouse or axe before a public launch.

## Models

Text generation uses Groq. Writing and analysis default to `openai/gpt-oss-120b`, quick tasks (social posts) to `openai/gpt-oss-20b`. Override with `GROQ_MODEL_WRITER` / `GROQ_MODEL_FAST`; change the shared client in `lib/llm.ts`. Groq free tiers have tight tokens-per-minute limits, so long research or chapter requests may need a paid tier.

## Deploying to Vercel

Push to GitHub, import the repo, set the env vars from `.env.example`, and use a hosted Postgres (Neon/Supabase). `build` runs `prisma generate`. Long generations set `maxDuration` (up to 300s); this needs a Vercel plan that allows it.

## Known limits

- Sign-in is Google only. Anyone with a Google account can sign in and spend your API credits; restrict it in the `signIn` callback in `lib/auth.ts` if you need an allowlist.
- Projects created before sign-in existed belong to the placeholder user `author@local.dev`. Reassign them with SQL (`UPDATE "Project" SET "userId" = ...`) if you want them under your Google account.
- Dictation uses the browser Web Speech API (Chrome/Edge). No Whisper endpoint is included.
- Image output is returned as a data URL and is not persisted.

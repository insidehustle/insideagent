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

Pull the latest code, then run `npm install` and `npm run db:push`. The schema has grown (chapter versions, project snapshots, a word goal and background jobs) and the new features need those tables and columns. `db:push` only adds them. Restart the dev server afterwards so the regenerated Prisma client is picked up; on Windows, stop the server before `npm install` or `prisma generate` or the engine file will be locked.

## Writing the whole book in the background

"Write the whole book" is a server-side job (`BookJob`, `lib/jobs.ts`), not a loop in the browser. Its state is in the database and it works in slices of about three minutes, so it fits the host's request limit and survives closing the tab. A slice that is cut off leaves the job for the next one to pick up; a lock on the job stops two slices working at once. The Studio panel shows progress, the reason for any pause, and Resume and Stop buttons.

Three things can run the next slice, and the job does not depend on any single one:

1. **The open browser tab** nudges the job along whenever nothing else is working on it. This needs no setup.
2. **Chaining**: at the end of a slice the server starts the next one in a new request. Set `CRON_SECRET` and `NEXTAUTH_URL` (the site's public URL) to enable it. With these set the browser can be closed.
3. **A scheduled ping** of `/api/cron/jobs` with `Authorization: Bearer $CRON_SECRET` restarts jobs that are waiting out a long rate limit or whose slice was killed. Vercel Cron can do this every minute on a plan that allows it (add `{ "path": "/api/cron/jobs", "schedule": "* * * * *" }` to `vercel.json`; the Hobby plan only allows daily crons and will reject a faster schedule). Otherwise ping it every few minutes from GitHub Actions, cron-job.org or similar.

Without the secret and URL the job still works, but only while a tab is open. It resumes when you come back.

What it does when things go wrong: a short rate limit (under 45 seconds) is waited out inside the slice; a longer one parks the job as *waiting* until the provider says it is clear; a used-up allowance, rejected key, oversized request or database problem *pauses* it with the reason until you press Resume; temporary provider trouble is retried with growing delays and then pauses. A chapter that fails three tries (for example because it is too long to finish within the host's time limit) pauses the job and suggests a lower word count. Chapters already written are never discarded, and a snapshot is taken first if there are drafted chapters.

Limits: one job per book, two running per author. The job writes only chapters still at the outline stage unless "Redraft" is ticked; chapters you write by hand while it runs are left alone.

## When something is rate limited or out of credit

The app explains which service stopped the work and what to do (`lib/errors.ts`): Groq (writing), Tavily (search), Gemini or Pollinations (images), the database or the network. A banner stays on screen with a countdown for rate limits. The background job uses the same explanations and shows them in its panel.

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

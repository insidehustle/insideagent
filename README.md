# Book Automation System

Next.js 14 (App Router) + Prisma/PostgreSQL + Groq, Gemini and Tavily. Research a niche, build an author blueprint, outline and draft chapters, design covers, and repurpose chapters into social posts.

## Setup

```bash
npm install                      # also runs prisma generate
cp .env.example .env.local       # fill in DATABASE_URL and the API keys
npm run db:push                  # create tables (loads .env.local)
npm run dev
```

Required: `DATABASE_URL`, `GROQ_API_KEY`. `TAVILY_API_KEY` is needed for web research, `GEMINI_API_KEY` for cover images.

## Flow

1. **Overview**: create a project (title + niche).
2. **Ikigai Core**: answer four prompts (typing or dictation). The model writes `author_blueprint.md`; edits you save are what later generations read.
3. **Research**: web search via Tavily or upload `.txt/.md/.pdf`. Produces an Outlier Score (1-100, computed in code from model-assessed sub-scores in `lib/frameworks/outlier-evaluator.ts`), market gaps, competitors, and a strategy report.
4. **Content Studio**: generate an outline, draft chapters with the 7-step narrative opening, rewrite selections with AI.
5. **Marketing**: Gemini covers/promo images, and LinkedIn/X posts passed through the anti-AI formatter (`lib/anti-ai.ts`).

## Models

Text generation uses Groq. Writing and analysis default to `openai/gpt-oss-120b`, quick tasks (social posts) to `openai/gpt-oss-20b`. Override with `GROQ_MODEL_WRITER` / `GROQ_MODEL_FAST`; change the shared client in `lib/llm.ts`. Groq free tiers have tight tokens-per-minute limits, so long research or chapter requests may need a paid tier.

## Deploying to Vercel

Push to GitHub, import the repo, set the env vars from `.env.example`, and use a hosted Postgres (Neon/Supabase). `build` runs `prisma generate`. Long generations set `maxDuration` (up to 300s); this needs a Vercel plan that allows it.

## Known limits

- No authentication: everything belongs to one default user (`lib/utils.ts#getDefaultUser`). Add auth before exposing this publicly, because the API routes spend your API credits.
- Dictation uses the browser Web Speech API (Chrome/Edge). No Whisper endpoint is included.
- Image output is returned as a data URL and is not persisted.

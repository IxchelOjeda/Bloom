# Bloom

A gentle, all-in-one life organizer for ADHD brains: planner, tasks, habits, meals, money and wellbeing, with an AI scheduling assistant and 20 aesthetic themes. Built with Expo + Supabase.

"Your schedule should adapt to your life, not your life to your schedule."

A cross-platform (iOS + Android) app built with React Native, Expo, Expo Router, TypeScript and Supabase.
Feature-by-feature status, including what is **not** done, is in [CHECKLIST.md](CHECKLIST.md).

---

## 1. Project structure

```
app/                      Expo Router screens
  _layout.tsx             providers, auth gate, onboarding redirect
  (auth)/                 login, signup, forgot, reset (deep link)
  onboarding.tsx          6 skippable steps
  (tabs)/                 the 5 permanent tabs: index (Today), plan, track, money, more
  plan/ track/ money/ more/   sub-screens (calendar, tasks, planner-ai, food, recipe-ai, debts, settings…)
src/
  theme/themes.ts         20 aesthetics + token derivation + WCAG contrast enforcement (pure, tested)
  theme/ThemeProvider.tsx applies the chosen theme app-wide
  components/ui.tsx       design-system primitives (all styling comes from theme tokens)
  components/Collection.tsx  config-driven CRUD screens with validation
  components/sheets.tsx   shared Task / Event / Reschedule sheets
  lib/db.ts               offline-first data layer (cache + queued writes + cross-screen refresh)
  lib/offlineQueue.ts     sync queue core (pure, tested)
  lib/scheduler.ts        scheduling engine + proposal validator (pure, tested; also used server-side)
  lib/finance.ts          savings pace, debt payoff, summaries, daily limits (pure, tested)
  lib/quietHours.ts       notification timing rules (pure, tested)
  lib/notifications.ts    expo-notifications wrapper
  lib/auth.tsx, preferences.tsx, supabase.ts, exportData.ts, templates.ts
supabase/
  migrations/0001_schema.sql   ~50 tables, FKs, indexes, interconnectivity triggers, RLS on every table
  migrations/0002_recurring_tasks.sql
  functions/life-planner/      planning-only AI (reads scheduling data via the user's JWT; never writes events)
  functions/recipe-ai/         cooking-only AI (reads NO user data)
  functions/food-search/       USDA FoodData Central + Open Food Facts, verified values only
  functions/delete-account/    permanent account deletion
  functions/_shared/           Anthropic call helper, timezone helpers, copy of scheduler.ts
tests/
  *.test.ts               62 unit tests (scheduler, finance, offline queue, 20 themes × 2 modes contrast, quiet hours)
  db/                     23 Postgres tests for triggers and Row Level Security (two-user isolation)
```

## 2. Prerequisites

- Node 20+ and npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) and a Supabase project (free tier works)
- For devices: Xcode (iOS simulator, macOS only) and/or Android Studio, or the Expo Go / a development build on your phone
- An Anthropic API key for the two AI assistants (optional — the rest of the app works without it)
- A free USDA FoodData Central key (optional — Open Food Facts works without a key)

## 3. Install

```bash
npm install
npx expo install --fix     # aligns every Expo/React Native package to your installed Expo SDK
```

The versions in package.json target Expo SDK 52. `expo install --fix` will correct any drift; if you upgrade
the SDK (`npx expo install expo@latest && npx expo install --fix`) the code uses only stable APIs.

## 4. Supabase setup

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push                       # applies supabase/migrations/*.sql
```

Then in the Supabase dashboard:

1. **Authentication → URL configuration**: add `lifeos://**` to Redirect URLs (email confirmation and password reset deep links).
2. **Authentication → Providers → Email**: keep "Confirm email" on (recommended).
3. The migration creates a private storage bucket `private` with per-user folders.

### Environment variables (app)

```bash
cp .env.example .env
```

| Variable | Where to find it |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → anon public key |

The anon key is designed to ship in apps; Row Level Security is what protects data. **Never** put the
service-role key or AI keys in `.env` for the app.

## 5. AI + external API configuration (server-side secrets)

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...      # both AI assistants
supabase secrets set AI_MODEL=claude-sonnet-5-5        # optional override
supabase secrets set USDA_FDC_API_KEY=...              # optional, free: https://fdc.nal.usda.gov/api-key-signup
npm run functions:deploy
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge Functions automatically.

Without `ANTHROPIC_API_KEY` the AI screens show a clear "AI is not configured" message — there are no fake replies.
Without the USDA key, food search uses Open Food Facts only and tells the user so.

**Restaurant data.** USDA FoodData Central includes some US fast-food items (e.g. several McDonald's products in its
SR Legacy set). Full, country-specific chain menus require a licensed provider (e.g. Nutritionix, FatSecret Platform)
or the chains' published data under their terms. To add such data, insert rows into `foods` with
`source = 'restaurant_official'`, `verified = true`, `user_id = null`, `brand` and `country` set, using the service role.
The app never invents nutrition values; manual entries are labelled "estimate".

## 6. Run

```bash
npx expo start
```

- **iOS**: press `i` for the simulator (macOS + Xcode), or scan the QR code with the Camera app using Expo Go.
- **Android**: press `a` for an emulator, or scan the QR code with Expo Go.

Expo Go is enough for most features. Notifications have limits in Expo Go on recent SDKs; for full local
notifications build a development client: `npx expo run:ios` / `npx expo run:android` (or `eas build --profile development`).

## 7. Tests

```bash
npm run test:logic      # 62 unit tests — no device needed
PGHOST=localhost PGPORT=5432 PGUSER=postgres npm run test:db   # 23 trigger + RLS tests on any local Postgres 15+
npm run typecheck       # after npm install
```

The DB tests stub Supabase's `auth.uid()` and run every check as two different users to prove isolation.

### Manual test plan on a device

1. Sign up → confirm email → log in → onboarding → you land on Today.
2. Add a task with two categories and a goal; complete it → goal progress moves (Plan → Goals).
3. Change the theme in More → Aesthetic; every screen restyles. Try Minimal and dark mode.
4. Airplane mode: complete tasks, add water, log an expense → banner shows pending changes → reconnect → they sync.
5. Plan → Life Planner: "I have one week to study 10 lectures…" → review sessions → untick one → approve → Calendar.
6. Ask the planner for a recipe → it declines. Ask Recipe AI → save recipe → send ingredients to groceries.
7. Money: add a debt, log a payment → balance drops; add a bill, "Mark paid" → next due date advances.
8. Settings → export data, then delete account.

## 8. Security & privacy model

- RLS on every table (`user_id = auth.uid()`), forced even for table owners; verified food rows writable only by the service role.
- AI keys live only in Edge Function secrets. Edge Functions act with the user's JWT, so RLS still applies.
- Life Planner receives scheduling data only, and only after the user opts in (revocable in Settings).
- Recipe AI receives only the conversation and an optional pantry list; it cannot read any table.
- Session tokens are stored in the OS keychain/keystore (expo-secure-store).
- Data export (JSON, all tables) and permanent account deletion are built in. No analytics or advertising SDKs.

## 9. Known limitations

See CHECKLIST.md → "Not implemented / partial". Highlights: no home-screen widgets, no Apple/Google
calendar sync yet (schema field `events.external_ref` reserved), no drag-and-drop on the calendar, date/time
entry uses text fields + quick chips (no native picker), UI text is English-only.

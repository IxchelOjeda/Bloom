# Orchid

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
  components/sheets.tsx   shared Task / Event / Reschedule sheets (reminders, attachments, phone-calendar copy)
  components/pickers.tsx  native date/time pickers (typed field on web)
  components/ImageField.tsx, BarcodeScanner(.web).tsx   photos in private storage, food barcode scanner
  theme/Backdrop.tsx      SVG background patterns per theme
  lib/db.ts               offline-first data layer (cache + queued writes + cross-screen refresh)
  lib/offlineQueue.ts     sync queue core (pure, tested)
  lib/scheduler.ts        scheduling engine + proposal validator (pure, tested; also used server-side)
  lib/finance.ts          savings pace, debt payoff, summaries, daily limits (pure, tested)
  lib/quietHours.ts       notification timing rules (pure, tested)
  lib/notifications.ts    local reminders (device-local registry, weekday-aware meds, snooze, spending alert)
  lib/nutrition.ts        portion maths for verified label portions (pure, tested)
  lib/storage.ts          private uploads + signed URLs
  lib/deviceCalendar.ts   Apple / Google calendar via the phone's calendar store (opt-in)
  lib/auth.tsx, preferences.tsx, supabase.ts, exportData.ts, templates.ts
supabase/
  migrations/0001_schema.sql   ~50 tables, FKs, indexes, interconnectivity triggers, RLS on every table
  migrations/0002_recurring_tasks.sql
  migrations/0003_explicit_grants.sql   Data API grants stated explicitly (anon: none)
  migrations/0004_portions_integrations.sql  verified food portions, integration + widget-size prefs
  functions/life-planner/      planning-only AI (reads scheduling data via the user's JWT; never writes events)
  functions/recipe-ai/         cooking-only AI (reads NO user data)
  functions/food-search/       USDA FoodData Central + Open Food Facts, verified values only
  functions/delete-account/    permanent account deletion
  functions/_shared/           Anthropic call helper, timezone helpers, copy of scheduler.ts
tests/
  *.test.ts               67 unit tests (scheduler, finance, offline queue, nutrition, 20 themes × 2 modes contrast, quiet hours)
  db/                     23 Postgres tests for triggers and Row Level Security (two-user isolation)
  e2e/                    the real app in a browser against the real schema (see tests/e2e/README.md)
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

1. **Authentication → URL configuration**: add `orchid://**` to Redirect URLs (email confirmation and password reset deep links).
2. **Authentication → Providers → Email**: keep "Confirm email" on (recommended).
3. The migration creates a private storage bucket `private` with per-user folders.

For a fully local backend with Docker, `supabase start` uses the included `supabase/config.toml`
(then put the printed API URL and anon key in `.env`).

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
Set `portion_label` / `portion_grams` (e.g. `'10 pieces'`, `160`) so people can log by pieces.
The app never invents nutrition values; manual entries are labelled "estimate".

## 6. Run

```bash
npx expo start
```

- **iOS**: press `i` for the simulator (macOS + Xcode), or scan the QR code with the Camera app using Expo Go.
- **Android**: press `a` for an emulator, or scan the QR code with Expo Go.

Expo Go is enough for most features, including the camera barcode scanner, photo picker, phone calendar
and native date pickers (all part of Expo Go for SDK 52). For dependable local notifications, build a
development client: `npx expo run:ios` / `npx expo run:android` (or `eas build --profile development`).
The first time you use the camera, photos, calendar or reminders, the phone asks for that permission —
nothing is requested at launch.

**What to try on a device that the automated tests can't cover:** scan a barcode (Track → Food), attach a
receipt photo (Money → Expenses), add an event with "Also add to my phone calendar" and check the Calendar
app, turn on Settings → Integrations → Show my phone calendar, add a medication at a time 2 minutes from now
and wait for the reminder, press Snooze on Today.

## 7. Tests

```bash
npm run typecheck && npm run lint
npm run test:logic      # 67 unit tests — no device needed
PGHOST=localhost PGPORT=5432 PGUSER=postgres npm run test:db   # 23 trigger + RLS tests on any local Postgres 15+
```

**End-to-end** (`tests/e2e/README.md`): the real app (Expo web) in Chromium, against all migrations on
Postgres with RLS enforced, through a small test-only gateway that speaks the Supabase auth/REST protocol.
26 checks covering sign-up → onboarding → every module's main flow → offline sync → logout/login → account
deletion, each asserting what was actually persisted.

```bash
npm run test:e2e:setup && (npm run test:e2e:gateway &) && (npm run test:e2e:web &) && npm run test:e2e
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
- Files (receipts, wishlist photos, attachments) live in a private bucket under the user's own folder and are shown through
  1-hour signed URLs; account deletion removes them.
- Phone-calendar events never leave the phone; the Life Planner only receives their start/end times, without titles.
- Offline queues are per user; logging out clears cached rows and cancels that person's reminders on the phone.
- Camera, photos, calendar and notification permissions are requested only when the related feature is first used.
- Data export (JSON, all tables) and permanent account deletion are built in. No analytics or advertising SDKs.

## 9. Known limitations

Full, honest status per feature is in [CHECKLIST.md](CHECKLIST.md). Highlights:

- **Not yet run on a physical device.** Everything is type-checked, lint-clean and the shared logic runs in
  the e2e suite, but native-only pieces (camera, photo picker, phone calendar, native pickers, notifications
  actually firing) need a first device pass.
- **AI assistants and verified food search need deployed Edge Functions + keys** (see §5). Without them the
  screens say so; nothing is faked.
- Not built: home-screen widgets (needs native widget targets), remote push (local notifications only),
  server-side Google Calendar API sync (the phone-calendar integration covers Google accounts added to the
  phone), Recipe AI images, UI translations (English only), full licensed restaurant menus, currency conversion.
- Calendar items are moved with long-press → tap a day, not a free-form drag gesture.

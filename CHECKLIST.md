# Feature checklist

**Status** — ✅ built · 🟡 partial · ❌ not built

**Verified by**
- 🧪 **unit** — pure logic tests (`npm run test:logic`, 67 tests)
- 🗄️ **db** — Postgres tests of triggers + Row Level Security with two users (`npm run test:db`, 23 checks)
- 🌐 **e2e** — exercised in the *running app* (Expo web) against the real schema, asserting what was persisted (`npm run test:e2e`, 26 checks; see `tests/e2e/README.md`)
- 📱 **device** — native-only code (camera, photo picker, phone calendar, native date pickers, local notifications firing). Type-checked and lint-clean, **not yet run on a physical iOS/Android device** — expect small fixes on first device run.

## Foundation
| Feature | Status | Verified |
|---|---|---|
| Expo SDK 52 + TypeScript + Expo Router; deps aligned with `expo install --check` | ✅ | 🌐 |
| Supabase schema (~50 tables, FKs, indexes, checks), 4 migrations | ✅ | 🗄️ |
| Row Level Security on every table; explicit grants (anon gets nothing); cross-user isolation | ✅ | 🗄️ 🌐 |
| Auth: sign up, log in, log out, password reset (deep link), persistent session (keychain on device) | ✅ | 🌐 (reset email: needs real Supabase) |
| Account deletion (all rows + all files) and full JSON data export | ✅ | 🌐 deletion · export 📱/web |
| Profile: name, country, language, currency, time zone, units, week start, date format | ✅ | 🌐 |
| Offline: cached reads, queued writes, idempotent ids, coalescing, per-user queue | ✅ | 🧪 🌐 |
| Offline banner incl. "server unreachable" detection + automatic retry with backoff | ✅ | 🌐 |
| Onboarding (6 skippable steps, module selection, theme, permissions asked in context) | ✅ | 🌐 |
| Five permanent tabs; every sub-screen deep-links correctly | ✅ | 🌐 |

## Today
| Feature | Status | Verified |
|---|---|---|
| Date, greeting, timeline, tasks, meals, water, meds, payments, habits, "snapshot, not a score" | ✅ | 🌐 |
| Up-next card ("starts in 2 h 10 min") | ✅ | 🌐 |
| Add/edit/complete events, breaks, unexpected activities; rest-day toggle | ✅ | 🌐 |
| Quick actions (task, activity, meal, food, water, expense, note, focus, AI) | ✅ | 🌐 |
| "Reorganize my day" → Life Planner, approval required | ✅ | 📝 needs AI key |
| Minimum-day mode, energy check-in | ✅ | 🌐 |
| Customize: reorder, hide, re-add sections, **widget sizes** (compact/regular/large) | ✅ | 🌐 reorder · sizes type-checked |
| Gentle restart screen after 3+ days away | ✅ | 📝 |
| Medication Taken / Skip / **Snooze 10 min** | ✅ | 🌐 taken · snooze notification 📱 |
| Phone-calendar events shown read-only (opt-in) | ✅ | 📱 |

## Plan
| Feature | Status | Verified |
|---|---|---|
| Calendar: week, month (tap a day), year (goals + month tiles) | ✅ | 🌐 |
| Move events/tasks between days (long-press → tap day; updates phone copy + reminder) | ✅ | type-checked (true drag gesture not built) |
| Activities: weekly target, sessions, preferred days/time, demanding flag, progress history, linked goals, to-dos | ✅ | 🌐 screen · 🗄️ focus→activity |
| Goals: horizons, start/target/current, milestones, auto-split, progress | ✅ | 🗄️ 🌐 |
| Universal tasks: multi-category, activity, goal, priority, estimate, due date, subtasks, notes, recurrence | ✅ | 🗄️ 🌐 |
| Task **hard deadline**, **reminders**, **attachments** (photos/files, private storage) | ✅ | deadline/reminder UI 🌐 · upload 📱 |
| Task views: today, upcoming, overdue, all, someday, done, by category/activity/goal | ✅ | 🌐 |
| Routines: ordered steps, repeat days, step-by-step player with countdown | ✅ | 🌐 screen |
| Weekly reset / monthly review / yearly plan | ✅ | 🌐 screen |
| Availability per weekday; rest / recovery / low / unavailable / vacation days | ✅ | 🌐 |
| Brain dump → task / today / event / goal / activity / note / wishlist (keeps pasted order) | ✅ | 🌐 |
| Focus timer: Pomodoro + custom, pause/resume/stop, background-safe, time per activity | ✅ | 🗄️ trigger · 🌐 screen |
| Templates (8 built-in) + save routine as template | ✅ | 🌐 screen |
| Flexible rescheduling (tomorrow / date / next free slot / unscheduled / not relevant) | ✅ | 🧪 next-free-slot |
| Native date & time pickers (typed field on web) | ✅ | 📱 |

## Life Planner AI
| Feature | Status | Verified |
|---|---|---|
| Server-side only, key never in the app; opt-in consent | ✅ | 📝 |
| Reads only scheduling data; phone-calendar busy times sent as anonymous blocks (no titles) | ✅ | 📝 |
| AI interprets → tested engine allocates (breaks, rest days, energy, no double-booking, deadline) | ✅ | 🧪 engine |
| Validated proposal; edit, untick, approve → creates events/tasks; reject; history | ✅ | 🧪 validator · 📝 UI |
| Off-topic refusal | ✅ | 📝 needs AI key |

## Track
| Feature | Status | Verified |
|---|---|---|
| Food diary: slots, macros, favorites, manual estimates (labelled), 7-day history | ✅ | 🌐 |
| Search: your saved foods (works without the Edge Function) + USDA + Open Food Facts | ✅ | 🌐 own foods · Edge Function 📝 |
| **Portion-aware logging** from verified label portions ("10 nuggets" from "4 pieces = 64 g") | ✅ | 🧪 |
| **Barcode scanning** (EAN/UPC → Open Food Facts) | ✅ | 📱 |
| Restaurant chains with full country menus | 🟡 USDA has some US chains; licensed data must be imported (README) | — |
| Optional nutrition goal; none by default | ✅ | 🌐 |
| Meal planner: week view, recipe link, repeat N weeks, grocery list | ✅ | 🌐 screen |
| Recipe AI (separate, no data access): pantry, shopping, substitutions, step follow-ups, save, → groceries | ✅ | 📝 needs AI key |
| Recipe AI images / visual references | ❌ text descriptions only | — |
| Grocery list: aisles, quantities, check off, staples | ✅ | 🌐 screen |
| Water: quick add, goal, units, history, capped reminders + quiet hours | ✅ | 🌐 logging · 🧪 timing |
| Medication: schedule, weekday-aware reminders, taken/skipped/snoozed, history; never suggests doses | ✅ | 🌐 · reminders 📱 |
| Sleep, wellbeing, habits (no streaks) | ✅ | 🌐 habits · screens |

## Money
| Feature | Status | Verified |
|---|---|---|
| Dashboard: available, saved, in/out this month, debt, today's limit | ✅ | 🧪 🌐 |
| Accounts moved by linked transactions | ✅ | 🗄️ 🌐 |
| Income sources (all frequencies) | ✅ | 🧪 |
| Savings goals with pace; contributions update goal + account | ✅ | 🧪 🗄️ 🌐 |
| Debts: payoff estimate, try-a-payment, log/undo payments → balance | ✅ | 🧪 🗄️ 🌐 |
| Bills & subscriptions: mark paid → next due advances; reminders | ✅ | 🗄️ 🌐 |
| Expenses: custom categories, payment method, account, **receipt photo** | ✅ | 🌐 · photo 📱 |
| Daily limits per weekday + per-date overrides; category budgets | ✅ | 🧪 |
| **Alert when over today's limit** (once a day, respects notification settings) | ✅ | 📱 |
| Multi-currency | 🟡 per-item currency; totals use the primary currency and say what's excluded (no FX) | — |

## More
| Feature | Status | Verified |
|---|---|---|
| Wishlists: unlimited lists, price, store, link, priority, status, **photo**; "bought it" can log an expense | ✅ | 🌐 screen · photo 📱 |
| Big purchases linked to savings goals | ✅ | 🌐 screen |
| Notes with links and pinning | ✅ | 🌐 |
| Settings: profile, modules, notifications + quiet hours, integrations, nutrition, privacy, export, logout, delete | ✅ | 🌐 |
| Accessibility: labels on all controls (chips/fields fixed), 44 pt targets, font scaling ≤1.6× | 🟡 no full VoiceOver/TalkBack pass yet | — |
| UI translations | ❌ English only (language preference is stored) | — |

## Aesthetic engine
| Feature | Status | Verified |
|---|---|---|
| 20 themes × light/dark; full token set (buttons, cards, nav, calendar, progress, fonts, radius, ornaments) | ✅ | 🧪 🌐 |
| WCAG contrast enforced for every theme, mode and custom colour | ✅ | 🧪 40 checks |
| **Background patterns** (lace, grain, stars, scanlines, stripes, dots, grid, flowers) via SVG | ✅ | 🌐 |
| Live previews, custom colours, decoration intensity, minimal variation, persistence | ✅ | 🌐 |
| Character-inspired themes use original names, colours and unicode ornaments only | ✅ | — |

## Notifications & integrations
| Feature | Status | Verified |
|---|---|---|
| Local notifications: medication (weekday-aware), water, bills, tasks, events, snooze, spending alert | ✅ | 🧪 timing · 📱 firing |
| Device-local reminder registry; deleting/editing an item cancels its reminders; logout cancels all | ✅ | 📱 |
| **Phone calendar** (Apple Calendar / Google Calendar via the OS): copy events, show busy blocks | ✅ | 📱 |
| Direct Google Calendar API (server-side OAuth sync) | ❌ the OS calendar route covers Google accounts on the phone | — |
| Remote push notifications | ❌ local notifications only | — |
| Home-screen widgets | ❌ needs native targets (e.g. `expo-apple-targets`, `react-native-android-widget`) | — |

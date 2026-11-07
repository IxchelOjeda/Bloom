# Feature checklist

**Legend** — ✅ built · 🟡 partial · ❌ not built
**Verification** — 🧪 covered by automated tests that pass · 📝 written and type-checked, **not yet run on a device**

> Honest note: this code was written in a sandbox that cannot install npm packages or run a simulator.
> The pure logic (scheduler, finance, offline queue, themes, notification timing) and the whole database layer
> (schema, triggers, RLS) were executed and tested. The React Native screens and Edge Functions were type-checked
> against stubs but have not run yet — expect a round of small fixes on first launch.

## Foundation
| Feature | Status | Verified |
|---|---|---|
| Expo + TypeScript + Expo Router project | ✅ | 📝 |
| Supabase schema (~50 tables, FKs, indexes, validation checks) | ✅ | 🧪 23 DB tests |
| Row Level Security on every table; cross-user isolation | ✅ | 🧪 |
| Auth: sign up, log in, log out, reset password (deep link), persistent session in secure store | ✅ | 📝 |
| Account deletion (Edge Function) + full JSON data export | ✅ | 📝 |
| Profile: name, country, language, currency, time zone, units, week start, date format | ✅ | 📝 |
| Offline: cached reads, queued writes, idempotent client UUIDs, coalescing, sync banner | ✅ | 🧪 queue core / 📝 UI |
| Onboarding (6 skippable steps, module selection, theme pick, permissions asked in context) | ✅ | 📝 |
| Five permanent tabs: Today, Plan, Track, Money, More | ✅ | 📝 |

## Today
| Feature | Status | Verified |
|---|---|---|
| Date, greeting, timeline, tasks, meals, water, meds, payments, habits, progress | ✅ | 📝 |
| Up-next card with minutes-away (time-blindness) | ✅ | 📝 |
| Complete / edit / add events, breaks, unexpected activities, mark rest day | ✅ | 📝 |
| Quick actions (task, activity, meal, food, water, expense, note, focus, AI) | ✅ | 📝 |
| "Reorganize my day" → Life Planner preset, approval required | ✅ | 📝 |
| Minimum-day mode | ✅ | 📝 |
| Energy check-in | ✅ | 📝 |
| Customize dashboard: reorder, hide, re-add sections (saved to profile) | ✅ | 📝 |
| Widget **sizes** | ❌ | — |
| Gentle restart screen after 3+ days away | ✅ | 📝 |

## Plan
| Feature | Status | Verified |
|---|---|---|
| Calendar: week, month (tap a day), year (goals + month tiles) | ✅ | 📝 |
| Calendar drag-and-drop | ❌ (move via edit sheet) | — |
| Activities: weekly time target, sessions, preferred days/time, demanding flag, progress history, linked goals, to-dos | ✅ | 📝 |
| Goals: horizons, start/target/current, milestones, auto-split, progress % | ✅ | 🧪 trigger |
| Universal tasks: multi-category, activity, goal, priority, estimate, due date, subtasks, notes, recurrence | ✅ | 🧪 triggers |
| Task deadline (separate from due date) & attachments in UI | 🟡 columns exist, no UI | — |
| Task views: today, upcoming, overdue, all, someday, done, by category/activity/goal | ✅ | 📝 |
| Routines: ordered steps, repeat days, step-by-step player with visual countdown | ✅ | 📝 |
| Weekly reset / monthly review / yearly plan | ✅ | 📝 |
| Availability windows per weekday; rest / recovery / low / unavailable / vacation days | ✅ | 📝 |
| Energy log history | ✅ | 📝 |
| Brain dump with conversion to task / event / goal / activity / note / wishlist | ✅ | 📝 |
| Focus timer: Pomodoro presets + custom, pause/resume/stop, survives backgrounding, time per activity | ✅ | 🧪 trigger |
| Templates (8 built-in) + save your routine as a template | ✅ | 📝 |
| Flexible rescheduling (tomorrow / pick date / next free slot / unscheduled / not relevant) | ✅ | 🧪 next-free-slot |

## Life Planner AI
| Feature | Status | Verified |
|---|---|---|
| Server-side only, key never in app; opt-in consent for data sharing | ✅ | 📝 |
| Reads only scheduling data (events, tasks, availability, rest days, energy, activities, goals) | ✅ | 📝 |
| AI interprets → tested engine allocates time (breaks, rest days, energy, no double-booking, deadline) | ✅ | 🧪 engine |
| Every proposed item validated; problems shown and unticked by default | ✅ | 🧪 validator |
| Edit times, untick items, approve → creates events/tasks; reject | ✅ | 📝 |
| Planning history stored and viewable | ✅ | 📝 |
| Off-topic refusal (planning only) | ✅ prompt + flag | 📝 |
| Timezone-correct (user's wall clock) | ✅ | 🧪 conversion check |

## Track
| Feature | Status | Verified |
|---|---|---|
| Food diary: search, grams, meal slot, macros, favorites, manual estimates, 7-day history | ✅ | 📝 |
| Verified data: USDA FDC + Open Food Facts, cached server-side; estimates clearly labelled | ✅ | 📝 |
| Restaurant chains with full country menus | 🟡 USDA has some US items; licensed data must be imported (README) | — |
| Barcode scanning | 🟡 server supports barcodes; no camera UI | — |
| Optional nutrition goal; none by default | ✅ | 📝 |
| Meal planner: week view, recipe link, repeat for N weeks, generate grocery list | ✅ | 📝 |
| Recipe AI (separate, no data access): pantry recipes, shopping, substitutions, step follow-ups, save, → groceries | ✅ | 📝 |
| Recipe AI images / visual references | ❌ text descriptions only | — |
| Grocery list: aisles, quantities, check off, staples, merge from meal plan | ✅ | 📝 |
| Water: quick add, goal, units, week/month history, reminders (capped, quiet hours) | ✅ | 🧪 timing |
| Medication: schedule, taken/skipped from Today, history, daily reminders; never suggests doses | ✅ | 📝 |
| Medication "snoozed" status | 🟡 in DB + Today logic, no button | — |
| Sleep, wellbeing activities, habits (no streaks, 4-week dot grid) | ✅ | 📝 |

## Money
| Feature | Status | Verified |
|---|---|---|
| Dashboard: available, saved, income/out this month, debt, today's limit, trends, categories | ✅ | 🧪 maths |
| Accounts with balances moved by linked transactions | ✅ | 🧪 trigger |
| Income sources (all frequencies) + mark received | ✅ | 🧪 |
| Savings goals with per-day/week/month pace; contributions update progress | ✅ | 🧪 |
| Debts: payoff estimate, try-a-payment, log/undo payments → balance | ✅ | 🧪 |
| Bills & subscriptions: mark paid → next due advances; reminders | ✅ | 🧪 trigger |
| Expenses with custom categories, payment method, account | ✅ | 📝 |
| Receipt photos | ❌ storage bucket ready, no picker | — |
| Daily limits per weekday + per-date overrides; category budgets | ✅ | 🧪 |
| Push alert when over a daily limit | ❌ shown in-app only | — |
| Multi-currency | 🟡 per-item currency; totals use the primary currency and say what's excluded (no FX conversion) | — |

## More
| Feature | Status | Verified |
|---|---|---|
| Wishlists: unlimited lists, price, store, link, priority, status; "bought it" can log an expense | ✅ | 📝 |
| Wishlist images | ❌ column exists, no picker | — |
| Big purchases linked to savings goals | ✅ | 📝 |
| Notes with links and pinning | ✅ | 📝 |
| Settings: profile, modules, notifications + quiet hours, nutrition, privacy, export, logout, delete | ✅ | 📝 |
| Accessibility: labels/roles on controls, 44pt targets, font scaling capped at 1.6× | 🟡 no screen-reader pass yet | — |
| UI translations | ❌ English only (language is stored) | — |

## Aesthetic engine
| Feature | Status | Verified |
|---|---|---|
| 20 themes, each light + dark; full token set (buttons, cards, nav, calendar, progress, fonts, radius, ornaments, pattern) | ✅ | 🧪 |
| WCAG contrast enforced for every theme, mode and custom colour | ✅ | 🧪 40 checks |
| Live previews, custom colours, decoration intensity, minimal variation, persistence | ✅ | 📝 |
| Background patterns (lace, grain, stars…) rendered | 🟡 defined per theme, not drawn yet | — |
| Character-inspired themes use original names, colours and unicode ornaments only (no licensed art) | ✅ | — |

## Notifications & integrations
| Feature | Status | Verified |
|---|---|---|
| Local notifications: medication, water, bills; permission asked in context; quiet hours | ✅ | 🧪 timing |
| Task / meal / event reminders | 🟡 helpers exist, not wired to those sheets | — |
| Remote push notifications | ❌ | — |
| Apple / Google Calendar sync | ❌ (`events.external_ref` reserved) | — |
| Home-screen widgets | ❌ needs native targets (e.g. expo-apple-targets / react-native-android-widget) | — |

-- =====================================================================
-- LifeOS — core schema
-- Every user-owned table has: id uuid (client may supply it, so offline
-- writes are idempotent), user_id → auth.users, created_at, updated_at.
-- RLS is enabled on every table at the bottom of this file.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- helpers ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- enums ----------
create type priority_level   as enum ('low','medium','high','urgent');
create type task_status      as enum ('todo','done','not_relevant','unscheduled');
create type energy_level     as enum ('very_low','low','medium','high');
create type day_kind         as enum ('rest','active_recovery','low_workload','unavailable','vacation');
create type meal_slot        as enum ('breakfast','lunch','dinner','snack','drink');
create type pay_frequency    as enum ('once','weekly','biweekly','twice_monthly','monthly','quarterly','annually','custom');
create type med_log_status   as enum ('taken','skipped','snoozed');
create type wish_status      as enum ('want','saving','purchased','not_interested');
create type nutrition_source as enum ('usda','open_food_facts','restaurant_official','manual_estimate','recipe_calc');
create type event_kind       as enum ('event','task_block','activity','break','meal','appointment','routine','deadline','focus');
create type plan_status      as enum ('proposed','approved','partially_approved','rejected');

-- =====================================================================
-- PROFILE & PREFERENCES
-- =====================================================================
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  display_name   text check (char_length(display_name) <= 60),
  country        text,
  language       text not null default 'en',
  currency       char(3) not null default 'USD',
  timezone       text not null default 'UTC',
  units          text not null default 'metric' check (units in ('metric','imperial')),
  week_start     smallint not null default 1 check (week_start between 0 and 6),
  date_format    text not null default 'yyyy-MM-dd',
  wake_time      time,
  sleep_time     time,
  onboarded      boolean not null default false,
  last_active_at timestamptz default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.preferences (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  theme_id         text not null default 'pinterest_minimalist',
  theme_mode       text not null default 'light' check (theme_mode in ('light','dark','system')),
  decor_intensity  smallint not null default 2 check (decor_intensity between 0 and 3), -- 0 = minimal
  custom_colors    jsonb not null default '{}'::jsonb,
  modules          jsonb not null default '{"plan":true,"food":true,"water":true,"meds":true,"sleep":true,"mindful":true,"habits":true,"money":true,"wishlist":true}'::jsonb,
  dashboard_layout jsonb not null default '["minimum_day","timeline","tasks","meals","water","meds","payments","habits","progress"]'::jsonb,
  notifications    jsonb not null default '{"enabled":false,"quiet_start":"22:00","quiet_end":"07:00","water_every_min":120,"tasks":true,"meds":true,"payments":true,"meals":false}'::jsonb,
  water_goal_ml    integer not null default 2000 check (water_goal_ml between 0 and 10000),
  nutrition_goals  jsonb, -- null by default: no calorie targets imposed
  pomodoro         jsonb not null default '{"focus":25,"short":5,"long":15,"rounds":4}'::jsonb,
  ai_planner_ok    boolean not null default false, -- explicit consent to send schedule data to AI
  updated_at       timestamptz not null default now()
);

create table public.availability (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null check (end_time > start_time),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.day_flags (  -- rest days, vacation, etc.
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  kind       day_kind not null,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.energy_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  level      energy_level not null,
  mood       smallint check (mood between 1 and 5),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.minimum_days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  items      jsonb not null default '[]'::jsonb, -- [{label, done, ref_type?, ref_id?}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- =====================================================================
-- PLAN: categories, goals, activities, tasks, calendar
-- =====================================================================
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  color      text,
  icon       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 120),
  description   text,
  horizon       text not null default 'long' check (horizon in ('daily','weekly','monthly','annual','long')),
  category_id   uuid references public.categories(id) on delete set null,
  unit          text,             -- e.g. 'kg', 'books', 'hours'
  start_value   numeric not null default 0,
  target_value  numeric,
  current_value numeric not null default 0,
  target_date   date,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.milestones (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  goal_id      uuid references public.goals(id) on delete cascade,
  activity_id  uuid, -- fk added after activities
  title        text not null,
  target_value numeric,
  due_date     date,
  position     integer not null default 0,
  done         boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.activities (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 80),
  description        text,
  category_id        uuid references public.categories(id) on delete set null,
  weekly_minutes     integer check (weekly_minutes >= 0),
  sessions_per_week  smallint check (sessions_per_week between 0 and 21),
  preferred_days     smallint[] not null default '{}',
  preferred_start    time,
  session_minutes    integer check (session_minutes > 0),
  demanding          boolean not null default false, -- planner avoids rest/low-energy days
  progress_unit      text,
  progress_value     numeric,
  total_minutes      integer not null default 0, -- maintained by focus/event triggers
  notes              text,
  archived           boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.milestones
  add constraint milestones_activity_fk foreign key (activity_id) references public.activities(id) on delete cascade;

create table public.activity_goals (
  id          uuid not null unique default gen_random_uuid(), -- lets offline upserts key on id
  activity_id uuid not null references public.activities(id) on delete cascade,
  goal_id     uuid not null references public.goals(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  primary key (activity_id, goal_id)
);

create table public.progress_entries (  -- activity/goal history: "lifted 35 kg"
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete cascade,
  goal_id     uuid references public.goals(id) on delete cascade,
  value       numeric not null,
  note        text,
  logged_at   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (activity_id is not null or goal_id is not null)
);

create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  parent_id       uuid references public.tasks(id) on delete cascade, -- subtasks
  title           text not null check (char_length(title) between 1 and 200),
  description     text,
  notes           text,
  activity_id     uuid references public.activities(id) on delete set null,
  goal_id         uuid references public.goals(id) on delete set null,
  goal_increment  numeric not null default 0, -- added to goal.current_value on completion
  due_date        date,
  scheduled_at    timestamptz,
  deadline        timestamptz,
  priority        priority_level not null default 'medium',
  estimate_min    integer check (estimate_min > 0),
  status          task_status not null default 'todo',
  completed_at    timestamptz,
  recurrence      text, -- RFC5545 RRULE string
  reminder_at     timestamptz,
  attachments     jsonb not null default '[]'::jsonb, -- storage paths
  source          text not null default 'manual', -- manual | brain_dump | ai_plan | template
  ai_plan_id      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.task_categories ( -- many-to-many: one task, many categories
  id          uuid not null unique default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  primary key (task_id, category_id)
);

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  kind         event_kind not null default 'event',
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  all_day      boolean not null default false,
  location     text,
  notes        text,
  task_id      uuid references public.tasks(id) on delete set null,
  activity_id  uuid references public.activities(id) on delete set null,
  routine_id   uuid,
  meal_plan_id uuid,
  done         boolean not null default false,
  recurrence   text,
  reminder_min integer,
  ai_plan_id   uuid,
  external_ref jsonb, -- future Apple/Google calendar sync ids
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create table public.period_plans ( -- weekly / monthly / yearly planning
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  period     text not null check (period in ('week','month','year')),
  starts_on  date not null,
  priorities jsonb not null default '[]'::jsonb,
  objectives jsonb not null default '[]'::jsonb,
  reflection text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period, starts_on)
);

create table public.routines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  weekdays    smallint[] not null default '{}',
  start_time  time,
  is_template boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.events add constraint events_routine_fk foreign key (routine_id) references public.routines(id) on delete set null;

create table public.routine_steps (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  routine_id   uuid not null references public.routines(id) on delete cascade,
  position     integer not null,
  name         text not null,
  description  text,
  minutes      integer check (minutes > 0),
  reminder     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.routine_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  routine_id     uuid not null references public.routines(id) on delete cascade,
  date           date not null,
  completed_steps uuid[] not null default '{}',
  finished       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, routine_id, date)
);

create table public.focus_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  task_id     uuid references public.tasks(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  started_at  timestamptz not null,
  minutes     integer not null check (minutes between 1 and 600),
  kind        text not null default 'focus' check (kind in ('focus','break')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.brain_dump (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  content      text not null check (char_length(content) between 1 and 2000),
  converted_to text, -- 'task' | 'activity' | 'goal' | 'note' | 'wishlist' | 'event'
  converted_id uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade, -- null = built-in
  kind       text not null check (kind in ('study','morning','night','weekly_reset','gym','cleaning','meal','budget','custom')),
  name       text not null,
  payload    jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  prompt      text not null,
  proposal    jsonb not null, -- validated structured proposal
  status      plan_status not null default 'proposed',
  applied_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.tasks  add constraint tasks_ai_plan_fk  foreign key (ai_plan_id) references public.ai_plans(id) on delete set null;
alter table public.events add constraint events_ai_plan_fk foreign key (ai_plan_id) references public.ai_plans(id) on delete set null;

-- =====================================================================
-- TRACK: food, recipes, groceries, water, meds, sleep, mindful, habits
-- =====================================================================
create table public.foods ( -- cached verified products + user custom foods
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete cascade, -- null = shared verified cache
  source         nutrition_source not null,
  external_id    text,
  brand          text,  -- restaurant chain or manufacturer
  country        text,  -- country-specific menus
  name           text not null,
  serving_label  text not null default '100 g',
  serving_grams  numeric,
  kcal           numeric check (kcal >= 0),
  protein_g      numeric check (protein_g >= 0),
  carbs_g        numeric check (carbs_g >= 0),
  fat_g          numeric check (fat_g >= 0),
  verified       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (source, external_id)
);

create table public.recipes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  servings     numeric not null default 1 check (servings > 0),
  prep_min     integer,
  cook_min     integer,
  difficulty   text,
  steps        jsonb not null default '[]'::jsonb,
  source       text not null default 'manual', -- manual | recipe_ai
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  name       text not null,
  quantity   numeric,
  unit       text,
  food_id    uuid references public.foods(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  slot        meal_slot not null,
  title       text not null,
  recipe_id   uuid references public.recipes(id) on delete set null,
  food_id     uuid references public.foods(id) on delete set null,
  servings    numeric not null default 1,
  planned_time time,
  completed   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.events add constraint events_meal_fk foreign key (meal_plan_id) references public.meal_plans(id) on delete set null;

create table public.food_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  eaten_at     timestamptz not null default now(),
  slot         meal_slot not null,
  food_id      uuid references public.foods(id) on delete set null,
  recipe_id    uuid references public.recipes(id) on delete set null,
  meal_plan_id uuid references public.meal_plans(id) on delete set null,
  name         text not null,
  servings     numeric not null default 1 check (servings > 0),
  -- snapshot so history stays correct even if the product changes
  kcal         numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
  source       nutrition_source not null,
  favorite     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.grocery_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  quantity    numeric,
  unit        text,
  aisle       text default 'Other',
  checked     boolean not null default false,
  staple      boolean not null default false, -- frequently purchased
  recipe_id   uuid references public.recipes(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.water_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount_ml  integer not null check (amount_ml between 1 and 5000),
  logged_at  timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.medications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  dosage       text,           -- free text as written by the user; never interpreted
  times        time[] not null default '{}',
  weekdays     smallint[] not null default '{0,1,2,3,4,5,6}',
  start_date   date,
  end_date     date,
  instructions text,
  reminders    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.medication_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  scheduled_for timestamptz not null,
  status        med_log_status not null,
  logged_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (medication_id, scheduled_for)
);

create table public.sleep_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  planned_bed   time, planned_wake time,
  actual_bed    timestamptz, actual_wake timestamptz,
  quality       smallint check (quality between 1 and 5),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, date)
);

create table public.mindful_activities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null, -- meditation, therapy, journaling, nap, breathing, detox, custom...
  title       text not null,
  scheduled_at timestamptz,
  done_at     timestamptz,
  minutes     integer,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.habits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  icon         text,
  frequency    text not null default 'daily' check (frequency in ('daily','weekly','custom')),
  weekdays     smallint[] not null default '{0,1,2,3,4,5,6}',
  times_per_week smallint,
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  habit_id   uuid not null references public.habits(id) on delete cascade,
  date       date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, date)
);

-- =====================================================================
-- MONEY
-- =====================================================================
create table public.accounts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  kind       text not null check (kind in ('cash','bank','savings','wallet','other')),
  currency   char(3) not null,
  balance    numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  icon       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.income_sources (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  amount       numeric(14,2) not null check (amount >= 0),
  currency     char(3) not null,
  frequency    pay_frequency not null,
  next_pay_date date,
  start_date   date,
  end_date     date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.savings_goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  target_amount  numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0, -- maintained by trigger
  currency       char(3) not null,
  target_date    date,
  contribution   numeric(14,2),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.debts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null,
  kind             text not null default 'custom', -- credit_card, student, personal, friend, family, custom
  original_amount  numeric(14,2) not null check (original_amount >= 0),
  remaining        numeric(14,2) not null check (remaining >= 0), -- maintained by trigger
  currency         char(3) not null,
  apr              numeric(6,3),
  min_payment      numeric(14,2),
  frequency        pay_frequency not null default 'monthly',
  due_day          smallint check (due_day between 1 and 31),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.recurring_payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  amount      numeric(14,2) not null check (amount >= 0),
  currency    char(3) not null,
  frequency   pay_frequency not null,
  next_due    date not null,
  category_id uuid references public.expense_categories(id) on delete set null,
  debt_id     uuid references public.debts(id) on delete set null,
  reminder_days smallint not null default 1,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One ledger for every money movement. Expenses, income received, debt
-- payments and savings contributions are all transactions → the dashboard
-- is a single query and nothing is double-counted.
create table public.transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  kind             text not null check (kind in ('expense','income','debt_payment','savings_contribution','transfer')),
  amount           numeric(14,2) not null check (amount > 0),
  currency         char(3) not null,
  occurred_on      date not null default current_date,
  description      text,
  category_id      uuid references public.expense_categories(id) on delete set null,
  account_id       uuid references public.accounts(id) on delete set null,
  payment_method   text,
  receipt_path     text, -- supabase storage
  notes            text,
  income_source_id uuid references public.income_sources(id) on delete set null,
  debt_id          uuid references public.debts(id) on delete set null,
  savings_goal_id  uuid references public.savings_goals(id) on delete set null,
  recurring_id     uuid references public.recurring_payments(id) on delete set null,
  wishlist_item_id uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (kind <> 'debt_payment' or debt_id is not null),
  check (kind <> 'savings_contribution' or savings_goal_id is not null)
);

create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.expense_categories(id) on delete cascade,
  month       date not null, -- first of month
  amount      numeric(14,2) not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.daily_limits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  weekday     smallint check (weekday between 0 and 6), -- default per weekday
  date        date,                                     -- or override for one date
  amount      numeric(14,2) not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((weekday is null) <> (date is null))
);

-- =====================================================================
-- MORE
-- =====================================================================
create table public.wishlist_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.wishlist_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.wishlist_categories(id) on delete set null,
  name        text not null,
  description text,
  image_path  text,
  url         text check (url is null or url ~* '^https?://'),
  price       numeric(14,2),
  currency    char(3),
  store       text,
  priority    priority_level not null default 'medium',
  status      wish_status not null default 'want',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.transactions add constraint tx_wishlist_fk foreign key (wishlist_item_id) references public.wishlist_items(id) on delete set null;

create table public.major_purchases (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  description     text,
  estimated_price numeric(14,2),
  currency        char(3),
  url             text check (url is null or url ~* '^https?://'),
  target_date     date,
  savings_goal_id uuid references public.savings_goals(id) on delete set null, -- progress comes from here
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text,
  body       text,
  url        text,
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (  -- registry of scheduled local notifications
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  ref_type    text not null,
  ref_id      uuid,
  fire_at     timestamptz,
  device_id   text,
  os_id       text, -- id returned by expo-notifications
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =====================================================================
-- INDEXES
-- =====================================================================
create index on public.tasks (user_id, status, due_date);
create index on public.tasks (user_id, scheduled_at);
create index on public.tasks (parent_id);
create index on public.events (user_id, starts_at);
create index on public.goals (user_id, horizon);
create index on public.activities (user_id) where not archived;
create index on public.food_logs (user_id, eaten_at);
create index on public.meal_plans (user_id, date);
create index on public.water_logs (user_id, logged_at);
create index on public.medication_logs (user_id, scheduled_for);
create index on public.habit_logs (user_id, date);
create index on public.transactions (user_id, occurred_on);
create index on public.transactions (debt_id);
create index on public.transactions (savings_goal_id);
create index on public.recurring_payments (user_id, next_due) where active;
create index on public.focus_sessions (user_id, started_at);
create index on public.foods using gin (to_tsvector('simple', coalesce(brand,'') || ' ' || name));

-- =====================================================================
-- INTERCONNECTIVITY TRIGGERS (server-side so every client stays consistent)
-- =====================================================================

-- Completing / un-completing a task moves its goal's current_value.
create or replace function public.task_goal_progress() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.goal_id is not null and new.goal_increment <> 0 then
    if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
      update goals set current_value = current_value + new.goal_increment where id = new.goal_id and user_id = new.user_id;
    elsif tg_op = 'UPDATE' and old.status = 'done' and new.status <> 'done' then
      update goals set current_value = current_value - new.goal_increment where id = new.goal_id and user_id = new.user_id;
    end if;
  end if;
  if new.status = 'done' and new.completed_at is null then new.completed_at = now(); end if;
  if new.status <> 'done' then new.completed_at = null; end if;
  return new;
end $$;
create trigger tasks_goal_progress before insert or update of status on public.tasks
  for each row execute function public.task_goal_progress();

-- Focus sessions add time to their activity (or the task's activity).
create or replace function public.focus_to_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  if new.kind <> 'focus' then return new; end if;
  a := coalesce(new.activity_id, (select activity_id from tasks where id = new.task_id and user_id = new.user_id));
  if a is not null then
    update activities set total_minutes = total_minutes + new.minutes where id = a and user_id = new.user_id;
  end if;
  return new;
end $$;
create trigger focus_sessions_activity after insert on public.focus_sessions
  for each row execute function public.focus_to_activity();

-- Progress entries update activity/goal current values.
create or replace function public.progress_apply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.activity_id is not null then update activities set progress_value = new.value where id = new.activity_id and user_id = new.user_id; end if;
  if new.goal_id     is not null then update goals      set current_value  = new.value where id = new.goal_id     and user_id = new.user_id; end if;
  return new;
end $$;
create trigger progress_entries_apply after insert on public.progress_entries
  for each row execute function public.progress_apply();

-- Ledger → debt balances, savings goals, account balances.
-- On UPDATE the old effect is undone and the new one applied, so edits stay correct.
create or replace function public.tx_effect(t public.transactions, s int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if t.kind = 'debt_payment' then
    update debts set remaining = greatest(0, remaining - s * t.amount) where id = t.debt_id and user_id = t.user_id;
  elsif t.kind = 'savings_contribution' then
    update savings_goals set current_amount = current_amount + s * t.amount where id = t.savings_goal_id and user_id = t.user_id;
  end if;
  if t.account_id is not null then
    update accounts set balance = balance + s * (case when t.kind = 'income' then t.amount else -t.amount end)
      where id = t.account_id and user_id = t.user_id;
  end if;
end $$;

create or replace function public.tx_apply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform public.tx_effect(old, -1); end if;
  if tg_op in ('INSERT','UPDATE') then perform public.tx_effect(new,  1); end if;
  return null;
end $$;
create trigger transactions_apply after insert or update or delete on public.transactions
  for each row execute function public.tx_apply();

-- Paying a recurring bill advances its next due date.
create or replace function public.advance_due(d date, f pay_frequency) returns date
language sql immutable as $$
  select case f
    when 'weekly'        then d + 7
    when 'biweekly'      then d + 14
    when 'twice_monthly' then d + 15
    when 'monthly'       then (d + interval '1 month')::date
    when 'quarterly'     then (d + interval '3 months')::date
    when 'annually'      then (d + interval '1 year')::date
    else d end $$;

create or replace function public.recurring_paid() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.recurring_id is not null then
    update recurring_payments set next_due = advance_due(next_due, frequency)
      where id = new.recurring_id and user_id = new.user_id;
  end if;
  return new;
end $$;
create trigger transactions_recurring after insert on public.transactions
  for each row execute function public.recurring_paid();

-- Logging a meal from the plan marks the plan item completed.
create or replace function public.food_log_completes_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.meal_plan_id is not null then
    update meal_plans set completed = true where id = new.meal_plan_id and user_id = new.user_id;
  end if;
  return new;
end $$;
create trigger food_logs_plan after insert on public.food_logs
  for each row execute function public.food_log_completes_plan();

-- New user → profile + preferences rows.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id) values (new.id) on conflict do nothing;
  insert into preferences (user_id) values (new.id) on conflict do nothing;
  insert into expense_categories (user_id, name)
    select new.id, unnest(array['Food','Transportation','Shopping','Entertainment','Education','Personal care','Bills','Housing','Other'])
    on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- updated_at + ROW LEVEL SECURITY on every table
-- =====================================================================
do $$
declare t text; owner_col text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    -- updated_at trigger
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='updated_at') then
      execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    owner_col := case when t = 'profiles' then 'id' else 'user_id' end;

    if t in ('foods','templates') then
      -- shared verified rows (user_id null) are readable by everyone signed in; writes only to own rows
      execute format($p$create policy "read shared or own" on public.%I for select to authenticated using (user_id is null or user_id = auth.uid())$p$, t);
      execute format($p$create policy "write own" on public.%I for insert to authenticated with check (user_id = auth.uid())$p$, t);
      execute format($p$create policy "update own" on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())$p$, t);
      execute format($p$create policy "delete own" on public.%I for delete to authenticated using (user_id = auth.uid())$p$, t);
    else
      execute format($p$create policy "own rows" on public.%I for all to authenticated using (%I = auth.uid()) with check (%I = auth.uid())$p$, t, owner_col, owner_col);
    end if;
  end loop;
end $$;

-- Only the food-search Edge Function (service role) may write verified shared foods.
create policy "no client shared writes" on public.foods as restrictive for insert to authenticated
  with check (verified = false and source in ('manual_estimate','recipe_calc'));

-- Private storage bucket for receipts, attachments, wishlist images: <uid>/<file>
insert into storage.buckets (id, name, public) values ('private', 'private', false) on conflict do nothing;
create policy "own folder" on storage.objects for all to authenticated
  using (bucket_id = 'private' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'private' and (storage.foldername(name))[1] = auth.uid()::text);

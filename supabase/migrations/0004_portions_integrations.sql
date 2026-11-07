-- Verified household portions from the source database (e.g. USDA branded "4 pieces" = 64 g,
-- Open Food Facts serving size). Lets people log "10 nuggets" instead of guessing grams.
-- Nutrient columns stay "per serving_label" (usually per 100 g).
alter table public.foods
  add column if not exists portion_label text check (portion_label is null or length(portion_label) <= 80),
  add column if not exists portion_grams numeric check (portion_grams is null or portion_grams > 0);
create index if not exists foods_user_name_idx on public.foods (user_id, lower(name));

-- Optional integrations (opt-in) and Today widget sizes.
alter table public.preferences
  add column if not exists integrations jsonb not null default '{"device_calendar": false}'::jsonb,
  add column if not exists dashboard_sizes jsonb not null default '{}'::jsonb; -- { "<section>": "compact" | "regular" | "large" }

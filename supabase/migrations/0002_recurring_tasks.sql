-- Completing a repeating task creates the next occurrence (once). Supports the simple
-- RRULE forms the app writes: FREQ=DAILY|WEEKLY|MONTHLY with optional INTERVAL=n.
alter table public.tasks add column if not exists next_spawned boolean not null default false;

create or replace function public.spawn_next_occurrence() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  freq text := substring(new.recurrence from 'FREQ=([A-Z]+)');
  step int := coalesce(nullif(substring(new.recurrence from 'INTERVAL=([0-9]+)'), '')::int, 1);
  base date := coalesce(new.due_date, current_date);
  nxt date;
begin
  if new.status <> 'done' or new.recurrence is null or new.next_spawned then return new; end if;
  nxt := case freq
    when 'DAILY'   then base + step
    when 'WEEKLY'  then base + 7 * step
    when 'MONTHLY' then (base + make_interval(months => step))::date
    else null end;
  if nxt is null then return new; end if;
  insert into tasks (user_id, title, description, notes, activity_id, goal_id, goal_increment, due_date, priority, estimate_min, recurrence, source)
    values (new.user_id, new.title, new.description, new.notes, new.activity_id, new.goal_id, new.goal_increment, nxt, new.priority, new.estimate_min, new.recurrence, 'recurrence');
  -- copy categories
  insert into task_categories (task_id, category_id, user_id)
    select (select id from tasks where user_id = new.user_id and recurrence = new.recurrence and title = new.title and due_date = nxt order by created_at desc limit 1), category_id, user_id
    from task_categories where task_id = new.id;
  new.next_spawned := true;
  return new;
end $$;

drop trigger if exists tasks_spawn_next on public.tasks;
create trigger tasks_spawn_next before update of status on public.tasks
  for each row execute function public.spawn_next_occurrence();

-- Runs after the migration. Fails loudly (ON_ERROR_STOP) on any broken expectation.
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@x'), ('22222222-2222-2222-2222-222222222222','b@x');

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as
$$ begin if not ok then raise exception 'FAIL: %', label; end if; raise notice 'ok  %', label; end $$;

select pg_temp.check((select count(*) from profiles) = 2, 'signup trigger created profiles');
select pg_temp.check((select count(*) from expense_categories) = 18, 'default expense categories seeded');

-- ---------- act as user A ----------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into goals (id, user_id, title, target_value, current_value, unit)
  values ('aaaaaaaa-0000-0000-0000-000000000001', auth.uid(), 'Read 12 books', 12, 0, 'books');
insert into tasks (id, user_id, title, goal_id, goal_increment)
  values ('aaaaaaaa-0000-0000-0000-000000000002', auth.uid(), 'Finish book 1', 'aaaaaaaa-0000-0000-0000-000000000001', 1);
update tasks set status = 'done' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select pg_temp.check((select current_value from goals where title='Read 12 books') = 1, 'completing task advances goal');
select pg_temp.check((select completed_at is not null from tasks where title='Finish book 1'), 'completed_at stamped');
update tasks set status = 'todo' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select pg_temp.check((select current_value from goals where title='Read 12 books') = 0, 'un-completing task reverts goal');

insert into activities (id, user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000003', auth.uid(), 'Study');
insert into focus_sessions (user_id, activity_id, started_at, minutes) values (auth.uid(), 'aaaaaaaa-0000-0000-0000-000000000003', now(), 25);
select pg_temp.check((select total_minutes from activities where name='Study') = 25, 'focus session adds activity time');

insert into debts (id, user_id, name, original_amount, remaining, currency) values ('aaaaaaaa-0000-0000-0000-000000000004', auth.uid(), 'Card', 1000, 1000, 'USD');
insert into accounts (id, user_id, name, kind, currency, balance) values ('aaaaaaaa-0000-0000-0000-000000000005', auth.uid(), 'Bank', 'bank', 'USD', 500);
insert into transactions (id, user_id, kind, amount, currency, debt_id, account_id)
  values ('aaaaaaaa-0000-0000-0000-000000000006', auth.uid(), 'debt_payment', 200, 'USD', 'aaaaaaaa-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000005');
select pg_temp.check((select remaining from debts where name='Card') = 800, 'debt payment reduces balance');
select pg_temp.check((select balance from accounts where name='Bank') = 300, 'debt payment reduces account');
update transactions set amount = 250 where id = 'aaaaaaaa-0000-0000-0000-000000000006';
select pg_temp.check((select remaining from debts where name='Card') = 750, 'editing payment re-applies correctly');
delete from transactions where id = 'aaaaaaaa-0000-0000-0000-000000000006';
select pg_temp.check((select remaining from debts where name='Card') = 1000, 'deleting payment restores debt');

insert into savings_goals (id, user_id, name, target_amount, currency) values ('aaaaaaaa-0000-0000-0000-000000000007', auth.uid(), 'Laptop', 1500, 'USD');
insert into transactions (user_id, kind, amount, currency, savings_goal_id) values (auth.uid(), 'savings_contribution', 300, 'USD', 'aaaaaaaa-0000-0000-0000-000000000007');
select pg_temp.check((select current_amount from savings_goals where name='Laptop') = 300, 'contribution updates savings goal');

insert into recurring_payments (id, user_id, name, amount, currency, frequency, next_due) values ('aaaaaaaa-0000-0000-0000-000000000008', auth.uid(), 'Rent', 700, 'USD', 'monthly', '2026-11-30');
insert into transactions (user_id, kind, amount, currency, recurring_id) values (auth.uid(), 'expense', 700, 'USD', 'aaaaaaaa-0000-0000-0000-000000000008');
select pg_temp.check((select next_due from recurring_payments where name='Rent') = '2026-12-30', 'paying a bill advances next due date');

insert into meal_plans (id, user_id, date, slot, title) values ('aaaaaaaa-0000-0000-0000-000000000009', auth.uid(), current_date, 'lunch', 'Salad');
insert into food_logs (user_id, slot, name, source, meal_plan_id) values (auth.uid(), 'lunch', 'Salad', 'manual_estimate', 'aaaaaaaa-0000-0000-0000-000000000009');
select pg_temp.check((select completed from meal_plans where title='Salad'), 'logging food completes planned meal');

-- client can't forge "verified" shared nutrition data
do $$ begin
  insert into foods (user_id, source, name, kcal, verified) values (auth.uid(), 'usda', 'Fake', 1, true);
  raise exception 'FAIL: client wrote verified food';
exception when insufficient_privilege then raise notice 'ok  client cannot insert verified foods';
end $$;

-- ---------- act as user B ----------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.check((select count(*) from tasks) = 0, 'user B cannot see user A tasks');
select pg_temp.check((select count(*) from transactions) = 0, 'user B cannot see user A money');
select pg_temp.check((select count(*) from profiles) = 1, 'user B sees only own profile');
update goals set current_value = 99;  -- silently affects 0 rows under RLS
reset role;
select pg_temp.check((select current_value from goals where title='Read 12 books') = 0, 'user B cannot modify user A goal');

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  insert into tasks (user_id, title) values ('11111111-1111-1111-1111-111111111111', 'injected');
  raise exception 'FAIL: user B wrote into user A';
exception when insufficient_privilege then raise notice 'ok  user B cannot insert rows for user A';
end $$;
-- B can't attach A's goal to B's own task to move A's progress
insert into tasks (user_id, title, goal_id, goal_increment, status)
  values (auth.uid(), 'sneaky', 'aaaaaaaa-0000-0000-0000-000000000001', 5, 'done');
reset role;
select pg_temp.check((select current_value from goals where title='Read 12 books') = 0, 'cross-user goal reference cannot move progress');

-- ---------- recurring tasks (migration 0002) ----------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into categories (id, user_id, name) values ('aaaaaaaa-0000-0000-0000-00000000000a', auth.uid(), 'Home');
insert into tasks (id, user_id, title, due_date, recurrence) values ('aaaaaaaa-0000-0000-0000-00000000000b', auth.uid(), 'Water plants', '2026-11-07', 'FREQ=WEEKLY');
insert into task_categories (task_id, category_id, user_id) values ('aaaaaaaa-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-00000000000a', auth.uid());
update tasks set status = 'done' where id = 'aaaaaaaa-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) from tasks where title = 'Water plants' and due_date = '2026-11-14' and status = 'todo') = 1, 'completing weekly task creates next week');
select pg_temp.check((select count(*) from task_categories tc join tasks t on t.id = tc.task_id where t.due_date = '2026-11-14') = 1, 'next occurrence keeps categories');
update tasks set status = 'todo' where id = 'aaaaaaaa-0000-0000-0000-00000000000b';
update tasks set status = 'done' where id = 'aaaaaaaa-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) from tasks where title = 'Water plants') = 2, 're-completing does not duplicate');
reset role;

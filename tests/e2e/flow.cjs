/**
 * End-to-end UI flow: the real app (Expo web) against the real schema (via tests/e2e/gateway.mjs).
 * Run: see tests/e2e/README.md. Fails on any uncaught page error or unexpected HTTP error.
 *   APP=http://localhost:8081 SHOTS=/tmp/shots node tests/e2e/flow.cjs [stepFilter]
 */
const { chromium } = require('playwright');
const fs = require('fs');

const APP = process.env.APP ?? 'http://localhost:8081';
const SHOTS = process.env.SHOTS ?? '/tmp/orchid-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const { Client } = require('pg');
const problems = [];
let sql; // superuser connection used only to ASSERT what the app persisted
const one = async (q, v = []) => (await sql.query(q, v)).rows[0];
const uid = async () => (await one('select id from auth.users where email = $1', [email])).id;
let page; let n = 0;

async function shot(name) { await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png` }); }
const text = (s, opts) => page.getByText(s, { exact: true, ...opts });
async function tap(s) { await text(s).locator('visible=true').first().click(); await page.waitForTimeout(350); }
async function tapRole(name) { await page.getByRole('button', { name, exact: true }).locator('visible=true').first().click(); await page.waitForTimeout(350); }
async function tapRoleLast(name) { await page.getByRole('button', { name, exact: true }).locator('visible=true').last().click(); await page.waitForTimeout(350); }
async function fill(label, value) { await page.getByLabel(label, { exact: true }).locator('visible=true').last().fill(value); }
async function expectText(s) { await page.getByText(s).locator('visible=true').first().waitFor({ timeout: 8000 }); }
async function go(path) { await page.goto(APP + path); await page.waitForTimeout(1200); }
function check(ok, label) { if (!ok) problems.push(`ASSERT: ${label}`); console.log(`${ok ? 'ok ' : 'FAIL'} ${label}`); }

const steps = [];
const step = (name, fn) => steps.push({ name, fn });

const email = `e2e${Date.now()}@test.local`;

step('signup + onboarding', async () => {
  await go('/');
  await expectText('Welcome back');
  await shot('login');
  await tap('Create an account');
  await fill('Email', email);
  await fill('Password', 'correct-horse-1');
  await tapRole('Create account');
  await expectText('Hi there ✦');
  await fill('Preferred name', 'Ixchel');
  await shot('onboarding-name');
  await tapRole('Continue'); await tapRole('Continue');
  await shot('onboarding-theme');
  await tapRole('Continue'); await tapRole('Continue');
  await fill('Usually wake up (HH:MM)', '07:30');
  await fill('Usually wind down by (HH:MM)', '22:30');
  await tapRole('Continue');
  await tapRole('Start my day');
  await page.waitForTimeout(2500);
  await shot('today');
  check(await text(/Ixchel/).count() > 0 || (await page.innerText('body')).includes('Ixchel'), 'Today greets by name');
});


step('goal + task with categories → completing advances goal', async () => {
  await go('/plan/goals');
  await tapRole('Add');
  await shot('goal-sheet');
  await fill('Goal', 'Read 12 books');
  await tap('annual');
  await fill('Measured in (optional)', 'books');
  await fill('Target', '12');
  await tapRole('Save');
  await expectText('Read 12 books');
  await go('/');
  await tapRole('Task');
  await fill('Task', 'Finish book 1');
  await tap('Personal'); await tap('Study');
  await tap('Read 12 books');
  await fill('Counts toward goal by', '1');
  await tapRole('Save');
  await expectText('Finish book 1');
  await shot('today-with-task');
  const t = await one(`select t.id, t.status, (select count(*) from task_categories c where c.task_id = t.id)::int cats from tasks t where title = 'Finish book 1'`);
  check(t && t.cats === 2, 'task saved with two categories');
  await page.getByRole('checkbox', { name: 'Finish book 1' }).locator('visible=true').first().click();
  await page.waitForTimeout(1500);
  const g = await one(`select current_value::float v from goals where title = 'Read 12 books'`);
  check(g.v === 1, `goal progress moved to 1 (got ${g.v})`);
  await go('/plan/goals');
  await expectText('1/12 books');
  await shot('goals');
});

step('today: energy, water, rest day, minimum day, timeline event', async () => {
  await go('/');
  await tap('low');
  await tapRole('+250'); await tapRole('+500');
  await page.waitForTimeout(800);
  await expectText('750 / 2000 ml');
  await tap('Make today a rest day');
  await page.waitForTimeout(800);
  await expectText('Rest day · undo');
  await tap('Set up');
  await tap('Eat meals'); await tap('Take my medication');
  await tapRole('Save');
  await expectText('Just these today. Everything else is a bonus.');
  await tapRole('Activity'); // quick action → schedule sheet
  await fill('What', 'Dentist');
  await tap('Appointment');
  await fill('Start', '23:00'); await fill('End', '23:45');
  await tapRole('Save');
  await expectText('Dentist');
  await shot('today-filled');
  const u = await uid();
  check((await one('select level::text l from energy_logs where user_id=$1', [u])).l === 'low', 'energy saved');
  check((await one('select sum(amount_ml)::int s from water_logs where user_id=$1', [u])).s === 750, 'water saved');
  check((await one('select count(*)::int c from day_flags where user_id=$1', [u])).c <= 1, 'rest day not duplicated');
  check((await one(`select count(*)::int c from events where user_id=$1 and title='Dentist' and kind='appointment'`, [u])).c === 1, 'event saved');
});

step('brain dump → convert to task and note', async () => {
  await go('/plan/brain-dump');
  await fill('Call the dentist', 'Call the bank\nBlog idea about plants');
  await tapRole('Dump it');
  await expectText('Call the bank');
  await tapRole('Do today');
  await page.waitForTimeout(800);
  await tapRole('Note');
  await page.waitForTimeout(800);
  await expectText('Inbox is clear.');
  const u = await uid();
  check((await one(`select count(*)::int c from tasks where user_id=$1 and title='Call the bank' and source='brain_dump'`, [u])).c === 1, 'brain dump → task');
  check((await one(`select count(*)::int c from notes where user_id=$1 and body like 'Blog idea%'`, [u])).c === 1, 'brain dump → note');
});

step('money: account, expense, debt payment, savings, bill', async () => {
  const u = await uid();
  const today = new Date(); const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await go('/money/accounts');
  await tapRole('Add');
  await fill('Name', 'Checking');
  await fill('Current balance', '1000');
  await tapRole('Save');
  await expectText('Checking');

  await go('/money/expenses');
  await tapRole('Add');
  await fill('Amount (USD)', '45.50');
  await fill('What for', 'Groceries');
  await tap('Food');
  await fill('Date', ymd(today));
  await tapRoleLast('Checking');
  await tap('debit');
  await tapRole('Save');
  await expectText('Groceries');
  await page.waitForTimeout(1200);
  check(Number((await one(`select balance from accounts where user_id=$1 and name='Checking'`, [u])).balance) === 954.5, 'expense reduced account balance to 954.50');

  await go('/money/debts');
  await tapRole('Add');
  await fill('Name', 'Visa');
  await tap('Credit card');
  await fill('Original amount', '1000');
  await fill('Remaining balance', '800');
  await fill('Interest rate % per year (if any)', '20');
  await fill('Minimum payment', '50');
  await tapRole('Save');
  await expectText('Visa');
  await tapRole('Log payment');
  await page.waitForTimeout(1500);
  check(Number((await one(`select remaining from debts where user_id=$1 and name='Visa'`, [u])).remaining) === 750, 'debt payment reduced remaining to 750');
  await shot('debts');

  await go('/money/savings');
  await tapRole('Add');
  await fill('Goal', 'Trip to Oaxaca');
  await fill('Target amount', '500');
  await fill('Target date', ymd(new Date(today.getTime() + 100 * 86400000)));
  await tapRole('Save');
  await expectText('Trip to Oaxaca');
  await fill('Add money', '100');
  await tapRoleLast('Checking');
  await tapRoleLast('Add');
  await page.waitForTimeout(1500);
  check(Number((await one(`select current_amount from savings_goals where user_id=$1`, [u])).current_amount) === 100, 'contribution updated savings goal');
  check(Number((await one(`select balance from accounts where user_id=$1 and name='Checking'`, [u])).balance) === 854.5, 'contribution moved money out of the account');
  await shot('savings');

  await go('/money/recurring');
  await tapRole('Add');
  await fill('Name', 'Spotify');
  await fill('Amount', '11.99');
  await tap('Monthly');
  await fill('Next due date', ymd(today));
  await tapRole('Save');
  await expectText('Spotify');
  await tapRole('Mark paid · $11.99');
  await page.waitForTimeout(1500);
  const next = (await one(`select next_due::text d from recurring_payments where user_id=$1`, [u])).d;
  check(next > ymd(today), `paying the bill advanced next due (${next})`);

  await go('/money');
  await page.waitForTimeout(1500);
  await shot('money-dashboard');
  const body = await page.innerText('body');
  check(body.includes('750'), 'money dashboard shows debt total');
});

step('track: manual food, water screen, medication, habit', async () => {
  const u = await uid();
  await go('/track/food');
  await tapRole('Enter manually');
  await fill('Food', 'Chicken rice bowl');
  await fill('Calories (kcal)', '620');
  await fill('Protein g', '38');
  await tapRole('lunch');
  await tapRole('Log it');
  await expectText('Chicken rice bowl');
  await expectText('estimate');
  await shot('food');
  const f = await one(`select kcal::float k, source::text s from food_logs where user_id=$1`, [u]);
  check(f && f.k === 620 && f.s === 'manual_estimate', 'manual food logged as an estimate');
  // saved custom food is searchable even without the Edge Function
  await fill("e.g. McDonald's nuggets, oat milk, banana", 'chicken');
  await tapRole('Search');
  await page.waitForTimeout(1500);
  await expectText('your estimate');
  await shot('food-search-own');

  await go('/track/meds');
  await tapRole('Add');
  await fill('Name', 'Vitamin D');
  await fill('Dosage (as prescribed)', '1 tablet');
  await fill('Times (HH:MM, comma separated)', '23:30');
  await tapRole('Save');
  await expectText('Vitamin D');
  await go('/');
  await expectText('Snooze 10 min');
  await tapRole('Taken');
  await page.waitForTimeout(1200);
  check((await one(`select status::text s from medication_logs where user_id=$1`, [u]))?.s === 'taken', 'medication marked taken from Today');

  await go('/track/habits');
  await tapRole('Add');
  await fill('Habit', 'Read 10 pages');
  await tapRole('Save');
  await expectText('Read 10 pages');
  await go('/');
  await tapRole('Read 10 pages');
  await page.waitForTimeout(1200);
  check((await one(`select count(*)::int c from habit_logs where user_id=$1`, [u])).c === 1, 'habit checked from Today');
  await shot('today-track');
});

step('theme engine restyles the whole app and persists', async () => {
  const u = await uid();
  await go('/more/theme');
  await shot('theme-picker');
  await page.getByRole('radio', { name: 'Gothic', exact: true }).locator('visible=true').first().click();
  await page.waitForTimeout(1200);
  check((await one(`select theme_id from preferences where user_id=$1`, [u])).theme_id === 'gothic', 'theme saved to profile');
  await go('/');
  await shot('today-gothic');
  await go('/more/theme');
  await page.getByRole('radio', { name: 'Cybercore', exact: true }).locator('visible=true').first().click();
  await page.waitForTimeout(800);
  await go('/money');
  await shot('money-cybercore');
  await go('/more/theme');
  await page.getByRole('radio', { name: 'Pinterest Minimalist', exact: true }).locator('visible=true').first().click();
  await page.waitForTimeout(800);
});

step('log out, log back in: data persisted', async () => {
  await go('/more/settings');
  await tapRole('Log out');
  await expectText('Welcome back');
  await fill('Email', email);
  await fill('Password', 'correct-horse-1');
  await tapRole('Log in');
  await page.waitForTimeout(2500);
  await expectText('Dentist');
  await expectText('Snooze 10 min');
  check(true, 'data visible after re-login');
});

step('offline: edits apply instantly, queue, then sync once on reconnect', async () => {
  const u = await uid();
  await go('/');
  await page.waitForTimeout(1000);
  const before = (await one('select coalesce(sum(amount_ml),0)::int s from water_logs where user_id=$1', [u])).s;
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.waitForTimeout(800);
  await tapRole('+250');
  await tapRole('Task');
  await fill('Task', 'Offline task');
  await tapRole('Save');
  await page.waitForTimeout(800);
  await expectText('Offline task');                 // shows immediately from the local queue
  await expectText(/(Offline — |Can't reach the server — )[23] changes/);
  await shot('offline');
  const mid = (await one('select coalesce(sum(amount_ml),0)::int s from water_logs where user_id=$1', [u])).s;
  check(mid === before, 'nothing reached the server while offline');
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  for (let i = 0; i < 30; i++) {           // auto-retry (backoff) — no user action needed
    await page.waitForTimeout(1000);
    if ((await one(`select count(*)::int c from tasks where user_id=$1 and title='Offline task'`, [u])).c) break;
  }
  await page.waitForTimeout(1000);
  const after = (await one('select coalesce(sum(amount_ml),0)::int s from water_logs where user_id=$1', [u])).s;
  check(after === before + 250, `water synced exactly once (${before} → ${after})`);
  check((await one(`select count(*)::int c from tasks where user_id=$1 and title='Offline task'`, [u])).c === 1, 'offline task synced exactly once');
  await expectText('Offline task');
  check(await page.getByText(/Can't reach the server|Offline —/).count() === 0, 'sync banner cleared after reconnect');
});

step('visit every screen', async () => {
  for (const r of ['/plan', '/track', '/money', '/more', '/plan/calendar', '/plan/activities', '/plan/availability', '/plan/brain-dump', '/plan/focus', '/plan/goals', '/plan/history', '/plan/periods', '/plan/planner-ai', '/plan/routines', '/plan/tasks', '/plan/templates', '/track/food', '/track/groceries', '/track/habits', '/track/meals', '/track/meds', '/track/mindful', '/track/recipe-ai', '/track/recipes', '/track/sleep', '/track/water', '/money/accounts', '/money/budgets', '/money/debts', '/money/expenses', '/money/income', '/money/recurring', '/money/savings', '/more/notes', '/more/purchases', '/more/settings', '/more/theme', '/more/wishlist']) {
    const before = problems.length;
    await go(r);
    await page.waitForTimeout(600);
    if (!page.url().endsWith(r)) problems.push(`ROUTE ${r} redirected to ${page.url()}`);
    if (problems.length > before) { console.log(`  issues on ${r}`); await shot('screen' + r.replace(/\//g, '-')); }
  }
  check(true, 'visited all screens');
});

step('delete account removes everything', async () => {
  const u = await uid();
  await go('/more/settings');
  await tapRole('Delete my account');
  await expectText('Welcome back');
  const left = await one(`select (select count(*) from auth.users where id=$1)::int u, (select count(*) from tasks where user_id=$1)::int t, (select count(*) from transactions where user_id=$1)::int x`, [u]);
  check(left.u === 0 && left.t === 0 && left.x === 0, 'account and all rows deleted');
});

(async () => {
  const filter = process.argv[2];
  sql = new Client({ database: process.env.PGDATABASE ?? 'orchid_e2e' }); await sql.connect();
  const browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => problems.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`CONSOLE: ${m.text().slice(0, 300)}`); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes(':54321') && !(r.status() === 503 && r.url().includes('/functions/v1/'))) problems.push(`HTTP ${r.status()} ${r.request().method()} ${decodeURIComponent(r.url()).slice(22, 200)}`); });
  page.on('dialog', (d) => { console.log(`  dialog: ${d.message().slice(0, 120)}`); void d.accept(); });
  for (const s of steps) {
    if (filter && !s.name.includes(filter) && s.name !== 'signup + onboarding') continue;
    console.log(`\n== ${s.name}`);
    try { await s.fn(); } catch (e) { problems.push(`STEP "${s.name}": ${e.message.split("\n").slice(0, 4).join(" | ")}`); await shot(`FAILED-${s.name.replace(/\W+/g, '-')}`); }
  }
  await browser.close(); await sql.end();
  console.log(`\n${problems.length ? problems.join('\n') : 'no problems'}`);
  process.exit(problems.length ? 1 : 0);
})();

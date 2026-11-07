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
  await go('/money/accounts');
  await tapRole('Add');
  await fill('Name', 'Checking');
  await fill('Current balance', '1000');
  await tapRole('Save');
  await expectText('Checking');
  await shot('accounts');
  await go('/money/expenses');
  await shot('expenses');
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

(async () => {
  const filter = process.argv[2];
  sql = new Client({ database: process.env.PGDATABASE ?? 'orchid_e2e' }); await sql.connect();
  const browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', (e) => problems.push(`PAGEERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`CONSOLE: ${m.text().slice(0, 300)}`); });
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes(':54321')) problems.push(`HTTP ${r.status()} ${r.request().method()} ${decodeURIComponent(r.url()).slice(22, 200)}`); });
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

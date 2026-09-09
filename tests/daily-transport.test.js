const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadApp() {
  const html = fs.readFileSync('index.html', 'utf8');
  const source = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const values = new Map();
  const elements = {
    staff: { value: 'テストスタッフ' },
    todayTransport: { value: '' },
  };
  const context = {
    console,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    alert: () => {},
    confirm: () => true,
    fetch: async () => { throw new Error('unexpected network call'); },
    localStorage: {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key),
    },
    document: {
      readyState: 'loading',
      getElementById: id => elements[id] || null,
      addEventListener: () => {},
      querySelectorAll: () => [],
    },
    window: { addEventListener: () => {} },
  };
  vm.createContext(context);
  vm.runInContext(source + `
    render=()=>{}; allSummary=()=>{}; cloudAfterDayChange=()=>{};
    globalThis.app={stamp,saveTodayTransport,dailyTransportValue,setDailyTransport,ensureDailyTransport,
      transportText,staffTotal,iso,DK,TK,TDK};`, context);
  return { app: context.app, storage: context.localStorage, elements };
}

function punches() {
  return [['出勤', '09:00'], ['退勤', '18:00']];
}

test('初回打刻はその時点の通常交通費を固定し、通常交通費の変更は過去日に影響しない', () => {
  const { app, storage } = loadApp();
  const today = app.iso(new Date());
  storage.setItem(app.TK, JSON.stringify({ テストスタッフ: 1500 }));
  app.stamp('出勤');
  assert.equal(app.dailyTransportValue('テストスタッフ', today), 1500);

  storage.setItem(app.TK, JSON.stringify({ テストスタッフ: 2000 }));
  assert.equal(app.dailyTransportValue('テストスタッフ', today), 1500);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = app.iso(tomorrow);
  app.ensureDailyTransport('テストスタッフ', tomorrowKey);
  assert.equal(app.dailyTransportValue('テストスタッフ', tomorrowKey), 2000);
});

test('勤務日の交通費は0円とNULLを区別する', () => {
  const { app, elements } = loadApp();
  const today = app.iso(new Date());
  elements.todayTransport.value = '0';
  app.saveTodayTransport();
  assert.equal(app.dailyTransportValue('テストスタッフ', today), 0);
  assert.equal(app.transportText(0), '¥0');

  elements.todayTransport.value = '';
  app.saveTodayTransport();
  assert.equal(app.dailyTransportValue('テストスタッフ', today), null);
  assert.equal(app.transportText(null), '未設定');
});

test('期間集計は保存済みの日別交通費だけを合計する', () => {
  const { app, storage } = loadApp();
  const today = app.iso(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = app.iso(yesterdayDate);
  storage.setItem(app.DK, JSON.stringify({
    テストスタッフ: { [today]: punches(), [yesterday]: punches() },
  }));
  app.setDailyTransport('テストスタッフ', today, 1500);
  app.setDailyTransport('テストスタッフ', yesterday, 0);

  const totals = app.staffTotal(JSON.parse(storage.getItem(app.DK)), 'テストスタッフ');
  assert.equal(totals[5], 1500);
  assert.equal(totals[6], 2);
});

test('日別交通費がない既存勤務はNULL（未設定）のまま扱う', () => {
  const { app } = loadApp();
  assert.equal(app.dailyTransportValue('テストスタッフ', '2020-01-01'), null);
  assert.equal(app.transportText(app.dailyTransportValue('テストスタッフ', '2020-01-01')), '未設定');
});

test('Supabase migrationはnullable integer列を追加する', () => {
  const sql = fs.readFileSync('supabase/migrations/20260909000000_add_attendance_transport_cost.sql', 'utf8');
  assert.match(sql, /add column if not exists transport_cost integer null/i);
});

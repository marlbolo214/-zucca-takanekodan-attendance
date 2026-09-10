const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260909010000_add_device_registrations.sql', 'utf8');

test('端末管理画面に種別ごとの上限と現在数の表示枠がある', () => {
  assert.match(html, /id="punchDeviceCount">-\/1台/);
  assert.match(html, /id="adminDeviceCount">-\/2台/);
  assert.match(html, /登録台数はSupabaseの登録情報を基準/);
});

test('上限メッセージを端末種別ごとに分かりやすく表示する', () => {
  assert.match(html, /打刻専用端末は1台まで登録できます/);
  assert.match(html, /管理者用端末は2台まで登録できます/);
});

test('Supabase RPCが排他制御下で1台・2台・合計3台の上限を判定する', () => {
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /punch_count\s*>=\s*1/i);
  assert.match(migration, /admin_count\s*>=\s*2/i);
  assert.match(migration, /total_count\s*>=\s*3/i);
  assert.match(migration, /device_id\s*<>\s*p_device_id/i);
});

test('登録解除RPCはSupabaseの行を削除して枠を再利用可能にする', () => {
  assert.match(migration, /function public\.unregister_device/i);
  assert.match(migration, /delete from public\.device_registrations/i);
});

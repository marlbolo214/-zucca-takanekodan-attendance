const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const initialMigration = fs.readFileSync('supabase/migrations/20260909010000_add_device_registrations.sql', 'utf8');
const limitMigration = fs.readFileSync('supabase/migrations/20260910000000_increase_admin_device_limit.sql', 'utf8');

test('端末管理画面に種別ごとの上限と現在数の表示枠がある', () => {
  assert.match(html, /id="punchDeviceCount">-\/1台/);
  assert.match(html, /id="adminDeviceCount">-\/3台/);
  assert.match(html, /登録台数はSupabaseの登録情報を基準/);
});

test('上限メッセージを端末種別ごとに分かりやすく表示する', () => {
  assert.match(html, /打刻専用端末は1台まで登録できます/);
  assert.match(html, /管理者用端末は3台まで登録できます/);
  assert.match(html, /端末は合計4台まで登録できます/);
});

test('端末管理画面が打刻専用1台・管理者用3台・合計4台を表示する', () => {
  assert.match(html, /punchDeviceCount'\)\.textContent=punch\+'\/1台'/);
  assert.match(html, /adminDeviceCount'\)\.textContent=admin\+'\/3台'/);
  assert.match(html, /devices\.length\+'\/4台'/);
});

test('Supabase RPCが排他制御下で1台・3台・合計4台の上限を判定する', () => {
  assert.match(limitMigration, /create or replace function public\.register_device/i);
  assert.match(limitMigration, /pg_advisory_xact_lock/i);
  assert.match(limitMigration, /punch_count\s*>=\s*1/i);
  assert.match(limitMigration, /admin_count\s*>=\s*3/i);
  assert.match(limitMigration, /total_count\s*>=\s*4/i);
  assert.match(limitMigration, /device_id\s*<>\s*p_device_id/i);
});

test('登録解除RPCはSupabaseの行を削除して枠を再利用可能にする', () => {
  assert.match(initialMigration, /function public\.unregister_device/i);
  assert.match(initialMigration, /delete from public\.device_registrations/i);
});

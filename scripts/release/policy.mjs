import assert from 'node:assert/strict';
export const TARGET = Object.freeze({
  account: '91d432bdfb2c2b7b1ecde0d7decde3f8',
  worker: 'talorys-psstta2bu4wy-agent',
  pages: 'talorys-psstta2bu4wy-web',
  origin: 'https://talorys-psstta2bu4wy-web.pages.dev',
  namespace: 'deae972ea5734d76821950d696425a6b',
});
export function checkApproval(approved, head, status) {
  assert.match(approved ?? '', /^[a-f0-9]{40}$/, 'A full, explicitly approved commit SHA is required');
  assert.equal(head.trim(), approved, 'HEAD differs from the approved release');
  assert.equal(status.trim(), '', 'Commit all reviewed changes before publishing');
}
export function checkConfig(config) {
  assert.equal(config.name, TARGET.worker);
  assert.equal(config.account_id, TARGET.account);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.keep_vars, true);
  assert.deepEqual(Object.keys(config.vars).sort(),['TALORYS_AGENT_NAME','TALORYS_DEFAULT_TIMEZONE','TALORYS_DEPLOYED_VERSION','TALORYS_INSTALLATION_ID']);
  assert.equal(config.vars.TALORYS_INSTALLATION_ID, 'psstta2bu4wy');
  assert.equal(config.compatibility_date,'2026-10-01');
  assert.deepEqual(config.compatibility_flags,['nodejs_compat']);
  assert.deepEqual(config.durable_objects.bindings, [{ name: 'TalorysAgent', class_name: 'TalorysAgent' }]);
  assert.deepEqual(config.migrations, [{ tag: 'v1', new_sqlite_classes: ['TalorysAgent'] }]);
  assert(!config.vars.BICHO_ENROLLMENT && !config.vars.TALORYS_MOCK_AI && !config.vars.TALORYS_ENV);
  assert.equal(config.ai.binding, 'AI');
}
export function checkIdentity(before, after) {
  for (const field of ['id', 'start_url', 'scope', 'display']) assert.equal(after[field], before[field], `PWA identity changed: ${field}`);
  assert.deepEqual(after.icons, before.icons, 'PWA icon paths changed');
  assert.equal(after.name, 'BichO');
  assert.equal(after.short_name, 'BichO');
}
const operational = new Set(['tal_schema', 'tal_activity', 'tal_login_attempts', 'tal_model_usage_daily', 'tal_usage_daily', 'tal_remote_auth_failure_days']);
export function compareSnapshots(before, after) {
  assert.deepEqual(after.fingerprints, before.fingerprints, 'Credential or push key changed: stop publication');
  // Compare every pre-existing owner record, allowing only known runtime counters and the brand migration.
  for (const table of Object.keys(before.columns).filter(name => name.startsWith('tal_') && !name.includes('_fts') && !operational.has(name))) {
    const oldColumns = before.columns[table];
    const newColumns = after.columns[table];
    assert(newColumns, `Missing table ${table}`);
    const indexes = oldColumns.map(column => { const index = newColumns.indexOf(column); assert(index >= 0, `Missing column ${table}.${column}`); return index; });
    const normalize = row => {
      const cells = [...row];
      for (const name of table === 'tal_sessions' ? ['last_seen_at'] : table === 'tal_push_subscriptions' ? ['last_success_at', 'failures'] : table === 'tal_automations' ? ['next_run', 'schedule_id', 'last_run', 'updated_at'] : []) {
        const index = oldColumns.indexOf(name); if (index >= 0) cells[index] = 'runtime';
      }
      if (table === 'tal_settings' && cells[oldColumns.indexOf('key')] === "'app.settings'") {
        const index = oldColumns.indexOf('value');
        const settings = JSON.parse(cells[index].slice(1, -1).replaceAll("''", "'"));
        delete settings.agentName; delete settings.language;
        cells[index] = JSON.stringify(settings);
        cells[oldColumns.indexOf('updated_at')] = 'runtime';
      }
      return JSON.stringify(cells);
    };
    const candidates = new Set(after.rows.filter(row => row.table_name === table).map(row => normalize(indexes.map(index => JSON.parse(row.row_data)[index]))));
    for (const row of before.rows.filter(row => row.table_name === table)) assert(candidates.has(normalize(JSON.parse(row.row_data))), `Existing record changed or disappeared in ${table}; investigate before continuing`);
  }
}

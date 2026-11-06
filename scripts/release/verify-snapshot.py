"""Restore a private SQL snapshot locally; never emit row contents or secrets."""
import collections, hashlib, json, os, sqlite3, sys
from pathlib import Path

source=Path(sys.argv[1])
dest=source.with_suffix('.sqlite')
if dest.exists(): raise SystemExit('Refusing to overwrite a restore rehearsal')
data=json.loads(source.read_text())
conn=sqlite3.connect(dest)
os.chmod(dest,0o600)
quote=lambda name:'"'+name.replace('"','""')+'"'
schema=data['schema']
virtual={x['name'] for x in schema if x['type']=='table' and x['sql'] and x['sql'].upper().startswith('CREATE VIRTUAL TABLE')}
shadow=lambda name:any(name.startswith(v+'_') for v in virtual)
tables=[x for x in schema if x['type']=='table' and not x['name'].startswith(('_cf_','sqlite_')) and not shadow(x['name'])]
for table in tables: conn.execute(table['sql'])
counts=collections.Counter()
for row in data['rows']:
 name=row['table_name']
 if name in virtual or shadow(name) or name.startswith(('sqlite_','_cf_')): continue
 literals=json.loads(row['row_data'])
 conn.execute('INSERT INTO '+quote(name)+' ('+','.join(map(quote,data['columns'][name]))+') VALUES ('+','.join(literals)+')')
 counts[name]+=1
for name in virtual:
 # The source search indexes are external-content FTS5 tables. Rebuild derived indexes.
 conn.execute('INSERT INTO '+quote(name)+' ('+quote(name)+") VALUES ('rebuild')")
for item in schema:
 if item['type'] in ('index','trigger','view') and item['sql'] and not item['name'].startswith('_cf_'):
  conn.execute(item['sql'])
conn.commit()
assert conn.execute('PRAGMA integrity_check').fetchall()==[('ok',)]
assert conn.execute('PRAGMA foreign_key_check').fetchall()==[]
for name in counts:
 restored=[json.dumps([conn.execute('SELECT quote(?)',(v,)).fetchone()[0] for v in row],separators=(',',':'),ensure_ascii=False) for row in conn.execute('SELECT '+','.join(map(quote,data['columns'][name]))+' FROM '+quote(name))]
 expected=[row['row_data'] for row in data['rows'] if row['table_name']==name]
 assert sorted(map(json.loads,restored),key=str)==sorted(map(json.loads,expected),key=str),name
proof={'snapshot_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'restore_integrity':'ok','foreign_keys':'ok','rows_compared':sum(counts.values()),'tables_compared':len(counts),'sql_only_excludes_cloudflare_internal_kv':'kv' not in data,'pitr_bookmark_present':bool(data.get('bookmark'))}
if len(sys.argv)>2:
 migration=json.loads(Path(sys.argv[2]).read_text())
 statements=migration if isinstance(migration,list) else migration['statements']
 target_version=13 if isinstance(migration,list) else migration['targetVersion']
 before={name:list(conn.execute('SELECT * FROM '+quote(name))) for name in counts if name not in ('tal_schema','tal_settings','tal_remote_tokens')}
 auth_before=list(conn.execute("SELECT * FROM tal_settings WHERE key != 'app.settings'"))
 tokens=list(conn.execute('SELECT * FROM tal_remote_tokens'))
 with conn:
  for statement in statements: conn.execute(statement)
  conn.execute('UPDATE tal_schema SET version=? WHERE id=1',(target_version,))
 for name,rows in before.items(): assert rows==list(conn.execute('SELECT * FROM '+quote(name))),name
 assert auth_before==list(conn.execute("SELECT * FROM tal_settings WHERE key != 'app.settings'"))
 assert tokens==[row[:-1] for row in conn.execute('SELECT * FROM tal_remote_tokens')]
 assert conn.execute('PRAGMA integrity_check').fetchall()==[('ok',)]
 assert conn.execute('PRAGMA foreign_key_check').fetchall()==[]
 proof['v3_migration_preserves_existing_records']=True
proof_path=source.with_suffix('.proof.json');proof_path.write_text(json.dumps(proof,indent=2)+'\n');os.chmod(proof_path,0o600)
conn.close()
print(json.dumps(proof,indent=2))

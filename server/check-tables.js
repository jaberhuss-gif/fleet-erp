const Database = require('better-sqlite3');
const db = new Database('fleet.db');
db.pragma('wal_checkpoint(TRUNCATE)');
console.log('Checkpoint done');
console.log('');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
for (const t of tables) {
  const count = db.prepare('SELECT COUNT(*) as c FROM ' + t.name).get();
  console.log(t.name + ': ' + count.c + ' rows');
}
db.close();

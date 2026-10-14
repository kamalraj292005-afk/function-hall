const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.NODE_ENV === 'test'
  ? path.join(__dirname, '..', 'function_hall_test.db')
  : (process.env.DB_PATH || path.join(__dirname, '..', 'function_hall.db'));

let rawDb = null;
let wrappedDb = null;

function wrapDatabase(database) {
  return {
    exec(sql) {
      return database.exec(sql);
    },
    prepare(sql) {
      const stmt = database.prepare(sql);
      return {
        run(...params) {
          return stmt.run(...params);
        },
        get(...params) {
          return stmt.get(...params);
        },
        all(...params) {
          return stmt.all(...params);
        }
      };
    },
    transaction(fn) {
      return (...args) => {
        database.exec('BEGIN IMMEDIATE');
        try {
          const result = fn(...args);
          database.exec('COMMIT');
          return result;
        } catch (err) {
          try {
            database.exec('ROLLBACK');
          } catch (rbErr) {
            // Ignore rollback errors if already aborted
          }
          throw err;
        }
      };
    },
    pragma(str) {
      return database.exec(`PRAGMA ${str};`);
    },
    close() {
      if (database) {
        database.close();
      }
    }
  };
}

function getDb(customPath) {
  const targetPath = customPath || DB_PATH;
  if (!wrappedDb) {
    const dbDir = path.dirname(targetPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    rawDb = new DatabaseSync(targetPath);
    rawDb.exec('PRAGMA journal_mode = WAL;');
    rawDb.exec('PRAGMA foreign_keys = ON;');
    rawDb.exec('PRAGMA busy_timeout = 5000;');
    wrappedDb = wrapDatabase(rawDb);
  }
  return wrappedDb;
}

function closeDb() {
  if (wrappedDb) {
    wrappedDb.close();
    wrappedDb = null;
    rawDb = null;
  }
}

module.exports = { getDb, closeDb, DB_PATH };

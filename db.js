const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'data.db');

let _db = null;

const ready = (async () => {
  try {
    const Database = require('better-sqlite3');
    _db = new Database(DB_FILE);
    _db.pragma('journal_mode = WAL');
    console.log('[db] using better-sqlite3');
  } catch (e) {
    console.log('[db] better-sqlite3 unavailable, using sql.js fallback');
    const initSqlJs = require('sql.js');
    const locateFile = (file) => path.join(path.dirname(require.resolve('sql.js')), '..', 'dist', file);
    const SQL = await initSqlJs({ locateFile });
    if (fs.existsSync(DB_FILE)) {
      _db = new SQL.Database(fs.readFileSync(DB_FILE));
    } else {
      _db = new SQL.Database();
    }
    const origExec = _db.exec.bind(_db);
    const origPrepare = _db.prepare.bind(_db);

    _db.exec = function(sql) { origExec(sql); fs.writeFileSync(DB_FILE, Buffer.from(_db.export())); };
    _db.pragma = function() {};

    // NOTE: sql.js closes open statements on db.export(), so we prepare a fresh
    // statement per call instead of caching one across run/get/all.
    _db.prepare = function(sql) {
      return {
        run: (...args) => {
          const stmt = origPrepare(sql);
          try {
            args.length ? stmt.bind(args) : stmt.bind([]);
            stmt.step();
            const changes = _db.getRowsModified();
            const idStmt = origPrepare('SELECT last_insert_rowid() as id');
            let lastInsertRowid = 0;
            try { if (idStmt.step()) lastInsertRowid = Number(idStmt.getAsObject().id) || 0; } finally { idStmt.free(); }
            fs.writeFileSync(DB_FILE, Buffer.from(_db.export()));
            return { changes, lastInsertRowid };
          } finally { stmt.free(); }
        },
        get: (...args) => {
          const stmt = origPrepare(sql);
          try {
            args.length ? stmt.bind(args) : stmt.bind([]);
            if (!stmt.step()) return undefined;
            return stmt.getAsObject();
          } finally { stmt.free(); }
        },
        all: (...args) => {
          const stmt = origPrepare(sql);
          try {
            args.length ? stmt.bind(args) : stmt.bind([]);
            const rows = []; while (stmt.step()) rows.push(stmt.getAsObject());
            return rows;
          } finally { stmt.free(); }
        },
      };
    };
  }

  _db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'USA',
  city TEXT DEFAULT '',
  region TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  condition TEXT NOT NULL,
  price REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  fitment TEXT DEFAULT 'Universal',
  description TEXT DEFAULT '',
  country TEXT NOT NULL,
  city TEXT DEFAULT '',
  region TEXT DEFAULT '',
  made_in TEXT DEFAULT 'Canada',
  image TEXT DEFAULT '',
  sold INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS saves (
  user_id INTEGER NOT NULL REFERENCES users(id),
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  PRIMARY KEY (user_id, listing_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user INTEGER NOT NULL REFERENCES users(id),
  to_user INTEGER NOT NULL REFERENCES users(id),
  listing_id INTEGER REFERENCES listings(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS stripe_accounts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  stripe_account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER REFERENCES listings(id),
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  amount_usd REAL NOT NULL,
  fee_usd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'paid',
  stripe_session_id TEXT UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listings_cat ON listings(category);
CREATE INDEX IF NOT EXISTS idx_listings_country ON listings(country);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user);
`);

  seedIfEmpty();
})();

function seedIfEmpty() {
  if (_db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return;
  const hash = bcrypt.hashSync('password123', 10);
  const insUser = _db.prepare(`INSERT INTO users (name,email,pass_hash,country,city,region,created_at) VALUES (?,?,?,?,?,?,?)`);
  const insListing = _db.prepare(`INSERT INTO listings (user_id,title,category,condition,price,currency,fitment,description,country,city,region,made_in,sold,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const D = 86400000, now = Date.now();

  const sellers = [
    ['Armin Ahmadi','armin@northauto.example', 'Canada','Toronto','ON'],
    ['Mike Torres','mike@northauto.example',  'USA','Detroit','MI'],
    ['Sarah Chen','sarah@northauto.example',  'Canada','Vancouver','BC'],
    ['Olivier Tremblay','olivier@northauto.example','Canada','Montreal','QC'],
    ['Prairie Auto Supply','prairie@northauto.example','USA','Grand Forks','ND'],
    ['Cascadia Auto Supply','cascadia@northauto.example','USA','Blaine','WA'],
  ].map(([name,email,country,city,region]) =>
    insUser.run(name, email, hash, country, city, region, now).lastInsertRowid);

  const seeds = [
    [0,'Brembo Ceramic Brake Pads (Front)','Brakes','New',95,'CAD','2019–2024 Toyota Camry','Sealed OEM stock, Canadian-market packaging.','Canada','Toronto','ON','Canada',0,1],
    [1,'Rust-Free OEM Front Fender (LH)','Body Parts','Good',142,'USD','2005–2011 Toyota Tacoma','Oil-sprayed Canadian truck, zero rust, in our Detroit warehouse.','USA','Detroit','MI','Canada',0,2],
    [2,'Michelin X-Ice Snow 245/45R18 (Set of 4)','Tires & Wheels','Like New',699,'CAD','Sedan / Crossover','One light season, stored indoors.','Canada','Vancouver','BC','Canada',0,3],
    [3,'Heated Wiper Blades (Winter Spec)','Wipers','New',39,'CAD','Subaru Outback 2020–2024','Heated-element blades, Canadian winter spec.','Canada','Montreal','QC','Canada',0,4],
    [4,'Block Heater Kit 600W','Electrical','New',58,'USD','Ford F-150 5.0L 2015–2023','Built in Winnipeg for Canadian winters, stocked in ND.','USA','Grand Forks','ND','Canada',0,5],
    [5,'OEM Reman Alternator 150A','Electrical','Good',72,'USD','Honda Civic 1.8L','Bench-tested, 30-day warranty.','USA','Blaine','WA','Canada',0,6],
    [0,'Denso Iridium Spark Plugs x4','Ignition','New',52,'CAD','Honda / Toyota 4-cyl','Part # SK20R11. Ships same day.','Canada','Toronto','ON','Canada',0,7],
    [1,'Quick-Strut Assembly (Front Left)','Suspension','New',112,'USD','2018–2022 Honda Accord','Individually boxed, never opened.','USA','Detroit','MI','Canada',0,8],
    [3,'Rust-Free Truck Bed 8ft (Silverado)','Body Parts','Good',899,'CAD','1999–2006 Chevy Silverado','Alberta-sourced, absolutely rust-free. Freight or pickup.','Canada','Montreal','QC','Canada',0,9],
    [4,'KYB Excel-G Rear Shocks (Pair)','Suspension','New',102,'USD','Toyota RAV4 2013–2018','Canadian warehouse stock.','USA','Grand Forks','ND','Canada',0,10],
    [2,'JDM Denso Alternator (Low Km)','Electrical','Good',115,'CAD','Honda Civic / Acura EL','Vancouver import, tested.','Canada','Vancouver','BC','Japan',0,11],
    [5,'Full Synthetic 5W-30 (Case of 6)','Oil & Fluids','New',98,'USD','API SP / ILSAC GF-6','Blended in Canada, free freight over $99.','USA','Blaine','WA','Canada',0,12],
  ];
  for (const [s, ...rest] of seeds) {
    const daysOffset = rest.pop();
    insListing.run(sellers[s], ...rest, now - daysOffset * D);
  }
}

module.exports = new Proxy({}, {
  get(t, k) {
    if (k === 'ready') return ready;
    if (!_db) throw new Error('Database not ready yet');
    return _db[k];
  }
});

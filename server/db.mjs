import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const prefectures = JSON.parse(readFileSync(new URL('../public/data/japan.geojson', import.meta.url))).features
  .map(feature => feature.properties.N03_001)

export function openDatabase(path = process.env.DB_PATH || resolve('data/demo.sqlite')) {
  const demo = !process.env.DB_PATH && path === resolve('data/demo.sqlite')
  if (path !== ':memory:' && demo) mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path, { readOnly: !demo && path !== ':memory:' })
  if (demo || path === ':memory:') {
    db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS earthquakes (
        id INTEGER PRIMARY KEY,
        occurred_at TEXT NOT NULL,
        location TEXT NOT NULL,
        location_ja TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        depth_km REAL NOT NULL,
        magnitude REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS observations (
        earthquake_id INTEGER NOT NULL REFERENCES earthquakes(id),
        prefecture TEXT NOT NULL,
        intensity INTEGER NOT NULL CHECK(intensity BETWEEN 1 AND 9),
        PRIMARY KEY (earthquake_id, prefecture)
      );
      CREATE INDEX IF NOT EXISTS earthquakes_time ON earthquakes(occurred_at);
    `)
    if (!db.prepare('SELECT COUNT(*) AS count FROM earthquakes').get().count) seedDemo(db)
  }
  // Fail at startup if an external database does not implement the contract.
  db.prepare('SELECT id, occurred_at, location, location_ja, latitude, longitude, depth_km, magnitude FROM earthquakes LIMIT 0').all()
  db.prepare('SELECT earthquake_id, prefecture, intensity FROM observations LIMIT 0').all()
  return { db, demo: demo || path === ':memory:' }
}

function seedDemo(db) {
  const regions = [
    ['Off the coast of Fukushima', '福島県沖', 37.5, 141.7, ['福島県', '宮城県', '茨城県', '栃木県', '山形県']],
    ['Hyūga-nada Sea', '日向灘', 31.8, 131.9, ['宮崎県', '大分県', '鹿児島県', '熊本県', '高知県']],
    ['Ishikawa, Noto Peninsula', '石川県能登地方', 37.4, 137.1, ['石川県', '富山県', '新潟県', '福井県', '長野県']],
    ['Eastern coast of Chiba', '千葉県東方沖', 35.6, 140.8, ['千葉県', '茨城県', '東京都', '埼玉県', '神奈川県']],
    ['Off the coast of Iwate', '岩手県沖', 39.5, 142.4, ['岩手県', '青森県', '宮城県', '秋田県']],
    ['Tokachi, Hokkaido', '十勝地方南部', 42.6, 143.5, ['北海道', '青森県']],
    ['Southern Ibaraki', '茨城県南部', 36.1, 140.1, ['茨城県', '栃木県', '埼玉県', '千葉県', '東京都']],
    ['Kumamoto region', '熊本県熊本地方', 32.8, 130.7, ['熊本県', '福岡県', '大分県', '長崎県', '佐賀県']],
    ['Wakayama prefecture', '和歌山県北部', 34.1, 135.3, ['和歌山県', '大阪府', '奈良県', '三重県', '徳島県']],
    ['Near Okinawa Island', '沖縄本島近海', 26.4, 127.8, ['沖縄県']],
    ['Suruga Bay', '駿河湾', 34.8, 138.5, ['静岡県', '愛知県', '山梨県', '神奈川県']],
  ]
  const insert = db.prepare('INSERT INTO earthquakes VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const observation = db.prepare('INSERT INTO observations VALUES (?, ?, ?)')
  const now = Date.now()
  db.exec('BEGIN')
  try {
    for (let i = 0; i < 286; i++) {
      const region = regions[(i * 7) % regions.length]
      const age = i < 12 ? (i + 1) * 1.86 / 24 : i < 48 ? 1 + (i - 12) / 6 : i < 126 ? 7 + (i - 48) / 3.4 : 30 + (i - 126) * 2.08
      const rank = i === 0 ? 4 : i % 31 === 0 ? 7 : i % 9 === 0 ? 5 : 1 + ((i * 7) % 4)
      insert.run(i + 1, new Date(now - age * 86400000).toISOString(), region[0], region[1],
        region[2] + Math.sin(i * 3) * .16, region[3] + Math.cos(i * 2) * .18,
        [10, 30, 40, 60, 20, 80][i % 6], Number((2.8 + rank * .43 + (i % 3) * .1).toFixed(1)))
      region[4].forEach((name, j) => {
        if (rank - j > 0) observation.run(i + 1, name, rank - j)
      })
    }
    db.prepare('INSERT INTO metadata VALUES (?, ?)').run('seeded_at', new Date(now).toISOString())
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

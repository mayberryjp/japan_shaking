import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from './app.mjs'
import { openDatabase } from './db.mjs'
import { aggregatePrefectures, matchesEarthquake } from '../src/utils.js'

test('time windows, observation joins, boundaries, and invalid input', async t => {
  const database = openDatabase(':memory:')
  const now = Date.now()
  database.db.exec('DELETE FROM observations; DELETE FROM earthquakes')
  const insert = database.db.prepare('INSERT INTO earthquakes VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  for (const [id, age] of [[1, 0], [2, 1], [3, 6], [4, 29], [5, 364], [6, 366], [7, -1]]) {
    insert.run(id, new Date(now - age * 86400000).toISOString(), 'Test coast', 'テスト沖', 37, 141, 20, 4.5)
  }
  database.db.exec("INSERT INTO observations VALUES (1, '福島県', 4), (1, '宮城県', 2), (2, '福島県', 2), (3, '北海道', 7)")
  const server = createApp(database, () => now).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => server.close(() => { database.db.close(); resolve() })))
  const url = `http://127.0.0.1:${server.address().port}/api/earthquakes`
  const health = await fetch(`http://127.0.0.1:${server.address().port}/api/health`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok' })
  for (const [days, ids] of [[1, [1, 2]], [7, [1, 2, 3]], [30, [1, 2, 3, 4]], [365, [1, 2, 3, 4, 5]]]) {
    const response = await fetch(`${url}?days=${days}`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body.events.map(event => event.id), ids)
    assert.equal(body.events[0].max_intensity, 4)
    assert.equal(body.events[0].observations.length, 2)
    assert.equal(body.prefectures.length, 47)
    if (days === 30) assert.equal(body.events.at(-1).max_intensity, 0)
  }
  for (const invalid of ['0', '8', '3650', 'abc', '1%20OR%201=1', '7&days=30']) {
    assert.equal((await fetch(`${url}?days=${invalid}`)).status, 400)
  }
  const defaultWindow = await (await fetch(url)).json()
  assert.equal(defaultWindow.days, 7)
})

test('prefecture aggregation uses per-location observations, not event maximum', () => {
  const events = [
    { observations: [{ prefecture: '福島県', intensity: 5 }, { prefecture: '宮城県', intensity: 2 }] },
    { observations: [{ prefecture: '福島県', intensity: 3 }] },
  ]
  assert.deepEqual(aggregatePrefectures(events), {
    福島県: { count: 2, intensity: 5 }, 宮城県: { count: 1, intensity: 2 },
  })

  assert.deepEqual(aggregatePrefectures([]), {})
})

test('search finds affected prefectures even when absent from the epicenter name', () => {
  const event = {
    location: 'Offshore test', location_ja: 'テスト沖',
    observations: [{ prefecture: '東京都', intensity: 2 }, { prefecture: '兵庫県', intensity: 1 }],
  }
  for (const query of ['Tokyo', '東京', '東京都', ' TŌKYŌ ', 'Tokyo prefecture', 'Hyōgo', '兵庫', 'Offshore', 'テスト', '']) {
    assert.equal(matchesEarthquake(event, query), true, query)
  }
  assert.equal(matchesEarthquake(event, 'Miyagi'), false)
  assert.equal(matchesEarthquake({ ...event, observations: [] }, 'Tokyo'), false)
})

import express from 'express'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { prefectures } from './db.mjs'

export function createApp({ db, demo }, clock = () => Date.now()) {
  const app = express()
  app.disable('x-powered-by')
  app.get('/api/health', (_req, res, next) => {
    try {
      db.prepare('SELECT 1').get()
      res.json({ status: 'ok' })
    } catch (error) { next(error) }
  })
  app.get('/api/earthquakes', (req, res, next) => {
    const days = Number(req.query.days ?? 7)
    if (!['1', '7', '30', '365'].includes(String(req.query.days ?? '7'))) {
      return res.status(400).json({ error: 'days must be 1, 7, 30, or 365' })
    }
    try {
      const end = new Date(clock()).toISOString()
      const start = new Date(clock() - days * 86400000).toISOString()
      const events = db.prepare(`
        SELECT e.*, COALESCE(MAX(o.intensity), 0) AS max_intensity
        FROM earthquakes e LEFT JOIN observations o ON o.earthquake_id = e.id
        WHERE julianday(e.occurred_at) >= julianday(?) AND julianday(e.occurred_at) <= julianday(?)
        GROUP BY e.id ORDER BY julianday(e.occurred_at) DESC, e.id DESC
      `).all(start, end)
      const observations = db.prepare(`
        SELECT o.* FROM observations o JOIN earthquakes e ON e.id = o.earthquake_id
        WHERE julianday(e.occurred_at) >= julianday(?) AND julianday(e.occurred_at) <= julianday(?)
      `).all(start, end)
      const byEvent = new Map()
      for (const row of observations) {
        if (!byEvent.has(row.earthquake_id)) byEvent.set(row.earthquake_id, [])
        byEvent.get(row.earthquake_id).push({ prefecture: row.prefecture, intensity: row.intensity })
      }
      res.json({
        demo, days, start, end, prefectures,
        events: events.map(event => ({ ...event, observations: byEvent.get(event.id) || [] })),
      })
    } catch (error) { next(error) }
  })
  const dist = resolve('dist')
  if (existsSync(dist)) app.use(express.static(dist))
  app.use((error, _req, res, _next) => {
    console.error('Request failed:', error)
    res.status(500).json({ error: 'Unable to read earthquake data. Check the server logs and database schema.' })
  })
  return app
}

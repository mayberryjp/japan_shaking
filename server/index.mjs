import { openDatabase } from './db.mjs'
import { createApp } from './app.mjs'

const database = openDatabase()
const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '127.0.0.1'
const server = createApp(database).listen(port, host, () => {
  console.log(`YURE API: http://${host}:${port} (${database.demo ? 'DEMO DATA — not real earthquakes' : 'connected SQLite database'})`)
})
function stop() { server.close(() => { database.db.close(); process.exit(0) }) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

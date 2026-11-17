export const intensityLabels = ['—', '1', '2', '3', '4', '5−', '5+', '6−', '6+', '7']
export function intensityColor(rank) {
  if (rank >= 7) return '#a73329'
  if (rank >= 5) return '#d05037'
  if (rank >= 4) return '#df8853'
  if (rank >= 3) return '#6d969d'
  if (rank >= 1) return '#8dabb0'
  return '#dedfd2'
}
export const dateFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', day: '2-digit', month: 'short' })
export const eventDateFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', day: '2-digit', month: 'short', year: 'numeric' })
export const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
export const prefectureNames = {
  北海道: 'Hokkaido', 青森県: 'Aomori', 岩手県: 'Iwate', 宮城県: 'Miyagi',
  秋田県: 'Akita', 山形県: 'Yamagata', 福島県: 'Fukushima', 茨城県: 'Ibaraki',
  栃木県: 'Tochigi', 群馬県: 'Gunma', 埼玉県: 'Saitama', 千葉県: 'Chiba',
  東京都: 'Tokyo', 神奈川県: 'Kanagawa', 新潟県: 'Niigata', 富山県: 'Toyama',
  石川県: 'Ishikawa', 福井県: 'Fukui', 山梨県: 'Yamanashi', 長野県: 'Nagano',
  岐阜県: 'Gifu', 静岡県: 'Shizuoka', 愛知県: 'Aichi', 三重県: 'Mie',
  滋賀県: 'Shiga', 京都府: 'Kyoto', 大阪府: 'Osaka', 兵庫県: 'Hyogo',
  奈良県: 'Nara', 和歌山県: 'Wakayama', 鳥取県: 'Tottori', 島根県: 'Shimane',
  岡山県: 'Okayama', 広島県: 'Hiroshima', 山口県: 'Yamaguchi', 徳島県: 'Tokushima',
  香川県: 'Kagawa', 愛媛県: 'Ehime', 高知県: 'Kochi', 福岡県: 'Fukuoka',
  佐賀県: 'Saga', 長崎県: 'Nagasaki', 熊本県: 'Kumamoto', 大分県: 'Oita',
  宮崎県: 'Miyazaki', 鹿児島県: 'Kagoshima', 沖縄県: 'Okinawa',
}
function normalizeSearch(value) {
  return value.normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').toLowerCase().trim()
}
export function matchesEarthquake(event, query) {
  const search = normalizeSearch(query).replace(/\s+prefecture$/, '')
  const places = [event.location, event.location_ja]
  for (const { prefecture } of event.observations) places.push(prefecture, prefectureNames[prefecture] || '')
  return places.some(place => normalizeSearch(place).includes(search))
}
export function aggregatePrefectures(events) {
  const result = {}
  for (const event of events) for (const observation of event.observations) {
    const previous = result[observation.prefecture] || { count: 0, intensity: 0 }
    result[observation.prefecture] = {
      count: previous.count + 1, intensity: Math.max(previous.intensity, observation.intensity),
    }
  }
  return result
}

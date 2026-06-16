// api/search.js
// 미국 주식: Finnhub API  /  한국 주식: 로컬 목록

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY
const FINNHUB_SEARCH_URL = 'https://finnhub.io/api/v1/search'

// ─── 한국 주식 목록 ───────────────────────────────────────────────────────────

const KR_STOCKS = [
  { symbol: '005930', name: '삼성전자' },
  { symbol: '000660', name: 'SK하이닉스' },
  { symbol: '035420', name: 'NAVER' },
  { symbol: '035720', name: '카카오' },
  { symbol: '005380', name: '현대차' },
  { symbol: '000270', name: '기아' },
  { symbol: '068270', name: '셀트리온' },
  { symbol: '373220', name: 'LG에너지솔루션' },
  { symbol: '006400', name: '삼성SDI' },
  { symbol: '005490', name: '포스코홀딩스' },
  { symbol: '105560', name: 'KB금융' },
  { symbol: '055550', name: '신한지주' },
  { symbol: '323410', name: '카카오뱅크' },
  { symbol: '259960', name: '크래프톤' },
  { symbol: '352820', name: '하이브' },
  { symbol: '247540', name: '에코프로비엠' },
  { symbol: '034020', name: '두산에너빌리티' },
  { symbol: '015760', name: '한국전력' },
  { symbol: '011170', name: '롯데케미칼' },
  { symbol: '207940', name: '삼성바이오로직스' },
]

// ─── 한국 주식 검색 ───────────────────────────────────────────────────────────

function searchKR(query) {
  const q = query.trim().toLowerCase()
  return KR_STOCKS
    .filter(s => s.name.toLowerCase().includes(q) || s.symbol.includes(q))
    .map(s => ({
      symbol: s.symbol,
      name: s.name,
      market: 'KR',
      type: 'stock',
      provider: 'local',
    }))
}

// ─── 미국 주식 검색 (Finnhub) ─────────────────────────────────────────────────

async function searchUS(query) {
  if (!FINNHUB_API_KEY) {
    console.warn('[search] FINNHUB_API_KEY가 설정되지 않았습니다.')
    return []
  }

  const url = `${FINNHUB_SEARCH_URL}?q=${encodeURIComponent(query)}&token=${FINNHUB_API_KEY}`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Finnhub 오류: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()

  return (data.result ?? [])
    .filter(r =>
      r.type === 'Common Stock' &&
      r.symbol &&
      !r.symbol.includes('.')   // 미국 상장 종목만 (해외 거래소 제외)
    )
    .slice(0, 8)
    .map(r => ({
      symbol: r.symbol,
      name: r.description,
      market: 'US',
      type: 'stock',
      provider: 'finnhub',
    }))
}

// ─── 메인 검색 함수 ───────────────────────────────────────────────────────────

/**
 * 주식 검색
 * @param {string} query - 검색어 (종목명 또는 티커)
 * @returns {Promise<{ results: Array<{ symbol, name, market, type, provider }> }>}
 */
export async function search(query) {
  if (!query || !query.trim()) {
    return { results: [] }
  }

  const [krResults, usResults] = await Promise.allSettled([
    Promise.resolve(searchKR(query)),
    searchUS(query),
  ])

  const results = [
    ...(krResults.status === 'fulfilled' ? krResults.value : []),
    ...(usResults.status === 'fulfilled' ? usResults.value : []),
  ]

  return { results }
}

// ─── Vercel Serverless Function ───────────────────────────────────────────────

export default async function handler(req, res) {
  try {
    const q = req.query.q ?? ''
    const result = await search(q)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

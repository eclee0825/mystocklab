// api/quote.js
// 미국 주식: Finnhub API  /  한국 주식: Yahoo Finance

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY
const FINNHUB_QUOTE_URL = 'https://finnhub.io/api/v1/quote'
const YAHOO_QUOTE_URL   = 'https://query1.finance.yahoo.com/v8/finance/chart'

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function isKRSymbol(symbol) {
  return /^\d{6}$/.test(symbol)
}

function toYahooSymbol(symbol) {
  return `${symbol}.KS`
}

function formatTime(ts) {
  if (!ts) return null
  return new Date(ts * 1000).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  })
}

// ─── 미국 주식 (Finnhub) ──────────────────────────────────────────────────────

async function fetchUS(symbol) {
  if (!FINNHUB_API_KEY) throw new Error('FINNHUB_API_KEY가 설정되지 않았습니다.')

  const url = `${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`
  const res  = await fetch(url)
  if (!res.ok) throw new Error(`Finnhub 오류: ${res.status} ${res.statusText}`)

  const d = await res.json()

  if (!d.c || d.c === 0) throw new Error(`${symbol}: 데이터 없음`)

  return {
    symbol,
    market: 'US',
    currency: 'USD',
    currentPrice:  d.c,
    open:          d.o,
    high:          d.h,
    low:           d.l,
    prevClose:     d.pc,
    changePercent: d.dp,
    updatedAt:     formatTime(d.t),
  }
}

// ─── 한국 주식 (Yahoo Finance) ────────────────────────────────────────────────

async function fetchKR(symbol) {
  const yahooSymbol = toYahooSymbol(symbol)
  const url = `${YAHOO_QUOTE_URL}/${yahooSymbol}?interval=1d&range=1d`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`Yahoo Finance 오류: ${res.status} ${res.statusText}`)

  const json = await res.json()
  const meta = json?.chart?.result?.[0]?.meta

  if (!meta) throw new Error(`${symbol}: Yahoo Finance 데이터 없음`)

  const current   = meta.regularMarketPrice ?? meta.chartPreviousClose
  const prevClose = meta.chartPreviousClose ?? meta.previousClose
  const changePercent = prevClose
    ? ((current - prevClose) / prevClose) * 100
    : null

  return {
    symbol,
    market: 'KR',
    currency: 'KRW',
    currentPrice:  current,
    open:          meta.regularMarketOpen         ?? null,
    high:          meta.regularMarketDayHigh      ?? null,
    low:           meta.regularMarketDayLow       ?? null,
    prevClose,
    changePercent: changePercent !== null ? parseFloat(changePercent.toFixed(2)) : null,
    updatedAt:     formatTime(meta.regularMarketTime),
  }
}

// ─── 메인 함수 ────────────────────────────────────────────────────────────────

/**
 * 실시간 주가 조회
 * @param {string} symbol - 종목 심볼 (미국: AAPL / 한국: 005930)
 * @returns {Promise<{
 *   symbol: string, market: string, currency: string,
 *   currentPrice: number, open: number, high: number, low: number,
 *   prevClose: number, changePercent: number, updatedAt: string
 * }>}
 */
export async function getQuote(symbol) {
  if (!symbol) throw new Error('symbol이 필요합니다.')
  return isKRSymbol(symbol) ? fetchKR(symbol) : fetchUS(symbol)
}

/**
 * 여러 종목 일괄 조회
 * @param {string[]} symbols
 * @returns {Promise<Array<{ symbol: string, data?: object, error?: string }>>}
 */
export async function getQuotes(symbols) {
  const results = await Promise.allSettled(symbols.map(getQuote))

  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? { symbol: symbols[i], data: r.value }
      : { symbol: symbols[i], error: r.reason?.message ?? '조회 실패' }
  )
}

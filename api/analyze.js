// api/analyze.js
// Groq AI 주식 분석 (llama-3.3-70b-versatile)

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL        = 'llama-3.3-70b-versatile'

// ─── Groq 공통 호출 ──────────────────────────────────────────────────────────

async function callGroq(systemPrompt, userPrompt, temperature = 0.4) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY가 설정되지 않았습니다.')

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq API 오류 (${res.status}): ${err}`)
  }

  const data    = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Groq 응답이 비어있습니다.')

  return JSON.parse(content)
}

// ─── 기능 1: 종목 분석 ───────────────────────────────────────────────────────

/**
 * @param {{ name, symbol, market, currentPrice, avgCost, shares, currency }} stock
 * @returns {Promise<{
 *   recommendation: string,
 *   summary: string,
 *   reasons: string[],
 *   risks: string[],
 *   disclaimer: string
 * }>}
 */
export async function analyzeStock(stock) {
  const { name, symbol, market, currentPrice, avgCost, shares, currency } = stock

  const pnlPct   = ((currentPrice - avgCost) / avgCost) * 100
  const currSign = currency === 'KRW' ? '₩' : '$'
  const totalVal = (currentPrice * shares).toLocaleString()

  const system = `당신은 전문 주식 애널리스트입니다.
투자자의 보유 종목을 분석하고 반드시 아래 JSON 형식으로만 응답하세요.
{
  "recommendation": "추가매수 | 유지 | 일부매도 | 전량매도 중 하나",
  "summary": "한 줄 핵심 요약 (30자 이내)",
  "reasons": ["이유1 (2~3문장 구체적으로)", "이유2 (2~3문장)", "이유3 (2~3문장)"],
  "risks": ["리스크1 (구체적 수치나 상황 포함)", "리스크2 (구체적으로)"],
  "disclaimer": "이 분석은 AI 참고용 의견이며 실제 투자 결정의 책임은 투자자 본인에게 있습니다."
}
한국어로 응답하세요.`

  const user = `다음 보유 종목을 분석해주세요:
- 종목명: ${name} (${symbol})
- 시장: ${market === 'US' ? '미국' : '국내'} 주식
- 현재가: ${currSign}${currentPrice.toLocaleString()}
- 평균 매수가: ${currSign}${avgCost.toLocaleString()}
- 보유 수량: ${shares}주
- 평가금액: ${currSign}${totalVal}
- 수익률: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%

현재 시장 상황과 이 종목의 특성을 고려해 투자 의견을 제시해주세요.`

  const result = await callGroq(system, user, 0.5)

  return {
    recommendation: result.recommendation ?? '유지',
    summary:        result.summary        ?? '',
    reasons:        Array.isArray(result.reasons) ? result.reasons : [],
    risks:          Array.isArray(result.risks)   ? result.risks   : [],
    disclaimer:     result.disclaimer ?? '이 분석은 AI 참고용 의견입니다.',
  }
}

// ─── 기능 2: 오늘의 추천 종목 ────────────────────────────────────────────────

/**
 * @returns {Promise<{
 *   generatedAt: string,
 *   us: RecommendedStock[],
 *   kr: RecommendedStock[]
 * }>}
 *
 * RecommendedStock: {
 *   rank, symbol, name, market, theme, aiScore, summary, reason, risk
 * }
 */
export async function getRecommendations() {
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  const system = `당신은 글로벌 주식 시장 전문 애널리스트입니다.
오늘 날짜의 시장 상황을 반영해 투자 추천 종목을 선정합니다.
반드시 아래 JSON 형식으로만 응답하세요:
{
  "us": [
    {
      "rank": 1,
      "symbol": "AAPL",
      "name": "Apple",
      "market": "US",
      "theme": "투자 테마 (예: AI반도체, 전기차, 바이오 등)",
      "aiScore": 85,
      "summary": "한 줄 요약 (20자 이내)",
      "reason": "추천 이유 (3~4문장, 구체적 수치 포함)",
      "risk": "주요 리스크 (2~3문장)"
    }
  ],
  "kr": [ ...같은 형식, 6자리 종목코드... ]
}
aiScore는 0~100 사이 정수. 한국어로 응답하세요.`

  const user = `오늘(${today}) 기준으로 투자 가치가 높은 종목을 선정해주세요:
- 미국 주식 10개 (S&P 500 구성 종목 위주, 다양한 섹터에서 선정)
- 국내 주식 10개 (코스피/코스닥, 다양한 섹터)
최근 실적, 업황, 모멘텀, 밸류에이션을 종합적으로 고려하세요.
AI 점수가 높은 순서로 정렬해주세요.`

  const result = await callGroq(system, user, 0.6)

  const normalize = (list, market) =>
    (Array.isArray(list) ? list : []).slice(0, 10).map((s, i) => ({
      rank:    s.rank    ?? i + 1,
      symbol:  s.symbol  ?? '',
      name:    s.name    ?? '',
      market:  s.market  ?? market,
      theme:   s.theme   ?? '',
      aiScore: typeof s.aiScore === 'number' ? Math.min(100, Math.max(0, s.aiScore)) : 0,
      summary: s.summary ?? '',
      reason:  s.reason  ?? '',
      risk:    s.risk    ?? '',
    }))

  return {
    generatedAt: new Date().toISOString(),
    us: normalize(result.us, 'US'),
    kr: normalize(result.kr, 'KR'),
  }
}

// ─── 메인 라우터 ──────────────────────────────────────────────────────────────

/**
 * 진입점 — Vite 미들웨어 또는 서버리스 핸들러에서 직접 호출
 * @param {{ mode?: string, [key: string]: unknown }} params
 */
export async function analyze(params) {
  const { mode, ...rest } = params ?? {}

  if (mode === 'recommendations') {
    return getRecommendations()
  }

  // 기본: 종목 분석
  const required = ['name', 'currentPrice', 'avgCost', 'shares']
  for (const key of required) {
    if (rest[key] === undefined || rest[key] === null) {
      throw new Error(`필수 파라미터 누락: ${key}`)
    }
  }

  return analyzeStock({
    name:         String(rest.name),
    symbol:       String(rest.symbol ?? ''),
    market:       String(rest.market ?? 'US'),
    currency:     String(rest.currency ?? 'USD'),
    currentPrice: Number(rest.currentPrice),
    avgCost:      Number(rest.avgCost),
    shares:       Number(rest.shares),
  })
}

// ─── Vercel Serverless Function (/api/analyze) ────────────────────────────────

export default async function handler(req, res) {
  try {
    let params = {}
    if (req.method === 'POST') {
      params = req.body ?? {}
    } else {
      params = req.query
    }
    const result = await analyze(params)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

import { StrictMode, useState, useEffect, useCallback, useRef, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  TrendingUp, TrendingDown, Plus, Settings, PieChart,
  Clock, Zap, Search, RefreshCw, X, Loader2, ChevronRight,
  Lightbulb, ChevronDown, ChevronUp, Download,
} from 'lucide-react'
import './styles.css'

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface Stock {
  id: string
  name: string
  symbol: string
  market: 'US' | 'KR'
  currency: 'USD' | 'KRW'
  price: number
  change: number
  changePercent: number
  updatedAt: string
  shares: number
  avgCost: number
}

interface SearchResult {
  symbol: string
  name: string
  market: 'US' | 'KR'
  type: string
  provider: string
}

interface QuoteData {
  symbol: string
  market: string
  currency: string
  currentPrice: number
  open: number | null
  high: number | null
  low: number | null
  prevClose: number
  changePercent: number | null
  updatedAt: string | null
}

type Tab    = 'portfolio' | 'add' | 'recommend' | 'settings'
type Market = 'US' | 'KR'

interface AnalysisData {
  recommendation: string
  summary: string
  reasons: string[]
  risks: string[]
  disclaimer: string
}

interface RecommendedStock {
  rank: number
  symbol: string
  name: string
  market: 'US' | 'KR'
  theme: string
  aiScore: number
  summary: string
  reason: string
  risk: string
}

interface RecommendationsData {
  generatedAt: string
  us: RecommendedStock[]
  kr: RecommendedStock[]
}

// ─── AI 추천 색상 설정 ────────────────────────────────────────────────────────

const REC_CONFIG: Record<string, { bg: string; color: string; icon: string }> = {
  '추가매수': { bg: 'rgba(0, 217, 126, 0.12)',  color: '#00d97e', icon: '↑' },
  '유지':     { bg: 'rgba(96, 165, 250, 0.12)', color: '#60a5fa', icon: '→' },
  '일부매도': { bg: 'rgba(251, 146, 60, 0.12)', color: '#fb923c', icon: '↓' },
  '전량매도': { bg: 'rgba(255, 77, 109, 0.12)', color: '#ff4d6d', icon: '✕' },
}

// ─── 초기 데이터 ──────────────────────────────────────────────────────────────

const INITIAL_STOCKS: Stock[] = [
  {
    id: '1', name: 'Apple', symbol: 'AAPL', market: 'US', currency: 'USD',
    price: 189.30, change: 4.32, changePercent: 2.34, updatedAt: '16:00 ET',
    shares: 5, avgCost: 172.50,
  },
  {
    id: '2', name: 'NVIDIA', symbol: 'NVDA', market: 'US', currency: 'USD',
    price: 875.40, change: 42.80, changePercent: 5.14, updatedAt: '16:00 ET',
    shares: 2, avgCost: 650.00,
  },
  {
    id: '3', name: '삼성전자', symbol: '005930', market: 'KR', currency: 'KRW',
    price: 71500, change: -200, changePercent: -0.28, updatedAt: '15:30 KST',
    shares: 10, avgCost: 68000,
  },
]

// ─── 빠른 종목 목록 ───────────────────────────────────────────────────────────

const QUICK_US = [
  { symbol: 'AAPL',  name: 'Apple' },
  { symbol: 'MSFT',  name: 'Microsoft' },
  { symbol: 'NVDA',  name: 'NVIDIA' },
  { symbol: 'TSLA',  name: 'Tesla' },
  { symbol: 'GOOGL', name: 'Google' },
  { symbol: 'AMZN',  name: 'Amazon' },
  { symbol: 'META',  name: 'Meta' },
]

const QUICK_KR = [
  { symbol: '005930', name: '삼성전자' },
  { symbol: '000660', name: 'SK하이닉스' },
  { symbol: '035420', name: 'NAVER' },
  { symbol: '035720', name: '카카오' },
  { symbol: '005380', name: '현대차' },
  { symbol: '000270', name: '기아' },
  { symbol: '068270', name: '셀트리온' },
]

// ─── API 호출 ─────────────────────────────────────────────────────────────────

async function apiSearch(query: string): Promise<SearchResult[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error(`검색 실패: ${res.status}`)
  const data = await res.json()
  return data.results ?? []
}

async function apiQuote(symbol: string): Promise<QuoteData> {
  const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`)
  if (!res.ok) throw new Error(`시세 조회 실패: ${res.status}`)
  return res.json()
}

async function apiQuotes(
  symbols: string[],
): Promise<Array<{ symbol: string; data?: QuoteData; error?: string }>> {
  const res = await fetch(`/api/quotes?symbols=${symbols.join(',')}`)
  if (!res.ok) throw new Error(`일괄 조회 실패: ${res.status}`)
  return res.json()
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

const USD_PER_KRW = 1 / 1350

function toUSD(price: number, currency: 'USD' | 'KRW') {
  return currency === 'KRW' ? price * USD_PER_KRW : price
}

function formatPrice(price: number, currency: 'USD' | 'KRW') {
  if (currency === 'KRW') return `₩${price.toLocaleString('ko-KR')}`
  return `$${price.toFixed(2)}`
}

function sign(n: number) { return n >= 0 ? '+' : '' }

function calcPortfolio(stocks: Stock[]) {
  let totalValue = 0
  let totalCost  = 0
  for (const s of stocks) {
    totalValue += toUSD(s.price, s.currency) * s.shares
    totalCost  += toUSD(s.avgCost, s.currency) * s.shares
  }
  const pnl       = totalValue - totalCost
  const pnlPct    = totalCost > 0 ? (pnl / totalCost) * 100 : 0
  const topGainer = [...stocks].sort((a, b) => b.changePercent - a.changePercent)[0]
  return { totalValue, pnl, pnlPct, topGainer }
}

// ─── AI 분석 패널 ─────────────────────────────────────────────────────────────

function AIAnalysisPanel({ data }: { data: AnalysisData }) {
  const cfg = REC_CONFIG[data.recommendation] ?? {
    bg: 'rgba(255,255,255,0.08)', color: 'var(--text)', icon: '?',
  }

  return (
    <div className="ai-panel">
      {/* 추천 결과 배지 */}
      <div className="ai-recommendation" style={{ background: cfg.bg, borderColor: cfg.color + '44' }}>
        <span className="ai-rec-icon" style={{ color: cfg.color }}>{cfg.icon}</span>
        <span className="ai-rec-label" style={{ color: cfg.color }}>{data.recommendation}</span>
      </div>

      {/* 한 줄 요약 */}
      <p className="ai-summary">"{data.summary}"</p>

      {/* 추천 이유 */}
      <div className="ai-section">
        <p className="ai-section-title">📋 추천 이유</p>
        <ul className="ai-list">
          {data.reasons.map((r, i) => (
            <li key={i} className="ai-list-item ai-reason">{r}</li>
          ))}
        </ul>
      </div>

      {/* 리스크 */}
      <div className="ai-section">
        <p className="ai-section-title">⚠️ 주의 리스크</p>
        <ul className="ai-list">
          {data.risks.map((r, i) => (
            <li key={i} className="ai-list-item ai-risk">{r}</li>
          ))}
        </ul>
      </div>

      {/* 면책 */}
      <p className="ai-disclaimer">{data.disclaimer}</p>
    </div>
  )
}

// ─── 미니 차트 ───────────────────────────────────────────────────────────────

function generateBars(symbol: string, positive: boolean): number[] {
  const seed = symbol.split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0)
  return Array.from({ length: 14 }, (_, i) => {
    const wave   = Math.sin(seed * 0.01 + i * 0.9) * 0.3 + 0.5
    const trend  = positive ? i / 14 * 0.45 : (1 - i / 14) * 0.45
    return Math.max(0.1, Math.min(1, wave * 0.55 + trend))
  })
}

function MiniChart({ symbol, positive }: { symbol: string; positive: boolean }) {
  const bars = generateBars(symbol, positive)
  return (
    <div className="mini-chart">
      {bars.map((h, i) => (
        <div
          key={i}
          className={`mini-bar ${positive ? 'mini-bar-up' : 'mini-bar-down'}`}
          style={{ height: `${Math.round(h * 100)}%` }}
        />
      ))}
    </div>
  )
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────

function SummaryCard({
  title, value, sub, sub2, positive,
}: {
  title: string
  value: string
  sub?: string
  sub2?: string
  positive?: boolean
}) {
  return (
    <div className="summary-card">
      <p className="summary-title">{title}</p>
      <p className={`summary-value ${positive === true ? 'text-up' : positive === false ? 'text-down' : ''}`}>
        {value}
      </p>
      {sub && (
        <p className={`summary-sub ${positive === true ? 'text-up' : positive === false ? 'text-down' : ''}`}>
          {sub}
        </p>
      )}
      {sub2 && <p className="summary-sub2">{sub2}</p>}
    </div>
  )
}

// ─── StockCard ────────────────────────────────────────────────────────────────

function StockCard({
  stock, onDelete, isUpdating = false,
}: {
  stock: Stock
  onDelete: (id: string) => void
  isUpdating?: boolean
}) {
  const up           = stock.changePercent >= 0
  const currentValue = toUSD(stock.price, stock.currency) * stock.shares
  const costValue    = toUSD(stock.avgCost, stock.currency) * stock.shares
  const pnlPct       = ((currentValue - costValue) / costValue) * 100
  const pnlUp        = pnlPct >= 0

  const [analysisOpen,    setAnalysisOpen]    = useState(false)
  const [analysisData,    setAnalysisData]    = useState<AnalysisData | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError,   setAnalysisError]   = useState('')

  async function handleAI() {
    // 이미 열려있으면 닫기
    if (analysisOpen) { setAnalysisOpen(false); return }

    // 캐시된 결과 있으면 바로 열기
    if (analysisData) { setAnalysisOpen(true); return }

    setAnalysisOpen(true)
    setAnalysisLoading(true)
    setAnalysisError('')
    try {
      const res = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:         stock.name,
          symbol:       stock.symbol,
          market:       stock.market,
          currency:     stock.currency,
          currentPrice: stock.price,
          avgCost:      stock.avgCost,
          shares:       stock.shares,
        }),
      })
      if (!res.ok) throw new Error(`서버 오류: ${res.status}`)
      const data: AnalysisData = await res.json()
      setAnalysisData(data)
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : 'AI 분석에 실패했어요.')
    } finally {
      setAnalysisLoading(false)
    }
  }

  return (
    <div className={`stock-card ${isUpdating ? 'card-updating' : ''}`}>
      {/* 헤더: 티커 + 삭제 버튼 */}
      <div className="stock-card-header">
        <div className="stock-ticker-wrap">
          <span className="stock-ticker">{stock.symbol}</span>
          <span className={`market-tag ${stock.market === 'US' ? 'tag-us' : 'tag-kr'}`}>
            {stock.market}
          </span>
        </div>
        <button className="delete-btn" onClick={() => onDelete(stock.id)} title="삭제">
          <X size={11} />
        </button>
      </div>

      {/* 회사명 */}
      <p className="stock-name">{stock.name}</p>

      {/* 미니 차트 */}
      <MiniChart symbol={stock.symbol} positive={up} />

      {/* 현재가 + 오늘 등락 */}
      <p className={`stock-price ${isUpdating ? 'price-pulse' : ''}`}>
        {formatPrice(stock.price, stock.currency)}
      </p>
      <p className={`stock-day-change ${up ? 'text-up' : 'text-down'}`}>
        {sign(stock.changePercent)}{stock.changePercent.toFixed(2)}%
        <span className={`change-badge ${up ? 'badge-up' : 'badge-down'}`}>
          {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
        </span>
      </p>

      <div className="stock-divider" />

      {/* 수익률 + 보유 정보 */}
      <div className={`pnl-row ${pnlUp ? 'pnl-up' : 'pnl-down'}`}>
        <span className="pnl-pct">{sign(pnlPct)}{pnlPct.toFixed(2)}%</span>
        <span className="pnl-label">수익</span>
      </div>
      <p className="stock-shares">{stock.shares}주 보유</p>

      <div className="stock-updated">
        <Clock size={9} />
        <span>{stock.updatedAt}</span>
        {isUpdating && <Loader2 size={9} className="spin" />}
      </div>

      {/* AI 분석 버튼 */}
      <button
        className={`ai-btn ${analysisOpen ? 'ai-btn-active' : ''}`}
        onClick={handleAI}
      >
        {analysisLoading
          ? <><Loader2 size={12} className="spin" /> 분석 중...</>
          : <>{analysisOpen ? '▲ AI 분석 닫기' : '🤖 AI 분석'}</>
        }
      </button>

      {/* AI 분석 결과 */}
      {analysisOpen && (
        analysisLoading
          ? <div className="ai-loading"><Loader2 size={18} className="spin" /> AI가 분석하고 있어요...</div>
          : analysisError
          ? <div className="ai-error">{analysisError}</div>
          : analysisData
          ? <AIAnalysisPanel data={analysisData} />
          : null
      )}
    </div>
  )
}

// ─── PortfolioTab ─────────────────────────────────────────────────────────────

function PortfolioTab({
  stocks, isRefreshing, onRefresh, onDelete,
}: {
  stocks: Stock[]
  isRefreshing: boolean
  onRefresh: () => void
  onDelete: (id: string) => void
}) {
  if (stocks.length === 0) {
    return (
      <div className="tab-content empty-state">
        <div className="empty-icon-wrap"><PieChart size={40} /></div>
        <p className="empty-title">포트폴리오가 비어있어요</p>
        <p className="empty-desc">종목 추가 탭에서 주식을 추가해보세요.</p>
      </div>
    )
  }

  const { totalValue, pnl, pnlPct, topGainer } = calcPortfolio(stocks)

  return (
    <div className="tab-content">
      <div className="summary-grid">
        <SummaryCard
          title="총 평가금액"
          value={`$${totalValue.toFixed(0)}`}
          sub2={`₩${Math.round(totalValue * 1350).toLocaleString('ko-KR')}`}
        />
        <SummaryCard
          title="총 손익"
          value={`${sign(pnl)}$${Math.abs(pnl).toFixed(0)}`}
          sub={`${sign(pnlPct)}${pnlPct.toFixed(2)}%`}
          positive={pnl >= 0}
        />
        <SummaryCard
          title="오늘 최고 상승"
          value={topGainer?.name ?? '-'}
          sub={topGainer ? `${sign(topGainer.changePercent)}${topGainer.changePercent.toFixed(2)}%` : undefined}
          positive={topGainer ? topGainer.changePercent >= 0 : undefined}
        />
      </div>

      <div className="section-header">
        <p className="section-label">내 포트폴리오</p>
        <button
          className={`refresh-btn ${isRefreshing ? 'refreshing' : ''}`}
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw size={13} className={isRefreshing ? 'spin' : ''} />
          {isRefreshing ? '업데이트 중' : '새로고침'}
        </button>
      </div>

      <div className="stock-grid">
        {stocks.map(s => (
          <StockCard key={s.id} stock={s} onDelete={onDelete} isUpdating={isRefreshing} />
        ))}
      </div>
    </div>
  )
}

// ─── AddStockTab ──────────────────────────────────────────────────────────────

function AddStockTab({ onAdd }: { onAdd: (stock: Stock) => void }) {
  const [market, setMarket]               = useState<Market>('US')
  const [query, setQuery]                 = useState('')
  const [results, setResults]             = useState<SearchResult[]>([])
  const [isSearching, setIsSearching]     = useState(false)
  const [searchError, setSearchError]     = useState('')
  const [selected, setSelected]           = useState<SearchResult | null>(null)
  const [quote, setQuote]                 = useState<QuoteData | null>(null)
  const [isLoadingQuote, setIsLoadingQuote] = useState(false)
  const [shares, setShares]               = useState('')
  const [avgCost, setAvgCost]             = useState('')

  const quickList = market === 'US' ? QUICK_US : QUICK_KR

  function resetSelection() {
    setSelected(null)
    setQuote(null)
    setShares('')
    setAvgCost('')
  }

  function changeMarket(m: Market) {
    setMarket(m)
    setResults([])
    setSearchError('')
    resetSelection()
  }

  // 검색 실행
  async function handleSearch() {
    if (!query.trim()) return
    setIsSearching(true)
    setSearchError('')
    resetSelection()
    try {
      const all = await apiSearch(query)
      const filtered = all.filter(r => r.market === market)
      setResults(filtered)
      if (filtered.length === 0) setSearchError('검색 결과가 없어요.')
    } catch {
      setSearchError('검색 중 오류가 발생했어요.')
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // 시세 조회 (검색 결과 클릭 / 빠른 버튼 공통)
  async function loadQuote(result: SearchResult) {
    setSelected(result)
    setResults([])
    setQuote(null)
    setAvgCost('')
    setIsLoadingQuote(true)
    try {
      const q = await apiQuote(result.symbol)
      setQuote(q)
      setAvgCost(String(q.currentPrice.toFixed(q.currency === 'KRW' ? 0 : 2)))
    } catch {
      // quote remains null — UI shows error
    } finally {
      setIsLoadingQuote(false)
    }
  }

  // 포트폴리오에 추가
  function handleAdd() {
    if (!selected || !quote) return
    const sh = parseFloat(shares)
    const ac = parseFloat(avgCost)
    if (!sh || sh <= 0 || !ac || ac <= 0) return

    const stock: Stock = {
      id:            `${selected.symbol}-${Date.now()}`,
      name:          selected.name,
      symbol:        selected.symbol,
      market:        selected.market,
      currency:      quote.currency as 'USD' | 'KRW',
      price:         quote.currentPrice,
      change:        quote.currentPrice - quote.prevClose,
      changePercent: quote.changePercent ?? 0,
      updatedAt:     quote.updatedAt ?? '--',
      shares:        sh,
      avgCost:       ac,
    }
    onAdd(stock)
    resetSelection()
    setQuery('')
  }

  const canAdd = !!selected && !!quote && parseFloat(shares) > 0 && parseFloat(avgCost) > 0

  return (
    <div className="tab-content">
      {/* 마켓 선택 */}
      <div className="market-selector">
        <button
          className={`market-btn ${market === 'US' ? 'active' : ''}`}
          onClick={() => changeMarket('US')}
        >
          🇺🇸 미국
        </button>
        <button
          className={`market-btn ${market === 'KR' ? 'active' : ''}`}
          onClick={() => changeMarket('KR')}
        >
          🇰🇷 국내
        </button>
      </div>

      {/* 검색창 */}
      <div className="search-bar">
        <input
          className="search-input"
          placeholder={
            market === 'US'
              ? '회사명 또는 티커 (예: Apple, AAPL)'
              : '회사명 또는 종목코드 (예: 삼성전자, 005930)'
          }
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button className="search-btn" onClick={handleSearch} disabled={isSearching}>
          {isSearching
            ? <Loader2 size={16} className="spin" />
            : <Search size={16} />}
        </button>
      </div>

      {searchError && <p className="search-error">{searchError}</p>}

      {/* 검색 결과 */}
      {results.length > 0 && (
        <div className="search-results">
          {results.map(r => (
            <button key={r.symbol} className="result-item" onClick={() => loadQuote(r)}>
              <div className="result-info">
                <span className="result-symbol">{r.symbol}</span>
                <span className="result-name">{r.name}</span>
              </div>
              <ChevronRight size={14} className="result-arrow" />
            </button>
          ))}
        </div>
      )}

      {/* 선택된 종목 + 시세 + 입력 폼 */}
      {selected && (
        <div className="selected-stock">
          <div className="selected-header">
            <div>
              <p className="selected-name">{selected.name}</p>
              <p className="selected-symbol">{selected.symbol} · {selected.market}</p>
            </div>
            <button className="clear-btn" onClick={resetSelection}>
              <X size={15} />
            </button>
          </div>

          {isLoadingQuote ? (
            <div className="quote-loading">
              <Loader2 size={20} className="spin" />
              <span>시세 조회 중...</span>
            </div>
          ) : quote ? (
            <>
              <div className="price-preview">
                <div>
                  <span className="preview-label">현재가</span>
                  <span className="preview-price">
                    {formatPrice(quote.currentPrice, quote.currency as 'USD' | 'KRW')}
                  </span>
                </div>
                {quote.changePercent !== null && (
                  <span className={`preview-change ${quote.changePercent >= 0 ? 'text-up' : 'text-down'}`}>
                    {sign(quote.changePercent)}{quote.changePercent.toFixed(2)}%
                  </span>
                )}
              </div>

              <div className="add-form">
                <div className="form-row">
                  <label className="form-label">수량 (주)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0.001"
                    step="0.001"
                    placeholder="0"
                    value={shares}
                    onChange={e => setShares(e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label className="form-label">평균 매수가</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={avgCost}
                    onChange={e => setAvgCost(e.target.value)}
                  />
                </div>
                <button
                  className="add-portfolio-btn"
                  onClick={handleAdd}
                  disabled={!canAdd}
                >
                  <Plus size={16} />
                  포트폴리오에 추가
                </button>
              </div>
            </>
          ) : (
            <p className="quote-error">시세를 불러올 수 없어요. 잠시 후 다시 시도해주세요.</p>
          )}
        </div>
      )}

      {/* 자주 찾는 종목 */}
      {!selected && (
        <>
          <p className="quick-label">자주 찾는 종목</p>
          <div className="quick-grid">
            {quickList.map(item => (
              <button
                key={item.symbol}
                className="quick-btn"
                onClick={() =>
                  loadQuote({ symbol: item.symbol, name: item.name, market, type: 'stock', provider: '' })
                }
              >
                <span className="quick-name">{item.name}</span>
                <span className="quick-symbol">{item.symbol}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── ScoreCircle ─────────────────────────────────────────────────────────────

function ScoreCircle({ score }: { score: number }) {
  const r = 20
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const color = score >= 80 ? '#00d97e' : score >= 60 ? '#60a5fa' : score >= 40 ? '#fb923c' : '#ff4d6d'
  return (
    <svg className="score-circle-svg" width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
      <circle
        cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 26 26)"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
      <text x="26" y="30" textAnchor="middle" fontSize="12" fontWeight="700" fill={color}>{score}</text>
    </svg>
  )
}

// ─── RecommendationCard ───────────────────────────────────────────────────────

function RecommendationCard({ stock }: { stock: RecommendedStock }) {
  const [open, setOpen] = useState(false)
  const scoreColor = stock.aiScore >= 80 ? '#00d97e' : stock.aiScore >= 60 ? '#60a5fa' : stock.aiScore >= 40 ? '#fb923c' : '#ff4d6d'
  return (
    <div className="rec-card">
      <div className="rec-header" onClick={() => setOpen(v => !v)}>
        <div className="rec-rank">#{stock.rank}</div>
        <div className="rec-info">
          <div className="rec-name-row">
            <span className="rec-name">{stock.name}</span>
            <span className={`market-tag ${stock.market === 'US' ? 'tag-us' : 'tag-kr'}`}>{stock.market}</span>
          </div>
          <div className="rec-meta-row">
            <span className="rec-symbol">{stock.symbol}</span>
            {stock.theme && <span className="rec-theme">{stock.theme}</span>}
          </div>
          <p className="rec-summary">{stock.summary}</p>
        </div>
        <div className="rec-right">
          <ScoreCircle score={stock.aiScore} />
          <span className="rec-score-label" style={{ color: scoreColor }}>AI점수</span>
        </div>
        <div className="rec-toggle">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>
      {open && (
        <div className="rec-detail">
          {stock.reason && (
            <div className="rec-section">
              <p className="rec-section-title">📋 추천 이유</p>
              <p className="rec-text rec-reason-text">{stock.reason}</p>
            </div>
          )}
          {stock.risk && (
            <div className="rec-section">
              <p className="rec-section-title">⚠️ 주요 리스크</p>
              <p className="rec-text rec-risk-text">{stock.risk}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── RecommendationTab ────────────────────────────────────────────────────────

function RecommendationTab({
  data, loading, error, onRefresh,
}: {
  data: RecommendationsData | null
  loading: boolean
  error: string
  onRefresh: () => void
}) {
  if (loading) {
    return (
      <div className="tab-content rec-loading-wrap">
        <Loader2 size={32} className="spin rec-loading-icon" />
        <p className="rec-loading-text">AI가 오늘의 추천 종목을 분석하고 있어요...</p>
        <p className="rec-loading-sub">잠시만 기다려주세요 (10~20초 소요)</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="tab-content rec-error-wrap">
        <p className="rec-error-text">{error}</p>
        <button className="refresh-btn" onClick={onRefresh}>다시 시도</button>
      </div>
    )
  }

  if (!data) return null

  const generatedAt = new Date(data.generatedAt).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="tab-content">
      <div className="rec-tab-header">
        <div>
          <p className="rec-tab-title">오늘의 AI 추천 종목</p>
          <p className="rec-tab-sub">생성: {generatedAt}</p>
        </div>
        <button
          className={`refresh-btn ${loading ? 'refreshing' : ''}`}
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
          새로고침
        </button>
      </div>

      <div className="rec-section-label">🇺🇸 미국 주식 추천</div>
      <div className="rec-list">
        {data.us.map(s => <RecommendationCard key={s.symbol} stock={s} />)}
      </div>

      <div className="rec-section-label rec-section-label-kr">🇰🇷 국내 주식 추천</div>
      <div className="rec-list">
        {data.kr.map(s => <RecommendationCard key={s.symbol} stock={s} />)}
      </div>

      <p className="rec-disclaimer">이 추천은 AI가 생성한 참고 정보이며, 실제 투자 결정의 책임은 투자자 본인에게 있습니다.</p>
    </div>
  )
}

// ─── SettingsTab ──────────────────────────────────────────────────────────────

function SettingsTab() {
  return (
    <div className="tab-content empty-state">
      <div className="empty-icon-wrap"><Settings size={40} /></div>
      <p className="empty-title">설정</p>
      <p className="empty-desc">API 연결, 환율, 알림 등 설정 항목이 추가될 예정이에요.</p>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [tab, setTab]                   = useState<Tab>('portfolio')
  const [stocks, setStocks]             = useState<Stock[]>(INITIAL_STOCKS)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const stocksRef = useRef(stocks)

  // PWA 설치 프롬프트
  const [installPrompt, setInstallPrompt] = useState<Event & { prompt: () => Promise<void> } | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as Event & { prompt: () => Promise<void> })
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // 종목 추천 상태
  const [recData,    setRecData]    = useState<RecommendationsData | null>(null)
  const [recLoading, setRecLoading] = useState(false)
  const [recError,   setRecError]   = useState('')

  useEffect(() => { stocksRef.current = stocks }, [stocks])

  const refreshPrices = useCallback(async () => {
    if (stocksRef.current.length === 0) return
    setIsRefreshing(true)
    try {
      const symbols = stocksRef.current.map(s => s.symbol)
      const results = await apiQuotes(symbols)
      setStocks(prev =>
        prev.map(stock => {
          const found = results.find(r => r.symbol === stock.symbol)
          if (!found?.data) return stock
          const q = found.data
          return {
            ...stock,
            price:         q.currentPrice,
            change:        q.currentPrice - q.prevClose,
            changePercent: q.changePercent ?? stock.changePercent,
            updatedAt:     q.updatedAt ?? stock.updatedAt,
          }
        }),
      )
    } catch (err) {
      console.error('새로고침 실패:', err)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  const loadRecommendations = useCallback(async () => {
    setRecLoading(true)
    setRecError('')
    try {
      const res = await fetch('/api/analyze?mode=recommendations')
      if (!res.ok) throw new Error(`서버 오류: ${res.status}`)
      const data: RecommendationsData = await res.json()
      setRecData(data)
    } catch (e) {
      setRecError(e instanceof Error ? e.message : 'AI 추천을 불러오지 못했어요.')
    } finally {
      setRecLoading(false)
    }
  }, [])

  // 종목 추천 탭 진입 시 자동 로드 (첫 번째만)
  useEffect(() => {
    if (tab === 'recommend' && !recData && !recLoading) {
      loadRecommendations()
    }
  }, [tab, recData, recLoading, loadRecommendations])

  // 1분마다 자동 새로고침
  useEffect(() => {
    const id = setInterval(refreshPrices, 60_000)
    return () => clearInterval(id)
  }, [refreshPrices])

  const handleAdd = (stock: Stock) => {
    setStocks(prev => [...prev, stock])
    setTab('portfolio')
  }

  const handleDelete = (id: string) => {
    setStocks(prev => prev.filter(s => s.id !== id))
  }

  const tabs: { key: Tab; label: string; Icon: (p: { size: number }) => ReactElement }[] = [
    { key: 'portfolio',  label: '포트폴리오', Icon: PieChart },
    { key: 'add',        label: '종목 추가',  Icon: Plus },
    { key: 'recommend',  label: '종목 추천',  Icon: Lightbulb },
    { key: 'settings',   label: '설정',       Icon: Settings },
  ]

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <Zap size={20} className="header-icon" />
          <h1 className="app-title">MyStock Lab</h1>
        </div>
        <div className="header-right">
          <p className="header-sub">실시간 포트폴리오</p>
          {installPrompt && (
            <button
              className="install-btn"
              onClick={async () => {
                await installPrompt.prompt()
                setInstallPrompt(null)
              }}
            >
              <Download size={13} />
              설치
            </button>
          )}
        </div>
      </header>

      <nav className="tab-nav">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`tab-btn ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <main className="app-main">
        {tab === 'portfolio' && (
          <PortfolioTab
            stocks={stocks}
            isRefreshing={isRefreshing}
            onRefresh={refreshPrices}
            onDelete={handleDelete}
          />
        )}
        {tab === 'add'       && <AddStockTab onAdd={handleAdd} />}
        {tab === 'recommend' && (
          <RecommendationTab
            data={recData}
            loading={recLoading}
            error={recError}
            onRefresh={loadRecommendations}
          />
        )}
        {tab === 'settings'  && <SettingsTab />}
      </main>
    </div>
  )
}

// ─── 렌더링 ──────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

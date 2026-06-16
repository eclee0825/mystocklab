import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'http'

export default defineConfig(({ mode }) => {
  // '' 접두사 → VITE_ 없이도 .env의 모든 변수 로드
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      apiDevPlugin(env),
    ],
  }
})

// ─── 개발용 API 라우터 플러그인 ───────────────────────────────────────────────

function apiDevPlugin(env: Record<string, string>) {
  return {
    name: 'vite-api-dev',

    configureServer(server: { middlewares: { use: Function } }) {
      // .env 변수를 process.env에 주입 → api/*.js 모듈이 읽을 수 있도록
      process.env.FINNHUB_API_KEY = env.FINNHUB_API_KEY
      process.env.GROQ_API_KEY    = env.GROQ_API_KEY

      server.middlewares.use('/api', async (
        req: IncomingMessage,
        res: ServerResponse,
      ) => {
        // connect 미들웨어는 /api 이후 경로만 req.url로 전달
        const url  = new URL(req.url ?? '/', 'http://localhost')
        const path = url.pathname   // '/search' | '/quote' | '/quotes'

        res.setHeader('Content-Type', 'application/json; charset=utf-8')

        try {
          if (path === '/search') {
            const q = url.searchParams.get('q') ?? ''
            const { search } = await import('./api/search.js')
            res.end(JSON.stringify(await search(q)))

          } else if (path === '/quote') {
            const symbol = url.searchParams.get('symbol') ?? ''
            const { getQuote } = await import('./api/quote.js')
            res.end(JSON.stringify(await getQuote(symbol)))

          } else if (path === '/quotes') {
            const symbols = (url.searchParams.get('symbols') ?? '')
              .split(',')
              .filter(Boolean)
            const { getQuotes } = await import('./api/quote.js')
            res.end(JSON.stringify(await getQuotes(symbols)))

          } else if (path === '/analyze') {
            // GET: mode=recommendations
            // POST: 종목 분석 파라미터 (JSON body)
            const { analyze } = await import('./api/analyze.js')

            let params: Record<string, unknown> = {}

            if (req.method === 'POST') {
              const body = await new Promise<string>((resolve, reject) => {
                let data = ''
                req.on('data', (chunk: Buffer) => { data += chunk.toString() })
                req.on('end',   () => resolve(data))
                req.on('error', reject)
              })
              params = body ? JSON.parse(body) : {}
            } else {
              // GET: 쿼리스트링으로 전달
              url.searchParams.forEach((v, k) => { params[k] = v })
            }

            res.end(JSON.stringify(await analyze(params)))

          } else {
            res.statusCode = 404
            res.end(JSON.stringify({ error: `알 수 없는 API 경로: ${path}` }))
          }

        } catch (err: unknown) {
          res.statusCode = 500
          const msg = err instanceof Error ? err.message : '서버 오류'
          res.end(JSON.stringify({ error: msg }))
        }
      })
    },
  }
}

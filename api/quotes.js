// api/quotes.js — Vercel Serverless Function (/api/quotes)
import { getQuotes } from './quote.js'

export default async function handler(req, res) {
  try {
    const symbols = (req.query.symbols ?? '').split(',').filter(Boolean)
    const result = await getQuotes(symbols)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

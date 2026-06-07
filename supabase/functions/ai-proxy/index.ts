// Supabase Edge Function — ai-proxy
// Handles server-side API key storage (AES-GCM encrypted) and proxies
// chat/brainstorm requests to Google, OpenAI, or Anthropic using stored keys.
// The browser never receives a stored key back — only success/error status.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const fail = (msg: string, status = 400) => json({ error: msg }, status)

// ── Encryption ────────────────────────────────────────────────────────────────

async function getEncKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('API_KEY_ENCRYPTION_SECRET') ?? ''
  if (secret.length < 16) throw new Error('API_KEY_ENCRYPTION_SECRET must be at least 16 characters')
  const raw = new TextEncoder().encode(secret.padEnd(32, '0').slice(0, 32))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encryptValue(plaintext: string): Promise<string> {
  const key = await getEncKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  const combined = new Uint8Array(12 + ct.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ct), 12)
  return btoa(String.fromCharCode(...combined))
}

async function decryptValue(encoded: string): Promise<string> {
  const key = await getEncKey()
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12))
  return new TextDecoder().decode(pt)
}

// ── Provider helpers ──────────────────────────────────────────────────────────

type Message = { role: string; text: string }

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: Message[],
  newMessage: string,
): Promise<string> {
  const geminiModel = model.startsWith('gemini-') ? model : 'gemini-2.5-flash'
  const contents = [
    ...history.map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: newMessage }] },
  ]
  const body: Record<string, unknown> = { contents, generationConfig: { maxOutputTokens: 8192 } }
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? `Gemini ${res.status}`)
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  history: Message[],
  newMessage: string,
): Promise<string> {
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...history.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
    { role: 'user', content: newMessage },
  ]
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4o', messages, max_tokens: 4096, temperature: 0.8 }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? `OpenAI ${res.status}`)
  return data.choices?.[0]?.message?.content ?? ''
}

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  history: Message[],
  newMessage: string,
): Promise<string> {
  const messages = [
    ...history.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
    { role: 'user', content: newMessage },
  ]
  const body: Record<string, unknown> = { model: 'claude-3-5-sonnet-20241022', messages, max_tokens: 4096, temperature: 0.8 }
  if (systemPrompt) body.system = systemPrompt

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? `Anthropic ${res.status}`)
  return data.content?.[0]?.text ?? ''
}

const providerForModel = (modelId: string): 'google' | 'openai' | 'anthropic' => {
  if (modelId.startsWith('gemini')) return 'google'
  if (modelId === 'gpt-4o') return 'openai'
  return 'anthropic'
}

const BRAINSTORM_PROMPT = (contextText: string, existingIdeas: string[]) =>
  `You are a lateral thinking specialist. Generate 5–7 ideas related to the concept below, spanning genuinely different angles: direct applications, analogies from unrelated domains, hidden sub-problems, unexpected combinations, simplified or amplified versions, and contrarian takes. Every idea should shift thinking in a new direction — no synonyms or trivial variations. Keep each under 7 words. Return ONLY a JSON array of strings, no preamble, no markdown.
Concept: ${contextText}
Already on canvas (do not duplicate): ${existingIdeas.join(', ')}`

function parseIdeasJson(text: string): string[] {
  try {
    const match = text.match(/\[[\s\S]*\]/)
    const parsed = JSON.parse(match ? match[0] : text)
    return Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.ideas) ? parsed.ideas : [])
  } catch { return [] }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail('Method not allowed', 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return fail('Unauthorized', 401)

  // Build Supabase client using the user's JWT — RLS applies automatically
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: authErr } = await sb.auth.getUser()
  if (authErr || !user) return fail('Unauthorized', 401)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return fail('Invalid JSON') }

  const action = body.action as string

  // ── Key management ──────────────────────────────────────────────────────────

  if (action === 'store_key') {
    const { provider, apiKey } = body as { provider: string; apiKey: string }
    if (!provider || !apiKey) return fail('Missing provider or apiKey')
    if (!['google', 'openai', 'anthropic'].includes(provider)) return fail('Invalid provider')
    try {
      const encryptedKey = await encryptValue(apiKey)
      const { error } = await sb.from('user_api_keys').upsert(
        { user_id: user.id, provider, encrypted_key: encryptedKey, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,provider' },
      )
      if (error) throw error
      return json({ success: true })
    } catch (e: unknown) { return fail((e as Error).message, 500) }
  }

  if (action === 'delete_key') {
    const { provider } = body as { provider: string }
    const { error } = await sb.from('user_api_keys').delete()
      .eq('user_id', user.id).eq('provider', provider)
    if (error) return fail(error.message, 500)
    return json({ success: true })
  }

  if (action === 'check_keys') {
    const { data, error } = await sb.from('user_api_keys')
      .select('provider').eq('user_id', user.id)
    if (error) return fail(error.message, 500)
    return json({ providers: (data ?? []).map((r: { provider: string }) => r.provider) })
  }

  // ── Resolve stored key ──────────────────────────────────────────────────────

  const getStoredKey = async (provider: string): Promise<string> => {
    const { data, error } = await sb.from('user_api_keys')
      .select('encrypted_key').eq('user_id', user.id).eq('provider', provider).single()
    if (error || !data) throw new Error(`No ${provider} API key stored. Add it in Settings.`)
    return decryptValue((data as { encrypted_key: string }).encrypted_key)
  }

  // ── Chat proxy ──────────────────────────────────────────────────────────────

  if (action === 'chat') {
    const { modelId, systemPrompt = '', history = [], newMessage } =
      body as { modelId: string; systemPrompt?: string; history?: Message[]; newMessage: string }
    if (!modelId || !newMessage) return fail('Missing modelId or newMessage')
    try {
      const provider = providerForModel(modelId)
      const apiKey = await getStoredKey(provider)
      let text: string
      if (provider === 'openai') text = await callOpenAI(apiKey, systemPrompt as string, history as Message[], newMessage as string)
      else if (provider === 'anthropic') text = await callAnthropic(apiKey, systemPrompt as string, history as Message[], newMessage as string)
      else text = await callGemini(apiKey, modelId as string, systemPrompt as string, history as Message[], newMessage as string)
      return json({ text })
    } catch (e: unknown) { return fail((e as Error).message, 500) }
  }

  // ── Brainstorm proxy ────────────────────────────────────────────────────────

  if (action === 'brainstorm') {
    const { modelId, contextText, existingIdeas = [] } =
      body as { modelId: string; contextText: string; existingIdeas?: string[] }
    if (!modelId || !contextText) return fail('Missing modelId or contextText')
    try {
      const provider = providerForModel(modelId)
      const apiKey = await getStoredKey(provider)
      const prompt = BRAINSTORM_PROMPT(contextText as string, existingIdeas as string[])
      let ideasText = '[]'

      if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: 200 }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error?.message)
        ideasText = d.choices?.[0]?.message?.content ?? '[]'
      } else if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', messages: [{ role: 'user', content: prompt }], max_tokens: 200 }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error?.message)
        ideasText = d.content?.[0]?.text ?? '[]'
      } else {
        const geminiModel = (modelId as string).startsWith('gemini-') ? modelId : 'gemini-2.5-flash'
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'ARRAY', items: { type: 'STRING' } } },
            }),
          },
        )
        const d = await res.json()
        if (!res.ok) throw new Error(d.error?.message)
        ideasText = d.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'
      }

      return json({ ideas: parseIdeasJson(ideasText) })
    } catch (e: unknown) { return fail((e as Error).message, 500) }
  }

  return fail('Unknown action')
})

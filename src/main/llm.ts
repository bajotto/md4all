import { getSettings } from './settings'
import { decryptSecret } from './sftp'
import type { LlmUsage } from './types'

const BASE = 'https://openrouter.ai/api/v1'

/** Sentinel used in the modelPrimary/modelReviewer fields to route to swell/devin instead of OpenRouter. */
export const SWELL_MODEL_ID = 'swell:devin'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function emptyUsage(): LlmUsage {
  return { promptTokens: 0, completionTokens: 0, cost: 0, calls: 0 }
}

export function addUsage(acc: LlmUsage, u: LlmUsage): void {
  acc.promptTokens += u.promptTokens
  acc.completionTokens += u.completionTokens
  acc.cost += u.cost
  acc.calls += u.calls
}

export interface ChatOptions {
  token?: string // overrides the saved token (used in validation before persisting)
  temperature?: number
  json?: boolean // requests response_format json_object
  maxTokens?: number
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    // OpenRouter recommends identifying the app
    'HTTP-Referer': 'https://github.com/md4all',
    'X-Title': 'md4all'
  }
}

/** Plaintext token from the encrypted settings. */
export function getToken(): string {
  const token = decryptSecret(getSettings().llm?.encToken)
  if (!token) throw new Error('Configure the OpenRouter token first (⚙ in the sidebar).')
  return token
}

export function getModels(): { primary: string; reviewer: string } {
  const llm = getSettings().llm ?? {}
  if (!llm.modelPrimary || !llm.modelReviewer) {
    throw new Error('Configure both LLM models in the settings (⚙).')
  }
  return { primary: llm.modelPrimary, reviewer: llm.modelReviewer }
}

/** Plaintext URL + token for swell/devin from the encrypted settings. */
function getSwellConfig(): { url: string; token: string } {
  const llm = getSettings().llm ?? {}
  const url = llm.swellUrl?.trim()
  const token = decryptSecret(llm.encSwellToken)
  if (!url || !token) {
    throw new Error('Configure the swell/devin URL and token first (⚙ in the sidebar).')
  }
  return { url: url.replace(/\/+$/, ''), token }
}

function messagesToPrompt(messages: ChatMessage[]): string {
  const label = (r: ChatMessage['role']): string =>
    r === 'system' ? 'Instructions' : r === 'user' ? 'User' : 'Assistant'
  return messages.map((m) => `## ${label(m.role)}\n${m.content}`).join('\n\n')
}

/**
 * Call to swell — local wrapper that sends a single prompt to the devin CLI (code agent).
 * No roles, no cost/tokens reported; can take minutes on a real task.
 */
async function chatSwell(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  const { url, token } = getSwellConfig()
  let prompt = messagesToPrompt(messages)
  if (opts.json) prompt += '\n\nRespond only with a valid JSON object, without surrounding text.'
  const res = await fetch(`${url}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': token },
    body: JSON.stringify({ prompt }),
    signal: AbortSignal.timeout(15 * 60 * 1000)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`swell/devin ${res.status}: ${text.slice(0, 400)}`)
  }
  const data = (await res.json()) as { success?: boolean; output?: string; error?: string }
  if (!data.success || data.output == null) throw new Error(data.error || 'Empty response from swell/devin')
  return { content: data.output, usage: { promptTokens: 0, completionTokens: 0, cost: 0, calls: 1 } }
}

export interface ChatResult {
  content: string
  usage: LlmUsage
}

/** Chat completion call. Returns the text and the token/cost usage. */
export async function chat(
  model: string,
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<ChatResult> {
  if (model === SWELL_MODEL_ID) return chatSwell(messages, opts)
  const token = opts.token ?? getToken()
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens,
      usage: { include: true }, // requests tokens + cost in the response
      ...(opts.json ? { response_format: { type: 'json_object' } } : {})
    })
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  }
  const content = data.choices?.[0]?.message?.content
  if (content == null) throw new Error('Empty response from the LLM')
  const usage: LlmUsage = {
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    cost: data.usage?.cost ?? 0,
    calls: 1
  }
  return { content, usage }
}

/** Calls the LLM expecting JSON and does tolerant parsing (removes code fences). */
export async function chatJson<T>(
  model: string,
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<{ value: T; usage: LlmUsage }> {
  const { content, usage } = await chat(model, messages, { ...opts, json: true })
  return { value: parseJsonLoose<T>(content), usage }
}

export function parseJsonLoose<T>(raw: string): T {
  let s = raw.trim()
  // removes code fences if the LLM includes them
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) s = fence[1].trim()
  // trims from the first { to the last } if there is surrounding text
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first > 0 || (last !== -1 && last < s.length - 1)) {
    if (first !== -1 && last !== -1) s = s.slice(first, last + 1)
  }
  return JSON.parse(s) as T
}

export interface ModelOption {
  id: string
  name: string
  promptPrice: number      // USD per token
  completionPrice: number  // USD per token
}

/** Fetches the list of OpenRouter models with prices for a specific token. */
export async function listModelsForToken(
  token: string
): Promise<{ ok: boolean; models: ModelOption[] }> {
  try {
    const res = await fetch(`${BASE}/models`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) return { ok: false, models: [] }
    const data = (await res.json()) as {
      data?: { id: string; name?: string; pricing?: { prompt?: string; completion?: string } }[]
    }
    const models: ModelOption[] = (data.data ?? [])
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        promptPrice: parseFloat(m.pricing?.prompt ?? '0') || 0,
        completionPrice: parseFloat(m.pricing?.completion ?? '0') || 0
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
    return { ok: true, models }
  } catch {
    return { ok: false, models: [] }
  }
}

export interface ValidateInput {
  token: string
  modelPrimary: string
  modelReviewer: string
  swellUrl?: string
  swellToken?: string
}

/**
 * Validates token + both model codes. OpenRouter models are checked against the model list
 * from the API; the SWELL_MODEL_ID sentinel is validated with a test call to the local endpoint.
 * This is what the settings "Save" calls before persisting.
 */
export async function validateLlmConfig(
  input: ValidateInput
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = []
  if (!input.modelPrimary?.trim()) errors.push('Primary model is empty.')
  if (!input.modelReviewer?.trim()) errors.push('Reviewer model is empty.')
  if (errors.length) return { ok: false, errors }

  const models = [input.modelPrimary, input.modelReviewer]
  const needsOpenRouter = models.some((m) => m !== SWELL_MODEL_ID)
  const needsSwell = models.some((m) => m === SWELL_MODEL_ID)

  let orIds: Set<string> | null = null
  if (needsOpenRouter) {
    if (!input.token?.trim()) {
      errors.push('OpenRouter token is empty.')
    } else {
      try {
        const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${input.token}` } })
        if (res.status === 401 || res.status === 403) {
          errors.push('OpenRouter token invalid or without permission (HTTP ' + res.status + ').')
        } else if (!res.ok) {
          const text = await res.text().catch(() => '')
          errors.push(`OpenRouter responded ${res.status}: ${text.slice(0, 200)}`)
        } else {
          const data = (await res.json()) as { data?: { id: string }[] }
          orIds = new Set((data.data ?? []).map((m) => m.id))
        }
      } catch (err) {
        errors.push('Network failure validating OpenRouter: ' + (err instanceof Error ? err.message : String(err)))
      }
    }
  }

  if (needsSwell) {
    const url = input.swellUrl?.trim()
    const token = input.swellToken?.trim()
    if (!url) errors.push('swell/devin URL is empty.')
    if (!token) errors.push('swell/devin token is empty.')
    if (url && token) {
      try {
        const res = await fetch(`${url.replace(/\/+$/, '')}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': token },
          body: JSON.stringify({ prompt: 'ping' }),
          signal: AbortSignal.timeout(20000)
        })
        if (res.status === 401 || res.status === 403) {
          errors.push('swell/devin token is invalid.')
        } else if (!res.ok) {
          const text = await res.text().catch(() => '')
          errors.push(`swell/devin responded ${res.status}: ${text.slice(0, 200)}`)
        }
      } catch (err) {
        errors.push('Network failure validating swell/devin: ' + (err instanceof Error ? err.message : String(err)))
      }
    }
  }

  if (orIds) {
    if (input.modelPrimary !== SWELL_MODEL_ID && !orIds.has(input.modelPrimary)) {
      errors.push(`Primary model does not exist on OpenRouter: ${input.modelPrimary}`)
    }
    if (input.modelReviewer !== SWELL_MODEL_ID && !orIds.has(input.modelReviewer)) {
      errors.push(`Reviewer model does not exist on OpenRouter: ${input.modelReviewer}`)
    }
  }

  return { ok: errors.length === 0, errors }
}

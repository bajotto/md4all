import { getSettings } from './settings'
import { decryptSecret } from './sftp'
import type { LlmUsage } from './types'

const BASE = 'https://openrouter.ai/api/v1'

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
  token?: string // sobrepõe o token salvo (usado na validação antes de persistir)
  temperature?: number
  json?: boolean // pede response_format json_object
  maxTokens?: number
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    // OpenRouter recomenda identificar o app
    'HTTP-Referer': 'https://github.com/md4all',
    'X-Title': 'md4all'
  }
}

/** Token em claro a partir das settings cifradas. */
export function getToken(): string {
  const token = decryptSecret(getSettings().llm?.encToken)
  if (!token) throw new Error('Configure o token do OpenRouter primeiro (⚙ na barra lateral).')
  return token
}

export function getModels(): { primary: string; reviewer: string } {
  const llm = getSettings().llm ?? {}
  if (!llm.modelPrimary || !llm.modelReviewer) {
    throw new Error('Configure os dois modelos da LLM nas configurações (⚙).')
  }
  return { primary: llm.modelPrimary, reviewer: llm.modelReviewer }
}

export interface ChatResult {
  content: string
  usage: LlmUsage
}

/** Chamada de chat completion. Retorna o texto e o consumo de tokens/custo. */
export async function chat(
  model: string,
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<ChatResult> {
  const token = opts.token ?? getToken()
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens,
      usage: { include: true }, // pede tokens + custo no retorno
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
  if (content == null) throw new Error('Resposta vazia da LLM')
  const usage: LlmUsage = {
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    cost: data.usage?.cost ?? 0,
    calls: 1
  }
  return { content, usage }
}

/** Chama a LLM esperando JSON e faz parse tolerante (remove cercas ```). */
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
  // remove cercas de código se a LLM as incluir
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) s = fence[1].trim()
  // recorta do primeiro { ao último } se houver texto ao redor
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first > 0 || (last !== -1 && last < s.length - 1)) {
    if (first !== -1 && last !== -1) s = s.slice(first, last + 1)
  }
  return JSON.parse(s) as T
}

export interface ValidateInput {
  token: string
  modelPrimary: string
  modelReviewer: string
}

/**
 * Valida token + os dois model codes contra a lista de modelos do OpenRouter.
 * É o que o "Salvar" das configurações chama antes de persistir.
 */
export async function validateLlmConfig(
  input: ValidateInput
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = []
  if (!input.token?.trim()) errors.push('Token vazio.')
  if (!input.modelPrimary?.trim()) errors.push('Modelo primário vazio.')
  if (!input.modelReviewer?.trim()) errors.push('Modelo revisor vazio.')
  if (errors.length) return { ok: false, errors }

  let ids: Set<string>
  try {
    const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${input.token}` } })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, errors: ['Token inválido ou sem permissão (HTTP ' + res.status + ').'] }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, errors: [`OpenRouter respondeu ${res.status}: ${text.slice(0, 200)}`] }
    }
    const data = (await res.json()) as { data?: { id: string }[] }
    ids = new Set((data.data ?? []).map((m) => m.id))
  } catch (err) {
    return {
      ok: false,
      errors: ['Falha de rede ao validar: ' + (err instanceof Error ? err.message : String(err))]
    }
  }

  if (!ids.has(input.modelPrimary)) errors.push(`Modelo primário não existe no OpenRouter: ${input.modelPrimary}`)
  if (!ids.has(input.modelReviewer)) errors.push(`Modelo revisor não existe no OpenRouter: ${input.modelReviewer}`)
  return { ok: errors.length === 0, errors }
}

import { getSettings } from './settings'
import { decryptSecret } from './sftp'
import type { LlmUsage } from './types'

const BASE = 'https://openrouter.ai/api/v1'

/** Sentinel usado nos campos modelPrimary/modelReviewer para rotear para o swell/devin em vez do OpenRouter. */
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

/** URL + token em claro do swell/devin a partir das settings cifradas. */
function getSwellConfig(): { url: string; token: string } {
  const llm = getSettings().llm ?? {}
  const url = llm.swellUrl?.trim()
  const token = decryptSecret(llm.encSwellToken)
  if (!url || !token) {
    throw new Error('Configure a URL e o token do swell/devin primeiro (⚙ na barra lateral).')
  }
  return { url: url.replace(/\/+$/, ''), token }
}

function messagesToPrompt(messages: ChatMessage[]): string {
  const label = (r: ChatMessage['role']): string =>
    r === 'system' ? 'Instruções' : r === 'user' ? 'Usuário' : 'Assistente'
  return messages.map((m) => `## ${label(m.role)}\n${m.content}`).join('\n\n')
}

/**
 * Chamada ao swell — wrapper local que manda um prompt único ao devin CLI (agente de código).
 * Sem roles, sem custo/tokens reportados; pode levar minutos numa tarefa real.
 */
async function chatSwell(messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  const { url, token } = getSwellConfig()
  let prompt = messagesToPrompt(messages)
  if (opts.json) prompt += '\n\nResponda apenas com um objeto JSON válido, sem texto ao redor.'
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
  if (!data.success || data.output == null) throw new Error(data.error || 'Resposta vazia do swell/devin')
  return { content: data.output, usage: { promptTokens: 0, completionTokens: 0, cost: 0, calls: 1 } }
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

export interface ModelOption {
  id: string
  name: string
  promptPrice: number      // USD por token
  completionPrice: number  // USD por token
}

/** Busca lista de modelos do OpenRouter com preços para um token específico. */
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
 * Valida token + os dois model codes. Modelos OpenRouter são checados contra a lista de modelos
 * da API; o sentinel SWELL_MODEL_ID é validado com uma chamada de teste ao endpoint local.
 * É o que o "Salvar" das configurações chama antes de persistir.
 */
export async function validateLlmConfig(
  input: ValidateInput
): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = []
  if (!input.modelPrimary?.trim()) errors.push('Modelo primário vazio.')
  if (!input.modelReviewer?.trim()) errors.push('Modelo revisor vazio.')
  if (errors.length) return { ok: false, errors }

  const models = [input.modelPrimary, input.modelReviewer]
  const needsOpenRouter = models.some((m) => m !== SWELL_MODEL_ID)
  const needsSwell = models.some((m) => m === SWELL_MODEL_ID)

  let orIds: Set<string> | null = null
  if (needsOpenRouter) {
    if (!input.token?.trim()) {
      errors.push('Token OpenRouter vazio.')
    } else {
      try {
        const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${input.token}` } })
        if (res.status === 401 || res.status === 403) {
          errors.push('Token OpenRouter inválido ou sem permissão (HTTP ' + res.status + ').')
        } else if (!res.ok) {
          const text = await res.text().catch(() => '')
          errors.push(`OpenRouter respondeu ${res.status}: ${text.slice(0, 200)}`)
        } else {
          const data = (await res.json()) as { data?: { id: string }[] }
          orIds = new Set((data.data ?? []).map((m) => m.id))
        }
      } catch (err) {
        errors.push('Falha de rede ao validar OpenRouter: ' + (err instanceof Error ? err.message : String(err)))
      }
    }
  }

  if (needsSwell) {
    const url = input.swellUrl?.trim()
    const token = input.swellToken?.trim()
    if (!url) errors.push('URL do swell/devin vazia.')
    if (!token) errors.push('Token do swell/devin vazio.')
    if (url && token) {
      try {
        const res = await fetch(`${url.replace(/\/+$/, '')}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': token },
          body: JSON.stringify({ prompt: 'ping' }),
          signal: AbortSignal.timeout(20000)
        })
        if (res.status === 401 || res.status === 403) {
          errors.push('Token do swell/devin inválido.')
        } else if (!res.ok) {
          const text = await res.text().catch(() => '')
          errors.push(`swell/devin respondeu ${res.status}: ${text.slice(0, 200)}`)
        }
      } catch (err) {
        errors.push('Falha de rede ao validar swell/devin: ' + (err instanceof Error ? err.message : String(err)))
      }
    }
  }

  if (orIds) {
    if (input.modelPrimary !== SWELL_MODEL_ID && !orIds.has(input.modelPrimary)) {
      errors.push(`Modelo primário não existe no OpenRouter: ${input.modelPrimary}`)
    }
    if (input.modelReviewer !== SWELL_MODEL_ID && !orIds.has(input.modelReviewer)) {
      errors.push(`Modelo revisor não existe no OpenRouter: ${input.modelReviewer}`)
    }
  }

  return { ok: errors.length === 0, errors }
}

# md4all — Scientific Protocol

## Fase Atual

- Fase: 2 (Pilot)
- Status: ✅ COMPLETE — aguardando aprovação para Fase 3 (escala)
- Data: 2026-08-28

## Referência

- `/home/main/.claude/GLOBAL_SCIENTIFIC_METHOD.md`

---

## Tarefa: Logo no header + Onboarding/bloqueio de LLM sem chave

### Hipóteses

- H1: Adicionar `<Logo size={20}/>` em `.sidebar-header` (flexbox) alinha ícone + título no canto sup esq sem regressão de layout.
- H2: Sem chave OpenRouter, botões de LLM (🤖, Híbrida) ficam bloqueados e abrem o modal ⚙; com chave, funcionam normalmente.
- H3: Nenhuma chave real é embarcada no código/binário (só placeholder).

### Critérios de aceitação

- ✅ Logo visível ao lado de "md4all" no header da sidebar
- ✅ Layout sem regressão (borda inferior e padding coerentes)
- ✅ 1ª execução sem chave → modal ⚙ abre sozinho (onboarding)
- ✅ 🤖 e Híbrida bloqueados sem chave; clique abre ⚙
- ✅ Com chave configurada, 🤖 e Híbrida funcionam como antes
- ✅ `grep -rn "sk-or-"` (excluindo placeholder) retorna 0 ocorrências

### Resultado (Fase 2 — Pilot)

- Status: PASS
- typecheck: ✅ 0 erros
- testes: ✅ 33/33 passando
- auditoria chaves: ✅ ZERO ocorrências de `sk-or-` real; nenhum `.env`/secret trackeado

### Arquivos alterados

- `src/renderer/src/components/Sidebar/Sidebar.tsx` — Logo no header
- `src/renderer/src/styles/global.css` — `.sidebar-header` flex + `.sidebar-wordmark`
- `src/renderer/src/store/useStore.ts` — `llmConfigured` + `refreshLlmConfigured` + onboarding em `init`
- `src/renderer/src/components/Sidebar/VaultPicker.tsx` — 🤖 bloqueado sem chave
- `src/renderer/src/components/SearchPanel/SearchPanel.tsx` — Híbrida bloqueada sem chave

### Erros

- Nenhum.

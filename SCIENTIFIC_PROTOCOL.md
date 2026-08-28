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

---

## Tarefa: Workaround para instalação Mac sem `xattr -cr` manual

### Contexto

O app é ad-hoc signed (sem Apple Developer ID / notarização). O Gatekeeper adiciona
`com.apple.quarantine` ao DMG baixado do GitHub; ao copiar o `.app` para `/Applications`
ele herda a quarentena e o macOS recente (Sonoma/Sequoia) mostra "damaged and can't be
opened". O `xattr -cr` no `after-pack.js` é inútil para isso — a quarentena vem do
**download**, não do build.

### Hipóteses

- H0: Um script `curl|bash` que baixa o DMG, monta, copia e roda `xattr -cr` automaticamente
  NÃO elimina a necessidade do usuário rodar o comando manualmente.
- H1: O script elimina a necessidade do comando manual — usuário roda uma linha e o app
  abre pronto.
- H2: O parsing do JSON da GitHub API (sem `jq`, só grep+sed) extrai corretamente a
  `browser_download_url` do DMG da arquitetura correta (arm64/x64).

### Critérios de aceitação

- ✅ Script detecta arquitetura (arm64 → arm64, x86_64 → x64)
- ✅ Script baixa o DMG correto da release mais recente (ou tag específica via `$1`)
- ✅ Script monta, copia para /Applications, roda `xattr -cr`, abre o app
- ✅ Script não casa `.zip` (só `.dmg`)
- ✅ Script lida com release sem DMG (falha com mensagem clara, não crasha)
- ✅ `bash -n` passa (sintaxe OK)
- ✅ `shellcheck` passa (0 warnings)
- ✅ Cleanup trap desmonta DMG e remove temp mesmo em erro/Ctrl-C

### Resultado (Fase 2 — Pilot)

- Status: PASS (validação estática — não há macOS neste ambiente)
- bash -n: ✅ OK
- shellcheck 0.11.0: ✅ 0 warnings (após remover var `VERSION` não usada)
- parsing JSON (mock realista da GitHub API): ✅ 7/7 testes passando
  - arm64 DMG extraído corretamente
  - x64 DMG extraído corretamente
  - tag_name extraído corretamente
  - `.dmg` regex NÃO casa `.zip`
  - release vazia → resultado vazio (não crasha)
  - JSON realista com campos extras → parsing correto
  - arch mapping: arm64→arm64, x86_64→x64
- **Limitação:** teste real em macOS pendente (não há macOS neste ambiente).
  O usuário deve validar rodando o script num Mac real na Fase 3.

### Arquivos alterados

- `scripts/install-mac.sh` — instalador curl|bash (novo)
- `README.md` — seção "Instalação" com o comando

### Pré-requisito para Fase 3 (escala)

- ⚠️ O repo `bajotto/md4all` precisa ser **público** para o `curl` baixar o script e o DMG
  sem autenticação. Atualmente é privado (HTTP 404 sem auth).

### Erros

- Nenhum. Var `VERSION` não usada foi detectada pelo shellcheck e removida.

---

## Tarefa: Auditoria de informação sensível no histórico git

### Hipóteses

- H0: O histórico contém informação sensível (chaves/senhas/secrets trackeados em algum commit).
- H1: O histórico está limpo (nenhum secret real trackeado em nenhum commit passado ou presente).

### Critérios de aceitação

- ✅ Todos os commits escaneados (não só o working tree)
- ✅ Padrões cobertos: `sk-or-` (OpenRouter), `sk-`/`sk-proj-` (OpenAI), GitHub tokens (`ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`/`github_pat_`), AWS (`AKIA…`), private keys (`-----BEGIN…`), Slack (`xox…`), JWTs (`eyJ…`), strings base64 longas
- ✅ Arquivos `.env`/`.pem`/`.key`/credentials trackeados em qualquer commit
- ✅ IPs hardcoded verificados
- ✅ Emails de commit verificados
- ✅ Arquivos deletados no histórico verificados (secrets removidos tarde)

### Resultado (Fase 1 — Discovery)

- Status: PASS — H1 confirmada (histórico limpo de secrets reais)
- Commits escaneados: 71
- Blobs únicos no histórico: 811
- Padrões de secret (sk-or-, sk-, ghp_, AKIA, BEGIN PRIVATE KEY, xox, eyJ): **ZERO ocorrências reais**
- Arquivos `.env`/`.pem`/`.key`/credentials trackeados: **ZERO**
- Strings base64 suspeitas (excluindo node_modules/lockfiles): **ZERO**
- Arquivos deletados no histórico: `Search.tsx` (refatoração) + `*.tsbuildinfo` (build) — nenhum secret
- Emails de commit: `bajotto@users.noreply.github.com` + `pedro@bajotto.com` (públicos, não sensíveis)

### Achados (não-blocking, mas sinalizados)

1. **IP `192.168.1.22:9890`** — aparece como placeholder/comentário em:
   - `src/main/types.ts` (comentário: "ex.: http://192.168.1.22:9890")
   - `src/renderer/src/components/LlmSettingsModal.tsx` (placeholder de input)
   - Commit: `b9b5ac6 feat: adiciona swell/devin como provider alternativo de LLM`
   - **Risco:** baixo (IP privado RFC1918, não acessível externamente), mas revela
     topologia da rede interna do autor (bate com padrão SSH 192.168.1.21,22,23,25).
     Recomendação: trocar por `http://localhost:9890` ou `http://<seu-host>:9890` nos
     placeholders antes de tornar o repo público.

2. **IP `34.73.89.87`** — aparece como placeholder em:
   - `src/renderer/src/components/AddVaultModal.tsx` (placeholder: "Host (ex.: 34.73.89.87)")
   - Commit: `08bccb4 feat: vaults remotos via SSH/SFTP + sidebar multi-raiz`
   - **Risco:** baixo (IP público do Google Cloud, mas é só exemplo de formulário).
     Recomendação: trocar por `exemplo.com` ou `203.0.113.1` (IP de documentação RFC5737).

### Veredito

✅ **Histórico limpo de secrets.** Nenhuma chave real, token, senha hardcoded, private key
ou arquivo de credenciais foi trackeado em nenhum dos 71 commits. O repo pode ser tornado
público com segurança após considerar os 2 achados de IP (opcionais, baixo risco).

### Erros

- Nenhum.

# 🗺️ Plano de Implementação — Festival TKD Colombo 2026
> **Status:** Active | **Gerado em:** 2026-04-24 | **Responsável:** Leonardo Reis
>
> Documento vivo. Atualizar conforme itens forem concluídos.

---

## 📐 Metodologia

Seguindo o **Algoritmo Indomável** (`Constitution.md`) e o fluxo **SDD**:
cada iniciativa possui dono, justificativa técnica, arquivos afetados e critério de conclusão.
Itens são ordenados por **risco × impacto**, não por facilidade.

---

## 🚨 Fase 1 — Segurança e Estabilidade (Sprint 1)
> Objetivo: eliminar vulnerabilidades de produção antes de qualquer nova feature.

### 1.1 Restringir acesso à coleção `waiting_devices`

| Campo | Valor |
|---|---|
| **Prioridade** | Crítica |
| **Risco atual** | Qualquer pessoa na internet pode ler e escrever dispositivos da arena |
| **Arquivo** | `firestore.rules` |

**Especificação:**
- Leitura permitida: autenticados + acesso público somente a documentos do próprio `courtId`
- Escrita permitida: somente usuários autenticados ou com token de sessão válido
- Deleção: somente admins

**Critério de conclusão:** `firebase emulators:start` + script de teste negativo confirma que usuário anônimo não consegue gravar.

---

### 1.2 Mover admins para Firebase Custom Claims

| Campo | Valor |
|---|---|
| **Prioridade** | Crítica |
| **Risco atual** | E-mails hardcoded nas Firestore rules — qualquer vazamento ou mudança de conta quebra o sistema |
| **Arquivos afetados** | `firestore.rules`, `server.ts`, novo script `scripts/set-admin-claim.ts` |

**Especificação:**
- Criar script Node que via Admin SDK adiciona `customClaims: { role: 'admin' }` ao UID
- Substituir checagens `resource.data.email in [...]` por `request.auth.token.role == 'admin'`
- Documentar procedimento em `README.md` (seção "Gerenciamento de Admins")

**Critério de conclusão:** regras não contêm nenhum e-mail literal; script funciona com `ts-node`.

---

### 1.3 Externalizar segredos hardcoded

| Campo | Valor |
|---|---|
| **Prioridade** | Alta |
| **Arquivos afetados** | `courtService.ts`, `constants.ts`, `utils.ts` |

**Itens a externalizar:**

| Constante | Local atual | Destino |
|---|---|---|
| `ARENA_ACCESS_PIN = "202611"` | `courtService.ts` | `process.env.ARENA_PIN` |
| `EVENT_YEAR = 2026` | `constants.ts` | `process.env.EVENT_YEAR` ou Firestore `settings/event` |
| Lista de academias (19 opções) | `constants.ts` | Firestore `settings/academies` (editável pelo admin) |
| Preços (R$90, R$25, etc.) | `utils.ts` | Firestore `settings/pricing` |

**Critério de conclusão:** nenhum valor de negócio hardcoded fora do `.env.example` documentado.

---

### 1.4 Remover `console.log` de produção

| Campo | Valor |
|---|---|
| **Prioridade** | Alta |
| **Arquivo** | `vite.config.ts`, `firebase.ts`, todos os componentes |

**Especificação:**
- Adicionar ao `vite.config.ts`:
  ```ts
  build: {
    terserOptions: { compress: { drop_console: true, drop_debugger: true } }
  }
  ```
- Substituir `console.log/warn/error` em runtime por função `logger(msg, level)` que só emite em `dev`
- Manter `console.error` somente no `ErrorBoundary` (necessário para monitoramento)

**Critério de conclusão:** `npm run build && grep -r "console.log" dist/` retorna vazio.

---

## 🧪 Fase 2 — Cobertura de Testes (Sprint 2)
> Objetivo: garantir corretude da lógica crítica de negócio antes do evento.

### 2.1 Configurar Vitest

| Campo | Valor |
|---|---|
| **Prioridade** | Alta |
| **Arquivos novos** | `vitest.config.ts`, `src/__tests__/setup.ts` |

**Especificação:**
```bash
npm install -D vitest @vitest/ui happy-dom
```
- Configurar `vitest.config.ts` com ambiente `happy-dom` e coverage via `v8`
- Adicionar scripts em `package.json`: `"test"`, `"test:ui"`, `"test:coverage"`

---

### 2.2 Testes — `bracketEngine.ts`

| Campo | Valor |
|---|---|
| **Arquivo de teste** | `src/__tests__/bracketEngine.test.ts` |
| **Cobertura alvo** | 100% das funções exportadas |

**Casos obrigatórios:**
- [ ] 2 atletas → chave direta sem BYE
- [ ] 3 atletas → pad para 4, um BYE
- [ ] 4 atletas → sementes 1 e 2 em lados opostos
- [ ] 8 atletas → sem BYE vs BYE em nenhuma rodada
- [ ] 9 atletas → pad para 16, distribuição correta
- [ ] Todos os BYEs avançam automaticamente sem criar partida
- [ ] Resultado é determinístico (mesma entrada → mesma saída)

---

### 2.3 Testes — `utils.ts`

| Campo | Valor |
|---|---|
| **Arquivo de teste** | `src/__tests__/utils.test.ts` |

**Casos obrigatórios:**
- [ ] `calculatePrice`: todas as combinações de modalidades e cashback
- [ ] `getAgeCategory`: limites de ano de nascimento para cada faixa etária (11 categorias)
- [ ] `getWeightCategory`: categorias de peso por gênero e faixa
- [ ] `generatePixPayload`: formato válido de QR Code PIX
- [ ] Desconto social: academias `'Djalma Johnsson'` e `'CCM Alfredo Chaves'`

---

### 2.4 Testes — `matchService.ts`

| Campo | Valor |
|---|---|
| **Arquivo de teste** | `src/__tests__/matchService.test.ts` |
| **Mock** | Firestore via `vi.mock('../firebase')` |

**Casos obrigatórios:**
- [ ] `advanceWinner`: vencedor progride para a partida seguinte correta
- [ ] `resetBracket`: todas as partidas voltam ao estado inicial
- [ ] `saveBracketMatches`: grava o número correto de documentos para N atletas
- [ ] Partida com BYE: vencedor avança automaticamente sem interação

---

### 2.5 Testes — `courtService.ts`

| Campo | Valor |
|---|---|
| **Arquivo de teste** | `src/__tests__/courtService.test.ts` |

**Casos obrigatórios:**
- [ ] Criação de sessão com expiração de 48h
- [ ] PIN inválido retorna erro
- [ ] Sessão expirada é descartada
- [ ] Ranking Poomsae calculado corretamente (média WT, desempate técnica)

---

### 2.6 Testes — Webhook Mercado Pago

| Campo | Valor |
|---|---|
| **Arquivo de teste** | `src/__tests__/server.test.ts` |
| **Ferramenta** | `supertest` + `vi.mock` |

**Casos obrigatórios:**
- [ ] Assinatura HMAC inválida → 401
- [ ] Assinatura válida + `payment.updated` → aprovação em batch
- [ ] `external_reference` inexistente no Firestore → 404 gracioso
- [ ] Idempotência: mesmo webhook processado duas vezes não duplica aprovações

---

## 🏗️ Fase 3 — Qualidade de Código (Sprint 3)
> Objetivo: reduzir dívida técnica e facilitar evolução futura.

### 3.1 Remover dependência morta `@google/genai`

| Campo | Valor |
|---|---|
| **Prioridade** | Média |
| **Arquivos** | `package.json`, `.env.example` |

**Opções (escolher uma):**
- **A)** Remover completamente: `npm uninstall @google/genai` + remover `GEMINI_API_KEY` do `.env.example`
- **B)** Implementar: usar para sugestões de chaveamento ou análise de desempenho por atleta (registrar como nova feature no `PRD.md`)

**Critério de conclusão:** nenhuma dependência não utilizada no `package.json`.

---

### 3.2 Dividir `CompetitionView.tsx` (1515 LOC)

| Campo | Valor |
|---|---|
| **Prioridade** | Média |
| **Arquivo original** | `src/components/views/CompetitionView.tsx` |

**Extração proposta:**

| Novo componente | Responsabilidade |
|---|---|
| `BracketPanel.tsx` | Renderização e navegação do chaveamento |
| `AthleteAssignmentSidebar.tsx` | Drag-and-drop de atletas para categorias |
| `CategoryMergeModal.tsx` | Lógica de fusão de categorias |
| `CompetitionView.tsx` (residual) | Orquestração e estado global |

---

### 3.3 Dividir `CourtView.tsx` (1525 LOC)

| Campo | Valor |
|---|---|
| **Prioridade** | Média |
| **Arquivo original** | `src/components/views/CourtView.tsx` |

**Extração proposta:**

| Novo componente | Responsabilidade |
|---|---|
| `KyoruguiScorePanel.tsx` | Pontuação por round, timer, vencedor |
| `PoomsaeJudgePanel.tsx` | Notas por juiz, média WT |
| `MatchHeader.tsx` | Exibição dos competidores, categoria, quadra |
| `CourtView.tsx` (residual) | Listener Firestore, roteamento de modalidade |

---

### 3.4 Eliminar `any` explícito em lógica crítica

| Campo | Valor |
|---|---|
| **Prioridade** | Média |
| **Arquivos** | `bracketEngine.ts`, `matchService.ts`, `courtService.ts` |

**Especificação:**
- Habilitar `"noImplicitAny": true` no `tsconfig.json` (já deve estar via `strict`)
- Substituir `match: any` em `bracketEngine.ts:104` pelo tipo `Partial<Match>`
- Criar tipo `FirestoreUpdatePayload` para updates parciais em `matchService`
- Meta: zero `any` nos arquivos de serviço e utilitários

---

### 3.5 Converter navegação por query string para rotas declarativas

| Campo | Valor |
|---|---|
| **Prioridade** | Baixa |
| **Arquivos** | `main.tsx`, `App.tsx` |

**Estado atual:** `?join=arena`, `?join=panel`, `?session=TOKEN` parseados manualmente.

**Estado alvo:**
```
/arena/join          → JoinView
/arena/panel         → ArenaCallPanel
/court/:sessionId    → CourtView  (já existe)
/podiums             → PodiumView (já existe)
```

---

## 📊 Fase 4 — Observabilidade e Performance (Sprint 4)
> Objetivo: preparar para escala no dia do evento.

### 4.1 Paginação de atletas e registrações

| Campo | Valor |
|---|---|
| **Prioridade** | Média (crítica se >500 atletas) |
| **Arquivos** | `AthletesView.tsx`, `RegistrationsView.tsx` |

**Especificação:**
- Implementar cursor-based pagination via `startAfter()` do Firestore
- Tamanho de página: 50 documentos
- UI: botão "Carregar mais" ou scroll infinito
- Filtros existentes devem ser compatíveis com paginação

---

### 4.2 Error Boundaries granulares

| Campo | Valor |
|---|---|
| **Prioridade** | Média |
| **Arquivo existente** | `src/components/ErrorBoundary.tsx` |

**Especificação:**
- Envolver cada view principal com `<ErrorBoundary fallback={<ViewErrorFallback />}>`
- Criar `ViewErrorFallback` com botão "Tentar novamente" e mensagem amigável
- Logar erro para serviço externo (ex: Firebase Crashlytics ou Sentry) em produção

---

### 4.3 Monitoramento de leituras Firestore

| Campo | Valor |
|---|---|
| **Prioridade** | Baixa |
| **Ação** | Ativar Firebase Usage dashboard e definir alertas de cota |

**Especificação:**
- Revisar listeners em tempo real: verificar se todos têm `unsubscribe` no `useEffect` cleanup
- Consolidar múltiplos listeners da mesma coleção onde possível
- Documentar contagem esperada de leituras por sessão de usuário

---

## 🎯 Backlog — Features Futuras

> Estas ideias NÃO bloqueam o evento. Registradas para ciclos futuros.

| # | Feature | Justificativa |
|---|---|---|
| F1 | **IA para sugestões de chaveamento** | Usar Gemini (SDK já instalado) para balancear categorias com menos de 4 atletas |
| F2 | **Light mode** | Tema claro para uso em ambientes iluminados (tablet dos juízes) |
| F3 | **Relatório PDF pós-evento** | Exportar resultados, rankings e financeiro em PDF via `jsPDF` |
| F4 | **App mobile (PWA)** | `vite-plugin-pwa` para instalação offline nos tablets dos árbitros |
| F5 | **Histórico de atletas** | Vincular resultados de edições anteriores ao perfil do atleta |
| F6 | **Notificações push** | Avisar academias quando registro for aprovado ou partida convocada |

---

## 📋 Quadro de Progresso

| ID | Tarefa | Fase | Status |
|---|---|---|---|
| S1.1 | Restringir `waiting_devices` | Segurança | ⬜ Pendente |
| S1.2 | Admins via Custom Claims | Segurança | ⬜ Pendente |
| S1.3 | Externalizar segredos | Segurança | ⬜ Pendente |
| S1.4 | Remover console.log produção | Segurança | ⬜ Pendente |
| T2.1 | Configurar Vitest | Testes | ⬜ Pendente |
| T2.2 | Testes bracketEngine | Testes | ⬜ Pendente |
| T2.3 | Testes utils | Testes | ⬜ Pendente |
| T2.4 | Testes matchService | Testes | ⬜ Pendente |
| T2.5 | Testes courtService | Testes | ⬜ Pendente |
| T2.6 | Testes webhook | Testes | ⬜ Pendente |
| Q3.1 | Remover `@google/genai` | Qualidade | ⬜ Pendente |
| Q3.2 | Dividir CompetitionView | Qualidade | ⬜ Pendente |
| Q3.3 | Dividir CourtView | Qualidade | ⬜ Pendente |
| Q3.4 | Eliminar `any` crítico | Qualidade | ⬜ Pendente |
| Q3.5 | Rotas declarativas | Qualidade | ⬜ Pendente |
| P4.1 | Paginação Firestore | Performance | ⬜ Pendente |
| P4.2 | Error Boundaries | Performance | ⬜ Pendente |
| P4.3 | Monitoramento leituras | Performance | ⬜ Pendente |

**Legenda:** ⬜ Pendente · 🔄 Em progresso · ✅ Concluído · ❌ Cancelado

---

## 🔗 Referências

- `Constitution.md` — Princípios e filosofia de engenharia
- `TECHNICAL_DOCUMENTATION.md` — Arquitetura, esquema Firestore, fluxos de dados
- `firestore.rules` — Regras de segurança atuais
- `src/utils/bracketEngine.ts` — Algoritmo de chaveamento
- `src/services/matchService.ts` — Lógica de partidas
- `src/services/courtService.ts` — Gestão de quadras e sessões

---

> *"Baekjool Boolgool" — cada item riscado aqui é uma vitória do espírito indomável sobre a dívida técnica.*

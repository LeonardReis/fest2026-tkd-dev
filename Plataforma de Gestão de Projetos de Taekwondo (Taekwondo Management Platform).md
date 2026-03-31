# Plataforma de Gestão de Projetos de Taekwondo (Taekwondo Management Platform)

## Documento de Requisitos e Arquitetura Inicial

---

**Indomitable Spirit Data Lab**

**Data:** 30 de Março de 2026

**Versão:** 1.0

---

## 1. Introdução

Este documento descreve os requisitos funcionais e não funcionais, bem como a arquitetura inicial proposta para a **Plataforma de Gestão de Projetos de Taekwondo (Taekwondo Management Platform)**. O objetivo é consolidar as necessidades identificadas nos diversos projetos desenvolvidos pelo Indomitable Spirit Data Lab, como o "Taekwondo na Escola" (Piraquara) e o "Taekwondo no IFPR Colombo", para criar uma ferramenta centralizada que otimize a administração, o monitoramento e a expansão dessas iniciativas.

## 2. Objetivos da Plataforma

A plataforma visa alcançar os seguintes objetivos:

*   **Centralizar a Gestão:** Unificar a administração de múltiplos projetos de Taekwondo, facilitando o acesso e a organização de informações.
*   **Otimizar o Monitoramento:** Fornecer ferramentas para o acompanhamento contínuo do desempenho de atletas, projetos e recursos.
*   **Promover a Transparência:** Garantir a visibilidade das informações para todas as partes interessadas, desde a equipe de gestão até patrocinadores e instituições parceiras.
*   **Escalar as Operações:** Suportar o crescimento e a expansão dos projetos para novas localidades e instituições.
*   **Gerar Insights:** Transformar dados brutos em informações acionáveis para a tomada de decisões estratégicas.

## 3. Requisitos Funcionais (Módulos e Funcionalidades)

### 3.1. Módulo de Gestão de Atletas

*   **Cadastro de Atletas:** Registro completo de informações pessoais, contato, histórico de saúde e dados acadêmicos (para projetos em instituições de ensino).
*   **Gestão de Graduações:** Registro e acompanhamento da progressão de faixas (Gubs e DANs), datas de exames e resultados.
*   **Controle de Frequência:** Registro de presença em aulas e treinamentos.
*   **Perfis de Atletas:** Visualização individualizada do histórico, desempenho e conquistas.

### 3.2. Módulo de Monitoramento de Performance

*   **Registro de Dados de Treinamento:** Input de métricas de desempenho físico, técnico e tático.
*   **Resultados de Competições:** Registro de participação e resultados em eventos (medalhas, classificações).
*   **Acompanhamento Acadêmico:** Integração ou registro manual de notas e desempenho escolar (para projetos em instituições de ensino).
*   **Painéis de Monitoramento de Desempenho:** Visualizações gráficas e relatórios sobre a evolução individual e coletiva dos atletas.

### 3.3. Módulo de Gestão de Projetos

*   **Visão Geral dos Projetos:** Dashboard com status atual de todos os projetos (Piraquara, IFPR Colombo, etc.).
*   **Gestão de Tarefas:** Atribuição, acompanhamento e prazos de tarefas relacionadas a cada projeto.
*   **Cronogramas:** Visualização de marcos e atividades dos projetos.
*   **Documentação:** Armazenamento centralizado de documentos (projetos, ofícios, termos de cessão).

### 3.4. Módulo de Gestão de Recursos

*   **Controle de Equipamentos:** Inventário de doboks, protetores e outros materiais.
*   **Gestão Financeira:** Registro de receitas (patrocínios, leis de incentivo) e despesas (logística de eventos, materiais).
*   **Orçamentos:** Criação e acompanhamento de orçamentos por projeto e por evento.
*   **Gestão de Parcerias:** Cadastro e acompanhamento de parceiros e patrocinadores.

### 3.5. Módulo de Comunicação

*   **Comunicados Internos:** Ferramenta para envio de mensagens e avisos à equipe e atletas.
*   **Notificações:** Alertas sobre prazos, eventos e atualizações.

### 3.6. Módulo de Relatórios e Análises

*   **Relatórios Personalizáveis:** Geração de relatórios sobre desempenho de atletas, saúde financeira dos projetos, impacto social, etc.
*   **Análise de Dados:** Ferramentas para análise aprofundada dos dados coletados, gerando insights para otimização.

### 3.7. Módulo de Gestão de Usuários e Permissões

*   **Perfis de Usuário:** Administrador, Gestor de Projeto, Instrutor, Atleta, Responsável (pais/tutores), Parceiro/Patrocinador.
*   **Controle de Acesso:** Definição de permissões baseadas nos perfis de usuário.

## 4. Requisitos Não Funcionais

*   **Usabilidade:** Interface intuitiva e fácil de usar.
*   **Performance:** Resposta rápida do sistema, mesmo com grande volume de dados.
*   **Segurança:** Proteção de dados sensíveis, controle de acesso robusto, conformidade com a LGPD.
*   **Escalabilidade:** Capacidade de suportar um número crescente de usuários e projetos.
*   **Disponibilidade:** Alta disponibilidade do sistema.
*   **Manutenibilidade:** Código limpo e documentado para facilitar futuras atualizações.
*   **Compatibilidade:** Acesso via navegadores web modernos e dispositivos móveis.

## 5. Arquitetura Inicial Proposta

### 5.1. Tecnologia (Sugestões)

*   **Frontend:** React.js ou Vue.js (para uma interface de usuário dinâmica e responsiva).
*   **Backend:** Python com Django/Flask ou Node.js com Express (para robustez e escalabilidade).
*   **Banco de Dados:** PostgreSQL ou MySQL (para integridade e volume de dados).
*   **Cloud Provider:** Google Cloud Platform (GCP) ou AWS (para escalabilidade, segurança e serviços gerenciados).

### 5.2. Componentes Principais

*   **Interface do Usuário (UI):** Aplicação web responsiva para acesso via desktop e mobile.
*   **API RESTful:** Para comunicação entre o frontend e o backend, garantindo a flexibilidade e a integração futura.
*   **Serviços de Backend:** Lógica de negócios, autenticação, autorização, processamento de dados.
*   **Banco de Dados:** Armazenamento persistente de todas as informações do projeto.
*   **Serviços de Armazenamento de Arquivos:** Para documentos (projetos, ofícios, termos).
*   **Serviços de Notificação:** Para envio de e-mails e alertas.

## 6. Roadmap de Desenvolvimento (Alto Nível)

### Fase 1: MVP (Produto Mínimo Viável)

*   **Foco:** Gestão de Atletas (cadastro, graduações, frequência) e Gestão de Projetos (visão geral, documentação).
*   **Duração Estimada:** 3-4 meses.

### Fase 2: Monitoramento e Relatórios

*   **Foco:** Módulo de Monitoramento de Performance, Painéis de Monitoramento de Desempenho e Geração de Relatórios Básicos.
*   **Duração Estimada:** 2-3 meses.

### Fase 3: Gestão Financeira e Comunicação

*   **Foco:** Módulo de Gestão de Recursos (financeiro, parcerias) e Módulo de Comunicação.
*   **Duração Estimada:** 2-3 meses.

### Fases Futuras

*   Integrações com sistemas externos (acadêmicos, federações).
*   Funcionalidades avançadas de análise de dados e IA.
*   Aplicativos móveis nativos.

---

## 7. Referências

[1] Documentação do Projeto "Taekwondo na Escola" (Piraquara).
[2] Documentação do Projeto "Taekwondo no IFPR Colombo".
[3] Ofício de Formalização de Parceria IFPR Colombo.
[4] Termo de Cessão de Espaço IFPR Colombo.

## 8. Considerações Adicionais Baseadas em Projetos Existentes

### 8.1. Projeto "Taekwondo na Escola" (Piraquara)

O projeto "Taekwondo na Escola" em Piraquara, com mais de 10 anos de atividade e abrangência em Curitiba, Colombo e região metropolitana, serve como um modelo robusto para a plataforma. Seus requisitos incluem:

*   **Gestão de Múltiplos Polos:** A plataforma deve suportar a administração de atividades em diferentes localidades e instituições de ensino público estadual.
*   **Histórico de Resultados:** Capacidade de registrar e destacar conquistas significativas, como o título de campeã geral do 44º Campeonato Paranaense de Taekwondo, com 91 medalhas e mais de 30 atletas classificados para o cenário nacional [1].
*   **Captação de Recursos para Eventos:** Funcionalidades para gerenciar a captação de recursos para eventos específicos, como o Campeonato Paranaense em Londrina, incluindo controle de custos de logística (transporte, hospedagem, alimentação) para equipes de até 60 atletas [1].
*   **Equipe Técnica Diversificada:** A plataforma deve acomodar diferentes papéis na equipe, como Supervisão Geral (Grão Mestre), Coordenação, Responsável Técnico e Instrutores de Polo, com suas respectivas graduações e identificações (CPF, CREF) [1].
*   **Parcerias Público-Privadas:** Ferramentas para gerenciar e documentar parcerias com instituições de ensino, órgãos públicos e patrocinadores privados, que são cruciais para a sustentabilidade do projeto [1].

### 8.2. Projeto "Taekwondo no IFPR Colombo"

O projeto no IFPR Colombo, com seu foco em protagonismo discente e alinhamento ao tripé Ensino, Pesquisa e Extensão, adiciona camadas de complexidade e oportunidades:

*   **Protagonismo Discente:** A plataforma deve permitir que alunas/atletas atuem como proponentes e instrutoras, com funcionalidades para gerenciar suas responsabilidades e progressão [2].
*   **Pesquisa Acadêmica:** Ferramentas para coletar e analisar dados que correlacionem a prática do Taekwondo com o desempenho acadêmico e cognitivo dos alunos, transformando a plataforma em um campo de estudo [2].
*   **Indicadores de Acompanhamento Acadêmico-Esportivos:** Capacidade de monitorar metas como a melhoria do desempenho acadêmico e a progressão em faixas coloridas (Gubs) para um número específico de atletas anualmente [2].
*   **Inclusão e Para-Taekwondo:** Funcionalidades que suportem a adaptação de aulas e o acompanhamento de pessoas com necessidades específicas [2].
*   **Gestão de Dados e Transparência:** A plataforma deve ser capaz de gerar painéis de monitoramento para a evolução física e técnica dos alunos, garantindo transparência para o IFPR e patrocinadores [2].
*   **Modelo de Captação por Cotas e Leis de Incentivo:** Suporte para a gestão de diferentes cotas de patrocínio e a documentação necessária para leis de incentivo ao esporte [2].

Essas considerações, extraídas dos projetos existentes, serão fundamentais para o desenvolvimento de uma plataforma que atenda às necessidades reais e estratégicas do Indomitable Spirit Data Lab.

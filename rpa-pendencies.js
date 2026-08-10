/* ==========================================================================
   Controle de Squads - Módulo Isolado de Pendências RPA (rpa-pendencies.js)
   Design System Harmonizado Impeccable (v1.5.0)
   ========================================================================== */

var RpaPendenciesModule = window.RpaPendenciesModule = {
  pendencies: [],
  activeId: null,
  selectedRobots: [],
  selectedResponsibles: [],
  selectedTimelineUpdates: [],

  // Inicialização do Módulo
  init() {
    this.injectUI();
    this.fetchPendencies();
    this.setupNavigationHook();
    this.registerGlobalAliases();
    this.setupRealtimeSync();
  },

  registerGlobalAliases() {
    const self = this;
    window.RpaPendenciesModule = self;
    window.openRpaView = function () { self.openRpaView(); };
    window.openRpaModal = function (id = null) { self.openModal(id); };
    window.openNewRpaPendencyModal = function (id = null) { self.openModal(id); };

    if (window.app) {
      window.app.openNewRpaPendencyModal = function (id = null) { self.openModal(id); };
      window.app.openRpaPendencyModal = function (id = null) { self.openModal(id); };
      window.app.closeRpaPendencyModal = function () { self.closeModal(); };
      window.app.saveRpaPendency = function (e) { self.savePendency(e); };
      window.app.openRpaPendencyDetailsModal = function (id) { self.openDetailsModal(id); };
      window.app.closeRpaPendencyDetailsModal = function () { self.closeDetailsModal(); };
      window.app.renderRpaPendenciesView = function () { self.renderView(); };
      window.app.addRpaTimelineUpdate = function () { self.addTimelineUpdate(); };
      window.app.removeRpaTimelineUpdate = function (idx) { self.removeTimelineUpdate(idx); };
      window.app.printRpaReport = function () { self.printReport(); };
      window.app.printRpaPDF = function () { self.printReport(); };
      window.app.resetRpaFilters = function () { self.resetFilters(); };
    }
  },

  seedDefaultIfEmpty() {
      const initial26Items = [
        {
          id: 'rpa-item-1',
          robo_name: 'ID18 - Cancelamento Dynamics',
          title: 'EMA-52 Finalizar período de Hypercare da automação Dynamics para garantir execução correta pós-ajustes',
          responsible: 'Redesign',
          severity: 'MEDIA',
          status: 'ABERTO',
          description: 'Finalizar período de Hypercare da automação Dynamics para garantir execução correta pós-ajustes (Sustentação / Redesign)',
          history_notes: [{ id: 'upd-1', date: '2026-08-09T10:00:00.000Z', displayDate: '09/08/2026', author: 'Sustentação / Redesign', text: 'Em Andamento / Conclusão Prevista' }],
          created_at: '2026-08-09T10:00:00.000Z',
          updated_at: '2026-08-09T10:00:00.000Z'
        },
        {
          id: 'rpa-item-2',
          robo_name: 'ID13 - Atualização Jira, ID29 - Pendência Tesouraria',
          title: 'EMA-54 (ID 13, ID 29) Corrigir regras de duplicidade e aprovar pendentes no BKO/Zord para religar o ID 29 (reembolso não permitido para rejeitado)',
          responsible: 'Caio',
          severity: 'ALTA',
          status: 'ABERTO',
          description: 'Corrigir regras de duplicidade e aprovar pendentes no BKO/Zord para religar o ID 29 (BKO / Sustentação)',
          history_notes: [{ id: 'upd-2', date: '2026-08-09T10:05:00.000Z', displayDate: '09/08/2026', author: 'BKO / Sustentação', text: 'Em Validação / Aguardando Aprovação' }],
          created_at: '2026-08-09T10:05:00.000Z',
          updated_at: '2026-08-09T10:05:00.000Z'
        },
        {
          id: 'rpa-item-3',
          robo_name: 'ID05 - Baixa Manual Lote',
          title: 'EMA-58 / EM 58 (ID 05) Análise de Baixas / Lote 203: Correção do fluxo na planilha de BKO; aguardando validação final de +20 itens/insumos inseridos',
          responsible: 'Caio',
          severity: 'ALTA',
          status: 'ABERTO',
          description: 'Correção do fluxo na planilha de BKO; aguardando validação final de +20 itens/insumos inseridos (Ana Natura)',
          history_notes: [{ id: 'upd-3', date: '2026-08-09T10:10:00.000Z', displayDate: '09/08/2026', author: 'Ana (Natura)', text: 'Aguardando Validação Final' }],
          created_at: '2026-08-09T10:10:00.000Z',
          updated_at: '2026-08-09T10:10:00.000Z'
        },
        {
          id: 'rpa-item-4',
          robo_name: 'ID06 - Demandas de BKO',
          title: 'EMA-59 / EM 59 (ID 06, ID 07) Remapeamento do processo de Análise Parking devido à descontinuação do ID 07, mudanças de regras e criação de monitoramento automatizado',
          responsible: 'Caio',
          severity: 'ALTA',
          status: 'ABERTO',
          description: 'Remapeamento do processo de Análise Parking devido à descontinuação do ID 07, mudanças de regras e criação de monitoramento automatizado',
          history_notes: [{ id: 'upd-4', date: '2026-08-09T10:15:00.000Z', displayDate: '09/08/2026', author: 'Caio', text: 'Em Análise / Pendente Alinhamento' }],
          created_at: '2026-08-09T10:15:00.000Z',
          updated_at: '2026-08-09T10:15:00.000Z'
        },
        {
          id: 'rpa-item-5',
          robo_name: 'ID06 - Demandas de BKO',
          title: 'EMA-60 Desenvolvimento e validação do Dashboard (Lupa / Radar) para exibição de métricas em tempo real',
          responsible: 'Caio',
          severity: 'MEDIA',
          status: 'ABERTO',
          description: 'Desenvolvimento e validação do Dashboard (Lupa / Radar) para exibição de métricas em tempo real (Caio / Equipe de Projetos)',
          history_notes: [{ id: 'upd-5', date: '2026-08-09T10:20:00.000Z', displayDate: '09/08/2026', author: 'Caio / Equipe de Projetos', text: 'Em Desenvolvimento / Validação' }],
          created_at: '2026-08-09T10:20:00.000Z',
          updated_at: '2026-08-09T10:20:00.000Z'
        },
        {
          id: 'rpa-item-6',
          robo_name: 'ID13 - Atualização Jira, ID15 - Pendência Recompra',
          title: 'EMA-61 / EC 61 (ID 13, ID 15) Expiração recorrente de senhas de acesso/login (Microsoft) no ID 13 e ID 15; necessidade de alerta automático e atualização',
          responsible: 'Caio',
          severity: 'ALTA',
          status: 'ABERTO',
          description: 'Expiração recorrente de senhas de acesso/login (Microsoft) no ID 13 e ID 15; necessidade de alerta automático e atualização',
          history_notes: [{ id: 'upd-6', date: '2026-08-09T10:25:00.000Z', displayDate: '09/08/2026', author: 'Caio / Lado Natura', text: 'Em Andamento / Pendente Acesso' }],
          created_at: '2026-08-09T10:25:00.000Z',
          updated_at: '2026-08-09T10:25:00.000Z'
        },
        {
          id: 'rpa-item-7',
          robo_name: 'ID16 - Cancelamento Jira',
          title: 'EMA-62 Mapeamento de Tipo de Item para o Fluxo de Cancelamento JIRA',
          responsible: 'Redesign',
          severity: 'MEDIA',
          status: 'ABERTO',
          description: 'Mapeamento de Tipo de Item para o Fluxo de Cancelamento JIRA (Sustentação)',
          history_notes: [{ id: 'upd-7', date: '2026-08-09T10:30:00.000Z', displayDate: '09/08/2026', author: 'Sustentação', text: 'Novo Chamado' }],
          created_at: '2026-08-09T10:30:00.000Z',
          updated_at: '2026-08-09T10:30:00.000Z'
        },
        {
          id: 'rpa-item-8',
          robo_name: 'ID28 - Amortização Performer 2, ID27 - Amortização Performer 1',
          title: 'ID 17 Documentação do processo ID 17 (Reembolso Amortização NC - gerado pelo ID 28/27) em fase final de elaboração/validação interna para envio',
          responsible: 'Caio',
          severity: 'MEDIA',
          status: 'ABERTO',
          description: 'Documentação do processo ID 17 (Reembolso Amortização NC - gerado pelo ID 28/27) em fase final de elaboração/validação interna para envio',
          history_notes: [{ id: 'upd-8', date: '2026-08-09T10:35:00.000Z', displayDate: '09/08/2026', author: 'Matheus', text: 'Em Andamento (Documentação)' }],
          created_at: '2026-08-09T10:35:00.000Z',
          updated_at: '2026-08-09T10:35:00.000Z'
        },
        {
          id: 'rpa-item-9',
          robo_name: 'ID26 - Amortização Dispatcher',
          title: 'ID 26 Homologação interna do ID 26 (Amortização); pendência na liberação de e-mail com anexos para troca de dados',
          responsible: 'Caio',
          severity: 'ALTA',
          status: 'EM_VALIDACAO',
          description: 'Homologação interna do ID 26 (Amortização); pendência na liberação de e-mail com anexos para troca de dados',
          history_notes: [{ id: 'upd-9', date: '2026-08-09T10:40:00.000Z', displayDate: '09/08/2026', author: 'Wennis / Caio (TI)', text: 'Em Homologação Interna / Bloqueado' }],
          created_at: '2026-08-09T10:40:00.000Z',
          updated_at: '2026-08-09T10:40:00.000Z'
        },
        {
          id: 'rpa-item-10',
          robo_name: 'ID27 - Amortização Performer 1, ID28 - Amortização Performer 2',
          title: 'ID 27, ID 28 Amortização: Documentações aprovadas em 04/08',
          responsible: 'Caio',
          severity: 'BAIXA',
          status: 'RESOLVIDO',
          description: 'Amortização: Documentações aprovadas em 04/08 (Projetos)',
          history_notes: [{ id: 'upd-10', date: '2026-08-04T10:00:00.000Z', displayDate: '04/08/2026', author: 'Projetos', text: 'Aprovado' }],
          created_at: '2026-08-04T10:00:00.000Z',
          updated_at: '2026-08-04T10:00:00.000Z'
        },
        {
          id: 'rpa-item-11',
          robo_name: 'ID29 - Pendência Tesouraria',
          title: 'Conciliação / Terceira Coleta Processo descontinuado na semana anterior; aguardando definição da data para a Terceira Coleta de Conciliação',
          responsible: 'Caio',
          severity: 'MEDIA',
          status: 'EM_VALIDACAO',
          description: 'Processo descontinuado na semana anterior; aguardando definição da data para a Terceira Coleta de Conciliação',
          history_notes: [{ id: 'upd-11', date: '2026-08-09T10:50:00.000Z', displayDate: '09/08/2026', author: 'Lucas / Willian (Natura) / Tesouraria', text: 'Aguardando Agendamento' }],
          created_at: '2026-08-09T10:50:00.000Z',
          updated_at: '2026-08-09T10:50:00.000Z'
        },
        {
          id: 'rpa-item-12',
          robo_name: 'ID16 - Cancelamento Jira',
          title: 'ID 16 Desenvolvimento em 70% da atualização Jira (Documentação aprovada); cronograma de término, HML interna e HML com a área',
          responsible: 'Caio',
          severity: 'MEDIA',
          status: 'ABERTO',
          description: 'Desenvolvimento em 70% da atualização Jira (Documentação aprovada); cronograma de término, HML interna e HML com a área',
          history_notes: [{ id: 'upd-12', date: '2026-08-09T10:55:00.000Z', displayDate: '09/08/2026', author: 'Projetos', text: 'Em Desenvolvimento' }],
          created_at: '2026-08-09T10:55:00.000Z',
          updated_at: '2026-08-09T10:55:00.000Z'
        },
        {
          id: 'rpa-item-13',
          robo_name: 'ID09 - Importação Reembolso Zord, ID10 - Status Reembolso Zord',
          title: 'Zord / Função (URL) Migração de URL do sistema Função pendente de alinhamento (Virada do Zord concluída, link antigo expira em 30 dias)',
          responsible: 'Caio',
          severity: 'MEDIA',
          status: 'ABERTO',
          description: 'Migração de URL do sistema Função pendente de alinhamento (Virada do Zord concluída, link antigo expira em 30 dias)',
          history_notes: [{ id: 'upd-13', date: '2026-08-09T11:00:00.000Z', displayDate: '09/08/2026', author: 'Caio', text: 'Pendente Alinhamento' }],
          created_at: '2026-08-09T11:00:00.000Z',
          updated_at: '2026-08-09T11:00:00.000Z'
        },
        {
          id: 'rpa-item-14',
          robo_name: 'ID13 - Atualização Jira',
          title: 'Infra / VPN / Acessos Liberar e regularizar acesso VPN e conta Microsoft',
          responsible: 'Caio',
          severity: 'ALTA',
          status: 'EM_VALIDACAO',
          description: 'Liberar e regularizar acesso VPN e conta Microsoft (Rodrigo / Lado Natura)',
          history_notes: [{ id: 'upd-14', date: '2026-08-09T11:05:00.000Z', displayDate: '09/08/2026', author: 'Rodrigo / Lado Natura', text: 'Pendente Liberação' }],
          created_at: '2026-08-09T11:05:00.000Z',
          updated_at: '2026-08-09T11:05:00.000Z'
        },
        {
          id: 'rpa-item-15',
          robo_name: 'ID13 - Atualização Jira, ID15 - Pendência Recompra',
          title: 'Infra / Credenciais (ID 13, ID 15) Atualizar credenciais (assets) de acesso Microsoft expiradas diretamente no orquestrador',
          responsible: 'Caio',
          severity: 'ALTA',
          status: 'EM_VALIDACAO',
          description: 'Atualizar credenciais (assets) de acesso Microsoft expiradas diretamente no orquestrador',
          history_notes: [{ id: 'upd-15', date: '2026-08-09T11:10:00.000Z', displayDate: '09/08/2026', author: 'Lado Natura', text: 'Pendente Atualização' }],
          created_at: '2026-08-09T11:10:00.000Z',
          updated_at: '2026-08-09T11:10:00.000Z'
        },
        {
          id: 'rpa-item-16',
          robo_name: 'ID26 - Amortização Dispatcher, ID27 - Amortização Performer 1',
          title: 'E-mail / Caixa de Entrada (ID 26, ID 27) Liberar acesso à caixa de e-mail para recebimento de mensagens do time de dados (bloqueante)',
          responsible: 'Caio',
          severity: 'CRITICA',
          status: 'ABERTO',
          description: 'Liberar acesso à caixa de e-mail para recebimento de mensagens do time de dados (bloqueante)',
          history_notes: [{ id: 'upd-16', date: '2026-08-09T11:15:00.000Z', displayDate: '09/08/2026', author: 'Caio', text: 'Bloqueado' }],
          created_at: '2026-08-09T11:15:00.000Z',
          updated_at: '2026-08-09T11:15:00.000Z'
        },
        {
          id: 'rpa-item-17',
          robo_name: 'ID28 - Amortização Performer 2',
          title: 'E-mail / Porta SMTP (ID 28) Providenciar a liberação da porta SMTP para envio de e-mails com anexo (bloqueante)',
          responsible: 'Caio',
          severity: 'CRITICA',
          status: 'ABERTO',
          description: 'Providenciar a liberação da porta SMTP para envio de e-mails com anexo (bloqueante)',
          history_notes: [{ id: 'upd-17', date: '2026-08-09T11:20:00.000Z', displayDate: '09/08/2026', author: 'Caio / TI', text: 'Bloqueado' }],
          created_at: '2026-08-09T11:20:00.000Z',
          updated_at: '2026-08-09T11:20:00.000Z'
        },
        {
          id: 'rpa-item-18',
          robo_name: 'ID05 - Baixa Manual Lote, ID06 - Demandas de BKO',
          title: 'ID 05 (Demandas BKO) Quedas severas de performance e resets na máquina acima de 500 casos fora do 1º horário; geração de retornos repetidos subscrevendo dados',
          responsible: 'Redesign',
          severity: 'CRITICA',
          status: 'ABERTO',
          description: 'Quedas severas de performance e resets na máquina acima de 500 casos fora do 1º horário; geração de retornos repetidos subscrevendo dados',
          history_notes: [{ id: 'upd-18', date: '2026-08-09T11:25:00.000Z', displayDate: '09/08/2026', author: 'Sustentação / BKO', text: 'Pendente Resolução' }],
          created_at: '2026-08-09T11:25:00.000Z',
          updated_at: '2026-08-09T11:25:00.000Z'
        },
        {
          id: 'rpa-item-19',
          robo_name: 'ID05 - Baixa Manual Lote',
          title: 'EMA-28 / ID 05 Configuração incorreta na obtenção de itens da fila e fluxos duplicados geraram erro em cascata e 25,5h de retrabalho',
          responsible: 'Redesign',
          severity: 'ALTA',
          status: 'ABERTO',
          description: 'Configuração incorreta na obtenção de itens da fila e fluxos duplicados geraram erro em cascata e 25,5h de retrabalho',
          history_notes: [{ id: 'upd-19', date: '2026-08-09T11:30:00.000Z', displayDate: '09/08/2026', author: 'Sustentação / Redesign', text: 'Identificado / Em Correção' }],
          created_at: '2026-08-09T11:30:00.000Z',
          updated_at: '2026-08-09T11:30:00.000Z'
        },
        {
          id: 'rpa-item-20',
          robo_name: 'ID08 - Arquivo Reembolso',
          title: 'ID 08 (Arquivo Reembolso) Falha grave de integridade/compliance: erros no nome do arquivo e subscrição divergente de pedido/valor. Solução prometida a partir do lote 67',
          responsible: 'Redesign',
          severity: 'CRITICA',
          status: 'ABERTO',
          description: 'Falha grave de integridade/compliance: erros no nome do arquivo e subscrição divergente de pedido/valor. Solução prometida a partir do lote 67',
          history_notes: [{ id: 'upd-20', date: '2026-08-09T11:35:00.000Z', displayDate: '09/08/2026', author: 'Redesign', text: 'Correção Prevista (Lote 67)' }],
          created_at: '2026-08-09T11:35:00.000Z',
          updated_at: '2026-08-09T11:35:00.000Z'
        },
        {
          id: 'rpa-item-21',
          robo_name: 'ID13 - Atualização Jira',
          title: 'ID 13 (Atualização Jira) Falha na transição HML p/ PRD: encerra execução com falha total e descarta itens já concluídos do lote. Falha nos filtros a corrigir no lote 35',
          responsible: 'Redesign',
          severity: 'CRITICA',
          status: 'ABERTO',
          description: 'Falha na transição HML p/ PRD: encerra execução com falha total e descarta itens já concluídos do lote. Falha nos filtros a corrigir no lote 35',
          history_notes: [{ id: 'upd-21', date: '2026-08-09T11:40:00.000Z', displayDate: '09/08/2026', author: 'Redesign', text: 'Validação Pendente (Lote 35)' }],
          created_at: '2026-08-09T11:40:00.000Z',
          updated_at: '2026-08-09T11:40:00.000Z'
        },
        {
          id: 'rpa-item-22',
          robo_name: 'ID14 - Extração Tarefas Dynamics, ID15 - Pendência Recompra, ID18 - Cancelamento Dynamics',
          title: 'ID 15 / ID 14 / ID 18 Falha na extração de cards no final de semana por falta de gatilho em dias não úteis no ID 18 (ajustado para operarem no FDS)',
          responsible: 'Redesign',
          severity: 'MEDIA',
          status: 'ABERTO',
          description: 'Falha na extração de cards no final de semana por falta de gatilho em dias não úteis no ID 18 (ajustado para operarem no FDS)',
          history_notes: [{ id: 'upd-22', date: '2026-08-09T11:45:00.000Z', displayDate: '09/08/2026', author: 'Redesign', text: 'Ajustado / Em Acompanhamento' }],
          created_at: '2026-08-09T11:45:00.000Z',
          updated_at: '2026-08-09T11:45:00.000Z'
        },
        {
          id: 'rpa-item-23',
          robo_name: 'ID18 - Cancelamento Dynamics',
          title: 'EMA-47 / ID 18 (Cancelamento Dynamics) Desempenho ineficiente e lentidão extrema consumindo o SLA (D0). Realizado ajuste no seletor do botão "Finalizar tarefa"',
          responsible: 'Redesign',
          severity: 'CRITICA',
          status: 'ABERTO',
          description: 'Desempenho ineficiente e lentidão extrema consumindo o SLA (D0). Realizado ajuste no seletor do botão "Finalizar tarefa"',
          history_notes: [{ id: 'upd-23', date: '2026-08-09T11:50:00.000Z', displayDate: '09/08/2026', author: 'Redesign / Sustentação', text: 'Em Validação (Aguardando Execuções)' }],
          created_at: '2026-08-09T11:50:00.000Z',
          updated_at: '2026-08-09T11:50:00.000Z'
        },
        {
          id: 'rpa-item-24',
          robo_name: 'ID19 - Cancelamento SAP',
          title: 'ID 19 (SAP Dispatcher) Solução desenhada internamente após travamento com o parceiro. Apresentação da versão oficial pela Redesign e apuração do atraso/horas',
          responsible: 'Redesign',
          severity: 'MEDIA',
          status: 'ABERTO',
          description: 'Solução desenhada internamente após travamento com o parceiro. Apresentação da versão oficial pela Redesign e apuração do atraso/horas',
          history_notes: [{ id: 'upd-24', date: '2026-08-09T11:55:00.000Z', displayDate: '09/08/2026', author: 'Redesign / TI Interna', text: 'Em Validação / Apuração' }],
          created_at: '2026-08-09T11:55:00.000Z',
          updated_at: '2026-08-09T11:55:00.000Z'
        },
        {
          id: 'rpa-item-25',
          robo_name: 'ID06 - Demandas de BKO',
          title: 'Geral / Gestão de Conhecimento Turnover constante na sustentação do fornecedor gerando novos bugs por falta de transferência de contexto; exigência de documentação robusta de engenharia',
          responsible: 'Redesign',
          severity: 'ALTA',
          status: 'ABERTO',
          description: 'Turnover constante na sustentação do fornecedor gerando novos bugs por falta de transferência de contexto; exigência de documentação robusta de engenharia',
          history_notes: [{ id: 'upd-25', date: '2026-08-09T12:00:00.000Z', displayDate: '09/08/2026', author: 'Redesign / Gestão de Contrato', text: 'Pendente Normalização / Ação Contratual' }],
          created_at: '2026-08-09T12:00:00.000Z',
          updated_at: '2026-08-09T12:00:00.000Z'
        },
        {
          id: 'rpa-item-26',
          robo_name: 'ID06 - Demandas de BKO',
          title: 'Geral / Processo de Sustentação Exigência de Restabelecimento do Hypercare obrigatorio e proibição de fragmentação de chamados/abertura de novos chamados sem historico mantido no original',
          responsible: 'Redesign',
          severity: 'ALTA',
          status: 'ABERTO',
          description: 'Exigência de Restabelecimento do Hypercare obrigatorio e proibição de fragmentação de chamados/abertura de novos chamados sem historico mantido no original',
          history_notes: [{ id: 'upd-26', date: '2026-08-09T12:05:00.000Z', displayDate: '09/08/2026', author: 'Redesign / Gestão de Processos', text: 'Pendente Alinhamento de Processo' }],
          created_at: '2026-08-09T12:05:00.000Z',
          updated_at: '2026-08-09T12:05:00.000Z'
        }
      ];

      this.pendencies = this.filterDeleted(initial26Items);
      this.saveLocal();
      this.syncMasterToSupabase();
    },

    getDeletedIds() {
      try {
        const val = localStorage.getItem('cs_rpa_deleted_ids');
        return val ? JSON.parse(val) : [];
      } catch (_) {
        return [];
      }
    },

    markDeleted(id) {
      if (!id) return;
      try {
        const list = this.getDeletedIds();
        if (!list.includes(id)) {
          list.push(id);
          localStorage.setItem('cs_rpa_deleted_ids', JSON.stringify(list));
        }
      } catch (_) {}
    },

    normalizeResponsible(respStr) {
      if (!respStr) return 'Redesign';
      const parts = String(respStr).split(/;|;/).map(s => s.trim()).filter(Boolean);
      const mapped = parts.map(p => {
        const lower = p.toLowerCase();
        if (lower.includes('redesign')) return 'Redesign';
        if (lower.includes('caio')) return 'Caio';
        if (lower.includes('skytel') || lower.includes('ambos') || lower.includes('emanapay') || lower.includes('squad rpa')) return 'Emanapay';
        return p;
      });
      return [...new Set(mapped)].join('; ');
    },

    filterDeleted(items) {
      if (!Array.isArray(items)) return [];
      const deletedList = this.getDeletedIds();
      return items
        .filter(item => item && item.id && !deletedList.includes(item.id))
        .map(item => {
          if (item.status === 'EM_ANALISE') item.status = 'ABERTO';
          if (item.status === 'AGUARDANDO_PARCEIRO') item.status = 'EM_VALIDACAO';
          item.responsible = this.normalizeResponsible(item.responsible);
          return item;
        });
    },

    async syncMasterToSupabase() {
      if (!window.supabaseClient) return;
      try {
        const masterIds = this.pendencies.map(i => i.id);
        for (const item of this.pendencies) {
          try {
            await window.supabaseClient.from('rpa_pendencies').upsert({
              id: item.id,
              robo_name: item.robo_name,
              title: item.title,
              responsible: item.responsible,
              status: item.status,
              severity: item.severity,
              description: item.description,
              history_notes: item.history_notes,
              created_at: item.created_at,
              updated_at: item.updated_at
            });
          } catch (_) {}
        }
        // Purga itens antigos do Supabase que não estejam na lista das 26 demandas ativas
        const { data: dbData } = await window.supabaseClient.from('rpa_pendencies').select('id');
        if (Array.isArray(dbData)) {
          for (const row of dbData) {
            if (!masterIds.includes(row.id)) {
              await window.supabaseClient.from('rpa_pendencies').delete().eq('id', row.id);
            }
          }
        }
      } catch (_) {}
    },

    loadLocal() {
      try {
        const saved = localStorage.getItem('cs_rpa_pendencies_v2');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.pendencies = this.filterDeleted(parsed);
          }
        }
      } catch (_) {
        this.pendencies = [];
      }
    },

    saveLocal() {
      try {
        this.pendencies = this.filterDeleted(this.pendencies);
        localStorage.setItem('cs_rpa_pendencies_v2', JSON.stringify(this.pendencies));
        if (window.app?.state) {
          window.app.state.rpaPendencies = this.pendencies;
        }
      } catch (_) {}
    },

    // Auto-Verificação e Leitura no Supabase via REST Client
    async fetchPendencies() {
      try {
        if (window.supabaseClient) {
          // 1. Tentar ler da tabela centralizada cs_board_state (acesso universal garantido para todos os usuários)
          const { data: boardState, error: bsError } = await window.supabaseClient
            .from('cs_board_state')
            .select('data')
            .eq('id', 'default')
            .maybeSingle();

          if (!bsError && boardState && boardState.data && Array.isArray(boardState.data.rpaPendencies) && boardState.data.rpaPendencies.length > 0) {
            const cleanBs = this.filterDeleted(boardState.data.rpaPendencies);
            if (cleanBs.length > 0) {
              this.pendencies = cleanBs;
              this.saveLocal();
              this.renderView();
              return;
            }
          }

          // 2. Fallback para a tabela rpa_pendencies se cs_board_state não tiver dados
          const { data, error } = await window.supabaseClient
            .from('rpa_pendencies')
            .select('*')
            .order('created_at', { ascending: false });

          if (!error && Array.isArray(data) && data.length > 0) {
            const mapped = data.map(item => ({
              id: item.id,
              robo_name: item.robo_name || 'Robô sem nome',
              title: item.title || 'Sem título',
              responsible: item.responsible || 'Redesign (Parceiro)',
              status: item.status || 'ABERTO',
              severity: item.severity || 'MEDIA',
              description: item.description || item.title || '',
              history_notes: Array.isArray(item.history_notes) ? item.history_notes : [],
              created_at: item.created_at || new Date().toISOString(),
              updated_at: item.updated_at || new Date().toISOString()
            }));

            const clean = this.filterDeleted(mapped);
            if (clean.length > 0) {
              this.pendencies = clean;
              this.saveLocal();
            }
          }
        }
      } catch (err) {
        console.warn('[RPA Pendencies] Modo de operação resiliente ativado:', err);
      }

      this.loadLocal();
      this.renderView();
    },

    setupRealtimeSync() {
      if (!window.supabaseClient) return;
      try {
        if (this._realtimeChannel) {
          try { window.supabaseClient.removeChannel(this._realtimeChannel); } catch (_) {}
        }
        this._realtimeChannel = window.supabaseClient
          .channel('rpa_pendencies_realtime_v3')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'cs_board_state' }, () => {
            console.log('[RPA Realtime] Alteração remota detectada no cs_board_state. Atualizando tela de todos os usuários...');
            this.fetchPendencies();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'rpa_pendencies' }, () => {
            console.log('[RPA Realtime] Alteração remota detectada na tabela rpa_pendencies. Atualizando tela...');
            this.fetchPendencies();
          })
          .subscribe();
      } catch (e) {
        console.warn('[RPA Realtime Error]', e);
      }

      if (!this._pollingInterval) {
        this._pollingInterval = setInterval(() => {
          this.fetchPendencies();
        }, 10000);
      }
    },

    // Injeção Dinâmica da UI (Estática no HTML)
    injectUI() {
      // Elementos visuais já estão estaticamente no HTML
    },

    parseHTML(str) {
      const tmp = document.createElement('div');
      tmp.innerHTML = str.trim();
      return tmp.firstElementChild;
    },

    // 4. Lógica de Pílulas + Selects Adicionadores
    setupSelectListeners() {
      // Backup listeners - HTML inline onchange already handles the primary flow
      // These only fire if inline handlers are somehow stripped
      const self = this;
      const robotSelect = document.getElementById('rpa-robot-adder-select');
      if (robotSelect) {
        robotSelect.addEventListener('change', function() {
          const v = this.value;
          if (v && v.indexOf('Selecionar') === -1) {
            self.addRobot(v);
            this.selectedIndex = 0;
          }
        });
      }

      const respSelect = document.getElementById('rpa-resp-adder-select');
      if (respSelect) {
        respSelect.addEventListener('change', function() {
          const v = this.value;
          if (v && v.indexOf('Selecionar') === -1) {
            self.addResponsible(v);
            this.selectedIndex = 0;
          }
        });
      }
    },

    addRobot(robotName) {
      let val = '';
      if (typeof robotName === 'string') {
        val = robotName.trim();
      } else if (robotName && typeof robotName === 'object') {
        if (robotName.value && robotName.value.trim() !== '') {
          val = robotName.value.trim();
        } else if (robotName.options && robotName.selectedIndex >= 0) {
          val = (robotName.options[robotName.selectedIndex].value || robotName.options[robotName.selectedIndex].text || '').trim();
        }
      }

      if (!val || val.indexOf('Selecionar') !== -1) return;

      if (!Array.isArray(this.selectedRobots)) this.selectedRobots = [];

      if (val === 'Nenhum' || val === 'Todos os robôs') {
        this.selectedRobots = [val];
      } else {
        this.selectedRobots = this.selectedRobots.filter(r => r !== 'Nenhum' && r !== 'Todos os robôs');
        if (!this.selectedRobots.includes(val)) {
          this.selectedRobots.push(val);
        }
      }

      this.renderRobotPills();

      const selectEl = document.getElementById('rpa-robot-adder-select');
      if (selectEl) {
        selectEl.value = '';
        selectEl.selectedIndex = 0;
      }
    },

    removeRobot(robotName) {
      if (!Array.isArray(this.selectedRobots)) return;
      const idx = this.selectedRobots.indexOf(robotName);
      if (idx >= 0) {
        this.selectedRobots.splice(idx, 1);
        this.renderRobotPills();
      }
    },

    renderRobotPills() {
      const container = document.getElementById('rpa-robot-pills-container');
      if (!container) return;

      if (!Array.isArray(this.selectedRobots) || !this.selectedRobots.length) {
        container.innerHTML = '';
        return;
      }

      container.innerHTML = this.selectedRobots.map(robot => {
        const safeName = robot.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        let badgeClass = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300';
        let iconClass = 'fa-robot text-emerald-400';
        if (robot === 'Nenhum') {
          badgeClass = 'bg-rose-500/20 border-rose-500/50 text-rose-300';
          iconClass = 'fa-ban text-rose-400';
        } else if (robot === 'Todos os robôs') {
          badgeClass = 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300';
          iconClass = 'fa-cubes text-cyan-400';
        }

        return `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${badgeClass} border shadow-sm my-0.5">
            <i class="fa-solid ${iconClass} text-xs"></i>
            <span>${robot}</span>
            <button type="button" onclick="window.RpaPendenciesModule.removeRobot('${safeName}')" class="ml-1 opacity-80 hover:opacity-100 font-bold cursor-pointer transition-colors" title="Remover">✕</button>
          </span>
        `;
      }).join('');
    },

    addResponsible(respName) {
      let val = '';
      if (typeof respName === 'string') {
        val = respName.trim();
      } else if (respName && typeof respName === 'object') {
        if (respName.value && respName.value.trim() !== '') {
          val = respName.value.trim();
        } else if (respName.options && respName.selectedIndex >= 0) {
          val = (respName.options[respName.selectedIndex].value || respName.options[respName.selectedIndex].text || '').trim();
        }
      }

      if (!val || val.indexOf('Selecionar') !== -1) return;

      if (!Array.isArray(this.selectedResponsibles)) this.selectedResponsibles = [];

      if (!this.selectedResponsibles.includes(val)) {
        this.selectedResponsibles.push(val);
      }

      this.renderRespPills();

      const selectEl = document.getElementById('rpa-resp-adder-select');
      if (selectEl) {
        selectEl.value = '';
        selectEl.selectedIndex = 0;
      }
    },

    removeResponsible(respName) {
      if (!Array.isArray(this.selectedResponsibles)) return;
      const idx = this.selectedResponsibles.indexOf(respName);
      if (idx >= 0) {
        this.selectedResponsibles.splice(idx, 1);
        this.renderRespPills();
      }
    },

    renderRespPills() {
      const container = document.getElementById('rpa-resp-pills-container');
      if (!container) return;

      if (!Array.isArray(this.selectedResponsibles) || !this.selectedResponsibles.length) {
        container.innerHTML = '';
        return;
      }

      container.innerHTML = this.selectedResponsibles.map(rName => {
        const safeName = rName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/20 border border-indigo-500/50 text-indigo-300 shadow-sm my-0.5">
            <i class="fa-solid fa-user text-indigo-400 text-xs"></i>
            <span>${rName}</span>
            <button type="button" onclick="window.RpaPendenciesModule.removeResponsible('${safeName}')" class="ml-1 text-indigo-300 hover:text-white font-bold cursor-pointer transition-colors" title="Remover">✕</button>
          </span>
        `;
      }).join('');
    },

    getSelectedRobotsString() {
      return this.selectedRobots.join(', ');
    },

    getSelectedResponsiblesString() {
      return this.selectedResponsibles.length ? this.selectedResponsibles.join(' ; ') : '';
    },

    // 4.5 Lógica da Linha do Tempo de Atualizações
    addTimelineUpdate() {
      const dateVal = document.getElementById('rpa-update-date')?.value;
      const textInput = document.getElementById('rpa-update-text');
      const textVal = (textInput?.value || '').trim();

      if (!textVal) {
        alert('Por favor, digite o resumo da atualização.');
        return;
      }

      let formattedDate = '--/--/----';
      if (dateVal) {
        const parts = dateVal.split('-');
        if (parts.length === 3) formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      } else {
        formattedDate = new Date().toLocaleDateString('pt-BR');
      }

      const nowIso = new Date().toISOString();
      this.selectedTimelineUpdates.unshift({
        id: 'upd-' + Date.now(),
        date: dateVal || nowIso,
        displayDate: formattedDate,
        author: window.app?.userName || 'Usuário',
        text: textVal
      });

      if (textInput) textInput.value = '';
      this.renderTimelineList();
    },

    removeTimelineUpdate(index) {
      if (index >= 0 && index < this.selectedTimelineUpdates.length) {
        this.selectedTimelineUpdates.splice(index, 1);
        this.renderTimelineList();
      }
    },

    renderTimelineList() {
      const container = document.getElementById('rpa-timeline-container');
      if (!container) return;

      if (!this.selectedTimelineUpdates.length) {
        container.innerHTML = `<p class="text-[11px] text-slate-500 text-center py-2">Nenhuma atualização registrada.</p>`;
        return;
      }

      container.innerHTML = this.selectedTimelineUpdates.map((item, idx) => {
        const displayDate = item.displayDate || (item.date ? (item.date.includes('/') ? item.date : new Date(item.date).toLocaleDateString('pt-BR')) : '--/--/----');
        return `
          <div class="flex items-start justify-between gap-2 p-2 rounded bg-slate-900/90 border border-white/5 text-xs">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">📅 ${displayDate}</span>
                <span class="text-[10px] text-slate-400">por ${item.author || 'Usuário'}</span>
              </div>
              <p class="text-slate-200 text-[11px] leading-relaxed break-words margin-0">${item.text}</p>
            </div>
            <button type="button" onclick="app.removeRpaTimelineUpdate(${idx})" class="text-slate-500 hover:text-rose-400 cursor-pointer text-xs p-1 transition-colors" title="Remover atualização">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        `;
      }).join('');
    },

    // 5. Hook Limpo na Navegação do App
    setupNavigationHook() {
      const checkAndToggleTab = () => {
        const squad = (window.app?.activeSquad || '').toString().toLowerCase();
        const activeDemandSquad = (window.app?.activeDemandSquadKey || '').toString().toLowerCase();
        const pageTitle = (document.getElementById('page-title')?.textContent || '').toLowerCase();
        const boardTitle = (document.getElementById('board-squad-title')?.textContent || '').toLowerCase();
        const backlogTitle = (document.getElementById('backlog-squad-title')?.textContent || '').toLowerCase();
        const concluidosTitle = (document.getElementById('concluidos-squad-title')?.textContent || '').toLowerCase();

        const isRpa = squad.includes('rpa') || 
                      activeDemandSquad.includes('rpa') || 
                      pageTitle.includes('rpa') || 
                      boardTitle.includes('rpa') || 
                      backlogTitle.includes('rpa') || 
                      concluidosTitle.includes('rpa');

        const activeView = window.app?.activeView || 'board';
        
        // 1. Alternar 4ª Aba "⚠️ Pendências RPA" nas Squads
        document.querySelectorAll('.rpa-only-tab-btn').forEach(btn => {
          if (isRpa) {
            btn.classList.remove('hidden');
            btn.style.setProperty('display', 'inline-flex', 'important');
            if (activeView === 'rpa-pendencies') {
              btn.className = 'px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer rpa-only-tab-btn bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10';
            } else {
              btn.className = 'px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer rpa-only-tab-btn text-gray-400 hover:text-white hover:bg-slate-800 border border-transparent';
            }
          } else {
            btn.classList.add('hidden');
            btn.style.setProperty('display', 'none', 'important');
          }
        });

        // 2. Atualizar estilos das outras 3 abas
        document.querySelectorAll('.tab-btn-board').forEach(btn => {
          if (activeView === 'board') {
            btn.className = 'px-4 py-2 rounded-lg text-xs font-bold transition-all tab-btn-board bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10';
          } else {
            btn.className = 'px-4 py-2 rounded-lg text-xs font-semibold transition-all tab-btn-board text-gray-400 hover:text-white hover:bg-slate-800 border border-transparent';
          }
        });

        document.querySelectorAll('.tab-btn-backlog').forEach(btn => {
          if (activeView === 'backlog') {
            btn.className = 'px-4 py-2 rounded-lg text-xs font-bold transition-all tab-btn-backlog bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10';
          } else {
            btn.className = 'px-4 py-2 rounded-lg text-xs font-semibold transition-all tab-btn-backlog text-gray-400 hover:text-white hover:bg-slate-800 border border-transparent';
          }
        });

        document.querySelectorAll('.tab-btn-concluidos').forEach(btn => {
          if (activeView === 'concluidos') {
            btn.className = 'px-4 py-2 rounded-lg text-xs font-bold transition-all tab-btn-concluidos bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10';
          } else {
            btn.className = 'px-4 py-2 rounded-lg text-xs font-semibold transition-all tab-btn-concluidos text-gray-400 hover:text-white hover:bg-slate-800 border border-transparent';
          }
        });

        if (!isRpa && activeView === 'rpa-pendencies') {
          window.app.navigate('board');
        }
      };

      if (window.app) {
        const origSetSquad = window.app.setSquad;
        window.app.setSquad = function (squadId) {
          if (origSetSquad) origSetSquad.call(window.app, squadId);
          checkAndToggleTab();
        };

        const origNavigate = window.app.navigate;
        window.app.navigate = function (viewId) {
          if (origNavigate) origNavigate.call(window.app, viewId);
          checkAndToggleTab();
        };
      }

      checkAndToggleTab();
      setInterval(checkAndToggleTab, 200);
    },

    openRpaView() {
      document.body.classList.add('squad-rpa');
      if (window.app) {
        window.app.setSquad('rpa');
        window.app.activeView = 'rpa-pendencies';
        document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active-view'));
        const rpaView = document.getElementById('view-rpa-pendencies');
        if (rpaView) rpaView.classList.add('active-view');
      }
      this.renderView();
    },

    onPeriodChange() {
      const periodEl = document.getElementById('rpa-filter-period');
      const customContainer = document.getElementById('rpa-custom-date-container');
      if (periodEl && customContainer) {
        if (periodEl.value === 'custom') {
          customContainer.classList.remove('hidden');
          customContainer.style.display = 'grid';
        } else {
          customContainer.classList.add('hidden');
          customContainer.style.display = 'none';
        }
      }
      this.renderView();
    },

    resetFilters() {
      const searchEl = document.getElementById('rpa-filter-search');
      const respEl = document.getElementById('rpa-filter-responsible');
      const statusEl = document.getElementById('rpa-filter-status');
      const periodEl = document.getElementById('rpa-filter-period');
      const dateRefEl = document.getElementById('rpa-filter-date-ref');
      const dateStartEl = document.getElementById('rpa-filter-date-start');
      const dateEndEl = document.getElementById('rpa-filter-date-end');

      if (searchEl) searchEl.value = '';
      if (respEl) respEl.value = '';
      if (statusEl) statusEl.value = '';
      if (periodEl) periodEl.value = 'all';
      if (dateRefEl) dateRefEl.value = 'created_at';
      if (dateStartEl) dateStartEl.value = '';
      if (dateEndEl) dateEndEl.value = '';

      this.onPeriodChange();
    },

    getFilteredPendencies() {
      const search = (document.getElementById('rpa-filter-search')?.value || '').toLowerCase().trim();
      const respFilter = (document.getElementById('rpa-filter-responsible')?.value || '').trim();
      const statusFilter = (document.getElementById('rpa-filter-status')?.value || '').trim();
      const periodFilter = (document.getElementById('rpa-filter-period')?.value || 'all').trim();
      const dateRef = (document.getElementById('rpa-filter-date-ref')?.value || 'created_at').trim();
      const dateStartVal = document.getElementById('rpa-filter-date-start')?.value;
      const dateEndVal = document.getElementById('rpa-filter-date-end')?.value;

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      return (this.pendencies || []).filter(item => {
        // 1. Filtro Busca Textual (robô, título ou descrição)
        if (search) {
          const matchTitle = (item.title || '').toLowerCase().includes(search);
          const matchRobo = (item.robo_name || '').toLowerCase().includes(search);
          const matchResp = (item.responsible || '').toLowerCase().includes(search);
          const matchDesc = (item.description || '').toLowerCase().includes(search);
          if (!matchTitle && !matchRobo && !matchResp && !matchDesc) return false;
        }

        // 2. Filtro por Responsável
        if (respFilter) {
          const itemResp = (item.responsible || '').toString();
          if (!itemResp.includes(respFilter)) return false;
        }

        // 3. Filtro por Status
        if (statusFilter) {
          const itemStatus = (item.status || 'ABERTO').toString();
          if (itemStatus !== statusFilter) return false;
        }

        // 4. Filtro por Período Temporal
        if (periodFilter !== 'all') {
          let rawDate = null;
          if (dateRef === 'resolved_at') {
            rawDate = item.resolved_at || item.updated_at || item.created_at;
          } else {
            rawDate = item.created_at || item.createdAt;
          }

          if (!rawDate) return false;
          const itemDate = new Date(rawDate);
          if (isNaN(itemDate.getTime())) return false;
          const itemDateStr = itemDate.toISOString().split('T')[0];

          if (periodFilter === 'today') {
            if (itemDateStr !== todayStr) return false;
          } else if (periodFilter === 'week') {
            const diffDays = (now.getTime() - itemDate.getTime()) / (1000 * 3600 * 24);
            if (diffDays < 0 || diffDays > 7) return false;
          } else if (periodFilter === 'month') {
            if (itemDate.getMonth() !== now.getMonth() || itemDate.getFullYear() !== now.getFullYear()) return false;
          } else if (periodFilter === 'year') {
            if (itemDate.getFullYear() !== now.getFullYear()) return false;
          } else if (periodFilter === 'custom') {
            if (dateStartVal && itemDateStr < dateStartVal) return false;
            if (dateEndVal && itemDateStr > dateEndVal) return false;
          }
        }

        return true;
      });
    },

    // 6. Renderização da Tabela de Pendências
    renderView() {
      const tbody = document.getElementById('rpa-pendencies-tbody');
      if (!tbody) return;

      const allItems = this.pendencies || [];
      const totalCount = allItems.length;
      const openCount = allItems.filter(i => i.status !== 'RESOLVIDO').length;
      const resolvedCount = allItems.filter(i => i.status === 'RESOLVIDO').length;

      const totalEl = document.getElementById('metric-rpa-total');
      if (totalEl) totalEl.textContent = `${totalCount} pendência${totalCount === 1 ? '' : 's'}`;

      const openEl = document.getElementById('metric-rpa-open');
      if (openEl) openEl.textContent = `${openCount} aberta${openCount === 1 ? '' : 's'}`;

      const resolvedEl = document.getElementById('metric-rpa-resolved');
      if (resolvedEl) resolvedEl.textContent = `${resolvedCount} concluída${resolvedCount === 1 ? '' : 's'}`;

      const filtered = this.getFilteredPendencies();

      if (!filtered.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="text-center py-8 text-slate-400">
              <i class="fa-solid fa-folder-open text-2xl mb-2 block text-slate-500"></i>
              Nenhuma pendência encontrada com os filtros selecionados.
            </td>
          </tr>
        `;
        return;
      }

      const formatDate = (iso) => {
        if (!iso) return '--/--/----';
        try {
          return new Date(iso).toLocaleDateString('pt-BR');
        } catch (_) {
          return iso;
        }
      };

      tbody.innerHTML = filtered.map(item => {
        const robotList = (item.robo_name || '').split(',').map(s => s.trim()).filter(Boolean);
        const robotBadges = robotList.map(r => `
          <span class="badge text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold px-2 py-0.5 rounded me-1 mb-1 whitespace-nowrap">
            <i class="fa-solid fa-robot me-1"></i>${r}
          </span>
        `).join('');

        const respList = (item.responsible || '').split(/;|;/).map(s => s.trim()).filter(Boolean);
        const respBadges = respList.map(r => `
          <span class="badge text-[10px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold px-2 py-0.5 rounded me-1 mb-1 whitespace-nowrap">
            <i class="fa-solid fa-user me-1"></i>${r}
          </span>
        `).join('');

        let sevBadge = `<span class="badge text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold px-2.5 py-0.5 rounded-full"><i class="fa-solid fa-fire me-1"></i> MÉDIA</span>`;
        if (item.severity === 'CRITICA') {
          sevBadge = `<span class="badge text-[10px] bg-rose-600/30 text-rose-300 border border-rose-500/50 font-extrabold px-2.5 py-0.5 rounded-full animate-pulse"><i class="fa-solid fa-triangle-exclamation me-1"></i> CRÍTICA</span>`;
        } else if (item.severity === 'ALTA') {
          sevBadge = `<span class="badge text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/40 font-bold px-2.5 py-0.5 rounded-full"><i class="fa-solid fa-fire-flame-curved me-1"></i> ALTA</span>`;
        } else if (item.severity === 'BAIXA') {
          sevBadge = `<span class="badge text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold px-2.5 py-0.5 rounded-full"><i class="fa-solid fa-circle-down me-1"></i> BAIXA</span>`;
        }

        let statusBadge = `<span class="badge text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 font-extrabold px-2.5 py-1 rounded-md uppercase">EM ABERTO</span>`;
        if (item.status === 'EM_VALIDACAO') {
          statusBadge = `<span class="badge text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-extrabold px-2.5 py-1 rounded-md uppercase">EM VALIDAÇÃO</span>`;
        } else if (item.status === 'RESOLVIDO') {
          statusBadge = `<span class="badge text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-extrabold px-2.5 py-1 rounded-md uppercase"><i class="fa-solid fa-check me-1"></i> RESOLVIDO</span>`;
        }

        let latestUpdateText = '';
        if (Array.isArray(item.history_notes) && item.history_notes.length > 0) {
          const latest = item.history_notes[0];
          let dStr = latest.displayDate;
          if (!dStr && latest.date) {
            try {
              dStr = latest.date.includes('/') ? latest.date : new Date(latest.date).toLocaleDateString('pt-BR');
            } catch (_) {
              dStr = latest.date;
            }
          }
          if (!dStr) {
            dStr = formatDate(item.updated_at || item.created_at);
          }
          latestUpdateText = `${dStr} - ${latest.text || ''}`;
        } else if (item.description) {
          latestUpdateText = item.description;
        }

        return `
          <tr class="hover:bg-white/5 transition-all">
            <td style="padding: 14px 16px;">
              <div class="flex flex-wrap items-center">
                ${robotBadges || `<span class="text-slate-400 text-xs">${item.robo_name}</span>`}
              </div>
            </td>
            <td style="padding: 14px 16px; min-width: 260px;">
              <span class="font-extrabold text-white text-xs block mb-1">${item.title}</span>
              
              <!-- DATAS DE CRIAÇÃO E CONCLUSÃO EXPLICITAS -->
              <div class="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 my-1 font-mono">
                <span><i class="fa-solid fa-calendar-plus text-amber-400 me-1"></i>Criado: <strong class="text-slate-200">${formatDate(item.created_at)}</strong></span>
                ${(item.status === 'RESOLVIDO' || item.resolved_at) ? `
                  <span class="text-emerald-400 font-semibold"><i class="fa-solid fa-calendar-check text-emerald-400 me-1"></i>Concluído: <strong>${formatDate(item.resolved_at || item.updated_at)}</strong></span>
                ` : ''}
              </div>

              ${latestUpdateText ? `
                <div class="text-[11px] text-emerald-300/90 bg-slate-900/90 border border-emerald-500/30 rounded-lg p-2.5 leading-relaxed shadow-sm mt-1.5">
                  <i class="fa-solid fa-comment-dots text-emerald-400 me-1.5 shrink-0"></i>${latestUpdateText}
                </div>
              ` : `
                <span class="text-[10px] text-slate-500 italic">Sem atualizações registradas</span>
              `}
            </td>
            <td style="padding: 14px 16px;">
              <div class="flex flex-wrap items-center">
                ${respBadges || `<span class="text-slate-400 text-xs">${item.responsible}</span>`}
              </div>
            </td>
            <td style="padding: 14px 16px;">${sevBadge}</td>
            <td style="padding: 14px 16px;">${statusBadge}</td>
            <td style="padding: 14px 16px; text-align: right;">
              <div class="flex items-center justify-end gap-1.5">
                <button onclick="app.openNewRpaPendencyModal('${item.id}')" class="btn btn-secondary text-[11px] py-1 px-2" title="Editar Pendência">
                  <i class="fa-solid fa-pen text-slate-300"></i>
                </button>
                <button onclick="app.deleteRpaPendency('${item.id}')" class="btn btn-secondary text-[11px] py-1 px-2 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30" title="Excluir Pendência">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    },

    // 7. Handlers de Modais e Formulários
    openModal(id = null) {
      let modal = document.getElementById('modal-rpa-edit');
      if (!modal) return;

      const titleEl = document.getElementById('rpa-modal-edit-title') || document.getElementById('modal-rpa-title');
      const idEl = document.getElementById('rpa-edit-id');
      const titleInput = document.getElementById('rpa-edit-title');
      const sevEl = document.getElementById('rpa-edit-severity');
      const statusEl = document.getElementById('rpa-edit-status');

      const todayIso = new Date().toISOString().split('T')[0];
      const dateInput = document.getElementById('rpa-update-date');
      const textInput = document.getElementById('rpa-update-text');

      if (dateInput) dateInput.value = todayIso;
      if (textInput) textInput.value = '';

      const formatDate = (iso) => {
        if (!iso) return '--/--/----';
        try { return new Date(iso).toLocaleDateString('pt-BR'); } catch (_) { return iso; }
      };

      if (id) {
        const item = this.pendencies.find(i => i.id === id);
        if (item) {
          if (titleEl) titleEl.textContent = 'Editar Ocorrência RPA';
          if (idEl) idEl.value = item.id;
          this.selectedRobots = item.robo_name ? item.robo_name.split(',').map(s => s.trim()).filter(Boolean) : [];
          this.selectedResponsibles = item.responsible ? item.responsible.split(/;|;/).map(s => s.trim()).filter(Boolean) : [];

          if (Array.isArray(item.history_notes) && item.history_notes.length > 0) {
            this.selectedTimelineUpdates = [...item.history_notes];
          } else if (item.description && item.description !== item.title) {
            const dStr = formatDate(item.created_at || item.updated_at);
            this.selectedTimelineUpdates = [{
              id: 'upd-' + Date.now(),
              date: item.created_at || new Date().toISOString(),
              displayDate: dStr,
              author: window.app?.userName || 'Usuário',
              text: item.description
            }];
          } else {
            this.selectedTimelineUpdates = [];
          }

          if (titleInput) titleInput.value = item.title;
          if (sevEl) sevEl.value = item.severity;
          if (statusEl) statusEl.value = item.status;
        }
      } else {
        if (titleEl) titleEl.textContent = 'Nova Pendência de Robô RPA';
        if (idEl) idEl.value = '';
        this.selectedRobots = [];
        this.selectedResponsibles = [];
        this.selectedTimelineUpdates = [];
        if (titleInput) titleInput.value = '';
        if (sevEl) sevEl.value = 'MEDIA';
        if (statusEl) statusEl.value = 'ABERTO';
      }

      this.renderRobotPills();
      this.renderRespPills();
      this.renderTimelineList();
      this.setupSelectListeners();

      modal.classList.remove('hidden');
      modal.classList.add('open', 'active');
      modal.style.cssText = 'display: flex !important; opacity: 1 !important; pointer-events: auto !important; z-index: 999999 !important; align-items: center; justify-content: center;';
    },

    closeModal() {
      const modal = document.getElementById('modal-rpa-edit');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('open', 'active');
        modal.style.cssText = 'display: none !important; opacity: 0 !important; pointer-events: none !important;';
      }
    },

    async savePendency(e) {
      if (e && e.preventDefault) e.preventDefault();

      const id = document.getElementById('rpa-edit-id')?.value;
      const robo_name = this.getSelectedRobotsString();
      const responsible = this.getSelectedResponsiblesString();
      const title = document.getElementById('rpa-edit-title')?.value.trim();
      const severity = document.getElementById('rpa-edit-severity')?.value;
      const status = document.getElementById('rpa-edit-status')?.value;

      if (!robo_name) {
        alert('Por favor, selecione ao menos um Robô Afetado.');
        return;
      }
      if (!title) {
        alert('Por favor, preencha o Título da ocorrência.');
        return;
      }
      if (!responsible) {
        alert('Por favor, selecione ao menos um Responsável.');
        return;
      }

      const nowIso = new Date().toISOString();
      let target = id ? this.pendencies.find(i => i.id === id) : null;

      let latestSummary = title;
      if (this.selectedTimelineUpdates.length > 0) {
        const first = this.selectedTimelineUpdates[0];
        let dStr = first.displayDate;
        if (!dStr && first.date) {
          try {
            dStr = first.date.includes('/') ? first.date : new Date(first.date).toLocaleDateString('pt-BR');
          } catch (_) {
            dStr = first.date;
          }
        }
        if (!dStr) dStr = new Date().toLocaleDateString('pt-BR');
        latestSummary = `${dStr} - ${first.text}`;
      }

      if (target) {
        target.robo_name = robo_name;
        target.title = title;
        target.responsible = responsible;
        target.severity = severity;
        target.status = status;
        target.description = latestSummary;
        target.history_notes = [...this.selectedTimelineUpdates];
        target.updated_at = nowIso;
      } else {
        target = {
          id: 'rpa-' + Date.now(),
          robo_name,
          title,
          responsible,
          severity,
          status,
          description: latestSummary,
          history_notes: [...this.selectedTimelineUpdates],
          created_at: nowIso,
          updated_at: nowIso
        };
        this.pendencies.unshift(target);
      }

      this.saveLocal();

      // Disparar persistência centralizada no Supabase (cs_board_state) para que todos os usuários recebam em tempo real
      if (window.app && typeof window.app.saveStateToSupabase === 'function') {
        try {
          await window.app.saveStateToSupabase();
        } catch (err) {
          console.warn('[RPA SaveState Warning]', err);
        }
      }

      if (window.supabaseClient) {
        try {
          const payload = {
            robo_name: target.robo_name,
            title: target.title,
            responsible: target.responsible,
            severity: target.severity,
            status: target.status,
            description: target.description,
            history_notes: target.history_notes,
            created_at: target.created_at || nowIso,
            updated_at: nowIso
          };
          if (target.id && !target.id.startsWith('rpa-')) {
            payload.id = target.id;
          }
          await window.supabaseClient.from('rpa_pendencies').upsert(payload);
        } catch (err) {
          console.warn('[RPA Pendencies] Supabase upsert error:', err);
        }
      }

      this.closeModal();
      this.renderView();
      alert('✅ Pendência salva com sucesso!');
    },

    openDetailsModal(id) {
      const item = this.pendencies.find(i => i.id === id);
      if (!item) return;

      this.activeId = id;
      let modal = document.getElementById('modal-rpa-details');
      if (!modal) return;

      const titleEl = document.getElementById('rpa-detail-robo-title') || document.getElementById('rpa-det-title');
      if (titleEl) titleEl.textContent = `Robô(s): ${item.robo_name}`;
      const respEl = document.getElementById('rpa-detail-resp');
      if (respEl) respEl.textContent = item.responsible;
      const dateEl = document.getElementById('rpa-detail-date');
      if (dateEl) dateEl.textContent = new Date(item.created_at).toLocaleDateString('pt-BR');
      const statusChangeEl = document.getElementById('rpa-detail-status-change');
      if (statusChangeEl) statusChangeEl.value = item.status;

      const sevEl = document.getElementById('rpa-detail-sev');
      if (sevEl) {
        if (item.severity === 'CRITICA') sevEl.innerHTML = '<span class="text-rose-400 font-extrabold">🚨 Crítica</span>';
        else if (item.severity === 'ALTA') sevEl.innerHTML = '<span class="text-amber-400 font-extrabold">🔥 Alta</span>';
        else if (item.severity === 'MEDIA') sevEl.innerHTML = '<span class="text-yellow-400 font-extrabold">⚡ Média</span>';
        else sevEl.innerHTML = '<span class="text-slate-300 font-extrabold">🟢 Baixa</span>';
      }

      const statusEl = document.getElementById('rpa-detail-status');
      if (statusEl) {
        if (item.status === 'EM_VALIDACAO') statusEl.innerHTML = '<span class="badge bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 font-bold text-[10px]">Em Validação</span>';
        else if (item.status === 'RESOLVIDO') statusEl.innerHTML = '<span class="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 font-bold text-[10px]">Resolvido</span>';
        else statusEl.innerHTML = '<span class="badge bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 font-bold text-[10px]">Em Aberto</span>';
      }

      this.renderNotesList(item);
      modal.classList.remove('hidden');
      modal.classList.add('open', 'active');
      modal.style.cssText = 'display: flex !important; opacity: 1 !important; pointer-events: auto !important; z-index: 999999 !important; align-items: center; justify-content: center;';
    },

    renderNotesList(item) {
      const listEl = document.getElementById('rpa-detail-notes');
      if (!listEl) return;

      const notes = item.history_notes || [];
      if (!notes.length) {
        listEl.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">Nenhuma nota ou cobrança registrada.</p>`;
        return;
      }

      listEl.innerHTML = notes.map(n => `
        <div class="mb-2.5 pb-2.5 border-b border-white/5 last:border-none last:mb-0 last:pb-0">
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-[11px] font-bold text-emerald-400"><i class="fa-solid fa-user me-1"></i>${n.author || 'Usuário'}</span>
            <span class="text-[10px] text-slate-400 font-mono">${new Date(n.date).toLocaleDateString('pt-BR')}</span>
          </div>
          <p class="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">${n.text}</p>
        </div>
      `).join('');
    },

    closeDetailsModal() {
      const modal = document.getElementById('modal-rpa-details');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('open', 'active');
        modal.style.cssText = 'display: none !important; opacity: 0 !important; pointer-events: none !important;';
      }
    },

    async addNote() {
      const id = this.activeId;
      if (!id) return;

      const textarea = document.getElementById('rpa-detail-new-text');
      const text = (textarea?.value || '').trim();
      if (!text) {
        alert('Digite o texto da nota de cobrança.');
        return;
      }

      const item = this.pendencies.find(i => i.id === id);
      if (!item) return;

      if (!Array.isArray(item.history_notes)) item.history_notes = [];
      const nowIso = new Date().toISOString();

      item.history_notes.unshift({
        date: nowIso,
        author: window.app?.userName || 'Usuário',
        text: text
      });
      item.updated_at = nowIso;

      if (window.supabaseClient) {
        try {
          await window.supabaseClient.from('rpa_pendencies').update({ history_notes: item.history_notes, updated_at: nowIso }).eq('id', id);
        } catch (_) {}
      }

      this.saveLocal();
      if (textarea) textarea.value = '';
      this.renderNotesList(item);
      this.renderView();
    },

    async updateStatus(newStatus) {
      const id = this.activeId;
      if (!id) return;

      const item = this.pendencies.find(i => i.id === id);
      if (!item) return;

      const oldStatus = item.status;
      if (oldStatus === newStatus) return;

      item.status = newStatus;
      const nowIso = new Date().toISOString();
      item.updated_at = nowIso;

      if (!Array.isArray(item.history_notes)) item.history_notes = [];
      item.history_notes.unshift({
        date: nowIso,
        author: 'Sistema',
        text: `Status alterado de "${oldStatus}" para "${newStatus}".`
      });

      if (window.supabaseClient) {
        try {
          await window.supabaseClient.from('rpa_pendencies').update({ status: newStatus, history_notes: item.history_notes, updated_at: nowIso }).eq('id', id);
        } catch (_) {}
      }

      this.saveLocal();
      this.openDetailsModal(id);
      this.renderView();
    },

    async deletePendency(id) {
      if (!confirm('Tem certeza que deseja excluir esta pendência de robô?')) return;

      this.markDeleted(id);
      this.pendencies = this.pendencies.filter(i => i.id !== id);

      if (window.supabaseClient) {
        try {
          await window.supabaseClient.from('rpa_pendencies').delete().eq('id', id);
        } catch (_) {}
      }

      this.saveLocal();
      this.renderView();
    },

    printReport() {
      let printContainer = document.getElementById('rpa-print-report-container');
      if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'rpa-print-report-container';
        printContainer.className = 'rpa-print-only-container';
        document.body.appendChild(printContainer);
      }

      const nowStr = new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const items = this.getFilteredPendencies();
      const totalCount = items.length;
      const openCount = items.filter(i => i.status !== 'RESOLVIDO').length;
      const resolvedCount = items.filter(i => i.status === 'RESOLVIDO').length;
      const authorStr = window.app?.userName || 'Administrador';

      const cardsHtml = items.map((item, idx) => {
        const robotList = (item.robo_name || '').split(',').map(s => s.trim()).filter(Boolean);
        const robotPills = robotList.map(r => `<span class="rpa-print-pill-robot">🤖 ${r}</span>`).join(' ');

        const respList = (item.responsible || '').split(/;|;/).map(s => s.trim()).filter(Boolean);
        const respPills = respList.map(r => `<span class="rpa-print-pill-resp">👤 ${r}</span>`).join(' ');

        let sevLabel = 'Média';
        let sevClass = 'rpa-print-badge-medium';
        if (item.severity === 'CRITICA') { sevLabel = '🚨 Crítica'; sevClass = 'rpa-print-badge-critical'; }
        else if (item.severity === 'ALTA') { sevLabel = '🔥 Alta'; sevClass = 'rpa-print-badge-high'; }
        else if (item.severity === 'BAIXA') { sevLabel = '🟢 Baixa'; sevClass = 'rpa-print-badge-low'; }

        let statusLabel = 'Em Aberto';
        let statusClass = 'rpa-print-badge-open';
        if (item.status === 'EM_VALIDACAO') { statusLabel = 'Em Validação'; statusClass = 'rpa-print-badge-analysis'; }
        else if (item.status === 'RESOLVIDO') { statusLabel = 'Resolvido'; statusClass = 'rpa-print-badge-resolved'; }

        const notes = item.history_notes || [];
        let timelineRows = '';
        if (Array.isArray(notes) && notes.length > 0) {
          timelineRows = notes.map(n => {
            const dStr = n.displayDate || (n.date ? (n.date.includes('/') ? n.date : new Date(n.date).toLocaleDateString('pt-BR')) : '');
            return `
              <div class="rpa-print-timeline-item">
                <div class="rpa-print-timeline-header">
                  <span class="rpa-print-timeline-date">📅 ${dStr}</span>
                  <span class="rpa-print-timeline-author">por ${n.author || 'Usuário'}</span>
                </div>
                <div class="rpa-print-timeline-text">${n.text}</div>
              </div>
            `;
          }).join('');
        } else if (item.description) {
          timelineRows = `<div class="rpa-print-timeline-text">${item.description}</div>`;
        } else {
          timelineRows = `<div style="color:#94a3b8; font-style:italic; font-size:11px;">Sem atualizações registradas</div>`;
        }

        return `
          <div class="rpa-print-card">
            <div class="rpa-print-card-header">
              <div class="rpa-print-card-robots">${robotPills || item.robo_name}</div>
              <div class="rpa-print-card-badges">
                <span class="${sevClass}">${sevLabel}</span>
                <span class="${statusClass}">${statusLabel}</span>
              </div>
            </div>

            <h3 class="rpa-print-card-title">${idx + 1}. ${item.title}</h3>

            <div class="rpa-print-card-resp-row">
              <span class="rpa-print-label">Responsável(is):</span>
              <div class="rpa-print-resps">${respPills || item.responsible}</div>
            </div>

            <div class="rpa-print-timeline-box">
              <div class="rpa-print-timeline-title">🕒 Linha do Tempo de Evolução:</div>
              ${timelineRows}
            </div>
          </div>
        `;
      }).join('');

      printContainer.innerHTML = `
        <div class="rpa-print-report-page">
          <div class="rpa-print-header">
            <div class="rpa-print-logo-row">
              <div class="rpa-print-logo">
                <img src="assets/emanapay-logo.png" alt="Natura Avon EmanaPay Logo" class="rpa-print-logo-img" />
                <span class="rpa-print-logo-sub">Gestão de Squads & RPA</span>
              </div>
              <div class="rpa-print-meta">
                <div><strong>Emissão:</strong> ${nowStr}</div>
                <div><strong>Gerado por:</strong> ${authorStr}</div>
              </div>
            </div>
            <h1 class="rpa-print-title">Relatório Executivo de Pendências de Robôs em Produção</h1>
          </div>

          <div class="rpa-print-kpi-grid">
            <div class="rpa-print-kpi-box">
              <div class="rpa-print-kpi-num text-amber-600">${totalCount}</div>
              <div class="rpa-print-kpi-label">TOTAL DE PENDÊNCIAS</div>
            </div>
            <div class="rpa-print-kpi-box">
              <div class="rpa-print-kpi-num text-rose-600">${openCount}</div>
              <div class="rpa-print-kpi-label">EM ABERTO / CRÍTICAS</div>
            </div>
            <div class="rpa-print-kpi-box">
              <div class="rpa-print-kpi-num text-emerald-600">${resolvedCount}</div>
              <div class="rpa-print-kpi-label">RESOLVIDAS</div>
            </div>
          </div>

          <div class="rpa-print-cards-list">
            ${cardsHtml}
          </div>

          <div class="rpa-print-footer">
            EmanaPay Control Squads - Documento Executivo de Acompanhamento RPA · Página 1
          </div>
        </div>
      `;

      window.print();
      setTimeout(() => {
        if (printContainer) printContainer.innerHTML = '';
      }, 500);
    },

    printPDF() {
      this.printReport();
    }
  };

  window.RpaPendenciesModule = RpaPendenciesModule;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RpaPendenciesModule.init());
  } else {
    RpaPendenciesModule.init();
  }

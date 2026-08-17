/* ==========================================================================
   Controle de Squads & Governança Jira - Jira Sync & Routing Engine Universal
   ========================================================================== */

const JiraSyncEngine = {
  // Sincronizar cards do Jira com deduplicação inteligente e roteamento de status
  async syncJiraCards(state, saveStateCallback) {
    if (!state) state = {};
    if (!Array.isArray(state.triageItems)) state.triageItems = [];
    if (!state.backlogItems || typeof state.backlogItems !== 'object') state.backlogItems = {};
    if (!state.completedTasks || typeof state.completedTasks !== 'object') state.completedTasks = {};
    ['dados', 'operacoes', 'rpa'].forEach(squadId => {
      if (!Array.isArray(state.backlogItems[squadId])) state.backlogItems[squadId] = [];
      if (!Array.isArray(state.completedTasks[squadId])) state.completedTasks[squadId] = [];
    });

    let cards = [];

    // CAMADA 1: Tentar consultar Proxy Configurado ou Local
    try {
      const customUrl = localStorage.getItem('cs_jira_custom_url');
      const localUrl = customUrl ? customUrl : 'http://localhost:3000/api/jira/consultar-cards-jira';
      const res = await fetch(localUrl);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.cards) && json.cards.length > 0) {
          cards = json.cards;
        }
      }
    } catch (e) {
      console.warn('Proxy local não acessível.');
    }

    let extractedAtStr = null;

    // CAMADA 2: Consulta via arquivo estático de cache (GitHub Actions Automático)
    if (!cards.length) {
      try {
        console.log('Buscando dados sincronizados em jira-data.json...');
        const res = await fetch(`./jira-data.json?v=${Date.now()}`);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.cards) && json.cards.length > 0) {
            cards = json.cards;
            if (json.updatedAt) {
              try {
                const d = new Date(json.updatedAt);
                extractedAtStr = `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
              } catch (_) {}
            }
            console.log(`Cache de dados do Jira carregado com ${cards.length} cards.`);
          }
        }
      } catch (err) {
        console.warn('Falha ao carregar jira-data.json:', err);
      }
    }

    if (!cards.length) {
      return {
        success: false,
        message: 'Nenhum card retornado do Jira ou arquivo de cache indisponível.'
      };
    }

    const extractJiraKey = (item) => {
      if (!item) return null;
      const raw = (item.jiraKey || item.gau || item.id || item.taskTitle || '').toString();
      const match = raw.match(/GAU-\d+/i);
      return match ? match[0].toUpperCase() : null;
    };

    // Mapear conjunto de todas as chaves válidas vindas do Jira nesta sincronização
    const validJiraKeys = new Set();
    cards.forEach((card, idx) => {
      const rawJiraKey = card.key || card.jiraKey || (card.id && card.id.toString().startsWith('GAU-') ? card.id : `GAU-${100 + idx}`);
      const keyStr = extractJiraKey({ jiraKey: rawJiraKey });
      if (keyStr) validJiraKeys.add(keyStr);
    });

    // 1. PURGA DEFINITIVA DE CARDS EXCLUÍDOS/DELETADOS DO JIRA (ex: GAU-132, GAU-133, GAU-134)
    // Se o item tem uma chave GAU mas ela NÃO existe na base vinda do Jira, PURGA imediata!
    state.triageItems = state.triageItems.filter(item => {
      const k = extractJiraKey(item);
      return !k || validJiraKeys.has(k);
    });

    ['dados', 'operacoes', 'rpa'].forEach(squadId => {
      state.backlogItems[squadId] = (state.backlogItems[squadId] || []).filter(item => {
        const k = extractJiraKey(item);
        return !k || validJiraKeys.has(k);
      });

      state.completedTasks[squadId] = (state.completedTasks[squadId] || []).filter(item => {
        const k = extractJiraKey(item);
        return !k || validJiraKeys.has(k);
      });
    });

    // Mapear posição atual dos cards existentes no estado para roteamento
    const existingMap = new Map();
    state.triageItems.forEach(t => {
      const k = extractJiraKey(t);
      if (k) existingMap.set(k, { queue: 'triage', item: t });
    });

    ['dados', 'operacoes', 'rpa'].forEach(squadId => {
      (state.backlogItems[squadId] || []).forEach(b => {
        const k = extractJiraKey(b);
        if (k) existingMap.set(k, { queue: `backlog_${squadId}`, item: b });
      });

      (state.completedTasks[squadId] || []).forEach(c => {
        const k = extractJiraKey(c);
        if (k) existingMap.set(k, { queue: `completed_${squadId}`, item: c });
      });
    });

    let countNew = 0;
    let countUpdated = 0;
    let countToCompleted = 0;
    let countUnchanged = 0;
    let countCancelled = 0;
    const newBacklogItemsBySquad = { dados: [], operacoes: [], rpa: [] };

    cards.forEach((card, idx) => {
      const rawStatus = (card.status || card.fields?.status?.name || '').toString().trim();
      const rawCatStatus = (card.categoriaStatus || card.fields?.status?.statusCategory?.name || '').toString().trim();

      const statusLower = rawStatus.toLowerCase();
      const catStatusLower = rawCatStatus.toLowerCase();

      const cleanRequesterName = (name) => {
        if (!name || typeof name !== 'string') return name || '';
        let str = name.trim();
        if (!str) return '';

        const sepMatch = str.match(/[\-–—]/);
        if (sepMatch) {
          const parts = str.split(/[\-–—]/);
          if (parts[0] && parts[0].trim()) {
            str = parts[0].trim();
          }
        }

        const lowerWords = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'del']);
        const acronyms = new Set(['RPA', 'TI', 'BKO', 'PJ', 'SCD', 'GAU', 'CRM', 'API']);
        const subParts = str.split(/([;/])/);

        return subParts.map(sub => {
          if (sub === ';' || sub === '/') return sub;
          const words = sub.trim().split(/\s+/).filter(Boolean);
          if (!words.length) return '';

          return words.map((w, idx) => {
            const upperW = w.toUpperCase();
            if (acronyms.has(upperW)) return upperW;
            const cleanW = w.toLowerCase();
            if (idx > 0 && lowerWords.has(cleanW)) return cleanW;
            return cleanW.replace(/[a-zà-ú]/i, letter => letter.toUpperCase());
          }).join(' ');
        }).join(' ');
      };

      const rawJiraKey = card.key || card.jiraKey || (card.id && card.id.toString().startsWith('GAU-') ? card.id : `GAU-${100 + idx}`);
      const jiraKey = extractJiraKey({ jiraKey: rawJiraKey }) || `GAU-${100 + idx}`;
      const title = card.title || card.summary || card.nome || 'Demanda do Jira';
      const description = card.description || card.descricao || card.notes || 'Sincronizado via Jira API';
      const rawRequester = card.requester || card.reporter || card.solicitante || 'Solicitante Jira';
      const requester = cleanRequesterName(rawRequester);

      // Extração do campo Time Solicitante (customfield_11010)
      const cfTeam = card.customfield_11010 || card.fields?.customfield_11010;
      let teamSolicitante = card.teamSolicitante || '';
      if (!teamSolicitante && cfTeam) {
        let teamVal = '';
        if (typeof cfTeam === 'object') {
          teamVal = (cfTeam.id || cfTeam.value || cfTeam.name || '').toString();
        } else {
          teamVal = cfTeam.toString();
        }
        if (teamVal === '24153' || teamVal.toLowerCase().includes('atendimento')) {
          teamSolicitante = 'Atendimento';
        } else if (teamVal === '24154' || teamVal.toLowerCase().includes('conciliação') || teamVal.toLowerCase().includes('conciliacao') || teamVal.toLowerCase().includes('parâmetros')) {
          teamSolicitante = 'Conciliação';
        } else if (teamVal === '24152' || teamVal.toLowerCase().includes('suporte')) {
          teamSolicitante = 'Suporte Operacional';
        } else {
          teamSolicitante = teamVal;
        }
      }

      const rawCreated = card.created || card.fields?.created || card.createdDate || card.date;
      let createdDate = new Date().toLocaleDateString('pt-BR');
      if (rawCreated) {
        try {
          const parsedDate = new Date(rawCreated);
          if (!isNaN(parsedDate.getTime())) {
            createdDate = parsedDate.toLocaleDateString('pt-BR');
          } else {
            createdDate = rawCreated.toString();
          }
        } catch (e) {
          createdDate = rawCreated.toString();
        }
      }

      // Mapeamento de Squad (16005 -> Operações, 16006 -> Dados, 16007 -> RPA)
      let targetSquadId = card.squadTarget || 'dados';
      let targetSquadName = 'Squad de Dados';

      const cfSquad = card.customfield_12475 || card.squad || card.squadTarget || card.fields?.customfield_12475 || card.fields?.customfield_squad;
      let cfStr = '';
      let hasExplicitSquad = false;
      if (cfSquad) {
        if (typeof cfSquad === 'object') {
          cfStr = (cfSquad.id || cfSquad.value || JSON.stringify(cfSquad)).toString().toLowerCase();
        } else {
          cfStr = cfSquad.toString().toLowerCase();
        }
      }

      if (cfStr.includes('16005') || cfStr.includes('operac') || cfStr.includes('operações')) {
        targetSquadId = 'operacoes';
        targetSquadName = 'Squad de Operações';
        hasExplicitSquad = true;
      } else if (cfStr.includes('16007') || cfStr.includes('rpa')) {
        targetSquadId = 'rpa';
        targetSquadName = 'Squad de RPA';
        hasExplicitSquad = true;
      } else if (cfStr.includes('16006') || cfStr.includes('dados')) {
        targetSquadId = 'dados';
        targetSquadName = 'Squad de Dados';
        hasExplicitSquad = true;
      }

      // VERIFICAÇÃO DE STATUS CANCELADO / REJEITADO / DESCONTINUADO
      const isCancelledStatus = 
        statusLower.includes('cancelad') ||
        statusLower.includes('canceled') ||
        statusLower.includes('descontinuad') ||
        statusLower.includes('rejeitad') ||
        statusLower.includes('inválid') ||
        statusLower.includes('invalid') ||
        statusLower.includes('duplicad') ||
        statusLower.includes('wont do') ||
        statusLower.includes('won\'t do') ||
        statusLower.includes('declined') ||
        statusLower.includes('discarded') ||
        statusLower.includes('obsoleto');

      const existing = existingMap.get(jiraKey);

      // CASO 1: CARD FOI CANCELADO NO JIRA
      if (isCancelledStatus) {
        countCancelled++;
        if (existing) {
          // Remover da fila onde estiver
          const oldLoc = existing.queue;
          if (oldLoc === 'triage') {
            state.triageItems = state.triageItems.filter(t => extractJiraKey(t) !== jiraKey);
          } else if (oldLoc.startsWith('backlog_')) {
            const sId = oldLoc.replace('backlog_', '');
            state.backlogItems[sId] = (state.backlogItems[sId] || []).filter(b => extractJiraKey(b) !== jiraKey);
          } else if (oldLoc.startsWith('completed_')) {
            const sId = oldLoc.replace('completed_', '');
            state.completedTasks[sId] = (state.completedTasks[sId] || []).filter(c => extractJiraKey(c) !== jiraKey);
          }
          existingMap.delete(jiraKey);
        }
        return; // Não adiciona aos quadros ativos
      }

      // Mapeamento de Fila de Destino
      let targetQueue = '';
      let defaultStatus = 'Backlog';

      if (
        statusLower === 'concluído' ||
        statusLower === 'concluido' ||
        statusLower === 'finalizado' ||
        statusLower === 'done' ||
        statusLower === 'closed' ||
        statusLower === 'resolved' ||
        statusLower === 'resolvido' ||
        statusLower.includes('coletar dados') ||
        statusLower.includes('conclu') ||
        statusLower.includes('entregue') ||
        catStatusLower === 'done'
      ) {
        targetQueue = `completed_${targetSquadId}`;
      } else if (!hasExplicitSquad || statusLower === 'aberto' || statusLower === 'abertos' || statusLower === 'triagem' || statusLower === 'novo' || statusLower === 'nova' || statusLower === 'to do' || statusLower === 'a fazer' || statusLower.includes('aguardando triagem') || statusLower.includes('pendente triagem')) {
        targetQueue = 'triage';
      } else {
        targetQueue = `backlog_${targetSquadId}`;
        if (statusLower.includes('bloquead') || statusLower.includes('impedid') || statusLower.includes('block') || statusLower.includes('hold')) {
          defaultStatus = 'Bloqueado';
        } else {
          defaultStatus = 'Backlog';
        }
      }

      // CASO A: TICKET NOVO
      if (!existing) {
        countNew++;
        if (targetQueue.startsWith('completed_')) {
          countToCompleted++;
        }
        existingMap.set(jiraKey, { queue: targetQueue });

        if (targetQueue === 'triage') {
          state.triageItems.unshift({
            id: `triage-${jiraKey}`,
            jiraKey,
            jiraUrl: `https://naturapay.atlassian.net/browse/${jiraKey}`,
            title,
            description,
            requesterName: requester,
            teamSolicitante,
            priority: card.priority || '2 - Alta',
            category: card.category || 'Geral',
            suggestedSquad: targetSquadId,
            createdAt: createdDate,
            createdDate,
            status: 'Pendente'
          });
        } else if (targetQueue.startsWith('completed_')) {
          state.completedTasks[targetSquadId].unshift({
            id: `completed-${jiraKey}`,
            gau: jiraKey,
            jiraKey: jiraKey,
            title: title,
            taskTitle: title,
            taskDescription: description,
            description: description,
            area: 'Geral',
            completedBy: requester || targetSquadName,
            requester: requester || targetSquadName,
            teamSolicitante,
            dueDate: card.dueDate || new Date().toISOString().split('T')[0],
            createdDate,
            completionDate: new Date().toLocaleDateString('pt-BR'),
            gains: '',
            requesterArea: requester
          });
        } else {
          if (!newBacklogItemsBySquad[targetSquadId]) newBacklogItemsBySquad[targetSquadId] = [];
          newBacklogItemsBySquad[targetSquadId].push({
            id: `backlog-${jiraKey}`,
            gau: jiraKey,
            jiraKey,
            title,
            notes: description,
            requester,
            teamSolicitante,
            team: targetSquadName,
            dueDate: card.dueDate || new Date().toISOString().split('T')[0],
            createdDate,
            priority: card.priority || '2 - Alta',
            category: card.category || 'Processos',
            status: defaultStatus,
            phase: 'backlog',
            progress: 0,
            rawCreated: rawCreated || card.created
          });
        }
      }
      // CASO B: TICKET EXISTE MAS MUDOU DE FILA
      else if (existing.queue !== targetQueue) {
        countUpdated++;
        if (targetQueue.startsWith('completed_')) {
          countToCompleted++;
        }

        // Remover da fila anterior
        const oldLoc = existing.queue;
        if (oldLoc === 'triage') {
          state.triageItems = state.triageItems.filter(t => extractJiraKey(t) !== jiraKey);
        } else if (oldLoc.startsWith('backlog_')) {
          const sId = oldLoc.replace('backlog_', '');
          state.backlogItems[sId] = (state.backlogItems[sId] || []).filter(b => extractJiraKey(b) !== jiraKey);
        } else if (oldLoc.startsWith('completed_')) {
          const sId = oldLoc.replace('completed_', '');
          state.completedTasks[sId] = (state.completedTasks[sId] || []).filter(c => extractJiraKey(c) !== jiraKey);
        }

        // Inserir na nova fila
        existingMap.set(jiraKey, { queue: targetQueue });

        if (targetQueue === 'triage') {
          state.triageItems.unshift({
            id: `triage-${jiraKey}`,
            jiraKey,
            jiraUrl: `https://naturapay.atlassian.net/browse/${jiraKey}`,
            title,
            description,
            requesterName: requester,
            teamSolicitante,
            priority: card.priority || '2 - Alta',
            category: card.category || 'Geral',
            suggestedSquad: targetSquadId,
            createdAt: createdDate,
            createdDate,
            status: 'Pendente'
          });
        } else if (targetQueue.startsWith('completed_')) {
          state.completedTasks[targetSquadId].unshift({
            id: `completed-${jiraKey}`,
            gau: jiraKey,
            jiraKey: jiraKey,
            title: title,
            taskTitle: title,
            taskDescription: description,
            description: description,
            area: 'Geral',
            completedBy: requester || targetSquadName,
            requester: requester || targetSquadName,
            teamSolicitante,
            dueDate: card.dueDate || new Date().toISOString().split('T')[0],
            createdDate,
            completionDate: new Date().toLocaleDateString('pt-BR'),
            gains: '',
            requesterArea: requester
          });
        } else {
          if (!newBacklogItemsBySquad[targetSquadId]) newBacklogItemsBySquad[targetSquadId] = [];
          newBacklogItemsBySquad[targetSquadId].push({
            id: `backlog-${jiraKey}`,
            gau: jiraKey,
            jiraKey,
            title,
            notes: description,
            requester,
            teamSolicitante,
            team: targetSquadName,
            dueDate: card.dueDate || new Date().toISOString().split('T')[0],
            createdDate,
            priority: card.priority || '2 - Alta',
            category: card.category || 'Processos',
            status: defaultStatus,
            phase: 'backlog',
            progress: 0,
            rawCreated: rawCreated || card.created
          });
        }
      }
      // CASO C: TICKET EXISTE NA MESMA FILA (Atualizar dados preservando estado do usuário)
      else {
        const itemObj = existing.item;
        let isModified = false;
        if (itemObj) {
          if (title && itemObj.title !== title) {
            itemObj.title = title;
            isModified = true;
          }
          if (requester && (itemObj.requester !== requester && itemObj.requesterName !== requester)) {
            itemObj.requester = requester;
            itemObj.requesterName = requester;
            isModified = true;
          }
          if (teamSolicitante && itemObj.teamSolicitante !== teamSolicitante) {
            itemObj.teamSolicitante = teamSolicitante;
            isModified = true;
          }
          if (isModified) countUpdated++;
          else countUnchanged++;
        } else {
          countUnchanged++;
        }
      }
    });

    // MERGE: Inserir novos cards de backlog no estado (crítico — sem isso os novos cards nunca aparecem)
    ['dados', 'operacoes', 'rpa'].forEach(squadId => {
      if (newBacklogItemsBySquad[squadId] && newBacklogItemsBySquad[squadId].length > 0) {
        state.backlogItems[squadId] = (state.backlogItems[squadId] || []).concat(newBacklogItemsBySquad[squadId]);
        console.log(`[Jira Sync] ${newBacklogItemsBySquad[squadId].length} novo(s) card(s) inserido(s) no backlog de ${squadId}.`);
      }
    });

    // ATRIBUIÇÃO DE ID SEQUENCIAL POR SQUAD (baseado na Data de Criação)
    const parseCreationTs = (item) => {
      if (!item) return 0;
      const raw = item.rawCreated || item.createdDate || item.createdAt || item.date || item.created;
      if (!raw) return 0;
      if (typeof raw === 'number') return raw;
      const str = String(raw).trim();
      if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length >= 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          let rest = parts[2].trim();
          let year = parseInt(rest.split(' ')[0], 10);
          if (year < 100) year += 2000;
          return new Date(year, month, day).getTime();
        }
      }
      const parsed = new Date(str).getTime();
      return isNaN(parsed) ? 0 : parsed;
    };

    ['dados', 'operacoes', 'rpa'].forEach(squadId => {
      const backlog = state.backlogItems[squadId] || [];
      const completed = state.completedTasks[squadId] || [];
      const allSquadItems = [].concat(backlog, completed);
      if (allSquadItems.length === 0) return;
      allSquadItems.sort((a, b) => parseCreationTs(a) - parseCreationTs(b));
      allSquadItems.forEach((item, idx) => {
        item.seqId = idx + 1;
      });
    });

    // Salvar estado e atualizar interface
    if (typeof saveStateCallback === 'function') saveStateCallback();

    const nowTime = new Date().toLocaleTimeString('pt-BR');
    return {
      success: true,
      time: nowTime,
      extractedAt: extractedAtStr || `${new Date().toLocaleDateString('pt-BR')} às ${nowTime}`,
      countNew,
      countUpdated,
      countToCompleted,
      countUnchanged,
      countCancelled,
      message: `✅ Sincronização Jira concluída às ${nowTime}: ${countNew} novos | ${countUpdated} atualizados | ${countToCompleted} concluídos | ${countCancelled} cancelados/expurgados.`
    };
  }
};

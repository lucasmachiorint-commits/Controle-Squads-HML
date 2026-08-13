/* ==========================================================================
   Controle de Squads - Módulo Isolado de Automação (automacao.js)
   Demandas Internas de Desenvolvimento & Automação
   Design System Harmonizado Impeccable (v1.9.0)
   ========================================================================== */

var AutomacaoModule = window.AutomacaoModule = {
  items: [],
  activeTab: 'backlog',
  editingId: null,
  _realtimeChannel: null,
  _pollingInterval: null,

  init: function() {
    this.fetchItems();
    this.registerGlobalAliases();
    this.setupRealtimeSync();
  },

  registerGlobalAliases: function() {
    window.app = window.app || {};
    var self = this;
    window.app.openAutomacaoModal = function(id) { self.openModal(id); };
    window.app.closeAutomacaoModal = function() { self.closeModal(); };
    window.app.saveAutomacaoDemand = function(e) { self.saveDemand(e); };
    window.app.deleteAutomacaoDemand = function(id) { self.deleteDemand(id); };
    window.app.setAutomacaoTab = function(tab) { self.setTab(tab); };
    window.app.changeAutomacaoOrder = function(id, val) { self.changeOrder(id, val); };
    window.app.moveAutomacaoTo = function(id, status) { self.moveTo(id, status); };
    window.app.renderAutomacaoView = function() { self.renderView(); };
    window.app.maskDateInput = function(el) { self.maskDateInput(el); };
    window.app.syncAutomacaoPickerToDate = function(val) { self.syncPickerToDate(val); };
  },

  maskDateInput: function(el) {
    if (!el) return;
    var v = el.value.replace(/\D/g, '');
    if (v.length > 8) v = v.substring(0, 8);
    if (v.length >= 5) {
      el.value = v.substring(0, 2) + '/' + v.substring(2, 4) + '/' + v.substring(4);
    } else if (v.length >= 3) {
      el.value = v.substring(0, 2) + '/' + v.substring(2);
    } else {
      el.value = v;
    }
  },

  syncPickerToDate: function(pickerValue) {
    if (!pickerValue) return;
    var formatted = this.formatDatePtBr(pickerValue);
    var dateEl = document.getElementById('auto-edit-created-date');
    if (dateEl) dateEl.value = formatted;
  },

  ensureSequentialIds: function() {
    if (!Array.isArray(this.items)) this.items = [];
    var currentMax = 0;
    this.items.forEach(function(item) {
      if (item.seqId && typeof item.seqId === 'number') {
        if (item.seqId > currentMax) currentMax = item.seqId;
      }
    });

    this.items.forEach(function(item) {
      if (!item.seqId) {
        currentMax++;
        item.seqId = currentMax;
      }
    });
  },

  fetchItems: async function() {
    try {
      if (window.supabaseClient) {
        var isHml = (typeof window !== 'undefined' && window.location && window.location.href && window.location.href.toUpperCase().includes('HML'));
        var rowId = isHml ? 'hml_default' : 'default';
        var res = await window.supabaseClient
          .from('cs_board_state')
          .select('data')
          .eq('id', rowId)
          .maybeSingle();

        if (res && res.data && res.data.data && Array.isArray(res.data.data.automacaoItems) && res.data.data.automacaoItems.length > 0) {
          this.items = res.data.data.automacaoItems;
          this.ensureSequentialIds();
          this.saveLocal(false);
          this.renderView();
          return;
        }
      }
    } catch(err) {
      console.warn("[AutomacaoModule] Falha ao ler Supabase, usando LocalStorage:", err);
    }
    this._loadFallback();
    this.renderView();
  },

  _loadFallback: function() {
    var stored = localStorage.getItem('cs_automacao_items_v1');
    if (stored) {
      try {
        this.items = JSON.parse(stored);
      } catch(e) {
        this.items = [];
      }
    }
    this.ensureSequentialIds();
  },

  saveLocal: function(triggerSupabase = true) {
    this.ensureSequentialIds();
    localStorage.setItem('cs_automacao_items_v1', JSON.stringify(this.items));
    if (window.app && window.app.state) {
      window.app.state.automacaoItems = this.items;
      if (triggerSupabase && typeof window.app.saveStateToSupabase === 'function') {
        window.app.saveStateToSupabase();
      }
    }
  },

  setupRealtimeSync: function() {
    if (!window.supabaseClient) return;
    try {
      if (this._realtimeChannel) {
        try { window.supabaseClient.removeChannel(this._realtimeChannel); } catch (_) {}
      }
      var isHml = (typeof window !== 'undefined' && window.location && window.location.href && window.location.href.toUpperCase().includes('HML'));
      var rowId = isHml ? 'hml_default' : 'default';

      this._realtimeChannel = window.supabaseClient
        .channel('automacao_realtime_' + (isHml ? 'hml' : 'prd'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cs_board_state' }, (payload) => {
          if (payload && payload.new && payload.new.id && payload.new.id !== rowId) return;
          this.fetchItems();
        })
        .subscribe();
    } catch (e) {
      console.warn('[Automacao Realtime Error]', e);
    }

    if (!this._pollingInterval) {
      this._pollingInterval = setInterval(() => {
        this.fetchItems();
      }, 5000);
    }
  },

  setTab: function(tabName) {
    this.activeTab = tabName;
    this.renderView();
  },

  getMetrics: function() {
    var total = this.items.length;
    var emAndamento = this.items.filter(i => i.status === 'em-andamento').length;
    var concluidos = this.items.filter(i => i.status === 'concluido').length;
    return { total: total, emAndamento: emAndamento, concluidos: concluidos };
  },

  formatDatePtBr: function(dateStr) {
    if (!dateStr) return new Date().toLocaleDateString('pt-BR');
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      var parts = dateStr.split('-');
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    try {
      var d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        var day = String(d.getDate()).padStart(2, '0');
        var month = String(d.getMonth() + 1).padStart(2, '0');
        var year = d.getFullYear();
        return day + '/' + month + '/' + year;
      }
    } catch(e) {}
    return dateStr;
  },

  formatDateIsoForPicker: function(dateStr) {
    var todayIso = new Date().toISOString().split('T')[0];
    if (!dateStr) return todayIso;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      var parts = dateStr.split('/');
      return parts[2] + '-' + parts[1] + '-' + parts[0];
    }
    try {
      var d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch(e) {}
    return todayIso;
  },

  renderView: function() {
    var container = document.getElementById('view-automacao');
    if (!container) return;

    this.ensureSequentialIds();
    var metrics = this.getMetrics();
    var filteredItems = this.items.filter(i => i.status === this.activeTab);

    if (this.activeTab === 'backlog') {
      filteredItems.sort((a, b) => (a.treatmentOrder || 999) - (b.treatmentOrder || 999));
    } else {
      filteredItems.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    }

    var html = '';

    // 1. BARRA DE ABAS HORIZONTAIS
    html += '<div class="flex items-center gap-2 bg-[#111827] p-1.5 rounded-xl border border-[#1f2937] mb-6 squad-tabs-container">';
    var tabs = [
      { id: 'em-andamento', label: 'Em Andamento' },
      { id: 'backlog', label: 'Backlog' },
      { id: 'concluido', label: 'Concluídos' }
    ];

    tabs.forEach(tab => {
      var isActive = this.activeTab === tab.id;
      var activeClass = isActive 
        ? 'bg-violet-500/20 text-violet-400 border border-violet-500/40 shadow-lg shadow-violet-500/10 font-bold active-tab' 
        : 'text-gray-400 hover:text-white border border-transparent font-semibold';
      html += '<button type="button" onclick="app.setAutomacaoTab(\'' + tab.id + '\')" class="px-4 py-2 rounded-lg text-xs transition-all automacao-tab-btn ' + activeClass + '">' + tab.label + '</button>';
    });
    html += '</div>';

    // 2. TRÊS QUADROS DE MÉTRICAS
    html += '<div class="triage-metrics-row mb-6 flex items-center gap-4">';
    
    html += '<div class="metric-box-card metric-box-purple flex-1 p-4 rounded-xl glass-panel" style="margin-bottom: 0 !important;">';
    html += '  <span class="metric-box-lbl text-violet-400 text-xs font-bold block mb-1">TOTAL DE DEMANDAS</span>';
    html += '  <div class="metric-box-val text-violet-300 text-2xl font-black">' + metrics.total + ' solicitações</div>';
    html += '</div>';

    html += '<div class="metric-box-card metric-box-amber flex-1 p-4 rounded-xl glass-panel" style="margin-bottom: 0 !important;">';
    html += '  <span class="metric-box-lbl text-amber-500 text-xs font-bold block mb-1">EM ANDAMENTO</span>';
    html += '  <div class="metric-box-val text-amber-400 text-2xl font-black">' + metrics.emAndamento + ' ativas</div>';
    html += '</div>';

    html += '<div class="metric-box-card metric-box-emerald flex-1 p-4 rounded-xl glass-panel" style="margin-bottom: 0 !important;">';
    html += '  <span class="metric-box-lbl text-emerald-400 text-xs font-bold block mb-1">CONCLUÍDAS</span>';
    html += '  <div class="metric-box-val text-emerald-400 text-2xl font-black">' + metrics.concluidos + ' finalizadas</div>';
    html += '</div>';

    html += '</div>';

    // 3. PAINEL DE TABELA E BOTÃO DE CADASTRO
    var tabTitles = {
      'backlog': 'Backlog de Automação',
      'em-andamento': 'Demandas em Andamento — Automação',
      'concluido': 'Demandas Concluídas — Automação'
    };

    html += '<div class="triage-table-panel glass-panel p-6">';
    html += '  <div class="panel-header-row mb-6 flex items-center justify-between">';
    html += '    <div>';
    html += '      <h2 style="font-size:20px; font-weight:800; margin:0;" class="text-white flex items-center gap-2">';
    html += '        <i class="fa-solid fa-wand-magic-sparkles text-violet-400"></i> ' + tabTitles[this.activeTab];
    html += '      </h2>';
    html += '      <p style="font-size:12px; margin:4px 0 0 0;" class="text-slate-400">Gerenciamento de solicitações internas de desenvolvimento e automação de processos</p>';
    html += '    </div>';

    if (this.activeTab === 'backlog') {
      html += '    <div>';
      html += '      <button type="button" onclick="app.openAutomacaoModal()" class="btn-new-automacao-demand bg-violet-500 hover:bg-violet-600 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all flex items-center gap-1.5 shadow-lg shadow-violet-500/20 cursor-pointer">';
      html += '        <i class="fa-solid fa-plus"></i> Adicionar Demanda';
      html += '      </button>';
      html += '    </div>';
    }
    html += '  </div>';

    // 4. TABELA DE DEMANDAS (Sem subtítulo de Aplicação ou Descrição no resumo)
    html += '  <div class="w-full overflow-hidden">';
    html += '    <table class="custom-table w-full text-left" style="table-layout: auto;">';
    html += '      <thead>';
    html += '        <tr>';
    html += '          <th style="width: 45px; white-space: nowrap; padding: 10px 8px;">ID</th>';

    if (this.activeTab === 'backlog') {
      html += '          <th style="width: 60px; white-space: nowrap; padding: 10px 8px;">ORDEM</th>';
    }

    html += '          <th style="min-width: 160px; padding: 10px 8px;">TÍTULO DA DEMANDA</th>';
    html += '          <th style="width: 120px; white-space: nowrap; padding: 10px 8px;">SOLICITANTE</th>';
    html += '          <th style="width: 160px; padding: 10px 8px;">TIME SOLICITANTE</th>';
    var isAdminUser = window.app && window.app.userRole === 'admin';
    var showStatusCol = (this.activeTab !== 'backlog') || isAdminUser;

    if (showStatusCol) {
      html += '          <th style="width: 125px; white-space: nowrap; padding: 10px 8px;">STATUS</th>';
    }
    html += '          <th style="width: 95px; white-space: nowrap; padding: 10px 8px;">DATA DE CRIAÇÃO</th>';
    html += '          <th style="width: 85px; white-space: nowrap; padding: 10px 8px;">CRITICIDADE</th>';
    html += '          <th style="width: 65px; text-align: right; white-space: nowrap; padding: 10px 8px;">AÇÕES</th>';
    html += '        </tr>';
    html += '      </thead>';
    html += '      <tbody>';

    if (filteredItems.length === 0) {
      var colSpan = 8;
      if (this.activeTab === 'backlog') colSpan += 1;
      if (!showStatusCol) colSpan -= 1;
      html += '        <tr>';
      html += '          <td colspan="' + colSpan + '" style="padding: 40px 16px; text-align: center;">';
      html += '            <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-800/50 mb-2">';
      html += '              <i class="fa-solid fa-inbox text-xl text-slate-400"></i>';
      html += '            </div>';
      html += '            <h4 class="font-bold text-slate-200 text-sm mb-1">Nenhuma demanda encontrada</h4>';
      html += '            <p class="text-xs text-slate-400 margin-0">Não há solicitações registradas nesta aba no momento.</p>';
      html += '          </td>';
      html += '        </tr>';
    } else {
      filteredItems.forEach(function(item, idx) {
        var critBadge = '';
        if (item.criticality === 'Alta') critBadge = 'bg-rose-500/20 text-rose-400 border-rose-500/40';
        else if (item.criticality === 'Média') critBadge = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
        else critBadge = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';

        var formattedDate = AutomacaoModule.formatDatePtBr(item.createdDate || item.createdAt);
        var statusClass = item.status === 'em-andamento' ? 'status-em-andamento' : (item.status === 'concluido' ? 'status-concluido' : 'status-backlog');

        html += '        <tr class="hover:bg-white/5 transition-all">';

        // 1. COLUNA ID
        html += '          <td style="padding: 10px 8px;" class="font-extrabold text-violet-400 text-xs">#' + (item.seqId || (idx + 1)) + '</td>';

        // 2. COLUNA ORDEM (apenas no Backlog)
        if (AutomacaoModule.activeTab === 'backlog') {
          html += '          <td style="padding: 10px 8px;">';
          html += '            <input type="number" value="' + (item.treatmentOrder || 1) + '" onchange="app.changeAutomacaoOrder(\'' + item.id + '\', this.value)" class="order-input-field w-12 text-center" style="height: 30px; font-weight: 800; font-size: 11px;" />';
          html += '          </td>';
        }

        // 3. TÍTULO DA DEMANDA (Somente o título, sem subtítulo de aplicação)
        html += '          <td style="padding: 10px 8px;">';
        html += '            <span class="font-extrabold text-white text-xs block" title="' + (item.title || '').replace(/"/g, '&quot;') + '">' + (item.title || 'Sem título') + '</span>';
        html += '          </td>';

        // 4. SOLICITANTE
        html += '          <td style="padding: 10px 8px;" class="text-xs font-semibold text-slate-300">' + (item.requester || '-') + '</td>';

        // 5. TIME SOLICITANTE (Apenas texto simples sem moldura)
        html += '          <td style="padding: 10px 8px;" class="text-xs font-semibold text-slate-300">';
        html += '            ' + (item.team || 'Conciliação, Parâmetros, Processamento e Adquirência');
        html += '          </td>';

        // 6. COLUNA STATUS (somente se showStatusCol)
        if (showStatusCol) {
          html += '          <td onclick="event.stopPropagation();" style="white-space:nowrap; padding: 10px 8px;">';
          html += '            <select class="status-select-dropdown ' + statusClass + '" style="width: 115px !important; min-width: 115px !important; max-width: 115px !important; font-size: 10px !important; padding: 4px 16px 4px 6px !important;" onchange="app.moveAutomacaoTo(\'' + item.id + '\', this.value)">';
          html += '              <option value="backlog" ' + (item.status === 'backlog' ? 'selected' : '') + '>Backlog</option>';
          html += '              <option value="em-andamento" ' + (item.status === 'em-andamento' ? 'selected' : '') + '>Em Andamento</option>';
          html += '              <option value="concluido" ' + (item.status === 'concluido' ? 'selected' : '') + '>Concluído</option>';
          html += '            </select>';
          html += '          </td>';
        }

        // 7. DATA DE CRIAÇÃO
        html += '          <td style="padding: 10px 8px;" class="text-xs text-slate-400 font-semibold">' + formattedDate + '</td>';

        // 8. CRITICIDADE
        html += '          <td style="padding: 10px 8px;">';
        html += '            <span class="badge text-[10px] px-2 py-0.5 border font-bold ' + critBadge + '">' + (item.criticality || 'Média') + '</span>';
        html += '          </td>';

        // 9. AÇÕES
        var isAdmin = window.app && window.app.userRole === 'admin';
        var isGerencial = window.app && window.app.userRole === 'gerencial';
        var currentUserEmail = (window.app && window.app.userEmail || '').toLowerCase();
        var isOwner = item.createdBy && currentUserEmail && item.createdBy.toLowerCase() === currentUserEmail;
        var canEditOrDelete = isAdmin || (isGerencial && isOwner);

        html += '          <td style="padding: 10px 8px; text-align: right;">';
        if (canEditOrDelete) {
          html += '            <div class="flex items-center justify-end gap-1">';
          html += '              <button onclick="app.openAutomacaoModal(\'' + item.id + '\')" class="btn btn-secondary text-[11px] py-1 px-1.5" title="Editar Demanda">';
          html += '                <i class="fa-solid fa-pen text-slate-300"></i>';
          html += '              </button>';
          html += '              <button onclick="app.deleteAutomacaoDemand(\'' + item.id + '\')" class="btn btn-secondary text-[11px] py-1 px-1.5 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30" title="Excluir Demanda">';
          html += '                <i class="fa-solid fa-trash-can"></i>';
          html += '              </button>';
          html += '            </div>';
        } else {
          html += '            <span class="text-[10px] text-slate-500 font-mono">Somente Leitura</span>';
        }
        html += '          </td>';

        html += '        </tr>';
      });
    }

    html += '      </tbody>';
    html += '    </table>';
    html += '  </div>';
    html += '</div>';

    container.innerHTML = html;
  },

  openModal: function(id) {
    var modal = document.getElementById('modal-automacao-edit');
    if (!modal) return;

    this.editingId = id || null;
    var titleEl = document.getElementById('automacao-modal-title');
    var idEl = document.getElementById('auto-edit-id');
    var reqEl = document.getElementById('auto-edit-requester');
    var teamEl = document.getElementById('auto-edit-team');
    var dateEl = document.getElementById('auto-edit-created-date');
    var pickerEl = document.getElementById('auto-edit-created-date-picker');
    var appEl = document.getElementById('auto-edit-application');
    var critEl = document.getElementById('auto-edit-criticality');
    var titleInput = document.getElementById('auto-edit-title');
    var descEl = document.getElementById('auto-edit-description');

    var todayPtBr = new Date().toLocaleDateString('pt-BR');
    var todayIso = new Date().toISOString().split('T')[0];

    if (id) {
      var item = this.items.find(i => i.id === id);
      if (item) {
        if (titleEl) titleEl.textContent = 'Editar Demanda #' + (item.seqId || '') + ' — Automação';
        if (idEl) idEl.value = item.id;
        if (reqEl) reqEl.value = item.requester || '';
        if (teamEl) teamEl.value = item.team || 'Conciliação, Parâmetros, Processamento e Adquirência';
        
        var formattedDate = this.formatDatePtBr(item.createdDate || item.createdAt);
        if (dateEl) dateEl.value = formattedDate;
        if (pickerEl) pickerEl.value = this.formatDateIsoForPicker(formattedDate);

        if (appEl) appEl.value = item.application || 'Controle de Squads';
        if (critEl) critEl.value = item.criticality || 'Média';
        if (titleInput) titleInput.value = item.title || '';
        if (descEl) descEl.value = item.description || '';
      }
    } else {
      if (titleEl) titleEl.textContent = 'Nova Demanda — Automação';
      if (idEl) idEl.value = '';
      if (reqEl) reqEl.value = '';
      if (teamEl) teamEl.value = 'Conciliação, Parâmetros, Processamento e Adquirência';
      if (dateEl) dateEl.value = todayPtBr;
      if (pickerEl) pickerEl.value = todayIso;
      if (appEl) appEl.value = 'Controle de Squads';
      if (critEl) critEl.value = 'Média';
      if (titleInput) titleInput.value = '';
      if (descEl) descEl.value = '';
    }

    modal.classList.remove('hidden');
    modal.classList.add('open', 'active');
    modal.style.cssText = 'display: flex !important; opacity: 1 !important; pointer-events: auto !important; z-index: 999999 !important; align-items: center; justify-content: center;';
  },

  closeModal: function() {
    var modal = document.getElementById('modal-automacao-edit');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('open', 'active');
    modal.style.cssText = 'display: none !important; opacity: 0 !important; pointer-events: none !important;';
  },

  saveDemand: function(e) {
    if (e && e.preventDefault) e.preventDefault();

    var id = document.getElementById('auto-edit-id')?.value;
    var requester = document.getElementById('auto-edit-requester')?.value.trim();
    var team = document.getElementById('auto-edit-team')?.value;
    var createdDateInput = document.getElementById('auto-edit-created-date')?.value;
    var application = document.getElementById('auto-edit-application')?.value;
    var criticality = document.getElementById('auto-edit-criticality')?.value;
    var title = document.getElementById('auto-edit-title')?.value.trim();
    var description = document.getElementById('auto-edit-description')?.value.trim();

    if (!title) {
      alert('Por favor, informe o Título da Demanda.');
      return;
    }

    var nowIso = new Date().toISOString();
    var createdFormatted = this.formatDatePtBr(createdDateInput || nowIso);

    this.ensureSequentialIds();

    if (id) {
      var item = this.items.find(i => i.id === id);
      if (item) {
        item.title = title;
        item.description = description;
        item.requester = requester;
        item.team = team;
        item.application = application;
        item.criticality = criticality;
        item.updatedAt = nowIso;
        if (createdDateInput) item.createdDate = createdFormatted;
      }
    } else {
      var nextOrder = 1;
      var backlogItems = this.items.filter(i => i.status === 'backlog');
      if (backlogItems.length > 0) {
        nextOrder = Math.max(...backlogItems.map(i => i.treatmentOrder || 0)) + 1;
      }

      var maxSeq = 0;
      this.items.forEach(function(i) {
        if (i.seqId && i.seqId > maxSeq) maxSeq = i.seqId;
      });

      var newItem = {
        id: 'auto-' + Date.now(),
        seqId: maxSeq + 1,
        title: title,
        description: description,
        requester: requester,
        team: team,
        application: application,
        criticality: criticality,
        status: 'backlog',
        treatmentOrder: nextOrder,
        createdBy: window.app && window.app.userEmail ? window.app.userEmail : '',
        createdDate: createdFormatted,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      this.items.unshift(newItem);
    }

    this.saveLocal();
    this.closeModal();
    this.renderView();
  },

  deleteDemand: function(id) {
    if (!id) return;
    var item = this.items.find(i => i.id === id);
    if (!item) return;

    var isAdmin = window.app && window.app.userRole === 'admin';
    var isGerencial = window.app && window.app.userRole === 'gerencial';
    var currentUserEmail = (window.app && window.app.userEmail || '').toLowerCase();
    var isOwner = item.createdBy && currentUserEmail && item.createdBy.toLowerCase() === currentUserEmail;

    if (!isAdmin && !(isGerencial && isOwner)) {
      alert('Acesso negado: Você só pode excluir demandas criadas por você mesmo.');
      return;
    }

    if (confirm('Tem certeza que deseja excluir esta demanda de automação?')) {
      this.items = this.items.filter(i => i.id !== id);
      this.saveLocal();
      this.renderView();
    }
  },

  moveTo: function(id, newStatus) {
    var item = this.items.find(i => i.id === id);
    if (!item) return;

    item.status = newStatus;
    item.updatedAt = new Date().toISOString();

    if (newStatus === 'backlog') {
      var backlogItems = this.items.filter(i => i.status === 'backlog' && i.id !== id);
      item.treatmentOrder = backlogItems.length + 1;
    }

    this.saveLocal();
    this.renderView();
  },

  changeOrder: function(itemId, newOrderInput) {
    var newOrder = parseInt(newOrderInput, 10);
    if (isNaN(newOrder) || newOrder < 1) return;

    var backlogItems = this.items.filter(i => i.status === 'backlog');
    var targetItem = backlogItems.find(i => i.id === itemId);
    if (!targetItem) return;

    var oldOrder = targetItem.treatmentOrder || 1;
    if (oldOrder === newOrder) return;

    var displacedItem = backlogItems.find(i => i.treatmentOrder === newOrder);
    if (displacedItem) {
      displacedItem.treatmentOrder = oldOrder;
    }

    targetItem.treatmentOrder = newOrder;
    this.saveLocal();
    this.renderView();
  }
};

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    if (window.AutomacaoModule && typeof window.AutomacaoModule.init === 'function') {
      window.AutomacaoModule.init();
    }
  }, 600);
});

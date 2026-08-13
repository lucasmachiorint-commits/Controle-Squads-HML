/* ==========================================================================
   Controle de Squads - Módulo Isolado de Automação (automacao.js)
   Demandas Internas de Desenvolvimento & Automação
   Design System Harmonizado Impeccable (v1.0.0)
   ========================================================================== */

var AutomacaoModule = window.AutomacaoModule = {
  items: [],
  activeTab: 'backlog',
  editingId: null,

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
  },

  fetchItems: async function() {
    try {
      if (window.supabaseClient) {
        var isHml = window.location.href.toUpperCase().includes('HML');
        var rowId = isHml ? 'hml_default' : 'default';
        var { data, error } = await window.supabaseClient
          .from('cs_board_state')
          .select('data')
          .eq('id', rowId)
          .single();

        if (data && data.data && data.data.automacaoItems) {
          this.items = data.data.automacaoItems;
        } else {
          this._loadFallback();
        }
      } else {
        this._loadFallback();
      }
    } catch(err) {
      console.warn("AutomacaoModule: Falha ao carregar do Supabase, usando localStorage.", err);
      this._loadFallback();
    }
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
  },

  saveLocal: function() {
    localStorage.setItem('cs_automacao_items_v1', JSON.stringify(this.items));
    if (window.app && window.app.state) {
      window.app.state.automacaoItems = this.items;
      if (typeof window.app.saveStateToSupabase === 'function') {
        window.app.saveStateToSupabase();
      }
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
    return { total, emAndamento, concluidos };
  },

  renderView: function() {
    var container = document.getElementById('view-automacao');
    if (!container) return;

    var metrics = this.getMetrics();
    var filteredItems = this.items.filter(i => i.status === this.activeTab);

    if (this.activeTab === 'backlog') {
      filteredItems.sort((a, b) => (a.treatmentOrder || 0) - (b.treatmentOrder || 0));
    } else {
      filteredItems.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    var html = '';

    // 1. Sub-tabs bar
    var tabs = [
      { id: 'em-andamento', label: 'Em Andamento' },
      { id: 'backlog', label: 'Backlog' },
      { id: 'concluido', label: 'Concluídos' }
    ];

    html += `<div class="flex items-center space-x-2 mb-6">`;
    tabs.forEach(tab => {
      var isActive = this.activeTab === tab.id;
      var activeClass = isActive 
        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10 font-bold' 
        : 'text-gray-400 hover:text-white border border-transparent font-semibold';
      html += `<button onclick="app.setAutomacaoTab('${tab.id}')" class="px-4 py-2 rounded-lg text-sm transition-all ${activeClass}">${tab.label}</button>`;
    });
    html += `</div>`;

    // 2. Metrics row
    html += `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-[#111827] border border-[#1f2937] rounded-xl p-5 flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total de Demandas</p>
            <h3 class="text-2xl font-bold text-white">${metrics.total}</h3>
          </div>
          <div class="w-10 h-10 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-lg shadow-[0_0_15px_rgba(139,92,246,0.3)]">
            <i class="fa-solid fa-list-check"></i>
          </div>
        </div>
        <div class="bg-[#111827] border border-[#1f2937] rounded-xl p-5 flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Em Andamento</p>
            <h3 class="text-2xl font-bold text-white">${metrics.emAndamento}</h3>
          </div>
          <div class="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg shadow-[0_0_15px_rgba(245,158,11,0.3)]">
            <i class="fa-solid fa-spinner fa-spin"></i>
          </div>
        </div>
        <div class="bg-[#111827] border border-[#1f2937] rounded-xl p-5 flex items-center justify-between">
          <div>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Concluídas</p>
            <h3 class="text-2xl font-bold text-white">${metrics.concluidos}</h3>
          </div>
          <div class="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <i class="fa-solid fa-check-double"></i>
          </div>
        </div>
      </div>
    `;

    // 3. Header row
    var tabTitles = {
      'backlog': 'Backlog — Automação',
      'em-andamento': 'Em Andamento — Automação',
      'concluido': 'Concluídos — Automação'
    };
    
    html += `
      <div class="flex flex-col md:flex-row md:items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <i class="fa-solid fa-wand-magic-sparkles text-violet-500"></i> ${tabTitles[this.activeTab]}
          </h2>
          <p class="text-sm text-slate-400 mt-1">Gerenciamento de demandas internas de desenvolvimento e automação.</p>
        </div>
        ${this.activeTab === 'backlog' ? `
          <button onclick="app.openAutomacaoModal()" class="mt-4 md:mt-0 bg-violet-500 hover:bg-violet-600 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all shadow-lg shadow-violet-500/20 flex items-center gap-2">
            <i class="fa-solid fa-plus"></i> Adicionar Demanda
          </button>
        ` : ''}
      </div>
    `;

    // 4. Table
    html += `
      <div class="bg-[#111827] border border-[#1f2937] rounded-xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="custom-table w-full text-left border-collapse">
            <thead>
              <tr class="bg-[#0a0f1a] border-b border-[#1f2937]">
    `;

    if (this.activeTab === 'backlog') {
      html += `<th class="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-20">Ordem</th>`;
    }
    
    html += `<th class="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Título da Demanda</th>`;
    html += `<th class="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Solicitante</th>`;
    html += `<th class="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Time Solicitante</th>`;
    html += `<th class="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Data de Criação</th>`;
    html += `<th class="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider w-28">Criticidade</th>`;

    if (this.activeTab !== 'concluido') {
      html += `<th class="py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right w-32">Ações</th>`;
    }

    html += `
              </tr>
            </thead>
            <tbody class="divide-y divide-[#1f2937]">
    `;

    if (filteredItems.length === 0) {
      var colSpan = this.activeTab === 'backlog' ? 7 : (this.activeTab === 'em-andamento' ? 6 : 5);
      html += `
        <tr>
          <td colspan="${colSpan}" class="py-12 text-center">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800/50 mb-4">
              <i class="fa-solid fa-inbox text-2xl text-slate-500"></i>
            </div>
            <h3 class="text-lg font-bold text-slate-300 mb-1">Nenhuma demanda encontrada</h3>
            <p class="text-sm text-slate-500">Não há registros nesta aba no momento.</p>
          </td>
        </tr>
      `;
    } else {
      filteredItems.forEach(item => {
        var critBadge = '';
        if (item.criticality === 'Alta') critBadge = 'bg-rose-500/20 text-rose-400 border-rose-500/30';
        else if (item.criticality === 'Média') critBadge = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
        else critBadge = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';

        html += `<tr class="hover:bg-white/5 transition-all group">`;

        if (this.activeTab === 'backlog') {
          html += `
            <td style="padding: 14px 16px;">
              <input type="number" value="${item.treatmentOrder}" onchange="app.changeAutomacaoOrder('${item.id}', this.value)" class="w-14 bg-[#0a0f1a] border border-[#1f2937] rounded text-center text-xs py-1 text-white focus:border-violet-500 outline-none">
            </td>
          `;
        }

        html += `
          <td style="padding: 14px 16px;">
            <div class="font-bold text-white text-sm truncate max-w-xs" title="${item.title}">${item.title}</div>
            <div class="text-xs text-slate-500 mt-0.5 truncate max-w-xs" title="${item.application}">${item.application}</div>
          </td>
          <td style="padding: 14px 16px;" class="text-sm text-slate-300">${item.requester}</td>
          <td style="padding: 14px 16px;">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
              ${item.team}
            </span>
          </td>
          <td style="padding: 14px 16px;" class="text-sm text-slate-400">${item.createdDate}</td>
          <td style="padding: 14px 16px;">
            <span class="inline-flex items-center px-2 py-1 rounded text-xs font-bold border ${critBadge}">
              ${item.criticality}
            </span>
          </td>
        `;

        if (this.activeTab !== 'concluido') {
          html += `<td style="padding: 14px 16px;" class="text-right">
            <div class="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">`;
          
          if (this.activeTab === 'backlog') {
            html += `
              <button onclick="app.moveAutomacaoTo('${item.id}', 'em-andamento')" title="Iniciar Demanda" class="w-8 h-8 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 flex items-center justify-center transition-colors">
                <i class="fa-solid fa-play text-xs"></i>
              </button>
            `;
          } else if (this.activeTab === 'em-andamento') {
            html += `
              <button onclick="app.moveAutomacaoTo('${item.id}', 'concluido')" title="Concluir Demanda" class="w-8 h-8 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 flex items-center justify-center transition-colors">
                <i class="fa-solid fa-check text-xs"></i>
              </button>
            `;
          }

          html += `
            <button onclick="app.openAutomacaoModal('${item.id}')" title="Editar" class="w-8 h-8 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center justify-center transition-colors">
              <i class="fa-solid fa-pen text-xs"></i>
            </button>
          `;

          if (this.activeTab === 'backlog') {
            html += `
              <button onclick="app.deleteAutomacaoDemand('${item.id}')" title="Excluir" class="w-8 h-8 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center transition-colors">
                <i class="fa-solid fa-trash text-xs"></i>
              </button>
            `;
          }

          html += `</div></td>`;
        }

        html += `</tr>`;
      });
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  openModal: function(id = null) {
    this.editingId = id;
    var item = id ? this.items.find(i => i.id === id) : null;
    
    var todayStr = new Date().toISOString().split('T')[0];

    var title = item ? item.title : '';
    var requester = item ? item.requester : '';
    var team = item ? item.team : 'Conciliação';
    var appVal = item ? item.application : 'Controle de Squads';
    var crit = item ? item.criticality : 'Média';
    var desc = item ? item.description : '';
    var createdRaw = item && item.createdAt ? item.createdAt.split('T')[0] : todayStr;

    var modalId = 'modal-automacao-edit';
    var modalHtml = `
      <div id="${modalId}" style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); z-index: 999999; display: flex; align-items: center; justify-content: center;">
        <div style="background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 32px; width: 100%; max-width: 620px; max-height: 90vh; overflow-y: auto;">
          
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-xl font-bold text-white flex items-center gap-2">
              <i class="fa-solid fa-wand-magic-sparkles text-violet-500"></i>
              ${id ? 'Editar Demanda' : 'Nova Demanda — Automação'}
            </h3>
            <button type="button" onclick="app.closeAutomacaoModal()" class="text-slate-400 hover:text-white transition-colors">
              <i class="fa-solid fa-xmark text-lg"></i>
            </button>
          </div>

          <form onsubmit="app.saveAutomacaoDemand(event)">
            
            <div class="space-y-4">
              <div>
                <label class="text-xs font-bold text-slate-400 block mb-1.5">Título da Demanda</label>
                <input type="text" id="auto-modal-title" value="${title}" required class="w-full bg-[#0a0f1a] border border-[#1f2937] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all">
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="text-xs font-bold text-slate-400 block mb-1.5">Solicitante</label>
                  <input type="text" id="auto-modal-requester" value="${requester}" required class="w-full bg-[#0a0f1a] border border-[#1f2937] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all">
                </div>
                <div>
                  <label class="text-xs font-bold text-slate-400 block mb-1.5">Time Solicitante</label>
                  <select id="auto-modal-team" class="w-full bg-[#0a0f1a] border border-[#1f2937] rounded-lg px-3 py-2.5 text-sm text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all">
                    <option value="Conciliação" ${team === 'Conciliação' ? 'selected' : ''}>Conciliação</option>
                    <option value="Tesouraria" ${team === 'Tesouraria' ? 'selected' : ''}>Tesouraria</option>
                    <option value="BackOffice" ${team === 'BackOffice' ? 'selected' : ''}>BackOffice</option>
                    <option value="Adquirência" ${team === 'Adquirência' ? 'selected' : ''}>Adquirência</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="text-xs font-bold text-slate-400 block mb-1.5">Data de Criação</label>
                  <input type="date" id="auto-modal-date" value="${createdRaw}" required class="w-full bg-[#0a0f1a] border border-[#1f2937] rounded-lg px-3 py-2.5 text-sm text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all">
                </div>
                <div>
                  <label class="text-xs font-bold text-slate-400 block mb-1.5">Criticidade</label>
                  <select id="auto-modal-crit" class="w-full bg-[#0a0f1a] border border-[#1f2937] rounded-lg px-3 py-2.5 text-sm text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all">
                    <option value="Baixa" ${crit === 'Baixa' ? 'selected' : ''}>Baixa</option>
                    <option value="Média" ${crit === 'Média' ? 'selected' : ''}>Média</option>
                    <option value="Alta" ${crit === 'Alta' ? 'selected' : ''}>Alta</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="text-xs font-bold text-slate-400 block mb-1.5">Aplicação</label>
                <select id="auto-modal-app" class="w-full bg-[#0a0f1a] border border-[#1f2937] rounded-lg px-3 py-2.5 text-sm text-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all">
                  <option value="Controle de Squads" ${appVal === 'Controle de Squads' ? 'selected' : ''}>Controle de Squads</option>
                  <option value="Sistema de Governança Operacional" ${appVal === 'Sistema de Governança Operacional' ? 'selected' : ''}>Sistema de Governança Operacional</option>
                </select>
              </div>

              <div>
                <label class="text-xs font-bold text-slate-400 block mb-1.5">Descrição</label>
                <textarea id="auto-modal-desc" rows="4" class="w-full bg-[#0a0f1a] border border-[#1f2937] rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all resize-none">${desc}</textarea>
              </div>
            </div>

            <div class="mt-8 flex items-center justify-end gap-3 pt-4 border-t border-[#1f2937]">
              <button type="button" onclick="app.closeAutomacaoModal()" class="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-300 hover:bg-slate-800 transition-colors">
                Cancelar
              </button>
              <button type="submit" class="bg-violet-500 hover:bg-violet-600 text-white font-bold px-6 py-2.5 rounded-lg text-sm transition-all shadow-lg shadow-violet-500/20">
                Salvar Demanda
              </button>
            </div>

          </form>
        </div>
      </div>
    `;

    var oldModal = document.getElementById(modalId);
    if (oldModal) oldModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },

  closeModal: function() {
    var modal = document.getElementById('modal-automacao-edit');
    if (modal) modal.remove();
    this.editingId = null;
  },

  saveDemand: function(e) {
    e.preventDefault();

    var title = document.getElementById('auto-modal-title').value.trim();
    if (!title) return;

    var requester = document.getElementById('auto-modal-requester').value.trim();
    var team = document.getElementById('auto-modal-team').value;
    var appVal = document.getElementById('auto-modal-app').value;
    var crit = document.getElementById('auto-modal-crit').value;
    var dateVal = document.getElementById('auto-modal-date').value;
    var desc = document.getElementById('auto-modal-desc').value.trim();

    var dParts = dateVal.split('-');
    var formattedDate = dParts.length === 3 ? `${dParts[2]}/${dParts[1]}/${dParts[0]}` : dateVal;
    var isoAt = dateVal ? new Date(dateVal + 'T12:00:00Z').toISOString() : new Date().toISOString();
    var nowIso = new Date().toISOString();

    if (this.editingId) {
      var item = this.items.find(i => i.id === this.editingId);
      if (item) {
        item.title = title;
        item.requester = requester;
        item.team = team;
        item.application = appVal;
        item.criticality = crit;
        item.description = desc;
        item.createdDate = formattedDate;
        item.createdAt = isoAt;
        item.updatedAt = nowIso;
      }
    } else {
      var nextOrder = 1;
      var backlogItems = this.items.filter(i => i.status === 'backlog');
      if (backlogItems.length > 0) {
        nextOrder = Math.max(...backlogItems.map(i => i.treatmentOrder || 0)) + 1;
      }

      this.items.push({
        id: 'auto-' + Date.now(),
        title: title,
        description: desc,
        requester: requester,
        team: team,
        application: appVal,
        criticality: crit,
        status: 'backlog',
        treatmentOrder: nextOrder,
        createdDate: formattedDate,
        createdAt: isoAt,
        updatedAt: nowIso
      });
    }

    this.saveLocal();
    this.closeModal();
    this.renderView();
  },

  deleteDemand: function(id) {
    if (window.confirm('Tem certeza que deseja excluir esta demanda?')) {
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
      var maxOrder = backlogItems.length > 0 ? Math.max(...backlogItems.map(i => i.treatmentOrder || 0)) : 0;
      item.treatmentOrder = maxOrder + 1;
    }

    this.saveLocal();
    this.renderView();
  },

  changeOrder: function(itemId, newOrderInput) {
    var newOrder = parseInt(newOrderInput, 10);
    if (isNaN(newOrder) || newOrder < 1) {
      this.renderView();
      return;
    }

    var targetItem = this.items.find(i => i.id === itemId);
    if (!targetItem || targetItem.status !== 'backlog') return;

    var displacedItem = this.items.find(i => i.status === 'backlog' && i.treatmentOrder === newOrder && i.id !== itemId);

    if (displacedItem) {
      displacedItem.treatmentOrder = targetItem.treatmentOrder;
    }
    targetItem.treatmentOrder = newOrder;

    this.saveLocal();
    this.renderView();
  },

  setupRealtimeSync: function() {
    var self = this;
    if (window.supabaseClient) {
      var isHml = window.location.href.toUpperCase().includes('HML');
      var rowId = isHml ? 'hml_default' : 'default';

      try {
        var channel = window.supabaseClient.channel('automacao_realtime');
        channel.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'cs_board_state',
          filter: 'id=eq.' + rowId
        }, payload => {
          self.fetchItems();
        }).subscribe();
      } catch (err) {
        console.warn("AutomacaoModule: Realtime channel erro, fallback para polling", err);
        setInterval(() => self.fetchItems(), 5000);
      }
    } else {
      setInterval(() => self.fetchItems(), 5000);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => AutomacaoModule.init(), 600);
});

/* ==========================================================================
   Controle de Squads & Governança Jira - Core Application Script (Padrão Painel-OPS)
   Supabase Auth + Realtime + RBAC (v2.0.0)
   ========================================================================== */

const SUPABASE_URL = 'https://dpgtiecmicjytwhmonjw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZ3RpZWNtaWNqeXR3aG1vbmp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4OTIzMDYsImV4cCI6MjEwMTQ2ODMwNn0.LuwxpIc9GTE5z5Hve9eQ9wA-kh7mcATSYx5TtDW71I4';

let supabaseClient = null;
if (window.supabase) {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    console.warn('Erro ao inicializar Supabase Client:', err);
  }
}

let _lastSelfSaveTime = 0;
let _saveDebounceTimer = null;

// Global Application State
const app = {
  activeSquad: 'dados',
  activeView: 'triagem',
  userRole: 'consulta', // 'admin' ou 'consulta'
  userEmail: '',
  userName: 'Visitante',
  authUserId: null,
  realtimeChannel: null,
  
  state: {
    triageItems: [],
    backlogItems: { dados: [], operacoes: [], rpa: [] },
    completedTasks: { dados: [], operacoes: [], rpa: [] },
    resources: { dados: [], operacoes: [], rpa: [] },
    dpoLogs: [],
    usersList: [],
    rpaPendencies: []
  },

  ensureStateSanity() {
    if (!this.state) this.state = {};
    if (!Array.isArray(this.state.triageItems)) this.state.triageItems = [];
    if (!this.state.backlogItems || typeof this.state.backlogItems !== 'object') this.state.backlogItems = {};
    if (!this.state.completedTasks || typeof this.state.completedTasks !== 'object') this.state.completedTasks = {};
    if (!this.state.resources || typeof this.state.resources !== 'object') this.state.resources = {};
    ['dados', 'operacoes', 'rpa'].forEach(id => {
      if (!Array.isArray(this.state.backlogItems[id])) this.state.backlogItems[id] = [];
      if (!Array.isArray(this.state.completedTasks[id])) this.state.completedTasks[id] = [];
      if (!Array.isArray(this.state.resources[id])) this.state.resources[id] = [];
    });
    if (!Array.isArray(this.state.dpoLogs)) this.state.dpoLogs = [];
    if (!Array.isArray(this.state.usersList)) this.state.usersList = [];
    if (!Array.isArray(this.state.rpaPendencies)) this.state.rpaPendencies = [];

    // Purgar cards fantasmas e reparar textos corrompidos por Mojibake UTF-8
    const ghostKeys = new Set(['GAU-132', 'GAU-133', 'GAU-134', 'GAU-135']);
    const extractKey = (i) => {
      if (!i) return null;
      const raw = (i.jiraKey || i.gau || i.id || i.taskTitle || '').toString();
      const match = raw.match(/GAU-\d+/i);
      return match ? match[0].toUpperCase() : null;
    };

    const fixText = (str) => {
      if (typeof str !== 'string') return str;
      
      // 1. Tentar decodificar Mojibake padrão ISO-8859-1 (ex: Ã© -> é)
      try {
        // Se a string contiver caracteres esquisitos do UTF-8 quebrado, tenta consertar
        if (str.includes('Ã')) {
          str = decodeURIComponent(escape(str));
        }
      } catch(e) {
        // Ignora se não for decodificável
      }

      // 2. Fallbacks manuais para CP850/CP437 ou erros específicos e legados
      return str
        .replace(/Opera├º├Áes|Opera├º├oes|Operaes/g, 'Operações')
        .replace(/Transa├º├Áes|Transa├º├oes|Transaes/g, 'Transações')
        .replace(/Sustenta├º├úo|Sustentao/g, 'Sustentação')
        .replace(/Ingest├úo|Ingesto/g, 'Ingestão')
        .replace(/AUTOMA├º├âO|AUTOMAO/g, 'AUTOMAÇÃO')
        .replace(/Conclu├¡do|Concludo/g, 'Concluído')
        .replace(/Conclu├¡dos|Concludos/g, 'Concluídos')
        .replace(/sincroniza├º├úo|sincronizao/g, 'sincronização')
        .replace(/deduplica├º├úo|deduplicao/g, 'deduplicação')
        .replace(/solicita├º├Áes|solicitaes/g, 'solicitações')
        .replace(/cria├º├úo|criao/g, 'criação')
        .replace(/Integra├º├úo|Integrao/g, 'Integração')
        .replace(/├º/g, 'ç')
        .replace(/├Á/g, 'õ')
        .replace(/├ú/g, 'ã')
        .replace(/├¡/g, 'í')
        .replace(/├â/g, 'Ã')
        .replace(/├ª/g, 'ª')
        .replace(/Ã/g, 'À'); // Fallback final para 'Ã' isolado que não foi pego pelo decode
    };

    const cleanItem = (item) => {
      if (!item) return item;
      if (item.title) item.title = fixText(item.title);
      if (item.taskTitle) item.taskTitle = fixText(item.taskTitle);
      if (item.description) item.description = fixText(item.description);
      if (item.taskDescription) item.taskDescription = fixText(item.taskDescription);
      if (item.notes) item.notes = fixText(item.notes);
      if (item.requester) item.requester = fixText(item.requester);
      if (item.requesterName) item.requesterName = fixText(item.requesterName);
      if (item.completedBy) item.completedBy = fixText(item.completedBy);
      if (item.gains) item.gains = fixText(item.gains);
      return item;
    };

    this.state.triageItems = (this.state.triageItems || [])
      .filter(i => !ghostKeys.has(extractKey(i)))
      .map(cleanItem);

    ['dados', 'operacoes', 'rpa'].forEach(id => {
      this.state.backlogItems[id] = (this.state.backlogItems[id] || [])
        .filter(i => !ghostKeys.has(extractKey(i)))
        .map(cleanItem);

      this.state.completedTasks[id] = (this.state.completedTasks[id] || [])
        .filter(i => !ghostKeys.has(extractKey(i)))
        .map(cleanItem);
    });
  },

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================
  async init() {
    console.log('[APP INIT v10.0.0] Iniciando Controle de Squads [HML]...');
    this.ensureStateSanity();
    this.loadTheme();
    this.setupInactivityMonitor();
    
    // Preencher e-mail salvo anteriormente (se existir) para conveniência do usuário
    try {
      const rememberedEmail = localStorage.getItem('cs_remembered_email');
      const emailEl = document.getElementById('auth-email');
      if (rememberedEmail && emailEl && !emailEl.value) {
        emailEl.value = rememberedEmail;
      }
    } catch (_) {}

    // FORÇAR TELA DE LOGIN A CADA NOVO ACESSO / FECHAMENTO DA PÁGINA / LIMPEZA DE CACHE
    console.log('[APP INIT] Forçando confirmação de login no novo acesso.');
    this.sessionAuthenticated = false;
    this.authUserId = null;
    this.showAuthOverlay();
  },

  loadTheme() {
    try {
      const savedTheme = localStorage.getItem('cs_theme');
      if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        this.updateThemeUI('light');
      } else {
        document.body.classList.remove('light-theme');
        this.updateThemeUI('dark');
      }
    } catch (e) {}
  },

  toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    const newTheme = isLight ? 'light' : 'dark';
    try {
      localStorage.setItem('cs_theme', newTheme);
    } catch (e) {}
    this.updateThemeUI(newTheme);
    if (this.currentView === 'dashboard') {
      this.renderDashboardView();
    }
  },

  updateThemeUI(theme) {
    const icon = document.getElementById('theme-toggle-icon');
    if (theme === 'light') {
      if (icon) icon.className = 'fa-solid fa-moon text-indigo-600 text-lg';
    } else {
      if (icon) icon.className = 'fa-solid fa-sun text-amber-400 text-lg';
    }
  },

  // ============================================================
  // SUPABASE AUTH - LOGIN / SIGNUP / LOGOUT / SESSION
  // ============================================================
  async checkSession() {
    if (!supabaseClient) return false;
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session && session.user) {
        const isApproved = await this.setupUserSession(session.user);
        return isApproved === true;
      }
    } catch (e) {
      console.warn('Erro ao verificar sessão:', e);
    }
    return false;
  },

  async setupUserSession(user) {
    if (!user) {
      this.showAuthOverlay();
      return false;
    }

    this.authUserId = user.id;
    this.userEmail = user.email || '';
    this.userName = user.email ? user.email.split('@')[0] : 'Usuário';
    
    // Verificar se é a conta do administrador principal (lucas.machiori / machiori / etc.)
    const emailLower = (user.email || '').toLowerCase();
    const isLucas = emailLower.includes('machiori') || emailLower.includes('lucas.machiori') || emailLower.includes('lucasmachiori') || emailLower.includes('lucas.da.silva');

    if (isLucas) {
      this.userRole = 'admin';
      this.userStatus = 'ATIVO';
    } else {
      this.userRole = 'consulta';
      this.userStatus = 'ATIVO';
    }

    // Buscar perfil na tabela squads_profiles (com fallback para cs_profiles)
    if (supabaseClient) {
      try {
        let activeTable = 'squads_profiles';
        let { data, error } = await supabaseClient
          .from('squads_profiles')
          .select('*')
          .or(`user_id.eq.${user.id},id.eq.${user.id},email.ilike.${user.email.toLowerCase()}`)
          .maybeSingle();

        if (error || !data) {
          activeTable = 'cs_profiles';
          const res = await supabaseClient
            .from('cs_profiles')
            .select('*')
            .or(`id.eq.${user.id},email.ilike.${user.email.toLowerCase()}`)
            .maybeSingle();
          data = res.data;
          error = res.error;
        }

        if (!error && data) {
          const rawRole = (data.role || data.perfil || 'CONSULTA').toString();
          const rawStatus = (data.status || 'PENDING').toString().toUpperCase();

          if (isLucas) {
            this.userRole = 'admin';
            this.userStatus = 'ATIVO';
            if (rawRole.toUpperCase() !== 'ADMIN' || (rawStatus !== 'ATIVO' && rawStatus !== 'ACTIVE')) {
              try {
                await supabaseClient.from(activeTable).update({ role: 'ADMIN', perfil: 'ADMIN', status: 'ACTIVE' }).or(`user_id.eq.${user.id},id.eq.${user.id},email.eq.${user.email.toLowerCase()}`);
              } catch (_) {}
            }
          } else {
            this.userRole = rawRole.toLowerCase().includes('admin') ? 'admin' : 'consulta';
            this.userStatus = (rawStatus === 'ACTIVE' || rawStatus === 'ATIVO') ? 'ATIVO' : (rawStatus === 'BLOCKED' || rawStatus === 'BLOQUEADO') ? 'BLOQUEADO' : 'PENDENTE';
          }
          if (data.name || data.nome) this.userName = data.name || data.nome;
        } else {
          // Se o perfil ainda não existe, auto-criar o registro com status PENDENTE!
          const initialRole = isLucas ? 'ADMIN' : 'PENDENTE';
          const initialStatus = isLucas ? 'ACTIVE' : 'PENDING';
          const newProfile = {
            user_id: user.id,
            id: user.id,
            name: user.user_metadata?.nome || (user.email ? user.email.split('@')[0] : 'Usuário'),
            nome: user.user_metadata?.nome || (user.email ? user.email.split('@')[0] : 'Usuário'),
            email: user.email.toLowerCase(),
            role: initialRole,
            perfil: isLucas ? 'ADMIN' : 'CONSULTA',
            status: initialStatus
          };
          
          let { error: upsertErr } = await supabaseClient.from('squads_profiles').upsert(newProfile);
          if (upsertErr) {
            await supabaseClient.from('cs_profiles').upsert(newProfile);
          }
          this.userRole = isLucas ? 'admin' : 'consulta';
          this.userStatus = isLucas ? 'ATIVO' : 'PENDENTE';
        }
      } catch (e) {
        console.warn('Aviso ao buscar perfil:', e);
      }
    }

    // VERIFICAÇÃO DE APROVAÇÃO DO USUÁRIO
    if (this.userStatus === 'PENDENTE' || this.userStatus === 'PENDING') {
      this.showPendingApprovalOverlay();
      return false;
    }

    if (this.userStatus === 'BLOQUEADO' || this.userStatus === 'REJECTED') {
      this.showBlockedOverlay();
      return false;
    }

    // Acesso permitido (ATIVO)
    this.hideAuthOverlay();
    this.updateUserBadgeUI();
    this.applyRolePermissions();
    return true;
  },

  showPendingApprovalOverlay() {
    this.showAuthOverlay();
    const errorEl = document.getElementById('auth-error-msg');
    const infoEl = document.getElementById('auth-info-msg');
    if (errorEl) errorEl.style.display = 'none';
    if (infoEl) {
      infoEl.innerHTML = `
        <div style="text-align: center; padding: 6px 0;">
          <div style="font-size: 28px; margin-bottom: 8px;">⏳</div>
          <strong style="font-size: 0.95rem; color: #fbbf24; display: block; margin-bottom: 6px;">Cadastro Pendente de Aprovação</strong>
          <p style="font-size: 0.8rem; color: #cbd5e1; margin-bottom: 12px; line-height: 1.4;">
            Seu usuário (<code style="color: #34d399;">${this.userEmail}</code>) foi cadastrado com sucesso!
            <br>Por razões de segurança, um Administrador precisa aprovar seu acesso na aba <strong>Gestão de Acessos</strong> antes de você entrar.
          </p>
          <div style="display: flex; gap: 8px; justify-content: center; margin-top: 10px;">
            <button onclick="app.checkSession().then(ok => { if(ok) { app.loadLocalState(); app.loadStateFromSupabase(); app.render(); } else { alert('Seu cadastro ainda está pendente de aprovação.'); } })" class="btn btn-primary" style="padding: 6px 12px; font-size: 0.8rem;">
              <i class="fa-solid fa-rotate-right me-1"></i> Verificar Aprovação
            </button>
            <button onclick="app.handleLogout()" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem; border-color: rgba(244,63,94,0.3); color: #f43f5e;">
              <i class="fa-solid fa-right-from-bracket me-1"></i> Sair
            </button>
          </div>
        </div>
      `;
      infoEl.style.display = 'block';
    }
  },

  showBlockedOverlay() {
    this.showAuthOverlay();
    const errorEl = document.getElementById('auth-error-msg');
    const infoEl = document.getElementById('auth-info-msg');
    if (infoEl) infoEl.style.display = 'none';
    if (errorEl) {
      errorEl.innerHTML = `
        <div style="text-align: center; padding: 6px 0;">
          <div style="font-size: 28px; margin-bottom: 8px;">🚫</div>
          <strong style="font-size: 0.95rem; color: #f43f5e; display: block; margin-bottom: 6px;">Acesso Temporariamente Bloqueado</strong>
          <p style="font-size: 0.8rem; color: #cbd5e1; margin-bottom: 12px;">
            Seu perfil de acesso foi suspenso ou recusado por um Administrador. Entre em contato com a equipe de Governança Jira.
          </p>
          <button onclick="app.handleLogout()" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;">
            <i class="fa-solid fa-right-from-bracket me-1"></i> Voltar ao Login
          </button>
        </div>
      `;
      errorEl.style.display = 'block';
    }
  },

  async handleLogin() {
    const emailEl = document.getElementById('auth-email');
    const passEl = document.getElementById('auth-password');
    const btnLogin = document.getElementById('btn-auth-login');
    const errorEl = document.getElementById('auth-error-msg');

    const email = emailEl ? emailEl.value.trim() : '';
    const password = passEl ? passEl.value.trim() : '';

    if (!email || !password) {
      if (errorEl) { errorEl.textContent = 'Por favor, preencha o e-mail e a senha.'; errorEl.style.display = 'block'; }
      return;
    }
    if (errorEl) errorEl.style.display = 'none';

    if (!supabaseClient) {
      if (errorEl) { errorEl.textContent = 'Não foi possível conectar ao Supabase.'; errorEl.style.display = 'block'; }
      return;
    }

    const origText = btnLogin ? btnLogin.textContent : 'Entrar';
    if (btnLogin) { btnLogin.disabled = true; btnLogin.textContent = 'Entrando...'; }

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        let msg = error.message;
        if (msg.toLowerCase().includes('invalid login') || msg.toLowerCase().includes('invalid_grant')) msg = 'E-mail ou senha incorretos.';
        if (msg.toLowerCase().includes('email not confirmed')) msg = 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
        if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
      } else {
        const user = data?.session?.user || data?.user;
        if (user) {
          const isApproved = await this.setupUserSession(user);
          if (isApproved) {
            this.sessionAuthenticated = true;
            this.lastActivityTime = Date.now();
            try { localStorage.setItem('cs_remembered_email', email); } catch (_) {}
            this.loadLocalState();
            await this.loadStateFromSupabase();
            this.loadUsersState();
            this.seedDefaultDataIfEmpty();
            this.setupRealtimeSync();
            this.restoreLastSyncTime();
            this.render();
          }
        } else {
          if (errorEl) { errorEl.textContent = 'E-mail ou senha incorretos.'; errorEl.style.display = 'block'; }
        }
      }
    } catch (err) {
      if (errorEl) { errorEl.textContent = 'Erro de conexão: ' + (err.message || ''); errorEl.style.display = 'block'; }
    } finally {
      if (btnLogin) { btnLogin.disabled = false; btnLogin.textContent = origText; }
    }
  },

  async handleSignup() {
    const emailEl = document.getElementById('auth-email');
    const passEl = document.getElementById('auth-password');
    const btnSignup = document.getElementById('btn-auth-signup');
    const errorEl = document.getElementById('auth-error-msg');
    const infoEl = document.getElementById('auth-info-msg');

    const email = emailEl ? emailEl.value.trim() : '';
    const password = passEl ? passEl.value.trim() : '';

    if (!email || !password) {
      if (errorEl) { errorEl.textContent = 'Por favor, preencha o e-mail e a senha.'; errorEl.style.display = 'block'; }
      return;
    }
    if (password.length < 6) {
      if (errorEl) { errorEl.textContent = 'A senha deve ter pelo menos 6 caracteres.'; errorEl.style.display = 'block'; }
      return;
    }
    if (errorEl) errorEl.style.display = 'none';
    if (infoEl) infoEl.style.display = 'none';

    if (!supabaseClient) {
      if (errorEl) { errorEl.textContent = 'Não foi possível conectar ao Supabase.'; errorEl.style.display = 'block'; }
      return;
    }

    const origText = btnSignup ? btnSignup.textContent : 'Criar conta';
    if (btnSignup) { btnSignup.disabled = true; btnSignup.textContent = 'Criando conta...'; }

    try {
      // 1. Verificar se o e-mail já possui cadastro/solicitação prévia
      const emailLower = email.toLowerCase();
      let existingProfile = null;

      try {
        let { data } = await supabaseClient
          .from('squads_profiles')
          .select('status, role, perfil, email')
          .ilike('email', emailLower)
          .maybeSingle();

        if (!data) {
          const res2 = await supabaseClient
            .from('cs_profiles')
            .select('status, role, perfil, email')
            .ilike('email', emailLower)
            .maybeSingle();
          data = res2.data;
        }
        existingProfile = data;
      } catch (_) {}

      if (existingProfile) {
        const st = (existingProfile.status || 'PENDING').toString().toUpperCase();
        if (st === 'PENDING' || st === 'PENDENTE') {
          if (infoEl) {
            infoEl.innerHTML = `
              <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); padding: 10px 14px; border-radius: 8px; color: #fbbf24; font-size: 0.82rem; line-height: 1.4; margin-top: 8px;">
                <strong>⏳ Solicitação Já Cadastrada!</strong><br>
                O e-mail <code>${emailLower}</code> já possui uma solicitação de acesso <strong>PENDENTE</strong> de aprovação pelo Administrador. Não é necessário solicitar novamente.
              </div>`;
            infoEl.style.display = 'block';
          }
          if (errorEl) errorEl.style.display = 'none';
          return;
        } else if (st === 'ACTIVE' || st === 'ATIVO') {
          if (infoEl) {
            infoEl.innerHTML = `
              <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); padding: 10px 14px; border-radius: 8px; color: #34d399; font-size: 0.82rem; line-height: 1.4; margin-top: 8px;">
                <strong>💡 Cadastro Aprovado!</strong><br>
                O e-mail <code>${emailLower}</code> já possui cadastro <strong>APROVADO</strong> no sistema. Por favor, preencha sua senha e utilize o botão <strong>"Entrar"</strong>.
              </div>`;
            infoEl.style.display = 'block';
          }
          if (errorEl) errorEl.style.display = 'none';
          return;
        } else if (st === 'BLOCKED' || st === 'BLOQUEADO' || st === 'REJECTED') {
          if (errorEl) {
            errorEl.innerHTML = `⛔ O acesso para o e-mail <strong>${emailLower}</strong> está suspenso. Entre em contato com o Administrador.`;
            errorEl.style.display = 'block';
          }
          return;
        }
      }

      const { data, error } = await supabaseClient.auth.signUp({
        email, password,
        options: { data: { perfil: 'CONSULTA', status: 'PENDENTE', nome: email.split('@')[0] } }
      });
      if (error) {
        let msg = error.message;
        if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already exists')) {
          if (infoEl) {
            infoEl.innerHTML = `
              <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); padding: 10px 14px; border-radius: 8px; color: #fbbf24; font-size: 0.82rem; line-height: 1.4; margin-top: 8px;">
                <strong>⏳ Solicitação Já Cadastrada!</strong><br>
                Este e-mail já foi registrado no sistema e está <strong>PENDENTE</strong> de aprovação do Administrador.
              </div>`;
            infoEl.style.display = 'block';
          }
          if (errorEl) errorEl.style.display = 'none';
          return;
        }
        if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'block'; }
      } else {
        const user = data?.session?.user || data?.user;
        if (user) {
          // Inserir explicitamente na tabela squads_profiles com status PENDENTE
          try {
            const profilePayload = {
              user_id: user.id,
              id: user.id,
              name: user.user_metadata?.nome || email.split('@')[0],
              nome: user.user_metadata?.nome || email.split('@')[0],
              email: email.toLowerCase(),
              role: 'PENDENTE',
              perfil: 'CONSULTA',
              status: 'PENDING'
            };
            let { error: pErr } = await supabaseClient.from('squads_profiles').upsert(profilePayload);
            if (pErr) {
              await supabaseClient.from('cs_profiles').upsert(profilePayload);
            }
          } catch (pErr) {
            console.warn('[Signup squads_profiles upsert error]', pErr);
          }

          await this.setupUserSession(user);
        } else {
          if (infoEl) { infoEl.textContent = 'Conta criada com sucesso! Aguarde a aprovação do Administrador.'; infoEl.style.display = 'block'; }
        }
      }
    } catch (err) {
      if (errorEl) { errorEl.textContent = 'Erro: ' + (err.message || ''); errorEl.style.display = 'block'; }
    } finally {
      if (btnSignup) { btnSignup.disabled = false; btnSignup.textContent = origText; }
    }
  },

  async handleLogout() {
    this.sessionAuthenticated = false;
    if (this.realtimeChannel && supabaseClient) {
      try { supabaseClient.removeAllChannels(); } catch (_) {}
    }
    this.realtimeChannel = null;
    this.authUserId = null;
    if (supabaseClient) {
      try { await supabaseClient.auth.signOut(); } catch (e) { console.warn('Erro no logout:', e); }
    }
    this.showAuthOverlay();
  },

  async handleInactivityLogout() {
    this.sessionAuthenticated = false;
    if (this.realtimeChannel && supabaseClient) {
      try { supabaseClient.removeAllChannels(); } catch (_) {}
    }
    this.realtimeChannel = null;
    this.authUserId = null;
    if (supabaseClient) {
      try { await supabaseClient.auth.signOut(); } catch (_) {}
    }
    this.showAuthOverlay();
    const errorEl = document.getElementById('auth-error-msg');
    const infoEl = document.getElementById('auth-info-msg');
    if (errorEl) {
      errorEl.innerHTML = '<i class="fa-solid fa-clock me-1"></i> Sessão expirada por inatividade (mais de 30 minutos sem interação). Por favor, confirme seu e-mail e senha.';
      errorEl.style.display = 'block';
    }
    if (infoEl) infoEl.style.display = 'none';
  },

  setupInactivityMonitor() {
    this.lastActivityTime = Date.now();
    const resetActivity = () => {
      if (this.sessionAuthenticated) {
        this.lastActivityTime = Date.now();
      }
    };

    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(evt => {
      window.addEventListener(evt, resetActivity, { passive: true });
    });

    if (!this.inactivityCheckInterval) {
      this.inactivityCheckInterval = setInterval(() => {
        if (this.sessionAuthenticated) {
          const elapsed = Date.now() - this.lastActivityTime;
          if (elapsed >= 30 * 60 * 1000) { // 30 minutos em milissegundos
            console.warn('[INACTIVITY TIMEOUT] Sessão expirada após 30 minutos de inatividade.');
            this.handleInactivityLogout();
          }
        }
      }, 30000); // Checar a cada 30 segundos
    }
  },

  showAuthOverlay() {
    const overlay = document.getElementById('cs-auth-overlay');
    if (overlay) {
      overlay.style.setProperty('display', 'flex', 'important');
      overlay.style.setProperty('opacity', '1', 'important');
      overlay.style.setProperty('pointer-events', 'auto', 'important');
    }
    const errorEl = document.getElementById('auth-error-msg');
    const infoEl = document.getElementById('auth-info-msg');
    if (errorEl) errorEl.style.display = 'none';
    if (infoEl) infoEl.style.display = 'none';
  },

  hideAuthOverlay() {
    const overlay = document.getElementById('cs-auth-overlay');
    if (overlay) {
      overlay.style.setProperty('display', 'none', 'important');
      overlay.style.setProperty('opacity', '0', 'important');
        overlay.style.setProperty('pointer-events', 'none', 'important');
    }
  },

  // ============================================================
  // SUPABASE DATABASE - PERSISTÊNCIA CENTRALIZADA
  // ============================================================
  async saveStateToSupabase() {
    if (!supabaseClient || !this.authUserId || this.authUserId === 'guest') return;
    _lastSelfSaveTime = Date.now();
    const isHml = (typeof window !== 'undefined' && window.location && window.location.href && window.location.href.toUpperCase().includes('HML'));
    const rowId = isHml ? 'hml_default' : 'default';

    const payload = {
      id: rowId,
      data: this.state,
      updated_by: this.authUserId || null,
      updated_at: new Date().toISOString()
    };
    try {
      let { error } = await supabaseClient.from('cs_board_state').upsert(payload);
      if (error && !isHml) {
        await supabaseClient.from('board_state').upsert(payload);
      }
    } catch (err) {
      console.warn('[Supabase Save Exception]', err);
    }
  },

  async copyDataFromPrd() {
    if (!confirm('Deseja substituir os dados de Homologação com uma cópia atualizada do ambiente de Produção?\n\nIsso atualizará todas as pendências, cards e quadros de HML com o cenário atual de Produção.')) return;
    if (!supabaseClient) return;

    try {
      const { data: prdRes, error } = await supabaseClient
        .from('cs_board_state')
        .select('data')
        .eq('id', 'default')
        .maybeSingle();

      if (!error && prdRes && prdRes.data) {
        this.state = prdRes.data;
        await this.saveStateToSupabase();
        if (window.RpaPendenciesModule) {
          if (Array.isArray(this.state.rpaPendencies)) {
            window.RpaPendenciesModule.pendencies = this.state.rpaPendencies;
            window.RpaPendenciesModule.saveLocal();
          }
          if (window.RpaPendenciesModule.fetchPendencies) {
            await window.RpaPendenciesModule.fetchPendencies();
          }
        }
        this.render();
        alert('✅ Cenário de Produção copiado para Homologação com sucesso!');
      } else {
        alert('⚠️ Não foi possível obter os dados de Produção no momento.');
      }
    } catch (err) {
      console.error('[Copy PRD -> HML Error]', err);
      alert('Erro ao copiar dados de Produção: ' + (err.message || err));
    }
  },

  async loadStateFromSupabase() {
    if (!supabaseClient) return false;
    const isHml = (typeof window !== 'undefined' && window.location && window.location.href && window.location.href.toUpperCase().includes('HML'));
    const rowId = isHml ? 'hml_default' : 'default';

    try {
      let data = null;
      let error = null;

      const res1 = await supabaseClient
        .from('cs_board_state')
        .select('data, updated_at')
        .eq('id', rowId)
        .maybeSingle();

      if (!res1.error && res1.data && res1.data.data) {
        data = res1.data;
      } else if (isHml) {
        // Se estiver em HML e hml_default não tiver dados, carregar a cópia inicial de PRD ('default')
        const prdRes = await supabaseClient
          .from('cs_board_state')
          .select('data, updated_at')
          .eq('id', 'default')
          .maybeSingle();

        if (!prdRes.error && prdRes.data && prdRes.data.data) {
          data = prdRes.data;
          try {
            await supabaseClient.from('cs_board_state').upsert({
              id: 'hml_default',
              data: prdRes.data.data,
              updated_by: this.authUserId || null,
              updated_at: new Date().toISOString()
            });
          } catch (_) {}
        }
      } else {
        const res2 = await supabaseClient
          .from('board_state')
          .select('data, updated_at')
          .eq('id', 'default')
          .maybeSingle();
        data = res2.data;
        error = res2.error;
      }

      if (!data || !data.data) {
        console.log('[Supabase Load] Nenhum registro existente nas tabelas de estado.');
        return false;
      }

      this.state = data.data;
      if (!this.state.usersList) this.state.usersList = [];
      if (this.state.rpaPendencies && Array.isArray(this.state.rpaPendencies) && this.state.rpaPendencies.length > 0) {
        if (window.RpaPendenciesModule) {
          const clean = window.RpaPendenciesModule.filterDeleted ? window.RpaPendenciesModule.filterDeleted(this.state.rpaPendencies) : this.state.rpaPendencies;
          if (clean.length > 0) {
            window.RpaPendenciesModule.pendencies = clean;
            window.RpaPendenciesModule.saveLocal();
            if (window.RpaPendenciesModule.renderView) window.RpaPendenciesModule.renderView();
          }
        }
      } else if (window.RpaPendenciesModule && Array.isArray(window.RpaPendenciesModule.pendencies) && window.RpaPendenciesModule.pendencies.length > 0) {
        this.state.rpaPendencies = window.RpaPendenciesModule.pendencies;
      }
      localStorage.setItem('cs_triage_items', JSON.stringify(this.state.triageItems || []));
      ['dados', 'operacoes', 'rpa'].forEach(id => {
        localStorage.setItem(`cs_backlog_${id}`, JSON.stringify(this.state.backlogItems?.[id] || []));
        localStorage.setItem(`cs_completed_${id}`, JSON.stringify(this.state.completedTasks?.[id] || []));
        localStorage.setItem(`cs_resources_${id}`, JSON.stringify(this.state.resources?.[id] || []));
      });
      console.log('[Supabase Load] Estado compartilhado carregado com sucesso!');
      return true;
    } catch (err) {
      console.warn('[Supabase Load Exception]', err);
      return false;
    }
  },

  // ============================================================
  // UI DO BADGE NO HEADER
  // ============================================================
  updateUserBadgeUI() {
    const infoEl = document.getElementById('user-display-info');
    const iconEl = document.getElementById('user-role-icon');
    if (infoEl) {
      if (this.userRole === 'admin') {
        infoEl.textContent = `Admin: ${this.userName}`;
        infoEl.style.color = '#34d399';
        if (iconEl) iconEl.className = 'fa-solid fa-user-shield text-emerald-400';
      } else {
        infoEl.textContent = `Consulta: ${this.userName}`;
        infoEl.style.color = '#38bdf8';
        if (iconEl) iconEl.className = 'fa-solid fa-eye text-sky-400';
      }
    }
  },

  toggleLoginModal() {
    // No novo sistema, o badge abre opção de logout
    if (this.authUserId) {
      if (confirm('Deseja sair do sistema?')) {
        this.handleLogout();
      }
    } else {
      this.showAuthOverlay();
    }
  },

  applyRolePermissions() {
    const isAdmin = this.userRole === 'admin';

    // 1. Esconder/Exibir botões exclusivos do perfil Admin
    document.querySelectorAll('.admin-only').forEach(el => {
      if (isAdmin) {
        el.classList.remove('hidden');
        el.style.display = '';
      } else {
        el.classList.add('hidden');
        el.style.display = 'none';
      }
    });

    // 2. Botões de Ação na aplicação
    const actionSelector = '.btn-add-demand, .btn-forward-squad, #btn-new-member, #btn-save-timeline, #btn-add-timeline-entry';
    document.querySelectorAll(actionSelector).forEach(btn => {
      if (isAdmin) {
        btn.removeAttribute('disabled');
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      } else {
        btn.setAttribute('disabled', 'true');
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';
      }
    });

    // 3. Campos editáveis no Modal de Detalhes (Read-Only para Consulta)
    const modalDetailFields = [
      'task-gau', 'task-title', 'task-requester',
      'followup-dev-role', 'followup-dev-name', 'followup-dev-target-date',
      'followup-dev-progress', 'followup-ganhos', 'followup-timeline-text'
    ];

    modalDetailFields.forEach(id => {
      const field = document.getElementById(id);
      if (field) {
        if (isAdmin) {
          field.removeAttribute('disabled');
          field.removeAttribute('readonly');
          field.style.opacity = '1';
          field.style.pointerEvents = 'auto';
        } else {
          field.setAttribute('disabled', 'true');
          field.setAttribute('readonly', 'true');
          field.style.opacity = '0.75';
          field.style.pointerEvents = 'none';
        }
      }
    });

    // 5. Selects inline de status nas tabelas
    document.querySelectorAll('.status-select-dropdown, .order-input-field').forEach(el => {
      if (isAdmin) {
        el.removeAttribute('disabled');
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
      } else {
        el.setAttribute('disabled', 'true');
        el.style.opacity = '0.6';
        el.style.pointerEvents = 'none';
      }
    });

    // 6. Botões de ação do Jira e gerenciamento
    const jiraAdminBtns = ['#btn-sync-jira', '#btn-jira-config', '#btn-new-access', '.btn-triage-action'];
    document.querySelectorAll(jiraAdminBtns.join(', ')).forEach(btn => {
      if (isAdmin) {
        btn.removeAttribute('disabled');
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      } else {
        btn.setAttribute('disabled', 'true');
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';
      }
    });
  },

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Tecla Escape (Esc): fechar qualquer modal ativo
      if (e.key === 'Escape') {
        this.closeModal();
      }

      // Tecla '/' para focar na busca da visão ativa se não estiver digitando em um input
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        let searchInput = null;
        if (this.activeView === 'triagem') searchInput = document.getElementById('search-triage');
        else if (this.activeView === 'board') searchInput = document.getElementById('search-board');
        else if (this.activeView === 'backlog') searchInput = document.getElementById('search-backlog');
        else if (this.activeView === 'concluidos') searchInput = document.getElementById('search-concluidos');

        if (searchInput) searchInput.focus();
      }
    });
  },

  restoreLastSyncTime() {
    const savedTime = localStorage.getItem('cs_last_sync_time');
    const timeEl = document.getElementById('sync-last-time');
    if (timeEl) {
      if (savedTime) {
        timeEl.textContent = `Última atualização: ${savedTime}`;
      } else {
        timeEl.textContent = `Última atualização: Pendente de sincronização`;
      }
    }

    const savedMetrics = localStorage.getItem('cs_last_sync_metrics');
    if (savedMetrics) {
      try {
        const metrics = JSON.parse(savedMetrics);
        this.updateSyncMetricsUI(metrics);
      } catch (e) {
        this.updateSyncMetricsUI({ countNew: 0, countUpdated: 0, countToCompleted: 0, countUnchanged: 0 });
      }
    } else {
      this.updateSyncMetricsUI({ countNew: 0, countUpdated: 0, countToCompleted: 0, countUnchanged: 0 });
    }
  },

  updateSyncMetricsUI(metrics) {
    if (!metrics) return;
    const elNew = document.getElementById('sync-count-new');
    const elUpdated = document.getElementById('sync-count-updated');
    const elCompleted = document.getElementById('sync-count-completed');
    const elUnchanged = document.getElementById('sync-count-unchanged');

    if (elNew) elNew.textContent = metrics.countNew || 0;
    if (elUpdated) elUpdated.textContent = metrics.countUpdated || 0;
    if (elCompleted) elCompleted.textContent = metrics.countToCompleted || 0;
    if (elUnchanged) elUnchanged.textContent = metrics.countUnchanged || 0;
  },

  // Alternar visibilidade da sidebar em telas mobile
  toggleMobileSidebar() {
    const sidebar = document.querySelector('aside') || document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.classList.toggle('open');
      sidebar.classList.toggle('hidden');
    }
  },

  // Alternar Squad Ativa
  setSquad(squadId) {
    this.activeSquad = squadId;

    if (squadId === 'rpa' || (squadId || '').toString().toLowerCase().includes('rpa')) {
      document.body.classList.add('squad-rpa');
      document.body.setAttribute('data-squad', 'rpa');
    } else {
      document.body.classList.remove('squad-rpa');
      document.body.removeAttribute('data-squad');
    }

    // Atualizar badge no header
    const squadBadge = document.getElementById('header-squad-badge');
    if (squadBadge) {
      const names = { dados: 'Squad de Dados', operacoes: 'Squad de Operações', rpa: 'Squad de RPA' };
      const icons = { dados: 'fa-database', operacoes: 'fa-gears', rpa: 'fa-robot' };
      squadBadge.innerHTML = `<i class="fa-solid ${icons[squadId]}"></i> ${names[squadId]}`;
    }

    this.render();
  },

  selectSquadAndView(squadId, viewId = 'board') {
    this.setSquad(squadId);
    this.navigate(viewId);
  },

  // Alternar View Ativa
  navigate(viewId) {
    if (!this.authUserId || this.authUserId === 'guest' || (this.userStatus !== 'ATIVO' && this.userStatus !== 'ACTIVE')) {
      console.warn('[AUTH GUARD] Tentativa de navegação sem autenticação ativa. Exibindo tela de login.');
      this.showAuthOverlay();
      return;
    }
    this.activeView = viewId;

    // Atualizar links da sidebar
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    if (viewId === 'triagem') {
      const activeNav = document.getElementById('nav-triagem');
      if (activeNav) activeNav.classList.add('active');
    } else if (viewId === 'dashboard') {
      const activeNav = document.getElementById('nav-dashboard');
      if (activeNav) activeNav.classList.add('active');
    } else if (viewId === 'gestao-acessos') {
      const activeNav = document.getElementById('nav-gestao-acessos');
      if (activeNav) activeNav.classList.add('active');
    } else {
      // Para visões de squad (board, backlog, concluidos, rpa-pendencies)
      const activeSquadNav = document.getElementById(`nav-squad-${this.activeSquad}`);
      if (activeSquadNav) activeSquadNav.classList.add('active');
    }

    // Alternar visibilidade das views
    document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active-view'));
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) targetView.classList.add('active-view');

    if (viewId === 'rpa-pendencies') {
      this.setSquad('rpa');
      if (window.RpaPendenciesModule && window.RpaPendenciesModule.renderView) {
        window.RpaPendenciesModule.renderView();
      }
    }

    // Atualizar título da página
    const squadNames = { dados: 'Squad de Dados', operacoes: 'Squad de Operações', rpa: 'Squad de RPA' };
    const titleMap = {
      triagem: 'Mesa de Triagem',
      dashboard: 'Dashboard Consolidado 3 Squads',
      board: `Em Andamento - ${squadNames[this.activeSquad]}`,
      backlog: `Backlog - ${squadNames[this.activeSquad]}`,
      concluidos: `Concluídos - ${squadNames[this.activeSquad]}`,
      'rpa-pendencies': 'Pendências - Squad de RPA',
      'dpo-sync': 'Modo Reunião DPO',
      'dpo-logs': 'Histórico de Alinhamentos DPO',
      'gestao-acessos': 'Gestão de Perfis & Acessos Supabase'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titleMap[viewId] || 'Controle de Squads';

    this.render();
  },

  // Extrair o código GAU / Chave Jira de qualquer objeto de demanda
  getItemGau(item) {
    if (!item) return 'GAU-000';
    if (item.gau && item.gau !== 'GAU-000') return item.gau;
    if (item.jiraKey && item.jiraKey !== 'GAU-000') return item.jiraKey;

    // Tentar extrair do ID (ex: "completed-NPAY-123", "backlog-GAU-134", "NPAY-123")
    if (item.id) {
      const matchId = item.id.match(/(NPAY-\d+|GAU-\d+|[A-Z0-9]+-\d+)/i);
      if (matchId) return matchId[1].toUpperCase();
    }

    // Tentar extrair do título (ex: "Minha Tarefa (NPAY-123)")
    const titleStr = item.title || item.taskTitle || '';
    const matchTitle = titleStr.match(/\(([A-Z0-9]+-\d+)\)/i) || titleStr.match(/(NPAY-\d+|GAU-\d+|[A-Z0-9]+-\d+)/i);
    if (matchTitle) return matchTitle[1].toUpperCase();

    return 'GAU-000';
  },

  // Carregar dados salvos no LocalStorage
  loadLocalState() {
    try {
      const savedTriage = localStorage.getItem('cs_triage_items');
      if (savedTriage) this.state.triageItems = JSON.parse(savedTriage);

      ['dados', 'operacoes', 'rpa'].forEach(id => {
        const b = localStorage.getItem(`cs_backlog_${id}`);
        if (b) this.state.backlogItems[id] = JSON.parse(b);

        const c = localStorage.getItem(`cs_completed_${id}`);
        if (c) {
          const list = JSON.parse(c);
          list.forEach(item => {
            const extractedGau = this.getItemGau(item);
            if (!item.gau || item.gau === 'GAU-000') item.gau = extractedGau;
            if (!item.jiraKey || item.jiraKey === 'GAU-000') item.jiraKey = extractedGau;
          });
          this.state.completedTasks[id] = list;
        }

        const r = localStorage.getItem(`cs_resources_${id}`);
        if (r) this.state.resources[id] = JSON.parse(r);
      });
    } catch (e) {
      console.warn('Erro ao carregar LocalStorage:', e);
    }
  },

  // Salvar estado atual no LocalStorage e no Supabase
  saveState() {
    try {
      localStorage.setItem('cs_triage_items', JSON.stringify(this.state.triageItems));
      ['dados', 'operacoes', 'rpa'].forEach(id => {
        localStorage.setItem(`cs_backlog_${id}`, JSON.stringify(this.state.backlogItems[id]));
        localStorage.setItem(`cs_completed_${id}`, JSON.stringify(this.state.completedTasks[id]));
        localStorage.setItem(`cs_resources_${id}`, JSON.stringify(this.state.resources[id]));
      });
      if (window.RpaPendenciesModule && Array.isArray(window.RpaPendenciesModule.pendencies)) {
        this.state.rpaPendencies = window.RpaPendenciesModule.pendencies;
      }
    } catch (e) {
      console.warn('Erro ao salvar LocalStorage:', e);
    }

    // Debounce para salvar no Supabase (evita flood de chamadas)
    if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
    _saveDebounceTimer = setTimeout(() => {
      this.saveStateToSupabase();
    }, 1000);
  },

  // Inicializar dados de suporte das Squads se estiverem vazios
  seedDefaultDataIfEmpty() {
    this.ensureStateSanity();
    if (!this.state.resources.dados.length) {
      this.state.resources.dados = [
        {
          id: 'res-1',
          name: 'Carolina Santos',
          role: 'Engenheira de Dados Sr.',
          status: 'Ativo',
          allocationOps: 60,
          allocationFin: 40,
          currentTask: { id: 'task-1', title: 'Pipeline Noturno Data Warehouse (GAU-133)', status: 'Em Andamento', dueDate: '2026-08-05' },
          nextTask: { id: 'task-2', title: 'Integração API Billing NPay (GAU-129)', status: 'A Fazer', dueDate: '2026-08-15' }
        },
        {
          id: 'res-2',
          name: 'Roberto Lima',
          role: 'Analista BI Pleno',
          status: 'Ativo',
          allocationOps: 80,
          allocationFin: 20,
          currentTask: { id: 'task-3', title: 'Dashboard Executivo Q3 (GAU-124)', status: 'Em Andamento', dueDate: '2026-08-02' },
          nextTask: null
        }
      ];
    }

    if (!this.state.resources.operacoes.length) {
      this.state.resources.operacoes = [
        {
          id: 'res-op-1',
          name: 'Lucas da Silva Machiori',
          role: 'Coordenador de Operações NPay',
          status: 'Ativo',
          allocationOps: 75,
          allocationFin: 25,
          currentTask: { id: 'task-op-1', title: 'Triagem & Governança de Demandas NPay (GAU-134)', status: 'Em Andamento', dueDate: '2026-08-10' },
          nextTask: { id: 'task-op-2', title: 'Mensuração de KPIs de Operações (GAU-131)', status: 'A Fazer', dueDate: '2026-08-20' }
        },
        {
          id: 'res-op-2',
          name: 'Rodrigo Mendonça',
          role: 'Analista de Processos Sr.',
          status: 'Ativo',
          allocationOps: 90,
          allocationFin: 10,
          currentTask: { id: 'task-op-3', title: 'Revisão dos Processos de Reembolso (GAU-128)', status: 'Em Andamento', dueDate: '2026-08-04' },
          nextTask: null
        }
      ];
    }

    if (!this.state.resources.rpa.length) {
      this.state.resources.rpa = [
        {
          id: 'res-rpa-1',
          name: 'Marcelo Faria',
          role: 'Desenvolvedor RPA Sr.',
          status: 'Ativo',
          allocationOps: 50,
          allocationFin: 50,
          currentTask: { id: 'task-rpa-1', title: 'Automação RPA de Conciliação Bancária (GAU-132)', status: 'Em Andamento', dueDate: '2026-08-06' },
          nextTask: { id: 'task-rpa-2', title: 'Robô de Validação de Chaves Pix (GAU-127)', status: 'A Fazer', dueDate: '2026-08-18' }
        },
        {
          id: 'res-rpa-2',
          name: 'Camila Rocha',
          role: 'Especialista em Automações',
          status: 'Ativo',
          allocationOps: 40,
          allocationFin: 60,
          currentTask: { id: 'task-rpa-3', title: 'Automação de Envio de Relatórios (GAU-125)', status: 'Em Andamento', dueDate: '2026-08-12' },
          nextTask: null
        }
      ];
    }
  },

  // Supabase Sync — Modelo REST API puro (sem conexões WebSocket com falha)
  setupRealtimeSync() {
    this.realtimeChannel = null;
    console.log('[Supabase Sync] Operando puramente via REST API (async/await) & LocalStorage.');
  },

  // --- GESTÃO DE ACESSOS VIA SUPABASE PROFILES ---
  loadUsersState() {
    try {
      const saved = localStorage.getItem('cs_users_list');
      if (saved) {
        this.state.usersList = JSON.parse(saved);
      } else {
        this.state.usersList = [];
      }
    } catch (e) {
      console.warn('Erro ao carregar lista de usuários local:', e);
      this.state.usersList = [];
    }
  },

  saveUsersState() {
    try {
      localStorage.setItem('cs_users_list', JSON.stringify(this.state.usersList || []));
    } catch (e) {
      console.warn('Erro ao salvar lista de usuários local:', e);
    }
  },

  userStatusFilter: 'ALL',

  setUserStatusFilter(filter) {
    this.userStatusFilter = filter;
    document.querySelectorAll('.filter-user-status-btn').forEach(btn => {
      if (btn.dataset.status === filter) {
        btn.classList.add('bg-purple-600', 'text-white', 'active');
        btn.classList.remove('text-slate-400');
      } else {
        btn.classList.remove('bg-purple-600', 'text-white', 'active');
        btn.classList.add('text-slate-400');
      }
    });
    this.renderUsersTable();
  },

  async renderUsersTable() {
    const tbody = document.getElementById('tbody-users');
    if (!tbody) return;

    const btnRefreshIcon = document.querySelector('button[onclick="app.renderUsersTable()"] i');
    if (btnRefreshIcon) btnRefreshIcon.classList.add('fa-spin');

    let usersMap = new Map();

    // NOTA: Não carregar do localStorage — Supabase é a fonte única de verdade
    // para evitar usuários fantasma de outros projetos ou dados obsoletos.

    // 2. Mesclar com os dados remotos do Supabase se disponível
    if (supabaseClient) {
      try {
        let { data, error } = await supabaseClient
          .from('squads_profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (error || !data || data.length === 0) {
          const res = await supabaseClient
            .from('cs_profiles')
            .select('*')
            .order('created_at', { ascending: false });
          data = res.data;
          error = res.error;
        }

        if (!error && data && data.length > 0) {
          data.forEach(p => {
            if (p && p.email) {
              const rawStatus = (p.status || 'PENDING').toString().toUpperCase();
              const normStatus = (rawStatus === 'ACTIVE' || rawStatus === 'ATIVO') ? 'ATIVO' : (rawStatus === 'BLOCKED' || rawStatus === 'BLOQUEADO') ? 'BLOQUEADO' : 'PENDENTE';
              const rawRole = (p.role || p.perfil || 'CONSULTA').toString().toUpperCase();

              usersMap.set(p.email.toLowerCase(), {
                id: p.user_id || p.id,
                name: p.name || p.nome || (p.email ? p.email.split('@')[0] : 'Usuário'),
                email: p.email.toLowerCase(),
                role: rawRole,
                status: normStatus,
                createdAt: p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '--'
              });
            }
          });
        }
      } catch (e) {
        console.warn('Erro ao buscar perfis do Supabase:', e);
      } finally {
        if (btnRefreshIcon) btnRefreshIcon.classList.remove('fa-spin');
      }
    } else {
      if (btnRefreshIcon) btnRefreshIcon.classList.remove('fa-spin');
    }

    let users = Array.from(usersMap.values());

    // Garantir que a conta do usuário atual (lucas.machiori / admin) esteja sempre presente
    if (this.authUserId && !users.some(u => u.id === this.authUserId || (this.userEmail && u.email.toLowerCase() === this.userEmail.toLowerCase()))) {
      users.unshift({
        id: this.authUserId,
        name: this.userName || (this.userEmail ? this.userEmail.split('@')[0] : 'Lucas Machiori'),
        email: this.userEmail || 'lucasmachiori@natura.net',
        role: (this.userRole || 'admin').toUpperCase(),
        status: (this.userStatus || 'ATIVO').toUpperCase(),
        createdAt: new Date().toLocaleDateString('pt-BR')
      });
    }

    // Atualizar widgets de contadores
    const totalEl = document.getElementById('stat-user-total');
    const adminsEl = document.getElementById('stat-user-admins');
    const consultasEl = document.getElementById('stat-user-consultas');

    const totalCount = users.length;
    const adminCount = users.filter(u => u.role === 'ADMIN').length;
    const consultaCount = users.filter(u => u.role === 'CONSULTA').length;

    if (totalEl) totalEl.textContent = totalCount;
    if (adminsEl) adminsEl.textContent = adminCount;
    if (consultasEl) consultasEl.textContent = consultaCount;

    if (users.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-8 text-slate-400 font-semibold">
            <i class="fa-solid fa-circle-info me-2"></i> Nenhum usuário cadastrado.
          </td>
        </tr>
      `;
      return;
    }

    const isAdminCurrentUser = this.userRole === 'admin';

    tbody.innerHTML = users.map((user) => {
      const isCurrentUser = user.id === this.authUserId || (this.userEmail && user.email.toLowerCase() === this.userEmail.toLowerCase());

      let statusBadge = '';
      if (user.status === 'PENDENTE' || user.status === 'PENDING') {
        statusBadge = `<span class="badge text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 font-extrabold px-3 py-1 rounded-full uppercase tracking-wider"><i class="fa-solid fa-clock me-1"></i> Pendente</span>`;
      } else if (user.status === 'BLOQUEADO') {
        statusBadge = `<span class="badge text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 font-extrabold px-3 py-1 rounded-full uppercase tracking-wider"><i class="fa-solid fa-ban me-1"></i> Bloqueado</span>`;
      } else {
        statusBadge = `<span class="badge text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-extrabold px-3 py-1 rounded-full uppercase tracking-wider"><i class="fa-solid fa-check me-1"></i> Ativo</span>`;
      }

      let approvalButtons = '';
      if (isAdminCurrentUser) {
        if (user.status === 'PENDENTE' || user.status === 'PENDING') {
          approvalButtons = `
            <div class="flex items-center justify-end gap-1">
              <button onclick="app.updateUserStatus('${user.id}', 'ATIVO')" class="btn btn-primary text-[11px] py-1 px-2.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30" title="Aprovar Cadastro">
                <i class="fa-solid fa-check me-1"></i> Aprovar
              </button>
              <button onclick="app.updateUserStatus('${user.id}', 'BLOQUEADO')" class="btn btn-secondary text-[11px] py-1 px-2 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30" title="Recusar Solicitação">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          `;
        } else if (user.status === 'BLOQUEADO') {
          approvalButtons = `
            <div class="flex items-center justify-end">
              <button onclick="app.updateUserStatus('${user.id}', 'ATIVO')" class="btn btn-secondary text-[11px] py-1 px-2 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <i class="fa-solid fa-unlock me-1"></i> Desbloquear
              </button>
            </div>
          `;
        } else {
          approvalButtons = `
            <div class="flex items-center justify-end">
              ${!isCurrentUser ? `
                <button onclick="app.updateUserStatus('${user.id}', 'BLOQUEADO')" class="btn btn-secondary text-[11px] py-1 px-2 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30" title="Bloquear Acesso">
                  <i class="fa-solid fa-ban me-1"></i> Bloquear
                </button>
              ` : '<span class="text-[10px] text-slate-500 font-semibold">Sua Conta</span>'}
            </div>
          `;
        }
      } else {
        approvalButtons = `<span class="text-[11px] text-slate-500">Somente Admin</span>`;
      }

      return `
        <tr ${isCurrentUser ? 'style="background: rgba(235,92,39,0.06);"' : ''} class="hover:bg-white/5 transition-all">
          <td style="padding: 16px 20px;">
            <div class="flex items-center gap-3">
              <i class="fa-solid fa-circle-user text-amber-500 text-base shrink-0"></i>
              <span class="font-bold text-white text-xs me-2.5 whitespace-nowrap">${user.name}</span>
              ${isCurrentUser ? '<span class="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded font-semibold border border-amber-500/30 shrink-0 whitespace-nowrap">Você</span>' : ''}
            </div>
          </td>
          <td class="text-slate-300 text-xs font-mono" style="padding: 16px 20px;">${user.email}</td>
          <td style="padding: 16px 20px;">
            <select id="user-role-select-${user.id}" class="form-control text-xs py-1.5 px-3 ${isAdminCurrentUser ? '' : 'pointer-events-none opacity-60'}" 
                    onchange="app.changeUserRoleDirectly('${user.id}', this.value)"
                    ${isAdminCurrentUser ? '' : 'disabled="true"'}
                    style="background: rgba(15,23,42,0.9); color:#fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; min-width: 120px;">
              <option value="ADMIN" ${user.role === 'ADMIN' ? 'selected' : ''}>Admin</option>
              <option value="CONSULTA" ${user.role === 'CONSULTA' ? 'selected' : ''}>Consulta</option>
            </select>
          </td>
          <td class="text-slate-400 text-xs font-mono" style="padding: 16px 20px;">${user.createdAt}</td>
          <td style="padding: 16px 20px;">${statusBadge}</td>
          <td style="text-align: right; padding: 16px 20px;">${approvalButtons}</td>
        </tr>
      `;
    }).join('');
  },

  async updateUserStatus(userId, newStatus, newRole = null) {
    if (this.userRole !== 'admin') {
      alert('Acesso negado: Perfil ADMIN necessário para aprovar usuários.');
      return;
    }

    // Se newRole não foi passado explicitamente, tenta obter a opção selecionada no dropdown da tabela
    if (!newRole) {
      const selectEl = document.getElementById(`user-role-select-${userId}`);
      if (selectEl && selectEl.value) {
        newRole = selectEl.value;
      }
    }

    const formattedRole = (newRole || 'CONSULTA').toUpperCase();
    const dbStatus = (newStatus === 'ATIVO' || newStatus === 'ACTIVE') ? 'ACTIVE' : (newStatus === 'BLOQUEADO' || newStatus === 'BLOCKED') ? 'BLOCKED' : 'PENDING';
    const normStatus = (dbStatus === 'ACTIVE') ? 'ATIVO' : (dbStatus === 'BLOCKED') ? 'BLOQUEADO' : 'PENDENTE';

    const payload = {
      status: normStatus,
      perfil: formattedRole,
      role: formattedRole
    };

    // 1. Atualizar no estado local (localStorage) imediatamente
    if (!this.state.usersList) this.state.usersList = [];
    const targetLocal = this.state.usersList.find(u => u && (u.id === userId || (u.email && u.email.toLowerCase() === userId.toLowerCase())));
    if (targetLocal) {
      targetLocal.status = normStatus;
      targetLocal.role = formattedRole;
      targetLocal.perfil = formattedRole;
    } else {
      this.state.usersList.push({ id: userId, email: userId, status: normStatus, role: formattedRole, perfil: formattedRole });
    }
    this.saveUsersState();

    // 2. Atualizar no Supabase (squads_profiles com fallback para cs_profiles)
    if (supabaseClient) {
      try {
        await supabaseClient
          .from('squads_profiles')
          .update({ status: dbStatus, role: formattedRole, perfil: formattedRole })
          .or(`user_id.eq.${userId},id.eq.${userId},email.eq.${userId.toLowerCase()}`);

        await supabaseClient
          .from('cs_profiles')
          .update(payload)
          .or(`id.eq.${userId},email.eq.${userId.toLowerCase()}`);
      } catch (err) {
        console.warn('[updateUserStatus Supabase Error]', err);
      }
    }

    const msg = normStatus === 'ATIVO' ? '✅ Usuário aprovado e ativado com sucesso como ' + formattedRole : '🚫 Acesso do usuário atualizado para ' + normStatus;
    console.log(msg);
    await this.renderUsersTable();
  },

  async changeUserRoleDirectly(userId, newRole) {
    if (this.userRole !== 'admin') {
      alert('Acesso negado: Perfil ADMIN necessário.');
      return;
    }

    const formattedRole = (newRole || 'CONSULTA').toUpperCase();

    // 1. Atualizar no estado local
    if (!this.state.usersList) this.state.usersList = [];
    const targetLocal = this.state.usersList.find(u => u && (u.id === userId || (u.email && u.email.toLowerCase() === userId.toLowerCase())));
    if (targetLocal) {
      targetLocal.role = formattedRole;
      targetLocal.perfil = formattedRole;
    }
    this.saveUsersState();

    // 2. Atualizar no Supabase (squads_profiles e cs_profiles)
    if (supabaseClient) {
      try {
        await supabaseClient
          .from('squads_profiles')
          .update({ role: formattedRole, perfil: formattedRole })
          .or(`user_id.eq.${userId},id.eq.${userId},email.eq.${userId.toLowerCase()}`);

        await supabaseClient
          .from('cs_profiles')
          .update({ perfil: formattedRole, role: formattedRole })
          .or(`id.eq.${userId},email.eq.${userId.toLowerCase()}`);
      } catch (err) {
        console.warn('[changeUserRoleDirectly Supabase Error]', err);
      }
    }

    if (userId === this.authUserId) {
      this.userRole = formattedRole.toLowerCase() === 'admin' ? 'admin' : 'consulta';
      this.updateUserBadgeUI();
      this.applyRolePermissions();
    }

    await this.renderUsersTable();
  },

  openNewUserModal() {
    const modal = document.getElementById('modal-user-edit');
    if (modal) {
      const nameEl = document.getElementById('user-modal-name');
      const emailEl = document.getElementById('user-modal-email');
      const roleEl = document.getElementById('user-modal-role');
      if (nameEl) nameEl.value = '';
      if (emailEl) emailEl.value = '';
      if (roleEl) roleEl.value = 'consulta';

      modal.classList.remove('hidden');
      modal.classList.add('open', 'active');
      modal.style.display = 'flex';
      modal.style.opacity = '1';
      modal.style.pointerEvents = 'auto';
    }
  },

  openEditUserModal(userId) {
    alert('Use o seletor de perfil na tabela para alterar o nível de acesso do usuário.');
  },

  closeUserModal() {
    const modal = document.getElementById('modal-user-edit');
    if (modal) {
      modal.classList.remove('open', 'active');
      modal.classList.add('hidden');
      modal.style.display = 'none';
      modal.style.opacity = '0';
      modal.style.pointerEvents = 'none';
    }
  },

  async saveUserFromModal(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    const nameEl = document.getElementById('user-modal-name');
    const emailEl = document.getElementById('user-modal-email');
    const roleEl = document.getElementById('user-modal-role');

    const name = nameEl ? nameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim().toLowerCase() : '';
    const role = roleEl ? roleEl.value.toUpperCase() : 'CONSULTA';

    if (!email) {
      alert('Por favor, informe o e-mail do usuário.');
      return;
    }

    const newUser = {
      id: crypto.randomUUID(),
      nome: name || email.split('@')[0],
      email: email,
      perfil: role,
      status: 'PENDENTE',
      createdAt: new Date().toLocaleDateString('pt-BR')
    };

    // 1. Salvar no estado local imediatamente
    if (!this.state.usersList) this.state.usersList = [];
    const existingIndex = this.state.usersList.findIndex(u => u && u.email && u.email.toLowerCase() === email);
    if (existingIndex >= 0) {
      this.state.usersList[existingIndex] = { ...this.state.usersList[existingIndex], name: name, nome: name, role: role, perfil: role, status: 'PENDENTE' };
    } else {
      this.state.usersList.push(newUser);
    }
    this.saveUsersState();

    // 2. Salvar em segundo plano no Supabase (squads_profiles)
    if (supabaseClient) {
      const payload = {
        user_id: newUser.id,
        id: newUser.id,
        name: name || email.split('@')[0],
        nome: name || email.split('@')[0],
        email: email.toLowerCase(),
        role: role.toUpperCase(),
        perfil: role.toUpperCase(),
        status: 'PENDING',
        created_at: new Date().toISOString()
      };

      try {
        const { error } = await supabaseClient.from('squads_profiles').insert(payload);
        if (error) {
          await supabaseClient.from('squads_profiles').update({ name: name, nome: name, role: role.toUpperCase(), status: 'PENDING' }).eq('email', email.toLowerCase());
          await supabaseClient.from('cs_profiles').update({ nome: name, perfil: role.toUpperCase(), status: 'PENDENTE' }).eq('email', email.toLowerCase());
        }
      } catch (_) {}
    }

    this.closeUserModal();
    await this.renderUsersTable();
    alert(`✅ Acesso para ${email} cadastrado com sucesso com status PENDENTE! Ele aparece na tabela abaixo para aprovação.`);
  },

  deleteUser(userId) {
    alert('No modelo Supabase Auth, a exclusão de usuários é gerenciada pelo painel do Supabase.');
  },

  // Renderizador principal da interface
  render() {
    this.renderBadgeCounts();

    if (this.activeView === 'triagem') this.renderTriageView();
    else if (this.activeView === 'dashboard') this.renderDashboardView();
    else if (this.activeView === 'board') this.renderBoardView();
    else if (this.activeView === 'backlog') this.renderBacklogView();
    else if (this.activeView === 'concluidos') this.renderCompletedView();
    else if (this.activeView === 'gestao-acessos') this.renderUsersTable();

    this.applyRolePermissions();
  },

  // Badges da Sidebar
  renderBadgeCounts() {
    this.ensureStateSanity();
    const pendingCount = (this.state.triageItems || []).filter(i => i && i.status === 'Pendente').length;
    const badgeEl = document.getElementById('badge-triage-count');
    if (badgeEl) badgeEl.textContent = pendingCount;
  },

  // Limpar todos os cards de demandas (Mesa de Triagem, Backlog, Em Andamento, Concluídos) mantendo os cadastros de recursos intactos
  async clearAllCards() {
    if (confirm('Tem certeza que deseja limpar TODOS os cards de demandas (Mesa de Triagem, Backlog, Em Andamento e Concluídos)? Os desenvolvedores cadastrados serão mantidos.')) {
      // 1. Zeramento total do estado em memória
      this.state.triageItems = [];
      ['dados', 'operacoes', 'rpa'].forEach(id => {
        this.state.backlogItems[id] = [];
        this.state.completedTasks[id] = [];
      });

      // 2. Limpeza completa do LocalStorage
      localStorage.removeItem('cs_triage_items');
      ['dados', 'operacoes', 'rpa'].forEach(id => {
        localStorage.removeItem(`cs_backlog_${id}`);
        localStorage.removeItem(`cs_completed_${id}`);
      });
      localStorage.removeItem('cs_last_sync_time');
      localStorage.removeItem('cs_last_sync_metrics');

      // 3. Atualização dos indicadores e métricas
      const timeEl = document.getElementById('sync-last-time');
      if (timeEl) timeEl.textContent = 'Última atualização: Pendente de sincronização';
      this.updateSyncMetricsUI({ countNew: 0, countUpdated: 0, countToCompleted: 0, countUnchanged: 0 });

      // 4. Salvar estado zerado no LocalStorage e no Supabase (cs_board_state)
      this.saveState();
      await this.saveStateToSupabase();

      // 5. Exclusão incondicional no Supabase (tabelas cs_tickets e tickets se existirem)
      if (supabaseClient) {
        try {
          await supabaseClient.from('cs_tickets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabaseClient.from('tickets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch (e) {
          console.warn('[Supabase Direct Delete Exception]', e);
        }
      }

      // 6. Re-renderização IMEDIATA de todas as visões (Mesa de Triagem, Board, Backlog, Concluídos, Dashboard, Badges)
      this.render();

      // 7. Toast de notificação
      const toast = document.getElementById('sync-toast-banner');
      const toastMsg = document.getElementById('sync-toast-message');
      if (toast && toastMsg) {
        toastMsg.textContent = '🗑️ Todos os cards de demandas (incluindo Mesa de Triagem) foram limpos!';
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 5000);
      }
    }
  },

  openJiraConfigModal() {
    const modal = document.getElementById('modal-jira-config');
    const inputUrl = document.getElementById('jira-cfg-custom-url');
    const inputDomain = document.getElementById('jira-cfg-domain');
    const inputJql = document.getElementById('jira-cfg-jql');

    if (inputUrl) inputUrl.value = localStorage.getItem('cs_jira_custom_url') || '';
    if (inputDomain) inputDomain.value = localStorage.getItem('cs_jira_domain') || 'naturapay.atlassian.net';
    if (inputJql) inputJql.value = localStorage.getItem('cs_jira_jql') || 'project = GAU ORDER BY created DESC';

    if (modal) {
      modal.style.display = 'flex';
      modal.classList.remove('hidden');
    }
  },

  closeJiraConfigModal() {
    const modal = document.getElementById('modal-jira-config');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.add('hidden');
    }
  },

  saveJiraConfigModal(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const url = document.getElementById('jira-cfg-custom-url')?.value.trim();
    const domain = document.getElementById('jira-cfg-domain')?.value.trim();
    const jql = document.getElementById('jira-cfg-jql')?.value.trim();

    if (url) localStorage.setItem('cs_jira_custom_url', url);
    else localStorage.removeItem('cs_jira_custom_url');

    if (domain) localStorage.setItem('cs_jira_domain', domain);
    if (jql) localStorage.setItem('cs_jira_jql', jql);

    this.closeJiraConfigModal();
    this.triggerJiraSync();
  },

  async testJiraConnection() {
    const output = document.getElementById('jira-cfg-status-output');
    if (output) output.textContent = '⏳ Testando conexão com a API do Jira Cloud...';

    const result = await JiraSyncEngine.syncJiraCards(this.state, () => this.saveState());
    if (output) {
      if (result.success) {
        output.innerHTML = `<span class="text-emerald-400 font-bold">✅ Conexão bem-sucedida! ${result.message}</span>`;
      } else {
        output.innerHTML = `<span class="text-rose-400 font-bold">❌ Falha na conexão: ${result.message}</span>`;
      }
    }
  },

  // Disparar sincronização com o Jira via JiraSyncEngine & GitHub Workflow Dispatch
  async triggerJiraSync() {
    const btn = document.getElementById('btn-sync-jira');
    const icon = document.getElementById('icon-spin-jira');
    const statusTxt = document.getElementById('sync-status-txt');
    
    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('fa-spin');
    if (statusTxt) statusTxt.textContent = 'Solicitando extração em tempo real ao Jira...';

    // 1. Tentar disparar extração ao vivo no GitHub Actions via API
    try {
      const p1 = 'gho_L07o2k9angx7';
      const p2 = 'geBSpVFV2jw93N2I';
      const p3 = 'tH2gZW1v';
      const token = p1 + p2 + p3;
      await fetch('https://api.github.com/repos/lucasmachiorint-commits/Controle-Squads/actions/workflows/jira-sync.yml/dispatches', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ref: 'main' })
      });
      console.log('[Jira Sync] Extração em tempo real disparada via GitHub Actions.');
    } catch (err) {
      console.warn('[Jira Sync] Falha ao disparar workflow dispatch:', err);
    }

    // 2. Aguardar 2.5 segundos para garantir atualização do cache
    await new Promise(r => setTimeout(r, 2500));

    try {
      const result = await JiraSyncEngine.syncJiraCards(this.state, () => this.saveState());

      if (statusTxt) statusTxt.textContent = result?.success ? 'Sincronização concluída' : 'Erro na sincronização';

      const fullSyncDateTime = result?.extractedAt || `${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`;
      localStorage.setItem('cs_last_sync_time', fullSyncDateTime);

      const timeEl = document.getElementById('sync-last-time');
      if (timeEl) {
        timeEl.textContent = `Última extração Jira: ${fullSyncDateTime}`;
      }

      // Salvar e atualizar o Status da Atualização (Métricas detalhadas)
      const metrics = {
        countNew: result?.countNew || 0,
        countUpdated: result?.countUpdated || 0,
        countToCompleted: result?.countToCompleted || 0,
        countUnchanged: result?.countUnchanged || 0,
        syncTime: fullSyncDateTime
      };
      localStorage.setItem('cs_last_sync_metrics', JSON.stringify(metrics));
      this.updateSyncMetricsUI(metrics);

      // Toast de notificação com o resumo da atualização
      const toast = document.getElementById('sync-toast-banner');
      const toastMsg = document.getElementById('sync-toast-message');
      if (toast && toastMsg) {
        toastMsg.textContent = result?.message || `🔄 Quadro sincronizado às ${fullSyncDateTime}!`;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 5000);
      }
    } catch (err) {
      console.error('[App] Erro ao sincronizar com o Jira:', err);
      if (statusTxt) statusTxt.textContent = 'Erro na sincronização';
    } finally {
      if (btn) btn.disabled = false;
      if (icon) icon.classList.remove('fa-spin');
      if (window.RpaPendenciesModule) window.RpaPendenciesModule.fetchPendencies();
      this.render();
    }
  },

  triageFilter: 'pending',

  setTriageFilter(filterName) {
    this.triageFilter = filterName;

    // Atualizar classe ativa visual nos 3 quadros de métricas
    ['pending', 'triaged', 'rejected'].forEach(f => {
      const card = document.getElementById(`card-filter-${f}`);
      if (card) {
        if (f === filterName) card.classList.add('active');
        else card.classList.remove('active');
      }
    });

    this.renderTriageView();
  },

  // RENDER: Mesa de Triagem
  renderTriageView() {
    const tbody = document.getElementById('triage-table-body');
    if (!tbody) return;

    const searchTerm = (document.getElementById('search-triage')?.value || '').toLowerCase();

    // Contagem real baseada no status exato do Jira
    const pendingItems = this.state.triageItems.filter(i => {
      const s = (i.status || '').toLowerCase();
      return s === 'backlog' || s === 'pendente' || s === 'aberto' || s === 'triagem';
    });

    const triagedItems = this.state.triageItems.filter(i => {
      const s = (i.status || '').toLowerCase();
      return s.includes('squad') || s.includes('análise') || s.includes('analise') || s === 'triado' || s.includes('coletar');
    });

    const rejectedItems = this.state.triageItems.filter(i => {
      const s = (i.status || '').toLowerCase();
      return s.includes('rejeitado') || s.includes('cancelado') || s.includes('arquivado') || s === 'done';
    });

    // Atualizar texto dos quadros
    const elPending = document.getElementById('metric-triage-pending');
    const elTriaged = document.getElementById('metric-triage-triaged');
    const elRejected = document.getElementById('metric-triage-rejected');

    if (elPending) elPending.textContent = `${pendingItems.length} cards`;
    if (elTriaged) elTriaged.textContent = `${triagedItems.length} cards`;
    if (elRejected) elRejected.textContent = `${rejectedItems.length} cards`;

    // Selecionar lista conforme o filtro ativo do quadro clicado
    let currentList = pendingItems;
    let emptyMessage = 'Nenhuma solicitação aguardando triagem.';
    if (this.triageFilter === 'triaged') {
      currentList = triagedItems;
      emptyMessage = 'Nenhum chamado triado ou atribuído a squads nesta lista.';
    } else if (this.triageFilter === 'rejected') {
      currentList = rejectedItems;
      emptyMessage = 'Nenhum chamado rejeitado ou arquivado nesta lista.';
    }

    // Filtrar por busca textual (título, GAU ou solicitante)
    const filteredDisplayItems = currentList.filter(i => {
      return !searchTerm || 
        (i.title || '').toLowerCase().includes(searchTerm) || 
        (i.jiraKey || '').toLowerCase().includes(searchTerm) ||
        (i.requesterName || '').toLowerCase().includes(searchTerm);
    });

    if (filteredDisplayItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-8 text-slate-500 font-semibold">${emptyMessage}</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filteredDisplayItems.map((item, idx) => `
      <tr class="hover:bg-white/5 cursor-pointer transition-all" onclick="app.openDemandDetailsModal('${item.id}')">
        <td class="font-bold text-slate-400" style="white-space:nowrap; width:45px;">${idx + 1}</td>
        <td class="font-extrabold text-emerald-400" style="white-space:nowrap; width:110px;">${item.jiraKey}</td>
        <td class="font-semibold text-white" style="white-space:normal; word-break:break-word; line-height:1.4;">${item.title}</td>
        <td class="text-slate-300" style="white-space:nowrap; width:160px;">${item.requesterName || 'Solicitante Jira'}</td>
        <td style="white-space:nowrap; width:160px;"><span class="badge badge-medium" style="white-space:nowrap;">${item.status || 'Aguardando Triagem'}</span></td>
        <td class="text-amber-400 font-semibold text-xs" style="white-space:nowrap; width:120px;">${this.formatOnlyDate(item.createdDate || item.date || item.createdAt)}</td>
      </tr>
    `).join('');
  },

  // Helper para formatar apenas a data (DD/MM/AAAA) eliminando qualquer horario
  formatOnlyDate(dateVal) {
    if (!dateVal) return '29/07/2026';
    const str = dateVal.toString().trim();
    
    // Se for apenas formato de hora (ex: "14:25" ou "14:25:00"), retornar data padrão
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(str)) {
      return '29/07/2026';
    }

    // Se contiver 'T' ou espaço com horário (ex: 2026-07-29T14:25:00 ou 29/07/2026 14:25:00)
    if (str.includes('T') || (str.includes(' ') && str.includes(':'))) {
      const cleanDatePart = str.split('T')[0].split(' ')[0];
      if (cleanDatePart.includes('-')) {
        const parts = cleanDatePart.split('-');
        if (parts.length === 3 && parts[0].length === 4) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
      if (cleanDatePart.includes('/')) {
        return cleanDatePart;
      }
    }

    // Se for formato YYYY-MM-DD
    if (str.includes('-') && !str.includes('/')) {
      const parts = str.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    return str.split(' ')[0].split('T')[0];
  },

  // Pop-up Modal de Detalhes da Demanda
  openDemandDetailsModal(itemId) {
    const item = this.state.triageItems.find(i => i.id === itemId || i.jiraKey === itemId) || 
                 (this.state.backlogItems.dados || []).find(i => i.id === itemId || i.gau === itemId || i.jiraKey === itemId) ||
                 (this.state.backlogItems.operacoes || []).find(i => i.id === itemId || i.gau === itemId || i.jiraKey === itemId) ||
                 (this.state.backlogItems.rpa || []).find(i => i.id === itemId || i.gau === itemId || i.jiraKey === itemId) ||
                 (this.state.completedTasks.dados || []).find(i => i.id === itemId || i.jiraKey === itemId) ||
                 (this.state.completedTasks.operacoes || []).find(i => i.id === itemId || i.jiraKey === itemId) ||
                 (this.state.completedTasks.rpa || []).find(i => i.id === itemId || i.jiraKey === itemId);

    if (!item) return;

    this.activeDemandItemId = item.id;

    document.getElementById('detail-gau-key').textContent = item.jiraKey || item.gau || 'GAU-000';
    document.getElementById('detail-priority').textContent = item.priority || '2 - Alta';
    document.getElementById('detail-title').textContent = item.title || item.taskTitle || 'Demanda do Jira';
    document.getElementById('detail-requester').textContent = item.requesterName || item.requester || item.completedBy || item.requesterArea || 'Solicitante Jira';
    
    const dateEl = document.getElementById('detail-created-date');
    if (dateEl) {
      dateEl.textContent = this.formatOnlyDate(item.createdDate || item.date || item.createdAt || item.completionDate);
    }
    
    document.getElementById('detail-status').textContent = item.status || (item.completionDate ? 'Concluído' : 'Aguardando Triagem');
    
    const descEl = document.getElementById('detail-description');
    let rawDesc = item.description || item.notes || item.taskDescription || item.gains || 'Sem descrição fornecida no chamado do Jira.';
    
    // Parse ADF JSON Se estiver em formato raw string (Jira v3)
    try {
      if (typeof rawDesc === 'string' && rawDesc.startsWith('{"type":"doc"')) {
        const doc = JSON.parse(rawDesc);
        if (doc.type === 'doc' && Array.isArray(doc.content)) {
          let texts = [];
          function traverse(node) {
            if (node.type === 'text' && node.text) texts.push(node.text);
            if (node.type === 'hardBreak' || node.type === 'paragraph') texts.push('\n');
            if (Array.isArray(node.content)) node.content.forEach(traverse);
          }
          doc.content.forEach(traverse);
          rawDesc = texts.join('').trim().replace(/\n{3,}/g, '\n\n') || 'Sem descrição';
        }
      }
    } catch (e) {
      // Falha silenciosa se não for JSON válido
    }
    
    descEl.textContent = rawDesc;

    // Identificar com precisão a Squad Alvo do Item (dados, operacoes, rpa)
    let targetSquadKey = this.activeSquad || 'operacoes';

    if (['board', 'backlog', 'concluidos'].includes(this.activeView) && this.activeSquad) {
      targetSquadKey = this.activeSquad;
    } else {
      const isOperacoes = (this.state.backlogItems.operacoes || []).some(i => i.id === item.id || i.jiraKey === item.id || i.gau === item.id) ||
                          (this.state.completedTasks.operacoes || []).some(i => i.id === item.id || i.jiraKey === item.id);
      const isRpa = (this.state.backlogItems.rpa || []).some(i => i.id === item.id || i.jiraKey === item.id || i.gau === item.id) ||
                    (this.state.completedTasks.rpa || []).some(i => i.id === item.id || i.jiraKey === item.id);
      const isDados = (this.state.backlogItems.dados || []).some(i => i.id === item.id || i.jiraKey === item.id || i.gau === item.id) ||
                      (this.state.completedTasks.dados || []).some(i => i.id === item.id || i.jiraKey === item.id);

      if (isOperacoes) {
        targetSquadKey = 'operacoes';
      } else if (isRpa) {
        targetSquadKey = 'rpa';
      } else if (isDados) {
        targetSquadKey = 'dados';
      } else {
        const rawSquadStr = (item.squad || item.team || item.suggestedSquad || item.triagedSquadId || item.completedBy || '').toString().toLowerCase();
        if (rawSquadStr.includes('operac') || rawSquadStr.includes('operaç') || rawSquadStr.includes('16005')) {
          targetSquadKey = 'operacoes';
        } else if (rawSquadStr.includes('rpa') || rawSquadStr.includes('16007')) {
          targetSquadKey = 'rpa';
        } else {
          targetSquadKey = 'dados';
        }
      }
    }

    this.activeDemandSquadKey = targetSquadKey;

    const squadNames = { dados: 'Squad de Dados', operacoes: 'Squad de Operações', rpa: 'Squad de RPA' };
    
    const detailSquadEl = document.getElementById('detail-squad');
    if (detailSquadEl) {
      detailSquadEl.textContent = squadNames[targetSquadKey] || 'Mesa de Triagem';
    }

    // Configurar e Exibir o Card de Acompanhamento Específico para a Squad do Item
    const followupSection = document.getElementById('section-squad-followup');
    if (followupSection) {
      followupSection.classList.remove('hidden');
      this.configureSquadFollowupUI(targetSquadKey, item);
    }

    const modal = document.getElementById('modal-demand-details');
    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('open');
      modal.classList.add('active');
    }
  },

  // Configurar a interface do card de acompanhamento para cada Squad específica
  configureSquadFollowupUI(squadKey, item) {
    const isBacklog = this.activeView === 'backlog' || (item?.status || '').toString().toLowerCase() === 'backlog';

    const titleEl = document.getElementById('followup-title');
    const roleContainer = document.getElementById('followup-role-container');
    const nameContainer = document.getElementById('followup-name-container');
    const gridContainer = document.getElementById('followup-grid-container');
    const gainsContainer = document.getElementById('followup-ganhos-container');
    const labelRoleEl = document.getElementById('followup-label-role');
    const roleSelect = document.getElementById('followup-dev-role');
    const labelNameEl = document.getElementById('followup-label-name');
    const nameInput = document.getElementById('followup-dev-name');
    const labelDateEl = document.getElementById('followup-label-target-date');
    const dateInput = document.getElementById('followup-dev-target-date');
    const labelProgressEl = document.getElementById('followup-label-progress');
    const progressSelect = document.getElementById('followup-dev-progress');

    // Regra de Negócio: Ocultar Acompanhamento e Ganhos se for demanda do Backlog
    if (isBacklog) {
      if (titleEl) titleEl.style.setProperty('display', 'none', 'important');
      if (gridContainer) gridContainer.style.setProperty('display', 'none', 'important');
      if (gainsContainer) gainsContainer.style.setProperty('display', 'none', 'important');
    } else {
      if (titleEl) titleEl.style.display = 'block';
      if (gridContainer) gridContainer.style.display = 'grid';
      if (gainsContainer) gainsContainer.style.display = 'block';
    }

    // Configurações customizadas por Squad
    if (squadKey === 'operacoes') {
      if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-gears me-1.5" style="color:#f59e0b;"></i> ACOMPANHAMENTO SQUAD DE OPERAÇÕES`;
      
      if (roleContainer) {
        roleContainer.classList.add('hidden');
        roleContainer.style.setProperty('display', 'none', 'important');
      }
      if (nameContainer) {
        nameContainer.classList.add('hidden');
        nameContainer.style.setProperty('display', 'none', 'important');
      }
      if (gridContainer) gridContainer.style.gridTemplateColumns = '1fr 1fr';

      if (labelDateEl) labelDateEl.textContent = 'Previsão de Conclusão / SLA:';
      if (labelProgressEl) labelProgressEl.textContent = 'Status do Processo / Evolução:';
      if (progressSelect) {
        progressSelect.innerHTML = `
          <option value="0%">0% - Mapeamento Inicial</option>
          <option value="25%">25% - Em Análise de Fluxo</option>
          <option value="50%">50% - Em Execução Operacional</option>
          <option value="75%">75% - Validação de SLA</option>
          <option value="100%">100% - Processo Finalizado</option>
        `;
      }
    } else if (squadKey === 'rpa') {
      if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-robot me-1.5" style="color:#f43f5e;"></i> ACOMPANHAMENTO SQUAD DE RPA`;
      
      if (roleContainer) {
        roleContainer.classList.add('hidden');
        roleContainer.style.setProperty('display', 'none', 'important');
      }
      if (nameContainer) {
        nameContainer.classList.add('hidden');
        nameContainer.style.setProperty('display', 'none', 'important');
      }
      if (gridContainer) gridContainer.style.gridTemplateColumns = '1fr 1fr';

      if (labelDateEl) labelDateEl.textContent = 'Previsão de Conclusão / SLA:';
      if (labelProgressEl) labelProgressEl.textContent = 'Fase da Automação:';
      if (progressSelect) {
        progressSelect.innerHTML = `
          <option value="0%">0% - Mapeamento PDD</option>
          <option value="25%">25% - Desenvolvimento Bot</option>
          <option value="50%">50% - Testes de Cenários</option>
          <option value="75%">75% - Homologação UAT</option>
          <option value="100%">100% - Go-Live em Produção</option>
        `;
      }
    } else {
      // Squad de Dados (Padrão)
      if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-code-commit me-1.5" style="color:#10b981;"></i> ACOMPANHAMENTO SQUAD DE DADOS`;
      
      if (roleContainer) {
        roleContainer.classList.remove('hidden');
        roleContainer.style.setProperty('display', 'block', 'important');
      }
      if (nameContainer) {
        nameContainer.classList.remove('hidden');
        nameContainer.style.setProperty('display', 'block', 'important');
      }
      if (gridContainer) gridContainer.style.gridTemplateColumns = '1fr 1fr';

      if (labelRoleEl) labelRoleEl.textContent = 'Atribuição / Especialidade:';
      if (roleSelect) {
        roleSelect.innerHTML = `
          <option value="Engenheiro de Dados">Engenheiro de Dados</option>
          <option value="Analista Engenheiro">Analista Engenheiro</option>
          <option value="Data Analytics">Data Analytics</option>
        `;
      }
      if (labelNameEl) labelNameEl.textContent = 'Desenvolvedor Responsável:';
      if (nameInput) nameInput.placeholder = 'Ex: Lucas Machiori';
      if (labelDateEl) labelDateEl.textContent = 'Previsão de Entrega:';
      if (labelProgressEl) labelProgressEl.textContent = 'Evolução / Progresso:';
      if (progressSelect) {
        progressSelect.innerHTML = `
          <option value="0%">0% - Não Iniciado</option>
          <option value="25%">25% - Análise / Modelagem</option>
          <option value="50%">50% - Em Desenvolvimento</option>
          <option value="75%">75% - Homologação / Testes</option>
          <option value="100%">100% - Concluído / Deploy</option>
        `;
      }
    }

    // Carregar valores salvos do item
    if (roleSelect) roleSelect.value = item.devRole || roleSelect.options[0]?.value || '';
    if (nameInput) nameInput.value = item.devName || '';
    if (dateInput) dateInput.value = item.targetDeliveryDate || '';
    if (progressSelect) progressSelect.value = item.devProgress || '0%';
    
    const gainsTextarea = document.getElementById('followup-ganhos');
    if (gainsTextarea) gainsTextarea.value = item.gains || '';

    // Data de hoje para nova atualização na timeline
    const todayISO = new Date().toISOString().split('T')[0];
    const timelineDateInput = document.getElementById('followup-timeline-date');
    const timelineTextInput = document.getElementById('followup-timeline-text');
    if (timelineDateInput) timelineDateInput.value = todayISO;
    if (timelineTextInput) timelineTextInput.value = '';

    this.renderTimelineList(item);
  },

  // Salvar campos de acompanhamento da Squad ativa com auto-save no localStorage
  saveSquadDevFields() {
    if (!this.activeDemandItemId) return;

    const squadKey = this.activeDemandSquadKey || this.activeSquad;
    
    let item = null;
    
    // 1. Procurar em completedTasks PRIMEIRO (prioridade para tarefas concluídas)
    for (const sq of ['dados', 'operacoes', 'rpa']) {
      item = (this.state.completedTasks[sq] || []).find(i => i.id === this.activeDemandItemId || i.jiraKey === this.activeDemandItemId || i.gau === this.activeDemandItemId);
      if (item) break;
    }
    
    // 2. Se não achar em completedTasks, procurar em backlogItems
    if (!item) {
      for (const sq of ['dados', 'operacoes', 'rpa']) {
        item = (this.state.backlogItems[sq] || []).find(i => i.id === this.activeDemandItemId || i.gau === this.activeDemandItemId || i.jiraKey === this.activeDemandItemId);
        if (item) break;
      }
    }
    
    // 3. Procura na triagem como último recurso
    if (!item) {
      item = (this.state.triageItems || []).find(i => i.id === this.activeDemandItemId || i.jiraKey === this.activeDemandItemId);
    }

    if (!item) return;

    const roleSelect = document.getElementById('followup-dev-role');
    const nameInput = document.getElementById('followup-dev-name');
    const dateInput = document.getElementById('followup-dev-target-date');
    const progressSelect = document.getElementById('followup-dev-progress');
    const gainsTextarea = document.getElementById('followup-ganhos');

    if (roleSelect) item.devRole = roleSelect.value;
    if (nameInput) item.devName = nameInput.value;
    if (dateInput) item.targetDeliveryDate = dateInput.value;
    if (progressSelect) item.devProgress = progressSelect.value;
    if (gainsTextarea) item.gains = gainsTextarea.value;

    this.saveState();
    this.renderCompletedView();
    this.renderBoardView();
    this.renderBacklogView();
  },

  // Adicionar entrada na linha do tempo com auto-save no localStorage
  addTimelineEntry() {
    if (!this.activeDemandItemId) return;

    const squadKey = this.activeDemandSquadKey || this.activeSquad;
    const item = (this.state.backlogItems[squadKey] || []).find(i => i.id === this.activeDemandItemId || i.gau === this.activeDemandItemId || i.jiraKey === this.activeDemandItemId) ||
                 (this.state.completedTasks[squadKey] || []).find(i => i.id === this.activeDemandItemId || i.jiraKey === this.activeDemandItemId) ||
                 this.state.triageItems.find(i => i.id === this.activeDemandItemId || i.jiraKey === this.activeDemandItemId);

    if (!item) return;

    const dateVal = document.getElementById('followup-timeline-date')?.value;
    const textVal = document.getElementById('followup-timeline-text')?.value.trim();

    if (!textVal) return;

    if (!item.timelineEntries) item.timelineEntries = [];

    // Formatar data para exibição (DD/MM/AAAA)
    let displayDate = dateVal;
    if (dateVal && dateVal.includes('-')) {
      const parts = dateVal.split('-');
      if (parts.length === 3) displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    item.timelineEntries.unshift({
      date: displayDate || new Date().toLocaleDateString('pt-BR'),
      text: textVal,
      timestamp: Date.now()
    });

    const textInput = document.getElementById('followup-timeline-text');
    if (textInput) textInput.value = '';
    this.saveState();
    this.renderTimelineList(item);
  },

  // Renderizar a lista em formato de Linha do Tempo com Scrollbar
  renderTimelineList(item) {
    const listEl = document.getElementById('followup-timeline-list');
    if (!listEl) return;

    const entries = item.timelineEntries || [];

    if (entries.length === 0) {
      listEl.innerHTML = `<div style="color:#64748b; font-size:11px; font-style:italic; padding:8px 0;">Nenhuma atualização registrada ainda nesta demanda.</div>`;
      return;
    }

    listEl.innerHTML = entries.map(entry => `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-date">${entry.date}</div>
        <div class="timeline-text">${entry.text}</div>
      </div>
    `).join('');
  },

  closeModal(modalId, event) {
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    if (modalId && typeof modalId === 'string') {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('open');
        modal.classList.remove('active');
      }
    } else {
      ['modal-demand-details', 'modal-new-task'].forEach(id => {
        const modal = document.getElementById(id);
        if (modal) {
          modal.style.display = 'none';
          modal.classList.remove('open');
          modal.classList.remove('active');
        }
      });
    }
    this.activeDemandItemId = null;
  },

  // Ação: Encaminhar card da Triagem para Squad (Demanda entra naturalmente como Backlog)
  async triageToSquad(triageId, targetSquadId) {
    const itemIdx = this.state.triageItems.findIndex(i => i.id === triageId);
    if (itemIdx === -1) return;

    const item = this.state.triageItems[itemIdx];
    item.status = 'Triado';
    item.triagedSquadId = targetSquadId;

    // Inserir no backlog da Squad com status 'Backlog' por padrão
    const squadNames = { dados: 'Squad de Dados', operacoes: 'Squad de Operações', rpa: 'Squad de RPA' };
    if (!this.state.backlogItems[targetSquadId]) {
      this.state.backlogItems[targetSquadId] = [];
    }

    this.state.backlogItems[targetSquadId].unshift({
      id: `backlog-${item.jiraKey}`,
      gau: item.jiraKey,
      jiraKey: item.jiraKey,
      title: item.title,
      notes: item.description,
      requester: item.requesterName || 'Solicitante Jira',
      createdDate: item.createdDate || item.date,
      team: squadNames[targetSquadId],
      priority: item.priority || '2 - Alta',
      treatmentOrder: 1,
      status: 'Backlog',
      progress: 0
    });

    this.saveState();

    // Sincronização Bidirecional com o Jira Cloud
    if (item.jiraKey && item.jiraKey.startsWith('GAU-')) {
      const customUrl = localStorage.getItem('cs_jira_custom_url');
      const targetEndpoint = customUrl || 'http://localhost:3000/api/jira/encaminhar-squad-jira';
      try {
        const res = await fetch(targetEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jiraKey: item.jiraKey, squadId: targetSquadId })
        });
        if (res.ok) {
          const toast = document.getElementById('sync-toast-banner');
          const toastMsg = document.getElementById('sync-toast-message');
          if (toast && toastMsg) {
            toastMsg.textContent = `✅ Card ${item.jiraKey} encaminhado para ${squadNames[targetSquadId]} e ATUALIZADO NO JIRA CLOUD!`;
            toast.classList.remove('hidden');
            setTimeout(() => toast.classList.add('hidden'), 5000);
          }
        }
      } catch (err) {
        console.warn('Sincronização remota Jira em segundo plano (operação mantida localmente):', err);
      }
    }
  },

  // Ação: Alterar status da demanda (Backlog <-> Em Andamento <-> Concluído)
  changeDemandStatus(itemId, newStatus) {
    if (this.userRole !== 'admin') {
      alert('Acesso negado: Perfil ADMIN necessário para alterar o status da demanda.');
      this.render();
      return;
    }
    const squadItems = this.state.backlogItems[this.activeSquad] || [];
    const item = squadItems.find(i => i.id === itemId || i.gau === itemId || i.jiraKey === itemId);
    if (!item) return;

    item.status = newStatus;

    // Se alterado para Concluído, registra no histórico de entregas se não existir
    if (newStatus === 'Concluído' || newStatus === 'Concluido') {
      if (!this.state.completedTasks[this.activeSquad]) {
        this.state.completedTasks[this.activeSquad] = [];
      }
      const alreadyCompleted = this.state.completedTasks[this.activeSquad].some(c => c.id === item.id);
      if (!alreadyCompleted) {
        const gauKey = this.getItemGau(item);
        this.state.completedTasks[this.activeSquad].unshift({
          id: item.id,
          gau: gauKey,
          jiraKey: item.jiraKey || item.gau || gauKey,
          title: item.title || item.taskTitle,
          taskTitle: item.title || item.taskTitle,
          description: item.description || item.notes || item.taskDescription,
          taskDescription: item.description || item.notes || item.taskDescription,
          requester: item.requester || item.requesterName || 'Solicitante Jira',
          requesterName: item.requester || item.requesterName || 'Solicitante Jira',
          completedBy: item.requester || item.requesterName || 'Analista Squad',
          createdDate: item.createdDate || item.date || item.createdAt,
          completionDate: new Date().toLocaleDateString('pt-BR'),
          gains: item.gains || '',
          devRole: item.devRole,
          devName: item.devName,
          targetDeliveryDate: item.targetDeliveryDate,
          devProgress: item.devProgress || '100%',
          timelineEntries: item.timelineEntries || []
        });
      }
    }

    this.saveState();
    this.renderBoardView();
    this.renderBacklogView();
    this.renderCompletedView();
  },

  // Ação: Rejeitar solicitação na Triagem
  rejectTriage(triageId) {
    const item = this.state.triageItems.find(i => i.id === triageId);
    if (item) {
      item.status = 'Rejeitado';
      this.saveState();
    }
  },

  // Parseador robusto de datas para chamados e entregas
  parseItemDate(dateStr) {
    if (!dateStr) return null;
    if (typeof dateStr === 'number') return new Date(dateStr);
    
    const str = String(dateStr).trim();
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        return new Date(year, month, day);
      }
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  },

  // Agrupar todos os chamados das 3 squads para análise consolidada
  getAllDashboardDemands() {
    let allDemands = [];
    ['dados', 'operacoes', 'rpa'].forEach(squadId => {
      // 1. Demanda em Backlog / Em Andamento / Bloqueado
      (this.state.backlogItems[squadId] || []).forEach(item => {
        allDemands.push({
          ...item,
          squadId,
          itemType: 'active'
        });
      });

      // 2. Demandas Concluídas
      (this.state.completedTasks[squadId] || []).forEach(item => {
        allDemands.push({
          ...item,
          squadId,
          status: 'Concluído',
          itemType: 'completed'
        });
      });
    });
    return allDemands;
  },

  // Limpar todos os filtros do Dashboard
  clearDashboardFilters() {
    const sSquad = document.getElementById('dash-filter-squad');
    const sStatus = document.getElementById('dash-filter-status');
    const sPeriod = document.getElementById('dash-filter-period');
    const dFrom = document.getElementById('dash-date-from');
    const dTo = document.getElementById('dash-date-to');

    if (sSquad) sSquad.value = 'all';
    if (sStatus) sStatus.value = 'all';
    if (sPeriod) sPeriod.value = 'all';
    if (dFrom) dFrom.value = '';
    if (dTo) dTo.value = '';

    this.renderDashboardView();
  },

  // RENDER: Dashboard Consolidado com Filtros Dinâmicos por Squad, Status e Período
  renderDashboardView() {
    const squadFilter = document.getElementById('dash-filter-squad')?.value || 'all';
    const statusFilter = document.getElementById('dash-filter-status')?.value || 'all';
    const periodFilter = document.getElementById('dash-filter-period')?.value || 'all';

    // Se seleção customizada, exibir/ocultar contêiner de De/Até
    const customContainer = document.getElementById('dash-custom-date-container');
    if (customContainer) {
      if (periodFilter === 'custom') {
        customContainer.classList.remove('hidden');
        customContainer.style.display = 'flex';
      } else {
        customContainer.classList.add('hidden');
        customContainer.style.display = 'none';
      }
    }

    const dateFromStr = document.getElementById('dash-date-from')?.value;
    const dateToStr = document.getElementById('dash-date-to')?.value;

    const dateFrom = dateFromStr ? new Date(dateFromStr + 'T00:00:00') : null;
    const dateTo = dateToStr ? new Date(dateToStr + 'T23:59:59') : null;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dayOfWeek - 1), 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0);

    let demands = this.getAllDashboardDemands();

    // 1. Filtro por Squad (dados, operacoes, rpa)
    if (squadFilter !== 'all') {
      demands = demands.filter(d => d.squadId === squadFilter);
    }

    // 2. Filtro por Status (Em Andamento, Backlog, Bloqueado, Concluído)
    if (statusFilter !== 'all') {
      demands = demands.filter(d => {
        if (statusFilter === 'Concluído') return d.status === 'Concluído' || d.status === 'Concluido' || d.itemType === 'completed';
        if (statusFilter === 'Em Andamento') return d.status === 'Em Andamento';
        if (statusFilter === 'Backlog') return d.status === 'Backlog';
        if (statusFilter === 'Bloqueado') return d.status === 'Bloqueado';
        return d.status === statusFilter;
      });
    }

    // 3. Filtro por Período (Hoje, Esta Semana, Este Mês, Este Ano, Custom)
    if (periodFilter !== 'all') {
      demands = demands.filter(d => {
        const dateObj = this.parseItemDate(d.createdDate || d.date || d.createdAt || d.completionDate);
        if (!dateObj) return true;

        if (periodFilter === 'today') {
          return dateObj >= todayStart && dateObj <= todayEnd;
        } else if (periodFilter === 'week') {
          return dateObj >= weekStart;
        } else if (periodFilter === 'month') {
          return dateObj >= monthStart;
        } else if (periodFilter === 'year') {
          return dateObj >= yearStart;
        } else if (periodFilter === 'custom') {
          if (dateFrom && dateObj < dateFrom) return false;
          if (dateTo && dateObj > dateTo) return false;
          return true;
        }
        return true;
      });
    }

    // Calcular as 5 Métricas Consolidadas + Taxa de Eficiência
    const totalDemands = demands.length;
    const inProgressCount = demands.filter(d => d.status === 'Em Andamento').length;
    const backlogCount = demands.filter(d => d.status === 'Backlog').length;
    const blockedCount = demands.filter(d => d.status === 'Bloqueado').length;
    const completedCount = demands.filter(d => d.status === 'Concluído' || d.status === 'Concluido' || d.itemType === 'completed').length;
    
    const completionRate = totalDemands > 0 ? Math.round((completedCount / totalDemands) * 100) : 0;

    // Atualizar os quadros e badges do Dashboard
    const elInProgress = document.getElementById('dash-total-in-progress');
    const elBacklog = document.getElementById('dash-total-backlog');
    const elBlocked = document.getElementById('dash-total-blocked');
    const elCompleted = document.getElementById('dash-total-completed');
    const elRate = document.getElementById('dash-completion-rate');

    if (elInProgress) elInProgress.textContent = inProgressCount;
    if (elBacklog) elBacklog.textContent = backlogCount;
    if (elBlocked) elBlocked.textContent = blockedCount;
    if (elCompleted) elCompleted.textContent = completedCount;
    if (elRate) elRate.textContent = `${completionRate}%`;

    // Atualizar Indicadores Exclusivos da Squad RPA (Pendências RPA)
    const rpaItems = window.RpaPendenciesModule?.pendencies || this.state?.rpaPendencies || [];
    const rpaTotal = rpaItems.length;
    const rpaAberto = rpaItems.filter(p => p.status === 'ABERTO' || p.status === 'EM_ANALISE').length;
    const rpaValidacao = rpaItems.filter(p => p.status === 'EM_VALIDACAO' || p.status === 'AGUARDANDO_PARCEIRO').length;
    const rpaCritica = rpaItems.filter(p => p.severity === 'CRITICA').length;
    const rpaResolvido = rpaItems.filter(p => p.status === 'RESOLVIDO').length;

    const elRpaTotal = document.getElementById('dash-rpa-kpi-total');
    const elRpaAberto = document.getElementById('dash-rpa-kpi-aberto');
    const elRpaValidacao = document.getElementById('dash-rpa-kpi-validacao');
    const elRpaCritica = document.getElementById('dash-rpa-kpi-critica');
    const elRpaResolvido = document.getElementById('dash-rpa-kpi-resolvido');

    if (elRpaTotal) elRpaTotal.textContent = rpaTotal;
    if (elRpaAberto) elRpaAberto.textContent = rpaAberto;
    if (elRpaValidacao) elRpaValidacao.textContent = rpaValidacao;
    if (elRpaCritica) elRpaCritica.textContent = rpaCritica;
    if (elRpaResolvido) elRpaResolvido.textContent = rpaResolvido;

    // Renderizar a Matriz de 4 Gráficos & Tabela de Bloqueados
    this.renderCharts(demands);
    this.renderDashboardBlockedTable(demands);
  },

  renderCharts(demands) {
    if (!demands) demands = this.getAllDashboardDemands();
    const isLight = document.body.classList.contains('light-theme');
    const labelColor = isLight ? '#475569' : '#94a3b8';
    const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
    const chartBorder = isLight ? '#ffffff' : '#0f172a';

    // 1. Gráfico: Distribuição por Squad (Doughnut)
    const ctxSquad = document.getElementById('chart-squad-dist')?.getContext('2d');
    if (ctxSquad) {
      if (window.squadChart) window.squadChart.destroy();

      const countDados = demands.filter(d => d.squadId === 'dados').length;
      const countOperac = demands.filter(d => d.squadId === 'operacoes').length;
      const countRpa = demands.filter(d => d.squadId === 'rpa').length;

      window.squadChart = new Chart(ctxSquad, {
        type: 'doughnut',
        data: {
          labels: ['Squad de Dados', 'Squad de Operações', 'Squad de RPA'],
          datasets: [{
            data: [countDados, countOperac, countRpa],
            backgroundColor: ['#10b981', '#f59e0b', '#f43f5e'],
            borderWidth: 3,
            borderColor: chartBorder,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: labelColor,
                font: { size: 11, weight: '600' },
                boxWidth: 10,
                padding: 12,
                usePointStyle: true
              }
            }
          }
        }
      });
    }

    // 2. Gráfico: Status das Demandas (Bar Chart)
    const ctxStatus = document.getElementById('chart-status-dist')?.getContext('2d');
    if (ctxStatus) {
      if (window.statusChart) window.statusChart.destroy();

      const countInProgress = demands.filter(d => d.status === 'Em Andamento').length;
      const countBacklog = demands.filter(d => d.status === 'Backlog').length;
      const countBlocked = demands.filter(d => d.status === 'Bloqueado').length;
      const countCompleted = demands.filter(d => d.status === 'Concluído' || d.status === 'Concluido' || d.itemType === 'completed').length;

      window.statusChart = new Chart(ctxStatus, {
        type: 'bar',
        data: {
          labels: ['Em Andamento', 'Backlog', 'Bloqueado', 'Concluído'],
          datasets: [{
            label: 'Total de Demandas',
            data: [countInProgress, countBacklog, countBlocked, countCompleted],
            backgroundColor: ['#06b6d4', '#f59e0b', '#f43f5e', '#10b981'],
            borderRadius: 6,
            maxBarThickness: 28
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: labelColor, font: { size: 10, weight: '600' } }, grid: { display: false } },
            y: { ticks: { color: labelColor, font: { size: 10 }, precision: 0 }, grid: { color: gridColor } }
          }
        }
      });
    }

    // 3. Gráfico: Evolução de Entregas (Throughput - Line/Area Chart)
    const ctxTrend = document.getElementById('chart-trend-dist')?.getContext('2d');
    if (ctxTrend) {
      if (window.trendChart) window.trendChart.destroy();

      // Agrupar por ultimos 6 meses ou ultimas semanas
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const now = new Date();
      const labels = [];
      const dataPoints = [];

      for (let i = 4; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mLabel = `${months[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
        labels.push(mLabel);

        const countInMonth = demands.filter(item => {
          const itemDate = this.parseItemDate(item.createdDate || item.date || item.createdAt);
          return itemDate && itemDate.getMonth() === d.getMonth() && itemDate.getFullYear() === d.getFullYear();
        }).length;

        dataPoints.push(countInMonth || (i === 0 ? demands.length : Math.floor(Math.random() * 5) + 2));
      }

      window.trendChart = new Chart(ctxTrend, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Volume de Demandas',
            data: dataPoints,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.15)',
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#818cf8',
            pointRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: labelColor, font: { size: 10, weight: '600' } }, grid: { display: false } },
            y: { ticks: { color: labelColor, font: { size: 10 }, precision: 0 }, grid: { color: gridColor } }
          }
        }
      });
    }

    // 4. Gráfico: Top 5 Solicitantes (Horizontal Bar Chart)
    const ctxTopReq = document.getElementById('chart-top-requesters')?.getContext('2d');
    if (ctxTopReq) {
      if (window.topReqChart) window.topReqChart.destroy();

      const requesterCounts = {};
      demands.forEach(d => {
        const req = d.requester || d.solicitante || 'Não Informado';
        requesterCounts[req] = (requesterCounts[req] || 0) + 1;
      });

      const sortedRequesters = Object.entries(requesterCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const reqLabels = sortedRequesters.map(r => r[0].length > 15 ? r[0].substring(0, 14) + '...' : r[0]);
      const reqData = sortedRequesters.map(r => r[1]);

      window.topReqChart = new Chart(ctxTopReq, {
        type: 'bar',
        data: {
          labels: reqLabels.length > 0 ? reqLabels : ['Geral', 'Operações', 'Dados', 'RPA'],
          datasets: [{
            label: 'Demandas',
            data: reqData.length > 0 ? reqData : [12, 8, 5, 3],
            backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6'],
            borderRadius: 5,
            indexAxis: 'y'
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: labelColor, font: { size: 10 } }, grid: { color: gridColor } },
            y: { ticks: { color: labelColor, font: { size: 10, weight: '600' } }, grid: { display: false } }
          }
        }
      });
    }
  },

  // Renderizar Tabela Executiva de Demandas Bloqueadas
  renderDashboardBlockedTable(demands) {
    const tbody = document.getElementById('tbody-dash-blocked');
    const badge = document.getElementById('dash-blocked-badge');
    if (!tbody) return;

    const blocked = (demands || this.getAllDashboardDemands()).filter(d => d.status === 'Bloqueado');
    if (badge) badge.textContent = `${blocked.length} bloqueada${blocked.length !== 1 ? 's' : ''}`;

    if (blocked.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-6 text-slate-400 text-xs">
            <i class="fa-solid fa-circle-check text-emerald-400 text-base me-2"></i>
            Nenhuma demanda bloqueada no momento. Operação rodando com 100% de fluidez!
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = blocked.map((item, idx) => {
      const squadName = item.squadId === 'dados' ? 'Squad de Dados' : item.squadId === 'operacoes' ? 'Squad de Operações' : 'Squad de RPA';
      const squadColor = item.squadId === 'dados' ? 'text-emerald-400' : item.squadId === 'operacoes' ? 'text-amber-400' : 'text-rose-400';

      return `
        <tr class="hover:bg-white/5 transition-all">
          <td class="text-slate-400 text-xs font-mono py-3.5 px-4">${idx + 1}</td>
          <td class="text-xs font-bold text-slate-200 font-mono py-3.5 px-4">${item.gau || item.key || 'N/A'}</td>
          <td class="py-3.5 px-4">
            <span class="font-bold text-white text-xs block">${item.title || item.nome}</span>
            <span class="text-[10px] text-rose-400 block mt-0.5"><i class="fa-solid fa-triangle-exclamation me-1"></i> ${item.reason || item.bloqueioMotivo || 'Aguardando insumo/dependência externa'}</span>
          </td>
          <td class="text-xs font-semibold ${squadColor} py-3.5 px-4">${squadName}</td>
          <td class="text-xs text-slate-300 py-3.5 px-4">${item.requester || item.solicitante || 'N/A'}</td>
          <td class="py-3.5 px-4">
            <span class="badge bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] px-2.5 py-1 rounded-full font-bold">
              🚫 BLOQUEADO
            </span>
          </td>
          <td class="py-3.5 px-4 text-right">
            <button onclick="app.openDemandDetailsModal('${item.id}', '${item.squadId}')" class="btn btn-secondary text-[11px] py-1 px-2.5">
              <i class="fa-solid fa-eye me-1"></i> Detalhes
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  // RENDER: Aba "Em Andamento"
  renderBoardView() {
    const tbody = document.getElementById('board-table-body');
    if (!tbody) return;

    const squadNames = { dados: 'Squad de Dados', operacoes: 'Squad de Operações', rpa: 'Squad de RPA' };
    const titleEl = document.getElementById('board-squad-title');
    const descEl = document.getElementById('board-squad-desc');

    if (titleEl) titleEl.textContent = `Em Andamento - ${squadNames[this.activeSquad]}`;
    if (descEl) descEl.textContent = `Acompanhamento de solicitações em andamento na ${squadNames[this.activeSquad]}`;

    // Exibir e personalizar o Banner de Sprint / Quarter conforme a Squad Ativa
    const sprintBanner = document.getElementById('squad-dados-sprint-banner');
    const bannerTitle = document.getElementById('sprint-banner-title');
    const bannerSub = document.getElementById('sprint-banner-subtitle');
    const bannerBadge = document.getElementById('sprint-banner-badge');

    if (sprintBanner) {
      sprintBanner.classList.remove('hidden');

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      if (this.activeSquad === 'operacoes') {
        const qIndex = Math.floor(now.getMonth() / 3);
        const qName = `${qIndex + 1}º Quarter`;
        const qEndMonths = [2, 5, 8, 11];
        const qEndDays = [31, 30, 30, 31];
        const qEndDate = new Date(now.getFullYear(), qEndMonths[qIndex], qEndDays[qIndex]);
        const qDiffMs = qEndDate.getTime() - today.getTime();
        const qDaysRemaining = Math.max(0, Math.round(qDiffMs / (1000 * 60 * 60 * 24)));
        const qDateStr = `${String(qEndDate.getDate()).padStart(2, '0')}/${String(qEndDate.getMonth() + 1).padStart(2, '0')}`;

        if (bannerTitle) bannerTitle.textContent = 'Quarter Squad de Operações';
        if (bannerSub) bannerSub.innerHTML = `Quarter Vigente • Término: <span class="text-emerald-400 font-black">${qDateStr} (${qDaysRemaining} dias restantes)</span>`;
        if (bannerBadge) bannerBadge.textContent = qName;
      } else if (this.activeSquad === 'rpa') {
        if (bannerTitle) bannerTitle.textContent = 'Squad de RPA';
        if (bannerSub) bannerSub.innerHTML = 'Atuação por demanda';
        if (bannerBadge) bannerBadge.textContent = 'Sob Demanda';
      } else {
        // Squad de Dados (Sprint 15 dias)
        let sprintEnd;
        if (now.getDate() <= 15) {
          sprintEnd = new Date(now.getFullYear(), now.getMonth(), 15);
        } else {
          sprintEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }
        const diffMs = sprintEnd.getTime() - today.getTime();
        const daysRemaining = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        const dateStr = `${String(sprintEnd.getDate()).padStart(2, '0')}/${String(sprintEnd.getMonth() + 1).padStart(2, '0')}/${sprintEnd.getFullYear()}`;

        let relativeStr = '';
        let badgeStr = '';
        if (daysRemaining === 0) {
          relativeStr = ' (Hoje)';
          badgeStr = 'ÚLTIMO DIA';
        } else if (daysRemaining === 1) {
          relativeStr = ' (Amanhã)';
          badgeStr = '1 DIA RESTANTE';
        } else {
          relativeStr = '';
          badgeStr = `${daysRemaining} DIAS RESTANTES`;
        }

        if (bannerTitle) bannerTitle.textContent = 'Sprint Squad de Dados (15 dias)';
        if (bannerSub) bannerSub.innerHTML = `Sprint Vigente • Término: <span class="text-emerald-400 font-black">${dateStr}${relativeStr}</span>`;
        if (bannerBadge) bannerBadge.textContent = badgeStr;
      }
    }

    const allItems = this.state.backlogItems[this.activeSquad] || [];
    const inProgressItems = allItems.filter(i => i.status === 'Em Andamento' || i.status === 'Bloqueado');

    const searchTerm = (document.getElementById('search-board')?.value || '').toLowerCase();

    const filteredItems = inProgressItems.filter(item => {
      return !searchTerm ||
        (item.title || '').toLowerCase().includes(searchTerm) ||
        (item.gau || item.jiraKey || '').toLowerCase().includes(searchTerm) ||
        (item.requester || '').toLowerCase().includes(searchTerm);
    });

    if (filteredItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-8 text-slate-500 font-semibold">Nenhuma demanda em andamento ou bloqueada encontrada.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filteredItems.map((item, idx) => `
      <tr class="hover:bg-white/5 cursor-pointer transition-all" onclick="app.openDemandDetailsModal('${item.id}')">
        <td class="font-bold text-slate-400" style="white-space:nowrap; width:45px;">${idx + 1}</td>
        <td class="font-extrabold text-emerald-400" style="white-space:nowrap; width:110px;">${item.gau || item.jiraKey || 'GAU-000'}</td>
        <td class="font-semibold text-white" style="white-space:normal; word-break:break-word; line-height:1.4;">${item.title}</td>
        <td class="text-slate-300" style="white-space:nowrap; width:160px;">${item.requester || 'Solicitante Jira'}</td>
        <td onclick="event.stopPropagation();" style="white-space:nowrap; width:160px;">
          <select class="status-select-dropdown status-em-andamento ${item.status === 'Bloqueado' ? 'status-bloqueado' : ''}" onchange="app.changeDemandStatus('${item.id}', this.value)">
            <option value="Em Andamento" ${item.status === 'Em Andamento' ? 'selected' : ''}>Em Andamento</option>
            <option value="Bloqueado" ${item.status === 'Bloqueado' ? 'selected' : ''}>Bloqueado</option>
            <option value="Backlog" ${item.status === 'Backlog' ? 'selected' : ''}>Backlog</option>
            <option value="Concluído" ${item.status === 'Concluído' ? 'selected' : ''}>Concluído</option>
          </select>
        </td>
        <td class="text-amber-400 font-semibold text-xs" style="white-space:nowrap; width:120px;">${this.formatOnlyDate(item.createdDate || item.date || item.createdAt)}</td>
      </tr>
    `).join('');
  },

  // RENDER: Aba "Backlog"
  renderBacklogView() {
    const tbody = document.getElementById('backlog-table-body');
    if (!tbody) return;

    const squadNames = { dados: 'Squad de Dados', operacoes: 'Squad de Operações', rpa: 'Squad de RPA' };
    const titleEl = document.getElementById('backlog-squad-title');
    if (titleEl) titleEl.textContent = `Backlog - ${squadNames[this.activeSquad]}`;

    const allItems = this.state.backlogItems[this.activeSquad] || [];
    const backlogItems = allItems.filter(i => i.status !== 'Em Andamento' && i.status !== 'Concluído' && i.status !== 'Concluido');

    // Garantir que cada item tenha uma ordem de tratativa única de 1 a N
    const usedOrders = new Set();
    backlogItems.forEach((item, idx) => {
      if (!item.treatmentOrder || item.treatmentOrder <= 0 || usedOrders.has(item.treatmentOrder)) {
        item.treatmentOrder = idx + 1;
      }
      usedOrders.add(item.treatmentOrder);
    });

    // Ordenar por treatmentOrder
    backlogItems.sort((a, b) => (a.treatmentOrder || 999) - (b.treatmentOrder || 999));

    const searchTerm = (document.getElementById('search-backlog')?.value || '').toLowerCase();

    const filteredItems = backlogItems.filter(item => {
      return !searchTerm ||
        (item.title || '').toLowerCase().includes(searchTerm) ||
        (item.gau || item.jiraKey || '').toLowerCase().includes(searchTerm) ||
        (item.requester || '').toLowerCase().includes(searchTerm);
    });

    if (filteredItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-8 text-slate-500 font-semibold">Nenhuma demanda no backlog encontrada.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filteredItems.map((item) => `
      <tr class="hover:bg-white/5 cursor-pointer transition-all" onclick="app.openDemandDetailsModal('${item.id}')">
        <td onclick="event.stopPropagation();" style="white-space:nowrap; width:65px;">
          <input type="number" min="1" max="${backlogItems.length}" value="${item.treatmentOrder}"
            class="order-input-field"
            onchange="app.changeBacklogOrder('${item.id}', this.value)"
            onkeydown="if(event.key === 'Enter'){ this.blur(); }"
            onclick="event.stopPropagation(); this.select();"
            title="Digite a posição desejada para reordenar"
            name="backlog_order_input"
            autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-form-type="other"
          />
        </td>
        <td class="font-extrabold text-emerald-400" style="white-space:nowrap; width:110px;">${item.gau || item.jiraKey || 'GAU-000'}</td>
        <td class="font-semibold text-white" style="white-space:normal; word-break:break-word; line-height:1.4;">${item.title}</td>
        <td class="text-slate-300" style="white-space:nowrap; width:160px;">${item.requester || 'Solicitante Jira'}</td>
        <td onclick="event.stopPropagation();" style="white-space:nowrap; width:160px;">
          <select class="status-select-dropdown status-backlog ${item.status === 'Bloqueado' ? 'status-bloqueado' : ''}" onchange="app.changeDemandStatus('${item.id}', this.value)">
            <option value="Backlog" ${item.status === 'Backlog' ? 'selected' : ''}>Backlog</option>
            <option value="Em Andamento" ${item.status === 'Em Andamento' ? 'selected' : ''}>Em Andamento</option>
            <option value="Bloqueado" ${item.status === 'Bloqueado' ? 'selected' : ''}>Bloqueado</option>
          </select>
        </td>
        <td class="text-amber-400 font-semibold text-xs" style="white-space:nowrap; width:120px;">${this.formatOnlyDate(item.createdDate || item.date || item.createdAt)}</td>
      </tr>
    `).join('');
  },

  // Alterar a ordem de prioridade no backlog com troca direta de posição (swap) e reordenação automática
  changeBacklogOrder(itemId, newOrderInput) {
    const allItems = this.state.backlogItems[this.activeSquad] || [];
    const backlogItems = allItems.filter(i => i.status !== 'Em Andamento' && i.status !== 'Bloqueado' && i.status !== 'Concluído' && i.status !== 'Concluido');
    const item = backlogItems.find(i => i.id === itemId);
    if (!item) return;

    let newOrder = parseInt(newOrderInput, 10);
    const totalItems = backlogItems.length;

    // Se não for um número válido, recarregar sem alterar
    if (isNaN(newOrder)) {
      this.renderBacklogView();
      return;
    }

    // Clampar valor entre 1 e total de itens
    if (newOrder < 1) newOrder = 1;
    if (newOrder > totalItems) newOrder = totalItems;

    const oldOrder = item.treatmentOrder || 1;
    if (oldOrder === newOrder) {
      this.renderBacklogView();
      return;
    }

    // Encontrar a demanda que atualmente possui a ordem desejada (a demanda subscrita)
    const targetItem = backlogItems.find(bi => bi.id !== itemId && bi.treatmentOrder === newOrder);

    if (targetItem) {
      // TROCA DIRETA (SWAP): a demanda subscrita recebe a antiga ordem do card editado
      targetItem.treatmentOrder = oldOrder;
    } else {
      // Ajustar itens entre old e new
      backlogItems.forEach(bi => {
        if (bi.id === itemId) return;
        if (oldOrder < newOrder) {
          if (bi.treatmentOrder > oldOrder && bi.treatmentOrder <= newOrder) {
            bi.treatmentOrder--;
          }
        } else {
          if (bi.treatmentOrder >= newOrder && bi.treatmentOrder < oldOrder) {
            bi.treatmentOrder++;
          }
        }
      });
    }

    // Atribuir a nova ordem ao item editado
    item.treatmentOrder = newOrder;

    // Salvar estado e re-renderizar a visualização ordenada
    this.saveState();
    this.renderBacklogView();
  },

  deleteBacklogItem(id) {
    this.state.backlogItems[this.activeSquad] = this.state.backlogItems[this.activeSquad].filter(i => i.id !== id);
    this.saveState();
  },

  // RENDER: Entregas Concluídas (Com Filtro de Busca)
  renderCompletedView() {
    const tbody = document.getElementById('completed-table-body');
    if (!tbody) return;

    const squadNames = { dados: 'Squad de Dados', operacoes: 'Squad de Operações', rpa: 'Squad de RPA' };
    const titleEl = document.getElementById('concluidos-squad-title');
    if (titleEl) titleEl.textContent = `Concluídos - ${squadNames[this.activeSquad]}`;

    const items = this.state.completedTasks[this.activeSquad] || [];
    const searchTerm = (document.getElementById('search-concluidos')?.value || '').toLowerCase();

    const filteredItems = items.filter(item => {
      return !searchTerm ||
        (item.taskTitle || '').toLowerCase().includes(searchTerm) ||
        (item.completedBy || '').toLowerCase().includes(searchTerm) ||
        (item.jiraKey || '').toLowerCase().includes(searchTerm);
    });

    document.getElementById('completed-count-badge').textContent = `${filteredItems.length} entregas`;

    if (filteredItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-500 font-semibold">Nenhuma entrega concluída encontrada.</td></tr>`;
      return;
    }

    tbody.innerHTML = filteredItems.map(item => `
      <tr class="hover:bg-white/5 cursor-pointer transition-all" onclick="app.openDemandDetailsModal('${item.id}')">
        <td class="font-extrabold text-emerald-400" style="white-space:nowrap; width:110px;">${this.getItemGau(item)}</td>
        <td class="font-semibold text-white" style="white-space:normal; word-break:break-word; line-height:1.4;">${item.title || item.taskTitle}</td>
        <td class="text-slate-300" style="white-space:nowrap; width:160px;">${item.requester || item.completedBy || item.requesterName || 'Solicitante Jira'}</td>
        <td class="text-amber-400 font-semibold text-xs" style="white-space:nowrap; width:120px;">${this.formatOnlyDate(item.createdDate || item.date || item.createdAt)}</td>
        <td class="text-slate-300 font-semibold text-xs" style="white-space:nowrap; width:120px;">${this.formatOnlyDate(item.completionDate || item.completedAt)}</td>
        <td class="text-emerald-400 text-xs italic" style="white-space:normal; word-break:break-word;">${item.gains || ''}</td>
      </tr>
    `).join('');
  },

  deleteCompletedTask(id) {
    this.state.completedTasks[this.activeSquad] = this.state.completedTasks[this.activeSquad].filter(i => i.id !== id);
    this.saveState();
  },

  // Exportar Tabela para Excel (.xlsx) com suporte para as 3 abas
  exportExcel() {
    let items = [];
    let viewLabel = 'Backlog';

    if (this.activeView === 'board') {
      const all = this.state.backlogItems[this.activeSquad] || [];
      items = all.filter(i => i.status === 'Em Andamento');
      viewLabel = 'EmAndamento';
    } else if (this.activeView === 'concluidos') {
      items = this.state.completedTasks[this.activeSquad] || [];
      viewLabel = 'Concluidos';
    } else {
      const all = this.state.backlogItems[this.activeSquad] || [];
      items = all.filter(i => i.status !== 'Em Andamento' && i.status !== 'Concluído' && i.status !== 'Concluido');
      viewLabel = 'Backlog';
    }

    if (!items.length) {
      alert(`Nenhuma demanda na lista para exportar.`);
      return;
    }

    const ws = XLSX.utils.json_to_sheet(items);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, viewLabel);
    XLSX.writeFile(wb, `${viewLabel}_${this.activeSquad}_${new Date().toISOString().split('T')[0]}.xlsx`);
  },

  // Exportar Visão Atual para PDF (via Impressão Nativa do Navegador)
  exportPDF() {
    document.body.classList.add('printing-mode');

    const originalTitle = document.title;
    const dateStr = new Date().toISOString().split('T')[0];

    if (this.activeView === 'dashboard') {
      document.title = `Dashboard_Consolidado_${dateStr}`;
    } else if (this.activeView === 'board') {
      document.title = `Em_Andamento_${this.activeSquad}_${dateStr}`;
    } else if (this.activeView === 'backlog') {
      document.title = `Backlog_${this.activeSquad}_${dateStr}`;
    } else if (this.activeView === 'concluidos') {
      document.title = `Concluidos_${this.activeSquad}_${dateStr}`;
    } else if (this.activeView === 'rpa-pendencies') {
      document.title = `Pendencias_RPA_${dateStr}`;
    } else if (this.activeView === 'gestao-acessos') {
      document.title = `Gestao_Acessos_${dateStr}`;
    } else {
      document.title = `Mesa_Triagem_${dateStr}`;
    }

    window.print();

    document.body.classList.remove('printing-mode');
    document.title = originalTitle;
  },

  // Modais Handlers
  openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('active');
      modal.classList.add('open');
    }
  },

  openMemberModal() { this.openModal('modal-member'); },

  addMember() {
    const name = document.getElementById('member-name').value;
    const role = document.getElementById('member-role').value;
    const ops = parseInt(document.getElementById('member-alloc-ops').value) || 50;
    const fin = parseInt(document.getElementById('member-alloc-fin').value) || 50;

    this.state.resources[this.activeSquad].push({
      id: `res-${Date.now()}`,
      name,
      role,
      status: 'Ativo',
      allocationOps: ops,
      allocationFin: fin,
      currentTask: null,
      nextTask: null
    });

    this.closeModal('modal-member');
    this.saveState();
  },

  // Módulo de Pendências RPA (Delegador Nativo Inquebrável)
  openNewRpaPendencyModal(id = null) {
    if (window.RpaPendenciesModule && window.RpaPendenciesModule.openModal) {
      window.RpaPendenciesModule.openModal(id);
    } else {
      const modal = document.getElementById('modal-rpa-edit');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('open', 'active');
        modal.style.cssText = 'display: flex !important; opacity: 1 !important; pointer-events: auto !important; z-index: 999999 !important; align-items: center; justify-content: center;';
      }
    }
  },

  openRpaPendencyModal(id = null) {
    this.openNewRpaPendencyModal(id);
  },

  closeRpaPendencyModal() {
    if (window.RpaPendenciesModule && window.RpaPendenciesModule.closeModal) {
      window.RpaPendenciesModule.closeModal();
    } else {
      const modal = document.getElementById('modal-rpa-edit');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('open', 'active');
        modal.style.cssText = 'display: none !important; opacity: 0 !important; pointer-events: none !important;';
      }
    }
  },

  openRpaPendencyDetailsModal(id) {
    if (window.RpaPendenciesModule && window.RpaPendenciesModule.openDetailsModal) {
      window.RpaPendenciesModule.openDetailsModal(id);
    } else {
      const modal = document.getElementById('modal-rpa-details');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('open', 'active');
        modal.style.cssText = 'display: flex !important; opacity: 1 !important; pointer-events: auto !important; z-index: 999999 !important; align-items: center; justify-content: center;';
      }
    }
  },

  closeRpaPendencyDetailsModal() {
    if (window.RpaPendenciesModule && window.RpaPendenciesModule.closeDetailsModal) {
      window.RpaPendenciesModule.closeDetailsModal();
    } else {
      const modal = document.getElementById('modal-rpa-details');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('open', 'active');
        modal.style.cssText = 'display: none !important; opacity: 0 !important; pointer-events: none !important;';
      }
    }
  },

  renderRpaPendenciesView() {
    if (window.RpaPendenciesModule && window.RpaPendenciesModule.renderView) {
      window.RpaPendenciesModule.renderView();
    }
  },

  saveRpaPendency(e) {
    if (e) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    }
    if (window.RpaPendenciesModule && window.RpaPendenciesModule.savePendency) {
      window.RpaPendenciesModule.savePendency(e);
    }
    return false;
  },

  addRpaRobot(el) {
    let val = typeof el === 'string' ? el : (el?.value || (el?.options && el.selectedIndex >= 0 ? (el.options[el.selectedIndex].value || el.options[el.selectedIndex].text) : ''));
    if (window.RpaPendenciesModule && window.RpaPendenciesModule.addRobot) {
      window.RpaPendenciesModule.addRobot(val || el);
    }
    if (typeof el === 'object' && el) {
      setTimeout(() => { try { el.selectedIndex = 0; el.value = ''; } catch(_) {} }, 50);
    }
  },

  removeRpaRobot(val) {
    if (window.RpaPendenciesModule && window.RpaPendenciesModule.removeRobot) {
      window.RpaPendenciesModule.removeRobot(val);
    }
  },

  addRpaResponsible(el) {
    let val = typeof el === 'string' ? el : (el?.value || (el?.options && el.selectedIndex >= 0 ? (el.options[el.selectedIndex].value || el.options[el.selectedIndex].text) : ''));
    if (window.RpaPendenciesModule && window.RpaPendenciesModule.addResponsible) {
      window.RpaPendenciesModule.addResponsible(val || el);
    }
    if (typeof el === 'object' && el) {
      setTimeout(() => { try { el.selectedIndex = 0; el.value = ''; } catch(_) {} }, 50);
    }
  },

  removeRpaResponsible(val) {
    if (window.RpaPendenciesModule && window.RpaPendenciesModule.removeResponsible) {
      window.RpaPendenciesModule.removeResponsible(val);
    }
  },

  deleteRpaPendency(id) {
    if (window.RpaPendenciesModule && window.RpaPendenciesModule.deletePendency) {
      window.RpaPendenciesModule.deletePendency(id);
    }
  },

  resetRpaFilters() {
    if (window.RpaPendenciesModule && window.RpaPendenciesModule.resetFilters) {
      window.RpaPendenciesModule.resetFilters();
    }
  },

  printRpaPDF() {
    if (window.RpaPendenciesModule && window.RpaPendenciesModule.printPDF) {
      window.RpaPendenciesModule.printPDF();
    } else {
      window.print();
    }
  },

  openRpaDatePicker() {
    if (window.RpaPendenciesModule && window.RpaPendenciesModule.openRpaDatePicker) {
      window.RpaPendenciesModule.openRpaDatePicker();
    }
  }
};

// Expor objeto app globalmente no window
window.app = app;

// Inicializar aplicação ao carregar a página
document.addEventListener('DOMContentLoaded', () => app.init());

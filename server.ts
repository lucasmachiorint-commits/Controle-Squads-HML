import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

interface WebhookLog {
  id: string;
  timestamp: string;
  event: string;
  jiraKey: string;
  summary: string;
  squad?: string;
  status?: string;
  payloadSnippet: string;
}

interface JiraEvent {
  id: string;
  event: string; // 'jira:issue_created' | 'jira:issue_updated' | 'jira:issue_resolved'
  jiraKey: string;
  summary: string;
  description?: string;
  requesterName?: string;
  requesterEmail?: string;
  requesterArea?: string;
  issueType?: string;
  priority?: string;
  category?: string;
  squad?: string; // 'dados' | 'operacoes' | 'rpa'
  status?: string;
  receivedAt: string;
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: ['text/plain', 'text/html', 'application/xml'] }));

// In-memory logs and events for live sync
const webhookLogs: WebhookLog[] = [];
const jiraEvents: JiraEvent[] = [];

function recordEventAndLog(
  event: string, 
  jiraKey: string, 
  summary: string, 
  squad?: string, 
  status?: string, 
  extraData: Partial<JiraEvent> = {},
  rawPayloadSnippet?: string
) {
  const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  
  const newLog: WebhookLog = {
    id: `log-${eventId}`,
    timestamp: nowStr,
    event,
    jiraKey,
    summary,
    squad,
    status,
    payloadSnippet: rawPayloadSnippet || JSON.stringify({ event, jiraKey, summary, squad, status })
  };
  webhookLogs.unshift(newLog);
  if (webhookLogs.length > 50) webhookLogs.pop();

  const newJiraEvent: JiraEvent = {
    id: eventId,
    event,
    jiraKey,
    summary,
    squad,
    status,
    description: extraData.description || 'Demanda recebida via automação do Jira.',
    requesterName: extraData.requesterName || 'Solicitante Jira',
    requesterEmail: extraData.requesterEmail || 'solicitante@empresa.com',
    requesterArea: extraData.requesterArea || 'Área Solicitante',
    issueType: extraData.issueType || 'Formulário Jira',
    priority: extraData.priority || '2 - Alta',
    category: extraData.category || 'Outros',
    receivedAt: nowStr
  };

  jiraEvents.unshift(newJiraEvent);
  if (jiraEvents.length > 50) jiraEvents.pop();

  return newJiraEvent;
}

// 1. Jira Webhook Listener Endpoint (Handles POST, GET, HEAD, OPTIONS and trailing slashes without redirects)
const handleJiraWebhook = (req: express.Request, res: express.Response) => {
  // CORS & Options Pre-flight support
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS, HEAD");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

  if (req.method === "OPTIONS" || req.method === "HEAD") {
    return res.status(200).end();
  }

  // Handle GET (Jira validation ping or browser check)
  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      message: "Jira Webhook Endpoint Ativo e Pronto",
      timestamp: new Date().toISOString()
    });
  }

  // Handle POST (Actual Jira Webhook Event)
  try {
    const body = req.body || {};
    const event = body.webhookEvent || body.event || 'jira:issue_created';
    const issue = body.issue || {};
    const jiraKey = issue.key || body.key || `JIRA-${Math.floor(100 + Math.random() * 900)}`;
    const fields = issue.fields || {};
    const summary = fields.summary || body.summary || 'Nova solicitação do Jira';
    
    // Extract squad custom field or status if provided
    const squad = fields.customfield_squad || body.squad || body.suggestedSquad;
    const status = fields.status?.name || body.status || 'Triagem';

    const recordedEvent = recordEventAndLog(
      event,
      jiraKey,
      summary,
      squad,
      status,
      {
        description: fields.description || body.description,
        requesterName: fields.reporter?.displayName || body.requesterName,
        requesterEmail: fields.reporter?.emailAddress || body.requesterEmail,
        requesterArea: fields.customfield_area || body.requesterArea,
        issueType: fields.issuetype?.name || body.issueType,
        priority: fields.priority?.name || body.priority,
        category: fields.customfield_category || body.category
      },
      JSON.stringify(body)
    );

    return res.status(200).json({
      success: true,
      message: `Webhook processado com sucesso para a key ${jiraKey}`,
      receivedAt: new Date().toISOString(),
      event: recordedEvent
    });
  } catch (error: any) {
    console.error("Erro ao processar Webhook do Jira:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

app.all("/api/jira/webhook", handleJiraWebhook);
app.all("/api/jira/webhook/", handleJiraWebhook);

// 2. Fetch Recent Webhook Logs & Events Endpoint
app.get("/api/jira/logs", (req, res) => {
  res.json({
    success: true,
    totalLogs: webhookLogs.length,
    logs: webhookLogs
  });
});

app.get("/api/jira/events", (req, res) => {
  res.json({
    success: true,
    totalEvents: jiraEvents.length,
    events: jiraEvents
  });
});

// 3. Jira Simulator Endpoint for Testing
app.post("/api/jira/simulate", (req, res) => {
  const { eventType, jiraKey, title, requesterName, requesterArea, priority, category, squadId, statusName, description } = req.body;
  
  const key = jiraKey || `JIRA-${Math.floor(100 + Math.random() * 900)}`;
  const summary = title || 'Nova solicitação via Formulário Jira';

  const recordedEvent = recordEventAndLog(
    eventType || 'jira:issue_created',
    key,
    summary,
    squadId,
    statusName || (eventType === 'jira:issue_resolved' ? 'Concluído' : 'Triagem'),
    {
      description: description || 'Solicitação gerada no Jira para teste de integração passiva.',
      requesterName: requesterName || 'Mariana Costa (Jira)',
      requesterArea: requesterArea || 'Financeiro & CX',
      priority: priority || '2 - Alta',
      category: category || 'Dashboard'
    },
    JSON.stringify(req.body)
  );

  res.json({
    success: true,
    message: `Simulação de evento '${eventType}' realizada para ${key}`,
    simulatedAt: new Date().toISOString(),
    event: recordedEvent
  });
});

// Helper: Extrair texto limpo de descrições no formato ADF (Atlassian Document Format)
function extractAdfText(doc: any): string {
  if (!doc) return '';
  if (typeof doc === 'string') return doc;
  if (doc.type === 'text') return doc.text || '';
  if (Array.isArray(doc.content)) {
    return doc.content.map(extractAdfText).join(' ');
  }
  return '';
}

// Helper: Mapear squad baseado nas opções Jira (16005 = Operações, 16006 = Dados, 16007 = RPA) ou por nome
function parseSquadFromFields(fields: any): string {
  const fieldsJson = JSON.stringify(fields);
  if (fieldsJson.includes('16006') || fieldsJson.toLowerCase().includes('dados operações') || fieldsJson.toLowerCase().includes('squad de dados')) {
    return 'Squad de Dados';
  }
  if (fieldsJson.includes('16005') || fieldsJson.toLowerCase().includes('operações npay') || fieldsJson.toLowerCase().includes('squad de operações')) {
    return 'Squad de Operações';
  }
  if (fieldsJson.includes('16007') || fieldsJson.toLowerCase().includes('rpa') || fieldsJson.toLowerCase().includes('squad de rpa')) {
    return 'Squad de RPA';
  }
  return 'Squad de Operações';
}

// Helper: Mapear prioridades
function parsePriority(priorityName?: string): '1 - Urgente' | '2 - Alta' | '3 - Média' | '4 - Baixa' {
  if (!priorityName) return '3 - Média';
  const p = priorityName.toLowerCase();
  if (p.includes('highest') || p.includes('urgente') || p.includes('blocker')) return '1 - Urgente';
  if (p.includes('high') || p.includes('alta')) return '2 - Alta';
  if (p.includes('medium') || p.includes('média') || p.includes('media')) return '3 - Média';
  return '4 - Baixa';
}

// Endpoint de Diagnóstico/Health-Check da Conexão Jira
app.get("/api/jira/health-check", async (req, res) => {
  const domain = (process.env.JIRA_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL || "";
  const token = process.env.JIRA_API_TOKEN || "";

  if (!domain || !email || !token || domain === "seu-dominio.atlassian.net") {
    return res.status(400).json({
      configured: false,
      message: "Credenciais do Jira ausentes ou não configuradas no arquivo .env (preencha JIRA_DOMAIN, JIRA_EMAIL e JIRA_API_TOKEN)"
    });
  }

  try {
    // Desabilitar temporariamente a rejeição de certificados SSL de redes corporativas/proxy
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const auth = Buffer.from(`${email}:${token}`).toString("base64");
    const response = await fetch(`https://${domain}/rest/api/3/myself`, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json"
      }
    });

    if (response.ok) {
      const userData = await response.json();
      return res.json({
        configured: true,
        success: true,
        authenticatedUser: userData.displayName || userData.emailAddress,
        domain
      });
    } else {
      const errText = await response.text();
      return res.status(401).json({
        configured: true,
        success: false,
        status: response.status,
        error: "Falha na autenticação com a API do Jira Cloud. Verifique o email e o API Token.",
        details: errText
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      configured: true,
      success: false,
      error: error.message || "Erro ao tentar conectar ao Jira Cloud"
    });
  }
});

// 4. Supabase Edge Function / Proxy Local para Consultar Cards Reais do Jira (Projeto GAU)
app.all("/api/jira/consultar-cards-jira", async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const domain = (process.env.JIRA_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL || "";
  const token = process.env.JIRA_API_TOKEN || "";

  // Se credenciais do Jira não estiverem preenchidas no .env, avisa no log e usa fallback
  if (!domain || !email || !token) {
    console.warn("[Jira Proxy] Credenciais do Jira não preenchidas no .env. Retornando cards de demonstração.");
    const sampleCards = [
      {
        key: "GAU-101",
        title: "Demanda de Teste: Ingestão de Dados DW (Insira credenciais reais no .env)",
        status: "Abertos",
        squad: "Squad de Dados",
        requester: "Sistema GAU",
        description: "Configure JIRA_DOMAIN, JIRA_EMAIL e JIRA_API_TOKEN no arquivo .env para buscar dados reais do espaço GAU",
        priority: "2 - Alta",
        category: "Ingestão"
      }
    ];
    return res.status(200).json({
      success: true,
      source: "mock-fallback",
      message: "Aviso: Preencha as credenciais no .env para buscar os cards reais do projeto GAU.",
      cards: sampleCards
    });
  }

  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const auth = Buffer.from(`${email}:${token}`).toString("base64");
    
    // Consulta JQL focada no projeto GAU (Governança Automação) usando a nova API v3 search/jql
    const jqlQuery = req.query.jql as string || "project = GAU ORDER BY created DESC";
    const jiraUrl = `https://${domain}/rest/api/3/search/jql?jql=${encodeURIComponent(jqlQuery)}&fields=*all&maxResults=100`;

    console.log(`[Jira Proxy] Consultando Jira Cloud (Projeto GAU): ${jiraUrl}`);

    const response = await fetch(jiraUrl, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Jira Proxy] Erro na API do Jira (${response.status}):`, errText);
      return res.status(response.status).json({
        success: false,
        error: `Erro da API do Jira: ${response.statusText}`,
        details: errText
      });
    }

    const data = await response.json();
    const issues = data.issues || [];

    // Mapeamento das issues reais para a estrutura aceita pelo Frontend
    const mappedCards = issues.map((issue: any) => {
      const fields = issue.fields || {};
      const rawStatus = fields.status?.name || 'Abertos';
      const squad = parseSquadFromFields(fields);
      const description = extractAdfText(fields.description) || fields.description || 'Sem descrição cadastrada';

      return {
        key: issue.key,
        title: fields.summary || 'Sem título',
        status: rawStatus,
        squad: squad,
        requester: fields.reporter?.displayName || 'Solicitante Jira',
        requesterEmail: fields.reporter?.emailAddress,
        description: description,
        priority: parsePriority(fields.priority?.name),
        category: fields.components?.[0]?.name || 'Processos',
        created: fields.created
      };
    });

    console.log(`[Jira Proxy] ${mappedCards.length} cards reais obtidos do espaço GAU com sucesso.`);

    return res.status(200).json({
      success: true,
      source: "jira-cloud-api-real",
      totalIssues: data.total,
      cards: mappedCards
    });

  } catch (error: any) {
    console.error("[Jira Proxy] Exceção ao consultar API do Jira:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Erro interno ao conectar ao Jira"
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "EmanaPay Squads Integration Engine" });
});

// Explicit API 404 handler (prevents /api/ requests from falling through to Vite or index.html)
app.all("/api/*", (req, res) => {
  res.status(404).json({ success: false, error: "API endpoint não encontrado" });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[EmanaPay Server] Servidor de Integração rodando na porta ${PORT}`);
  });
}

startServer();

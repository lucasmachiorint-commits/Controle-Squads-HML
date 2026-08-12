const express = require('express');
const path = require('path');
const fs = require('fs');

// Carregar .env se existir
if (fs.existsSync('.env')) {
  require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Permite requisições CORS de qualquer origem (inclusive do GitHub Pages)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.static(__dirname));

// Parser para o formato ADF (Atlassian Document Format) do Jira v3
function parseADFDescription(doc) {
  if (!doc) return 'Sem descrição';
  if (typeof doc === 'string') return doc;
  if (doc.type === 'doc' && Array.isArray(doc.content)) {
    let texts = [];
    function traverse(node) {
      if (node.type === 'text' && node.text) texts.push(node.text);
      if (Array.isArray(node.content)) node.content.forEach(traverse);
    }
    doc.content.forEach(traverse);
    return texts.join(' ') || 'Sem descrição';
  }
  return 'Sem descrição';
}

// Proxy para consultar cards do Jira Cloud em tempo real com paginação nextPageToken (100% dos chamados)
app.get('/api/jira/consultar-cards-jira', async (req, res) => {
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    const domain = process.env.JIRA_DOMAIN || 'naturapay.atlassian.net';
    const email = process.env.JIRA_EMAIL || 'lucas.machiori.nt@naturapay.net';
    const token = process.env.JIRA_API_TOKEN || '';

    if (!email || !token) {
      return res.json({ success: false, message: 'Credenciais Jira ausentes no .env', cards: [] });
    }

    const authHeader = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
    
    let allIssues = [];
    let startAt = 0;
    let maxResults = 100;
    let nextPageToken = null;
    let pageCount = 0;
    const maxPages = 50; // Limite de segurança de até 5.000 chamados

    const customJQL = process.env.JIRA_JQL || 'project = GAU ORDER BY created DESC';
    const jqlQuery = encodeURIComponent(customJQL);

    // Paginação híbrida (suporta nextPageToken do Jira Cloud REST v3 e startAt/total tradicional)
    while (pageCount < maxPages) {
      pageCount++;
      let jiraUrl = `https://${domain}/rest/api/3/search/jql?jql=${jqlQuery}&fields=*all&maxResults=${maxResults}&startAt=${startAt}`;
      if (nextPageToken) {
        jiraUrl += `&nextPageToken=${encodeURIComponent(nextPageToken)}`;
      }

      let response = await fetch(jiraUrl, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      let json = null;
      if (!response.ok) {
        // Fallback para o endpoint v3 clássico /rest/api/3/search se o endpoint /jql não responder
        const fallbackUrl = `https://${domain}/rest/api/3/search?jql=${jqlQuery}&fields=*all&maxResults=${maxResults}&startAt=${startAt}`;
        const fallbackRes = await fetch(fallbackUrl, {
          method: 'GET',
          headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
        });

        if (!fallbackRes.ok) {
          const errText = await response.text();
          console.error('[Jira API Error]:', response.status, errText);
          break;
        }
        json = await fallbackRes.json();
      } else {
        json = await response.json();
      }

      const issues = json.issues || [];
      if (!issues.length) break;

      allIssues = allIssues.concat(issues);
      startAt += issues.length;

      // Verificar condição de parada (nextPageToken ou total de itens atingido)
      if (json.nextPageToken) {
        nextPageToken = json.nextPageToken;
      } else {
        nextPageToken = null;
      }

      if (json.isLast || (json.total && startAt >= json.total) || issues.length < maxResults) {
        break;
      }
    }

    const cards = allIssues.map((issue, idx) => {
      const fields = issue.fields || {};
      const statusName = fields.status?.name || 'Aberto';
      const catStatus = fields.status?.statusCategory?.name || 'To Do';
      const summary = fields.summary || 'Demanda do Jira';
      const reporter = fields.reporter?.displayName || 'Solicitante Jira';

      // Data de Criação do Card
      let createdFormatted = 'Data N/D';
      if (fields.created) {
        try {
          const d = new Date(fields.created);
          createdFormatted = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
          createdFormatted = fields.created;
        }
      }

      // Identificar a Squad de Atendimento a partir do customfield_12475 (16005 = Operações NPay, 16006 = Dados Operações, 16007 = RPA)
      let squadId = 'dados';
      let squadName = 'Squad de Dados';

      const cfSquad = fields.customfield_12475 || fields.customfield_16005 || fields.customfield_16006 || fields.customfield_16007 || fields.customfield_squad;
      let cfStr = '';
      if (cfSquad) {
        if (typeof cfSquad === 'object') {
          cfStr = (cfSquad.id || cfSquad.value || JSON.stringify(cfSquad)).toString().toLowerCase();
        } else {
          cfStr = cfSquad.toString().toLowerCase();
        }
      }

      if (cfStr.includes('16005') || cfStr.includes('operac') || cfStr.includes('operaç')) {
        squadId = 'operacoes';
        squadName = 'Squad de Operações';
      } else if (cfStr.includes('16007') || cfStr.includes('rpa')) {
        squadId = 'rpa';
        squadName = 'Squad de RPA';
      } else if (cfStr.includes('16006') || cfStr.includes('dados')) {
        squadId = 'dados';
        squadName = 'Squad de Dados';
      }

      return {
        id: issue.id || `jira-${idx}`,
        key: issue.key,
        jiraKey: issue.key,
        title: summary,
        summary,
        status: statusName,
        categoriaStatus: catStatus,
        squad: squadName,
        squadTarget: squadId,
        customfield_12475: cfSquad,
        requester: reporter,
        priority: fields.priority?.name || '2 - Alta',
        category: 'Geral',
        createdDate: createdFormatted,
        description: parseADFDescription(fields.description)
      };
    });

    console.log(`[Jira Proxy] ${cards.length} cards reais obtidos do espaço GAU com sucesso via nextPageToken.`);
    return res.json({ success: true, count: cards.length, cards });
  } catch (err) {
    console.error('Erro no Proxy Jira:', err);
    return res.status(500).json({ success: false, error: err.message, cards: [] });
  }
});

// Endpoint para Atualização Bidirecional no Jira Cloud (Atualiza customfield_12475 e move no Jira)
app.post('/api/jira/encaminhar-squad-jira', async (req, res) => {
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    const { jiraKey, squadId } = req.body;
    if (!jiraKey || !squadId) {
      return res.status(400).json({ success: false, message: 'Parâmetros jiraKey e squadId são obrigatórios' });
    }

    const domain = process.env.JIRA_DOMAIN || 'naturapay.atlassian.net';
    const email = process.env.JIRA_EMAIL || 'lucas.machiori.nt@naturapay.net';
    const token = process.env.JIRA_API_TOKEN || '';

    if (!email || !token) {
      return res.json({ success: false, message: 'Credenciais Jira ausentes no .env' });
    }

    const authHeader = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');

    // Mapeamento de Squad ID para a Opção do Custom Field 12475 no Jira Cloud
    const squadOptionMap = {
      dados: '16006',     // Dados Operações
      operacoes: '16005', // Operações NPay
      rpa: '16007'        // RPA
    };

    const optionId = squadOptionMap[squadId] || '16006';

    // 1. Atualizar o campo Squad Atendimento (customfield_12475) no Jira Cloud
    const editUrl = `https://${domain}/rest/api/3/issue/${jiraKey}`;
    const editRes = await fetch(editUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          customfield_12475: { id: optionId }
        }
      })
    });

    if (!editRes.ok) {
      const errText = await editRes.text();
      console.warn(`[Jira Cloud Update Warning] Falha ao atualizar customfield_12475 no card ${jiraKey}:`, errText);
    } else {
      console.log(`[Jira Cloud Update Success] Card ${jiraKey} atualizado com a Squad de Atendimento ID ${optionId}`);
    }

    // 2. Buscar transições disponíveis no Jira Cloud para alterar o status para Aguardando Squad
    const transUrl = `https://${domain}/rest/api/3/issue/${jiraKey}/transitions`;
    const transRes = await fetch(transUrl, {
      method: 'GET',
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
    });

    if (transRes.ok) {
      const transData = await transRes.json();
      const transitions = transData.transitions || [];
      const squadTrans = transitions.find(t => 
        t.name.toLowerCase().includes('squad') || 
        t.name.toLowerCase().includes('analisar') ||
        t.to?.name?.toLowerCase().includes('squad')
      );

      if (squadTrans) {
        await fetch(transUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ transition: { id: squadTrans.id } })
        });
        console.log(`[Jira Cloud Transition Success] Card ${jiraKey} movido via transação ID ${squadTrans.id} (${squadTrans.name})`);
      }
    }

    return res.json({ success: true, message: `Card ${jiraKey} encaminhado para ${squadId} e atualizado no Jira Cloud!` });
  } catch (err) {
    console.error('Erro na atualização bidirecional Jira:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint para Atualização Bidirecional do Campo Time Solicitante (customfield_11010)
app.put('/api/jira/update-team-solicitante', async (req, res) => {
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    const { jiraKey, teamSolicitante } = req.body;
    if (!jiraKey || !teamSolicitante) {
      return res.status(400).json({ success: false, message: 'Parâmetros jiraKey e teamSolicitante são obrigatórios' });
    }

    const domain = process.env.JIRA_DOMAIN || 'naturapay.atlassian.net';
    const email = process.env.JIRA_EMAIL || 'lucas.machiori.nt@naturapay.net';
    const token = process.env.JIRA_API_TOKEN || '';

    if (!email || !token) {
      return res.json({ success: false, message: 'Credenciais Jira ausentes no .env' });
    }

    const authHeader = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');

    const teamOptionMap = {
      'Atendimento': '24153',
      'Conciliação': '24154',
      'Conciliação, Parâmetros, Processamento e Adquirência': '24154',
      'Suporte Operacional': '24152'
    };

    const optionId = teamOptionMap[teamSolicitante];
    if (!optionId) {
      return res.status(400).json({ success: false, message: `Opção de time inválida: ${teamSolicitante}` });
    }

    const editUrl = `https://${domain}/rest/api/3/issue/${jiraKey}`;
    const editRes = await fetch(editUrl, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          customfield_11010: { id: optionId }
        }
      })
    });

    if (!editRes.ok) {
      const errText = await editRes.text();
      console.warn(`[Jira Cloud Update Warning] Falha ao atualizar customfield_11010 no card ${jiraKey}:`, errText);
      return res.status(500).json({ success: false, message: 'Erro ao atualizar Jira Cloud', details: errText });
    }

    console.log(`[Jira Cloud Update Success] Card ${jiraKey} atualizado com Time Solicitante: ${teamSolicitante} (ID ${optionId})`);
    return res.json({ success: true, message: `Card ${jiraKey} atualizado no Jira Cloud com ${teamSolicitante}` });
  } catch (err) {
    console.error('Erro na atualização do Time Solicitante no Jira:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor Controle-Squads (Padrão Painel-OPS) rodando em http://localhost:${PORT}`);
});

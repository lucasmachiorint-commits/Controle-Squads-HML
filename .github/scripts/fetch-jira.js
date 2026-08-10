const fs = require('fs');

const JIRA_DOMAIN = process.env.JIRA_DOMAIN || 'naturapay.atlassian.net';
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_TOKEN;

if (!JIRA_EMAIL || !JIRA_TOKEN) {
  console.error("ERRO: Faltam variáveis de ambiente (JIRA_EMAIL ou JIRA_TOKEN).");
  process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
const jqlQuery = encodeURIComponent('project = GAU ORDER BY created DESC');
const maxResults = 100;

async function fetchJiraAndSaveJson() {
  let allIssues = [];
  let startAt = 0;
  let nextPageToken = null;
  let pageCount = 0;

  console.log(`Iniciando extração do Jira em ${JIRA_DOMAIN}...`);

  while (pageCount < 20) {
    pageCount++;
    let jiraUrl = `https://${JIRA_DOMAIN}/rest/api/3/search/jql?jql=${jqlQuery}&fields=*all&maxResults=${maxResults}&startAt=${startAt}`;
    if (nextPageToken) {
      jiraUrl += `&nextPageToken=${encodeURIComponent(nextPageToken)}`;
    }

    try {
      const res = await fetch(jiraUrl, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        console.error(`Erro Jira: ${res.status} - ${res.statusText}`);
        const text = await res.text();
        console.error(text);
        break;
      }

      const json = await res.json();
      const issues = json.issues || [];
      if (!issues.length) break;

      allIssues = allIssues.concat(issues);
      startAt += issues.length;

      console.log(`Página ${pageCount} - Obtidos ${issues.length} chamados. Total: ${allIssues.length}`);

      if (json.isLast || !json.nextPageToken || issues.length < maxResults) break;
      nextPageToken = json.nextPageToken;
    } catch (e) {
      console.error(`Falha na conexão com Jira:`, e.message);
      break;
    }
  }

  if (allIssues.length === 0) {
    console.warn("Nenhum chamado retornado pelo Jira.");
    process.exit(0);
  }

  console.log(`Total final: ${allIssues.length} cards extraídos. Transformando...`);

  const cards = allIssues.map((issue, idx) => {
    const fields = issue.fields || {};
    const statusName = fields.status?.name || 'Aberto';
    const catStatus = fields.status?.statusCategory?.name || 'To Do';
    const summary = fields.summary || 'Demanda do Jira';
    const reporter = fields.reporter?.displayName || 'Solicitante Jira';

    let createdFormatted = new Date().toLocaleDateString('pt-BR');
    if (fields.created) {
      try {
        const d = new Date(fields.created);
        createdFormatted = d.toLocaleDateString('pt-BR');
      } catch (e) {
        createdFormatted = fields.created;
      }
    }

    const cfSquad = fields.customfield_12475 || fields.customfield_squad;

    // Helper to parse ADF format
    let finalDescription = 'Sem descrição';
    if (typeof fields.description === 'string') {
      finalDescription = fields.description;
    } else if (fields.description && fields.description.type === 'doc' && Array.isArray(fields.description.content)) {
      let texts = [];
      function traverse(node) {
        if (node.type === 'text' && node.text) texts.push(node.text);
        if (node.type === 'hardBreak') texts.push('\n');
        if (node.type === 'paragraph') texts.push('\n');
        if (Array.isArray(node.content)) node.content.forEach(traverse);
      }
      fields.description.content.forEach(traverse);
      finalDescription = texts.join('').trim().replace(/\n{3,}/g, '\n\n') || 'Sem descrição';
    } else if (fields.description?.content) {
      finalDescription = JSON.stringify(fields.description);
    }

    return {
      id: issue.id || `jira-${idx}`,
      key: issue.key,
      jiraKey: issue.key,
      title: summary,
      summary: summary,
      status: statusName,
      categoriaStatus: catStatus,
      customfield_12475: cfSquad,
      squad: cfSquad,
      requester: reporter,
      priority: fields.priority?.name || '2 - Alta',
      category: 'Geral',
      createdDate: createdFormatted,
      description: finalDescription
    };
  });

  const payload = {
    updatedAt: new Date().toISOString(),
    totalCards: cards.length,
    cards: cards
  };

  fs.writeFileSync('docs/jira-data.json', JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync('jira-data.json', JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✅ SUCESSO! ${cards.length} cards gravados com sucesso em docs/jira-data.json e jira-data.json.`);
}

fetchJiraAndSaveJson();

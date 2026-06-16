exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  if (!NOTION_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN environment variable is not set.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const headers = {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  // ── PATCH MODE ──────────────────────────────────────────────────────────────
  // body.patch = [{ pageId, properties: { 'Balance': 1234, 'Paid': true } }]
  // Converts JS values to Notion property API shapes and PATCHes each page.
  if (body.patch) {
    function toNotionProp(value) {
      if (typeof value === 'boolean') return { checkbox: value };
      if (typeof value === 'number')  return { number: value };
      if (typeof value === 'string')  return { rich_text: [{ text: { content: value } }] };
      return value; // already shaped
    }

    const results = await Promise.all(body.patch.map(async ({ pageId, properties }) => {
      const notionProps = {};
      for (const [key, val] of Object.entries(properties)) {
        notionProps[key] = toNotionProp(val);
      }
      const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ properties: notionProps }),
      });
      const data = await res.json();
      return { pageId, ok: res.ok, error: res.ok ? null : data.message };
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patched: results }),
    };
  }

  // ── QUERY MODE ───────────────────────────────────────────────────────────────
  // body.databaseIds = { debts: '...', budget: '...', log: '...', recurring: '...' }
  const ids = body.databaseIds || (body.databaseId ? { debts: body.databaseId } : null);
  if (!ids) {
    return { statusCode: 400, body: JSON.stringify({ error: 'databaseIds or patch is required' }) };
  }

  async function queryDb(databaseId) {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ page_size: 100 }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `Notion API error (${response.status})`);
    return data.results || [];
  }

  const results = {};
  const errors = {};

  await Promise.all(Object.entries(ids).map(async ([key, dbId]) => {
    if (!dbId) return;
    try {
      results[key] = await queryDb(dbId);
    } catch (err) {
      errors[key] = err.message;
    }
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ results, errors }),
  };
};

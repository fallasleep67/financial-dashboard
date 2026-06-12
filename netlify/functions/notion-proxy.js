exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  if (!NOTION_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN environment variable is not set. Add it in Netlify -> Site configuration -> Environment variables, then redeploy.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // Support both single databaseId (legacy) and multiple databaseIds
  const ids = body.databaseIds || (body.databaseId ? { debts: body.databaseId } : null);
  if (!ids) {
    return { statusCode: 400, body: JSON.stringify({ error: 'databaseIds (object) or databaseId (string) is required' }) };
  }

  async function queryDb(databaseId) {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 100 }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Notion API error (${response.status})`);
    }
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

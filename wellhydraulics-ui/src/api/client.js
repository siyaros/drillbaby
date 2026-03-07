/**
 * WellHydraulics API client.
 * All communication with the Python backend goes through here.
 */

const BASE = '';  // Same origin (proxied in dev, served in prod)

async function request(path, options = {}) {
  const url = BASE + path;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }
  return res.json();
}

export async function healthCheck() {
  return request('/api/health');
}

export async function runSolver(params) {
  return request('/api/solve', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function importExcel(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(BASE + '/api/import/excel', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Import failed: ${res.status}`);
  return res.json();
}

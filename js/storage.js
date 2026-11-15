// Capa de almacenamiento unificada:
// 1) Supabase (nube compartida gratuita) si está configurado en config.js o ajustes
// 2) Servidor local Python (server.py) si está disponible en /api/health
// 3) LocalStorage del navegador (modo offline / prueba local en un solo dispositivo)

const LOCAL_DB_KEY = 'porra29n_local_db_v1';
const CLOUD_CFG_KEY = 'porra29n_supabase_cfg_v1';

function normalizeSupabaseUrl(rawUrl) {
  return String(rawUrl || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/i, '');
}

function getRuntimeSupabaseConfig() {
  const staticCfg = window.PORRA_CONFIG || {};
  let override = {};
  try {
    override = JSON.parse(localStorage.getItem(CLOUD_CFG_KEY) || '{}');
  } catch {
    override = {};
  }
  const url = normalizeSupabaseUrl(override.SUPABASE_URL || staticCfg.SUPABASE_URL || '');
  const key = (override.SUPABASE_ANON_KEY || staticCfg.SUPABASE_ANON_KEY || '').trim();
  return { url, key };
}

export function saveCloudOverrideConfig(url, key) {
  const cleanUrl = normalizeSupabaseUrl(url);
  const cleanKey = String(key || '').trim();
  if (!cleanUrl || !cleanKey) {
    localStorage.removeItem(CLOUD_CFG_KEY);
    return;
  }
  localStorage.setItem(CLOUD_CFG_KEY, JSON.stringify({
    SUPABASE_URL: cleanUrl,
    SUPABASE_ANON_KEY: cleanKey
  }));
}

export function getSavedCloudOverride() {
  try {
    return JSON.parse(localStorage.getItem(CLOUD_CFG_KEY) || '{}');
  } catch {
    return {};
  }
}

function readLocalDb() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_DB_KEY) || '{}');
    return {
      predictions: Array.isArray(parsed.predictions) ? parsed.predictions : [],
      officialResults: parsed.officialResults || null
    };
  } catch {
    return { predictions: [], officialResults: null };
  }
}

function writeLocalDb(db) {
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
}

function normalizePredictionRow(row) {
  return {
    friendKey: row.friend_key || row.friendKey,
    friendName: row.friend_name || row.friendName,
    seats: row.seats || {},
    pct: row.pct || {},
    turnout: row.turnout != null ? Number(row.turnout) : null,
    comment: row.comment || '',
    customParties: row.custom_parties || row.customParties || [],
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

function normalizeOfficialRow(row) {
  if (!row) return null;
  return {
    seats: row.seats || {},
    pct: row.pct || {},
    turnout: row.turnout != null ? Number(row.turnout) : null,
    publishedAt: row.published_at || row.publishedAt || new Date().toISOString()
  };
}

export async function detectBackendMode() {
  const supa = getRuntimeSupabaseConfig();
  if (supa.url && supa.key) {
    return { mode: 'supabase', label: 'Nube compartida (Supabase gratis)', shared: true, config: supa };
  }

  if (window.location.protocol.startsWith('http')) {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (res.ok) {
        return { mode: 'server', label: 'Servidor local Python (compartido)', shared: true };
      }
    } catch {
      // Sin servidor API activo -> fallback local
    }
  }

  return { mode: 'local', label: 'Modo local (solo este navegador)', shared: false };
}

async function supabaseFetch(path, options = {}) {
  const { url, key } = getRuntimeSupabaseConfig();
  if (!url || !key) throw new Error('Supabase no configurado.');

  const headers = {
    apikey: key,
    ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const res = await fetch(`${url}${path}`, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = (data && (data.message || data.error_description || data.hint)) || `Error HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function loadAllData(backend) {
  if (backend.mode === 'supabase') {
    const [preds, officialRows] = await Promise.all([
      supabaseFetch('/rest/v1/predictions?select=*&order=updated_at.desc'),
      supabaseFetch('/rest/v1/official_results?id=eq.1&select=*')
    ]);
    return {
      predictions: (preds || []).map(normalizePredictionRow),
      officialResults: officialRows && officialRows[0] ? normalizeOfficialRow(officialRows[0]) : null
    };
  }

  if (backend.mode === 'server') {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo leer el estado del servidor local.');
    const data = await res.json();
    return {
      predictions: (data.predictions || []).map(normalizePredictionRow),
      officialResults: data.officialResults ? normalizeOfficialRow(data.officialResults) : null
    };
  }

  const db = readLocalDb();
  return {
    predictions: (db.predictions || []).map(normalizePredictionRow),
    officialResults: db.officialResults ? normalizeOfficialRow(db.officialResults) : null
  };
}

export async function savePrediction(backend, payload) {
  const deadlineMs = new Date(window.PORRA_CONFIG.DEADLINE_ISO).getTime();
  if (Date.now() > deadlineMs) {
    throw new Error('El plazo para enviar o modificar la porra cerró el sábado 28 de noviembre a las 23:59.');
  }

  const row = {
    friend_key: payload.friendKey,
    friend_name: payload.friendName,
    seats: payload.seats,
    pct: payload.pct,
    turnout: payload.turnout,
    comment: payload.comment || '',
    custom_parties: payload.customParties || [],
    updated_at: new Date().toISOString()
  };

  if (backend.mode === 'supabase') {
    const data = await supabaseFetch('/rest/v1/predictions?on_conflict=friend_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row)
    });
    return normalizePredictionRow(Array.isArray(data) ? data[0] : row);
  }

  if (backend.mode === 'server') {
    const res = await fetch('/api/predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error guardando en servidor local.');
    return normalizePredictionRow(data.prediction || row);
  }

  const db = readLocalDb();
  const normalized = normalizePredictionRow(row);
  const idx = db.predictions.findIndex(p => (p.friendKey || p.friend_key) === normalized.friendKey);
  if (idx >= 0) db.predictions[idx] = normalized;
  else db.predictions.unshift(normalized);
  writeLocalDb(db);
  return normalized;
}

export async function deletePrediction(backend, friendKey) {
  const deadlineMs = new Date(window.PORRA_CONFIG.DEADLINE_ISO).getTime();
  if (Date.now() > deadlineMs) {
    throw new Error('La porra ya está cerrada y no se pueden eliminar predicciones.');
  }

  if (backend.mode === 'supabase') {
    await supabaseFetch(`/rest/v1/predictions?friend_key=eq.${encodeURIComponent(friendKey)}`, {
      method: 'DELETE'
    });
    return;
  }

  if (backend.mode === 'server') {
    const res = await fetch(`/api/predictions/${encodeURIComponent(friendKey)}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudo eliminar.');
    }
    return;
  }

  const db = readLocalDb();
  db.predictions = db.predictions.filter(p => (p.friendKey || p.friend_key) !== friendKey);
  writeLocalDb(db);
}

export async function saveOfficialResults(backend, { adminCode, seats, pct, turnout }) {
  if (backend.mode === 'supabase') {
    await supabaseFetch('/rest/v1/rpc/save_official_results', {
      method: 'POST',
      body: JSON.stringify({
        p_admin_code: adminCode || '',
        p_seats: seats,
        p_pct: pct,
        p_turnout: turnout
      })
    });
    return normalizeOfficialRow({ seats, pct, turnout, published_at: new Date().toISOString() });
  }

  if (backend.mode === 'server') {
    const res = await fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminCode: adminCode || '', seats, pct, turnout })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error guardando los resultados oficiales.');
    return normalizeOfficialRow(data.officialResults);
  }

  const db = readLocalDb();
  db.officialResults = normalizeOfficialRow({ seats, pct, turnout, published_at: new Date().toISOString() });
  writeLocalDb(db);
  return db.officialResults;
}

export async function clearOfficialResults(backend, adminCode) {
  if (backend.mode === 'supabase') {
    await supabaseFetch('/rest/v1/rpc/clear_official_results', {
      method: 'POST',
      body: JSON.stringify({ p_admin_code: adminCode || '' })
    });
    return;
  }

  if (backend.mode === 'server') {
    const res = await fetch('/api/results', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminCode: adminCode || '' })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudieron borrar los resultados.');
    }
    return;
  }

  const db = readLocalDb();
  db.officialResults = null;
  writeLocalDb(db);
}

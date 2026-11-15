import {
  OFFICIAL_23J_SUMMARY,
  POLL_TIERS,
  PARTIES_CATALOG,
  mergeCatalogWithCustom,
  slugifyFriendKey
} from './data.js';
import { scoreParty, rankPredictions } from './scoring.js';
import { escapeHtml, getTotalSeats, getTotalPct, renderHemicycleSVG } from './hemicycle.js';
import {
  detectBackendMode,
  loadAllData,
  savePrediction,
  deletePrediction,
  saveOfficialResults,
  clearOfficialResults,
  saveCloudOverrideConfig,
  getSavedCloudOverride
} from './storage.js';

// =============================================================================
// ESTADO GLOBAL DE LA APLICACIÓN
// =============================================================================
const state = {
  backend: { mode: 'local', label: 'Cargando...', shared: false },
  activeTab: 'predict', // 'predict' | 'group' | 'ranking' | 'scoring' | 'base'
  loading: true,
  saving: false,
  predictions: [],
  officialResults: null,
  customParties: [], // Partidos añadidos manualmente por cualquier participante
  editor: {
    editingKey: null,
    friendName: '',
    turnout: 70.4,
    comment: '',
    search: '',
    filterTier: 'all', // 'all' | 'likely' | 'borderline' | 'extra' | 'picked'
    showCustomDrawer: false,
    seats: {},
    pct: {}
  },
  group: {
    viewMode: 'table', // 'table' | 'cards'
    selectedFriendKey: null,
    onlyActiveParties: true
  },
  ranking: {
    demoResultsActive: false,
    demoResults: {
      turnout: 70.8,
      seats: {
        pp: 132, psoe: 112, vox: 61, fa: 10, erc: 8, bildu: 7,
        junts: 5, pnv: 4, compromis: 3, adelante: 2, bng: 2, cca: 1,
        salf: 2, upn: 1
      },
      pct: {
        pp: 31.4, psoe: 27.6, vox: 18.6, fa: 5.8, erc: 2.1, bildu: 1.5,
        junts: 1.3, pnv: 1.0, compromis: 1.5, adelante: 1.4, bng: 0.9, cca: 0.4,
        salf: 1.8, upn: 0.2, podemos: 1.3, pacma: 0.7
      }
    },
    showOfficialEditor: false,
    officialDraftSeats: {},
    officialDraftPct: {},
    officialDraftTurnout: 70.0,
    adminCode: '',
    expandedFriendKey: null
  },
  calc: {
    real: 120,
    pred: 140
  },
  pactSelectedIds: [] // Partidos seleccionados en la suma/pactómetro (ej. ['pp', 'vox'])
};

// Inicializar editor con la base del 23-J de 2023
function initEditorDefaults() {
  state.editor.seats = {};
  state.editor.pct = {};
  getFullCatalog().forEach(p => {
    state.editor.seats[p.id] = p.seats23 || 0;
    state.editor.pct[p.id] = p.pct23 || 0;
  });
}

function getFullCatalog() {
  const allCustom = [...state.customParties];
  state.predictions.forEach(pred => {
    (pred.customParties || []).forEach(cp => {
      if (cp && cp.id && !allCustom.some(x => x.id === cp.id)) {
        allCustom.push(cp);
      }
    });
  });
  return mergeCatalogWithCustom(allCustom);
}

// Comprobar si ya pasó el sábado antes de las elecciones a las 23:59 CET
function isDeadlinePassed() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('previewLock') === '1') return true;
  const deadlineMs = new Date(window.PORRA_CONFIG.DEADLINE_ISO).getTime();
  return Date.now() > deadlineMs;
}

function formatCountdown() {
  const deadlineMs = new Date(window.PORRA_CONFIG.DEADLINE_ISO).getTime();
  const diff = deadlineMs - Date.now();
  if (diff <= 0 || isDeadlinePassed()) {
    return { closed: true, text: 'Plazo cerrado (28/11 23:59)' };
  }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  parts.push(`${String(hours).padStart(2, '0')}h`);
  parts.push(`${String(mins).padStart(2, '0')}m`);
  parts.push(`${String(secs).padStart(2, '0')}s`);
  return { closed: false, text: `Cierra en ${parts.join(' ')}` };
}

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  const dot = document.getElementById('toast-dot');
  const text = document.getElementById('toast-msg');
  text.textContent = msg;
  dot.style.background =
    type === 'warning' ? 'var(--warning)' :
    type === 'error' ? 'var(--error)' : 'var(--success)';
  el.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.add('hidden'), 3400);
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

// =============================================================================
// ARRANQUE Y RECARGA DE DATOS
// =============================================================================
async function bootstrap() {
  initEditorDefaults();
  updateChrome();
  renderApp();

  try {
    state.backend = await detectBackendMode();
    await refreshFromBackend();
  } catch (err) {
    showToast(`Error al cargar datos: ${err.message}`, 'error');
  } finally {
    state.loading = false;
    updateChrome();
    renderApp();
  }

  // Actualizar cuenta atrás cada segundo
  setInterval(updateDeadlineBadge, 1000);
}

async function refreshFromBackend() {
  const data = await loadAllData(state.backend);
  state.predictions = data.predictions || [];
  state.officialResults = data.officialResults || null;
  if (!state.group.selectedFriendKey && state.predictions.length > 0) {
    state.group.selectedFriendKey = state.predictions[0].friendKey;
  }
  // Preparar borrador de resultados oficiales
  if (state.officialResults) {
    state.ranking.officialDraftSeats = { ...(state.officialResults.seats || {}) };
    state.ranking.officialDraftPct = { ...(state.officialResults.pct || {}) };
    state.ranking.officialDraftTurnout = state.officialResults.turnout ?? 70.0;
  } else {
    getFullCatalog().forEach(p => {
      if (state.ranking.officialDraftSeats[p.id] == null) {
        state.ranking.officialDraftSeats[p.id] = 0;
      }
      if (state.ranking.officialDraftPct[p.id] == null) {
        state.ranking.officialDraftPct[p.id] = 0;
      }
    });
  }
}

function updateDeadlineBadge() {
  const badge = document.getElementById('deadline-badge');
  if (!badge) return;
  const cd = formatCountdown();
  badge.textContent = cd.text;
  badge.className = 'badge tabular ' + (cd.closed ? 'badge-error' : 'badge-primary');
}

function updateChrome() {
  const cfg = window.PORRA_CONFIG || {};
  document.getElementById('header-title').textContent = cfg.POOL_TITLE || 'Porra Elecciones España 2026';
  document.getElementById('header-sub').textContent = `${cfg.POOL_SUBTITLE || '350 escaños'} · Sin PIN · Editable hasta el 28/11 23:59`;

  updateDeadlineBadge();

  const dot = document.getElementById('storage-dot');
  const lbl = document.getElementById('storage-label');
  const banner = document.getElementById('storage-banner');
  lbl.textContent = state.backend.label;

  if (state.backend.mode === 'supabase') {
    dot.style.background = 'var(--success)';
    banner.className = 'hidden';
  } else if (state.backend.mode === 'server') {
    dot.style.background = 'var(--primary)';
    banner.className = 'hidden';
  } else {
    dot.style.background = 'var(--warning)';
    banner.className = 'banner-notice badge-warning';
    banner.innerHTML = `
      <span>
        <strong>Modo local (solo este dispositivo):</strong> para que todos tus amigos guarden y vean las porras desde su móvil, conecta la nube gratuita de Supabase en 3 minutos.
      </span>
      <button class="btn btn-sm btn-primary" onclick="window.__porraActions.openCloudModal()">Conectar Supabase gratis</button>
    `;
  }

  document.querySelectorAll('.friends-count').forEach(el => {
    el.textContent = state.predictions.length;
  });

  document.querySelectorAll('.nav-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === state.activeTab);
  });
  document.querySelectorAll('.mnav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === state.activeTab);
  });
}

function renderApp() {
  const main = document.getElementById('app-main');
  if (state.loading) {
    main.innerHTML = `<div class="card" style="text-align:center;padding:36px;">Cargando datos de la porra...</div>`;
    return;
  }

  if (state.activeTab === 'predict') main.innerHTML = renderPredictView();
  else if (state.activeTab === 'group') main.innerHTML = renderGroupView();
  else if (state.activeTab === 'ranking') main.innerHTML = renderRankingView();
  else if (state.activeTab === 'scoring') main.innerHTML = renderScoringGuideView();
  else main.innerHTML = renderBaseView();
}

// =============================================================================
// VISTA 1: MI PORRA
// =============================================================================
function buildPredictPartyCardsHtml() {
  const locked = isDeadlinePassed();
  const catalog = getFullCatalog();
  const q = (state.editor.search || '').trim().toLowerCase();

  const filtered = catalog.filter(p => {
    if (state.editor.filterTier === 'likely' && p.pollTier !== 'likely') return false;
    if (state.editor.filterTier === 'borderline' && p.pollTier !== 'borderline') return false;
    if (state.editor.filterTier === 'extra' && p.pollTier !== 'extra') return false;
    if (state.editor.filterTier === 'picked' && !(state.editor.seats[p.id] > 0 || state.editor.pct[p.id] > 0)) return false;
    if (q) {
      const hay = `${p.abbr} ${p.name} ${p.scope} ${p.note26 || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    return `<div class="text-muted" style="text-align:center;padding:24px;">Ningún partido coincide con tu búsqueda o filtro.</div>`;
  }

  let currentTier = null;
  const htmlParts = [];

  filtered.forEach(p => {
    if (state.editor.filterTier === 'all' && !q && p.pollTier !== currentTier) {
      currentTier = p.pollTier;
      const tierInfo = POLL_TIERS[currentTier];
      if (tierInfo) {
        htmlParts.push(`
          <div class="tier-header">
            <span>${escapeHtml(tierInfo.label)}</span>
          </div>
        `);
      }
    }

    const s = state.editor.seats[p.id] || 0;
    const pc = state.editor.pct[p.id] || 0;
    const baseTxt = p.seats23 > 0
      ? `23-J: <strong>${p.seats23} esc.</strong> (${p.pct23.toFixed(2)}%)`
      : (p.pct23 > 0 ? `23-J: 0 esc. (${p.pct23.toFixed(2)}%)` : '23-J: No concurrió / en coalición');

    htmlParts.push(`
      <div class="party-card">
        <div class="party-top">
          <div class="party-ident">
            <span class="party-dot" style="background:${p.color}"></span>
            <div style="min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <strong style="font-size:14px;">${escapeHtml(p.abbr)}</strong>
                <span class="badge" style="padding:2px 7px;font-size:11px;">${escapeHtml(p.scope)}</span>
                ${p.pollRange26 ? `<span class="badge badge-primary" style="padding:2px 7px;font-size:11px;">${escapeHtml(p.pollRange26)}</span>` : ''}
              </div>
              <div class="text-muted" style="font-size:12px;margin-top:2px;">${escapeHtml(p.name)}</div>
              <div class="text-muted" style="font-size:12px;margin-top:2px;">${baseTxt}</div>
            </div>
          </div>
        </div>

        <div class="party-controls">
          <div class="stepper">
            <span class="text-muted" style="font-size:12px;margin-right:4px;">Diputados:</span>
            <button class="step-btn" ${locked ? 'disabled' : ''} onclick="window.__porraActions.adjustSeat('${p.id}', -1)" aria-label="Restar diputado a ${escapeHtml(p.abbr)}">−</button>
            <input id="seat-input-${p.id}" class="seat-input tabular" type="number" min="0" max="350" value="${s}" ${locked ? 'disabled' : ''}
              oninput="window.__porraActions.setSeatDirect('${p.id}', this.value)" />
            <button class="step-btn" ${locked ? 'disabled' : ''} onclick="window.__porraActions.adjustSeat('${p.id}', 1)" aria-label="Sumar diputado a ${escapeHtml(p.abbr)}">+</button>
          </div>

          <div style="display:flex;align-items:center;gap:5px;">
            <span class="text-muted" style="font-size:12px;">% voto (opc.):</span>
            <input class="pct-input tabular" type="number" step="0.1" min="0" max="100" value="${pc}" ${locked ? 'disabled' : ''}
              oninput="window.__porraActions.setPctDirect('${p.id}', this.value)" />
            <span class="text-muted" style="font-size:12px;">%</span>
          </div>
        </div>
      </div>
    `);
  });

  return htmlParts.join('');
}

function updatePredictSeatsUi() {
  const catalog = getFullCatalog();
  const total = getTotalSeats(state.editor.seats);
  const totalPct = getTotalPct(state.editor.pct).toFixed(1);
  const diff = 350 - total;

  const hemi = document.getElementById('editor-hemicycle');
  if (hemi) hemi.innerHTML = renderHemicycleSVG(state.editor.seats, catalog);

  const badge = document.getElementById('editor-seats-badge');
  if (badge) {
    if (diff === 0) {
      badge.className = 'badge badge-success tabular';
      badge.textContent = '350 / 350 · ¡Cuadra exacto!';
    } else if (diff > 0) {
      badge.className = 'badge badge-warning tabular';
      badge.textContent = `${total} / 350 · Faltan ${diff}`;
    } else {
      badge.className = 'badge badge-error tabular';
      badge.textContent = `${total} / 350 · Sobran ${Math.abs(diff)}`;
    }
  }

  const pctEl = document.getElementById('editor-pct-total');
  if (pctEl) pctEl.textContent = `${totalPct}% sumado`;

  const pactEl = document.getElementById('editor-pact-box');
  if (pactEl) pactEl.innerHTML = renderPactCalculatorHtml(state.editor.seats, catalog, { context: 'editor' });
}

function getPactCandidateParties(seatsMap, catalog) {
  const selected = new Set(state.pactSelectedIds);
  return catalog.filter(p =>
    selected.has(p.id) ||
    (parseInt(seatsMap?.[p.id] || 0, 10) || 0) > 0 ||
    p.pollTier === 'likely'
  );
}

function computePactSum(seatsMap, selectedIds) {
  return (selectedIds || []).reduce(
    (acc, id) => acc + (parseInt(seatsMap?.[id] || 0, 10) || 0),
    0
  );
}

function renderPactCalculatorHtml(seatsMap, catalog, options = {}) {
  const selectedIds = state.pactSelectedIds;
  const candidates = getPactCandidateParties(seatsMap, catalog);
  const selectedParties = selectedIds
    .map(id => catalog.find(p => p.id === id))
    .filter(Boolean);

  const sumSeats = computePactSum(seatsMap, selectedIds);
  const majorityDiff = sumSeats - 176;

  let statusHtml = `<span class="text-muted" style="font-size:12px;">Pulsa dos o más partidos para ver cuántos diputados suman juntos.</span>`;
  if (selectedParties.length > 0) {
    if (sumSeats >= 176) {
      statusHtml = `
        <span class="badge badge-success tabular">
          ${sumSeats} / 350 esc. · Mayoría absoluta (${majorityDiff === 0 ? 'justa' : '+' + majorityDiff})
        </span>
      `;
    } else {
      statusHtml = `
        <span class="badge badge-warning tabular">
          ${sumSeats} / 350 esc. · A ${176 - sumSeats} de la mayoría (176)
        </span>
      `;
    }
  }

  const segmentsHtml = selectedParties.map(p => {
    const s = parseInt(seatsMap?.[p.id] || 0, 10) || 0;
    const widthPct = Math.max(0, Math.min(100, (s / 350) * 100));
    return `<div class="pact-bar-seg" style="width:${widthPct.toFixed(2)}%;background:${p.color};" title="${escapeHtml(p.abbr)}: ${s}"></div>`;
  }).join('');

  return `
    <div class="pact-box">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <strong style="font-size:13px;">Suma de partidos (Pactómetro)</strong>
        ${selectedIds.length > 0 ? `
          <button class="btn btn-sm" style="padding:3px 8px;font-size:11px;" onclick="window.__porraActions.clearPact()">
            Limpiar (${selectedIds.length})
          </button>
        ` : ''}
      </div>

      <div class="pact-chips">
        ${candidates.map(p => {
          const active = selectedIds.includes(p.id);
          const s = parseInt(seatsMap?.[p.id] || 0, 10) || 0;
          return `
            <button type="button" class="pact-chip ${active ? 'active' : ''}"
              onclick="window.__porraActions.togglePactParty('${p.id}')">
              <span class="party-dot" style="width:8px;height:8px;margin-top:0;background:${active ? 'currentColor' : p.color};"></span>
              <span>${escapeHtml(p.abbr)}</span>
              ${options.hideCounts ? '' : `<span class="tabular" style="opacity:0.85;">${s}</span>`}
            </button>
          `;
        }).join('')}
      </div>

      ${selectedParties.length > 0 ? `
        <div class="pact-bar-track" title="La línea vertical marca los 176 escaños de la mayoría absoluta">
          ${segmentsHtml}
          <div class="pact-majority-mark"></div>
        </div>
      ` : ''}

      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        ${statusHtml}
        ${selectedParties.length > 0 ? `
          <span class="text-muted" style="font-size:11px;">${selectedParties.map(p => escapeHtml(p.abbr)).join(' + ')}</span>
        ` : ''}
      </div>
    </div>
  `;
}

function renderPredictView() {
  const locked = isDeadlinePassed();
  const catalog = getFullCatalog();
  const total = getTotalSeats(state.editor.seats);
  const totalPct = getTotalPct(state.editor.pct).toFixed(1);
  const diff = 350 - total;

  let badgeClass = 'badge-success';
  let badgeText = '350 / 350 · ¡Cuadra exacto!';
  if (diff > 0) {
    badgeClass = 'badge-warning';
    badgeText = `${total} / 350 · Faltan ${diff}`;
  } else if (diff < 0) {
    badgeClass = 'badge-error';
    badgeText = `${total} / 350 · Sobran ${Math.abs(diff)}`;
  }

  const existingPills = state.predictions.map(p => {
    const active = state.editor.editingKey === p.friendKey;
    return `
      <button class="chip ${active ? 'active' : ''}" onclick="window.__porraActions.loadFriendToEditor('${p.friendKey}')">
        ${escapeHtml(p.friendName)}
      </button>
    `;
  }).join('');

  return `
    ${locked ? `
      <div class="banner-notice badge-error">
        <span><strong>Porra cerrada:</strong> el plazo para crear o modificar predicciones finalizó el ${escapeHtml(window.PORRA_CONFIG.DEADLINE_LABEL)}.</span>
      </div>
    ` : ''}

    <div class="predict-layout">
      <!-- Columna izquierda: Perfil + Hemiciclo + Guardar -->
      <div class="sticky-col stack-md">
        <div class="card stack-sm">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <strong style="font-size:15px;">1. ¿Quién hace la porra?</strong>
            <span class="badge">Sin PIN</span>
          </div>

          ${state.predictions.length > 0 ? `
            <div>
              <div class="label">Editar una porra ya guardada (o escribe un nombre nuevo abajo):</div>
              <div class="chips-row">
                <button class="chip ${!state.editor.editingKey ? 'active' : ''}" onclick="window.__porraActions.newFriendDraft()">+ Nuevo amigo</button>
                ${existingPills}
              </div>
            </div>
          ` : ''}

          <div>
            <label class="label" for="friend-name-input">Tu nombre o apodo</label>
            <input id="friend-name-input" class="input" type="text" maxlength="40"
              value="${escapeHtml(state.editor.friendName)}" ${locked ? 'disabled' : ''}
              oninput="window.__porraActions.setFriendName(this.value)"
              placeholder="Ej. Alex, Lucía, Carlos..." />
          </div>
        </div>

        <div class="card stack-sm">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <strong style="font-size:15px;">2. Hemiciclo en directo</strong>
            <span id="editor-seats-badge" class="badge ${badgeClass} tabular">${badgeText}</span>
          </div>

          <div id="editor-hemicycle">${renderHemicycleSVG(state.editor.seats, catalog)}</div>

          <div id="editor-pact-box">
            ${renderPactCalculatorHtml(state.editor.seats, catalog, { context: 'editor' })}
          </div>

          <div style="display:flex;justify-content:space-between;font-size:12px;border-top:1px solid var(--border);padding-top:10px;">
            <span class="text-muted">Suma opcional de % de voto:</span>
            <strong id="editor-pct-total" class="tabular">${totalPct}% sumado</strong>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <button class="btn btn-sm" ${locked ? 'disabled' : ''} onclick="window.__porraActions.copy23J()">Copiar base 23-J</button>
            <button class="btn btn-sm" ${locked ? 'disabled' : ''} onclick="window.__porraActions.zeroAll()">Poner todo a 0</button>
          </div>
        </div>

        <div class="card stack-sm">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:end;">
            <div>
              <label class="label" for="turnout-input">Participación est. (%)</label>
              <input id="turnout-input" class="input tabular" type="number" step="0.1" min="0" max="100"
                value="${state.editor.turnout}" ${locked ? 'disabled' : ''}
                oninput="window.__porraActions.setTurnout(this.value)" />
            </div>
            <div class="text-muted" style="font-size:12px;padding-bottom:8px;">23-J: 70,39% (censo esp.)</div>
          </div>

          <div>
            <label class="label" for="comment-input">Comentario o nota para el grupo (opc.)</label>
            <input id="comment-input" class="input" type="text" maxlength="200"
              value="${escapeHtml(state.editor.comment)}" ${locked ? 'disabled' : ''}
              oninput="window.__porraActions.setComment(this.value)"
              placeholder="Ej. Creo que Adelante Andalucía y SALF dan la sorpresa..." />
          </div>

          <button class="btn btn-primary" style="width:100%;" ${locked || state.saving ? 'disabled' : ''} onclick="window.__porraActions.saveMyPrediction()">
            ${state.saving ? 'Guardando...' : (state.editor.editingKey ? 'Actualizar mi predicción' : 'Guardar mi predicción')}
          </button>

          ${state.editor.editingKey && !locked ? `
            <button class="btn btn-danger btn-sm" style="width:100%;" onclick="window.__porraActions.removeEditingFriend()">
              Eliminar esta porra
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Columna derecha: Partidos ordenados por probabilidad de encuestas -->
      <div class="card stack-md">
        <div>
          <strong style="font-size:15px;">3. Reparte los 350 diputados (${catalog.length} candidaturas)</strong>
          <p class="text-muted" style="margin:4px 0 0;font-size:12px;">
            Ordenadas por expectativa en encuestas del 29-N (incluyendo Adelante Andalucía, Compromís, SALF, Podemos, etc.) y con la referencia oficial del 23-J.
          </p>
        </div>

        <div class="stack-sm">
          <input id="party-search-input" class="input" type="text" value="${escapeHtml(state.editor.search)}"
            oninput="window.__porraActions.setSearch(this.value)"
            placeholder="Buscar partido o territorio (ej. Adelante, SALF, PACMA, BNG...)" />

          <div class="chips-row">
            ${[
              ['all', `Todos (${catalog.length})`],
              ['likely', 'Con proyección encuestas'],
              ['borderline', 'En disputa (0–2)'],
              ['extra', 'Extraparlamentarios / BOE'],
              ['picked', 'Solo mis elegidos (>0)']
            ].map(([k, lbl]) => `
              <button class="chip ${state.editor.filterTier === k ? 'active' : ''}"
                onclick="window.__porraActions.setFilterTier('${k}')">
                ${lbl}
              </button>
            `).join('')}
          </div>
        </div>

        <div id="predict-party-list" class="stack-sm">
          ${buildPredictPartyCardsHtml()}
        </div>

        <!-- Añadir cualquier otra candidatura del BOE -->
        <div style="border-top:1px solid var(--border);padding-top:12px;">
          <button class="btn" style="width:100%;border-style:dashed;" ${locked ? 'disabled' : ''}
            onclick="window.__porraActions.toggleCustomDrawer()">
            + Añadir otro partido de las 55 candidaturas del BOE
          </button>

          ${state.editor.showCustomDrawer ? `
            <div class="formula-box stack-sm" style="margin-top:10px;">
              <div style="font-weight:700;font-size:12px;">Añadir candidatura personalizada</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;">
                <input id="custom-party-name" class="input" style="flex:1;min-width:170px;" type="text"
                  placeholder="Nombre o siglas (ej. Coalición por Melilla)" />
                <input id="custom-party-scope" class="input" style="width:160px;" type="text"
                  placeholder="Circunscripción (opc.)" />
                <button class="btn btn-primary btn-sm" onclick="window.__porraActions.addCustomParty()">Añadir</button>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

// =============================================================================
// VISTA 2: PORRAS DEL GRUPO
// =============================================================================
function renderGroupView() {
  const catalog = getFullCatalog();
  const preds = state.predictions;
  const locked = isDeadlinePassed();

  if (!preds.length) {
    return `
      <div class="card stack-md" style="text-align:center;padding:36px 20px;">
        <div style="font-size:16px;font-weight:800;">Aún no hay predicciones guardadas</div>
        <p class="text-muted" style="max-width:460px;margin:0 auto;">
          Sé el primero en guardar tu porra en la pestaña <strong>Mi Porra</strong>. En cuanto tus amigos guarden la suya, aparecerán aquí para compararlas todas.
        </p>
        <div>
          <button class="btn btn-primary" onclick="window.__porraActions.switchTab('predict')">Ir a hacer mi porra</button>
        </div>
      </div>
    `;
  }

  const activeParties = catalog.filter(p => {
    if (!state.group.onlyActiveParties) return true;
    if (p.seats23 > 0 || p.pollTier === 'likely') return true;
    return preds.some(f => (f.seats?.[p.id] || 0) > 0 || (f.pct?.[p.id] || 0) >= 0.5);
  });

  const avgSeats = {};
  catalog.forEach(p => {
    const sum = preds.reduce((acc, f) => acc + (parseInt(f.seats?.[p.id] || 0, 10) || 0), 0);
    avgSeats[p.id] = (sum / preds.length).toFixed(1);
  });

  let maxSpread = null;
  catalog.forEach(p => {
    const vals = preds.map(f => parseInt(f.seats?.[p.id] || 0, 10) || 0);
    const spread = Math.max(...vals) - Math.min(...vals);
    if (!maxSpread || spread > maxSpread.spread) {
      maxSpread = { abbr: p.abbr, spread, min: Math.min(...vals), max: Math.max(...vals) };
    }
  });

  const selectedFriend = preds.find(f => f.friendKey === state.group.selectedFriendKey) || preds[0];

  return `
    <div class="stack-md">
      <div class="grid-3">
        <div class="card">
          <div class="text-muted" style="font-size:12px;">Participantes</div>
          <div class="tabular" style="font-size:22px;font-weight:800;margin-top:4px;">${preds.length} ${preds.length === 1 ? 'amigo' : 'amigos'}</div>
          <div class="text-muted" style="font-size:12px;margin-top:2px;">Todos ven las porras de todos</div>
        </div>
        <div class="card">
          <div class="text-muted" style="font-size:12px;">Media del grupo (principales)</div>
          <div class="tabular" style="font-size:16px;font-weight:800;margin-top:6px;">
            PP ${avgSeats.pp || 0} · PSOE ${avgSeats.psoe || 0} · Vox ${avgSeats.vox || 0}
          </div>
          <div class="text-muted" style="font-size:12px;margin-top:2px;">Promedio de escaños previstos</div>
        </div>
        <div class="card">
          <div class="text-muted" style="font-size:12px;">Mayor discrepancia</div>
          <div class="tabular" style="font-size:16px;font-weight:800;margin-top:6px;">
            ${escapeHtml(maxSpread?.abbr || '—')} (${maxSpread?.min}–${maxSpread?.max})
          </div>
          <div class="text-muted" style="font-size:12px;margin-top:2px;">Horquilla de ${maxSpread?.spread || 0} escaños entre vosotros</div>
        </div>
      </div>

      <div class="card stack-md">
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="chip ${state.group.viewMode === 'table' ? 'active' : ''}" onclick="window.__porraActions.setGroupView('table')">Tabla comparativa</button>
            <button class="chip ${state.group.viewMode === 'cards' ? 'active' : ''}" onclick="window.__porraActions.setGroupView('cards')">Ver por amigo</button>
          </div>

          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            ${state.group.viewMode === 'table' ? `
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);cursor:pointer;">
                <input type="checkbox" ${state.group.onlyActiveParties ? 'checked' : ''}
                  onchange="window.__porraActions.toggleGroupActiveFilter(this.checked)" />
                Solo partidos con escaños / proyección
              </label>
            ` : ''}
            <button class="btn btn-sm" onclick="window.__porraActions.refreshAll()">Actualizar</button>
          </div>
        </div>

        ${state.group.viewMode === 'table' ? `
          ${renderPactCalculatorHtml(
            Object.fromEntries(catalog.map(p => [p.id, Math.round(Number(avgSeats[p.id] || 0))])),
            catalog,
            { hideCounts: true }
          )}

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th class="sticky-col-cell" style="min-width:130px;">Partido</th>
                  <th class="text-right">23-J</th>
                  <th class="text-right">Media</th>
                  ${preds.map(f => `
                    <th class="text-right">
                      <button style="background:none;border:none;color:var(--primary);font-weight:700;cursor:pointer;font-size:12px;padding:0;"
                        onclick="window.__porraActions.inspectFriendCard('${f.friendKey}')">
                        ${escapeHtml(f.friendName)}
                      </button>
                    </th>
                  `).join('')}
                </tr>
              </thead>
              <tbody>
                ${state.pactSelectedIds.length > 0 ? (() => {
                  const selNames = state.pactSelectedIds
                    .map(id => catalog.find(p => p.id === id)?.abbr)
                    .filter(Boolean)
                    .join(' + ');
                  const sum23 = state.pactSelectedIds.reduce((a, id) => a + (catalog.find(p => p.id === id)?.seats23 || 0), 0);
                  const sumAvg = state.pactSelectedIds.reduce((a, id) => a + parseFloat(avgSeats[id] || 0), 0).toFixed(1);
                  return `
                    <tr style="background:color-mix(in srgb, var(--primary) 10%, transparent);font-weight:800;">
                      <td class="sticky-col-cell" style="background:var(--content);">Suma: ${escapeHtml(selNames)}</td>
                      <td class="text-right tabular">${sum23}</td>
                      <td class="text-right tabular">${sumAvg}</td>
                      ${preds.map(f => {
                        const s = computePactSum(f.seats, state.pactSelectedIds);
                        return `<td class="text-right tabular ${s >= 176 ? 'text-success' : ''}">${s}${s >= 176 ? ' ✓' : ''}</td>`;
                      }).join('')}
                    </tr>
                  `;
                })() : ''}
                ${activeParties.map(p => `
                  <tr>
                    <td class="sticky-col-cell">
                      <div style="display:flex;align-items:center;gap:8px;">
                        <span class="party-dot" style="background:${p.color};margin-top:0;"></span>
                        <strong>${escapeHtml(p.abbr)}</strong>
                      </div>
                    </td>
                    <td class="text-right tabular text-muted">${p.seats23}</td>
                    <td class="text-right tabular"><strong>${avgSeats[p.id]}</strong></td>
                    ${preds.map(f => {
                      const s = parseInt(f.seats?.[p.id] || 0, 10) || 0;
                      const pc = f.pct?.[p.id];
                      const delta = s - (p.seats23 || 0);
                      return `
                        <td class="text-right tabular">
                          <strong class="${s === 0 ? 'text-muted' : ''}">${s}</strong>
                          ${delta !== 0 ? `<span class="${delta > 0 ? 'text-success' : 'text-error'}" style="font-size:11px;"> (${delta > 0 ? '+' + delta : delta})</span>` : ''}
                          ${pc ? `<div class="text-muted" style="font-size:11px;">${pc}%</div>` : ''}
                        </td>
                      `;
                    }).join('')}
                  </tr>
                `).join('')}
                <tr style="background:var(--content);font-weight:700;">
                  <td class="sticky-col-cell" style="background:var(--content);">Participación est.</td>
                  <td class="text-right tabular text-muted">70,4%</td>
                  <td class="text-right tabular">
                    ${(preds.reduce((a, f) => a + (Number(f.turnout) || 70), 0) / preds.length).toFixed(1)}%
                  </td>
                  ${preds.map(f => `<td class="text-right tabular">${f.turnout != null ? f.turnout + '%' : '—'}</td>`).join('')}
                </tr>
              </tbody>
            </table>
          </div>
        ` : `
          <div class="chips-row">
            ${preds.map(f => `
              <button class="chip ${selectedFriend?.friendKey === f.friendKey ? 'active' : ''}"
                onclick="window.__porraActions.selectGroupFriend('${f.friendKey}')">
                ${escapeHtml(f.friendName)}
              </button>
            `).join('')}
          </div>

          ${selectedFriend ? `
            <div class="party-card stack-md" style="padding:16px;">
              <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;">
                <div>
                  <div style="font-size:16px;font-weight:800;">Porra de ${escapeHtml(selectedFriend.friendName)}</div>
                  <div class="text-muted" style="font-size:12px;">
                    Guardada: ${escapeHtml(formatDateTime(selectedFriend.updatedAt))} · Participación est.: ${selectedFriend.turnout ?? '—'}%
                  </div>
                </div>
                ${!locked ? `
                  <button class="btn btn-sm" onclick="window.__porraActions.loadFriendToEditor('${selectedFriend.friendKey}')">
                    Editar esta porra
                  </button>
                ` : ''}
              </div>

              ${selectedFriend.comment ? `
                <div class="formula-box" style="font-style:italic;">"${escapeHtml(selectedFriend.comment)}"</div>
              ` : ''}

              ${renderHemicycleSVG(selectedFriend.seats, catalog)}

              ${renderPactCalculatorHtml(selectedFriend.seats, catalog)}

              <div class="grid-2">
                ${catalog
                  .filter(p => (selectedFriend.seats?.[p.id] || 0) > 0 || (selectedFriend.pct?.[p.id] || 0) > 0)
                  .sort((a, b) => (selectedFriend.seats?.[b.id] || 0) - (selectedFriend.seats?.[a.id] || 0) || (selectedFriend.pct?.[b.id] || 0) - (selectedFriend.pct?.[a.id] || 0))
                  .map(p => {
                    const s = selectedFriend.seats?.[p.id] || 0;
                    const pc = selectedFriend.pct?.[p.id] || 0;
                    const d = s - (p.seats23 || 0);
                    return `
                      <div class="card" style="padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                          <span class="party-dot" style="background:${p.color};margin-top:0;"></span>
                          <strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.abbr)}</strong>
                        </div>
                        <div class="tabular" style="display:flex;align-items:center;gap:8px;">
                          <strong>${s} esc.</strong>
                          ${pc ? `<span class="text-muted" style="font-size:12px;">(${pc}%)</span>` : ''}
                          ${d !== 0 ? `<span class="${d > 0 ? 'text-success' : 'text-error'}" style="font-size:12px;font-weight:700;">${d > 0 ? '+' + d : d}</span>` : ''}
                        </div>
                      </div>
                    `;
                  }).join('')}
              </div>
            </div>
          ` : ''}
        `}
      </div>
    </div>
  `;
}

// =============================================================================
// VISTA 3: RESULTADOS OFICIALES Y RANKING (+1 / -1)
// =============================================================================
function renderRankingView() {
  const catalog = getFullCatalog();
  const activeResults = state.officialResults || (state.ranking.demoResultsActive ? state.ranking.demoResults : null);
  const isDemo = !state.officialResults && state.ranking.demoResultsActive;

  // Editor de resultados oficiales (para el organizador)
  const officialEditorHtml = state.ranking.showOfficialEditor ? renderOfficialEditorBox(catalog) : '';

  if (!activeResults) {
    return `
      <div class="stack-md">
        <div class="card stack-md" style="text-align:center;padding:34px 20px;">
          <div style="font-size:17px;font-weight:800;">Esperando los resultados del 29 de noviembre de 2026</div>
          <p class="text-muted" style="max-width:540px;margin:0 auto;">
            Cuando acabe el escrutinio tras las elecciones, carga aquí los diputados reales de cada partido y se calculará el ranking con el sistema <strong>+1 por diputado acertado y −1 por diputado de desviación</strong>.
          </p>
          <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px;padding-top:6px;">
            <button class="btn btn-primary" onclick="window.__porraActions.toggleOfficialEditor()">
              Cargar resultados reales (Organizador)
            </button>
            <button class="btn" onclick="window.__porraActions.toggleDemoResults()">
              Probar vista previa con simulación ficticia
            </button>
          </div>
        </div>
        ${officialEditorHtml}
      </div>
    `;
  }

  const ranked = rankPredictions(state.predictions, activeResults, catalog);

  return `
    <div class="stack-md">
      <div class="card stack-sm">
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            ${isDemo ? `
              <span class="badge badge-warning">SIMULACIÓN FICTICIA DE PRUEBA</span>
              <span class="text-muted" style="font-size:12px;">Cifras de prueba (no son resultados reales).</span>
            ` : `
              <span class="badge badge-success">ESCRUTINIO OFICIAL CARGADO</span>
              <span class="text-muted" style="font-size:12px;">Publicado: ${escapeHtml(formatDateTime(activeResults.publishedAt))}</span>
            `}
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-sm" onclick="window.__porraActions.toggleOfficialEditor()">
              ${state.ranking.showOfficialEditor ? 'Cerrar editor' : 'Editar resultados'}
            </button>
            ${isDemo ? `
              <button class="btn btn-sm" onclick="window.__porraActions.toggleDemoResults()">Salir de simulación</button>
            ` : `
              <button class="btn btn-sm btn-danger" onclick="window.__porraActions.removeOfficialResults()">Borrar resultados</button>
            `}
          </div>
        </div>

        <div class="formula-box" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;">
          <span><strong>Fórmula aplicada:</strong> +1 por cada diputado acertado · −1 por cada diputado de desviación (máx. 350 pts).</span>
          <button class="btn btn-sm" onclick="window.__porraActions.switchTab('scoring')">Ver explicación y ejemplos</button>
        </div>
      </div>

      ${officialEditorHtml}

      ${ranked.length === 0 ? `
        <div class="card" style="text-align:center;padding:28px;">
          Aún no hay predicciones de amigos para clasificar.
        </div>
      ` : `
        <!-- Podio Top 3 -->
        <div class="grid-3">
          ${ranked.slice(0, 3).map((r, idx) => `
            <div class="card stack-sm" style="${idx === 0 ? 'border-color:var(--warning);border-width:2px;' : ''}">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <span class="badge ${idx === 0 ? 'badge-warning' : ''}">${idx + 1}.º puesto</span>
                <strong class="tabular" style="font-size:18px;color:var(--primary);">${r.totalPoints} pts</strong>
              </div>
              <div style="font-size:18px;font-weight:800;">${escapeHtml(r.prediction.friendName)}</div>
              <div class="tabular text-muted" style="font-size:12px;">
                <div>Acertados: <strong class="text-success">+${r.totalMatched}</strong> · Fallados: <strong class="text-error">−${r.totalMissed}</strong></div>
                <div>Plenos exactos: <strong>${r.exactPartyHits}</strong>${r.bestHit ? ` · Mejor: ${escapeHtml(r.bestHit.party.abbr)} (±${r.bestHit.missed})` : ''}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Clasificación completa desplegable -->
        <div class="card stack-sm">
          <strong style="font-size:15px;">Clasificación completa (pulsa en un participante para auditar partido a partido)</strong>
          <div class="stack-sm">
            ${ranked.map((r, idx) => {
              const isOpen = state.ranking.expandedFriendKey === r.prediction.friendKey;
              return `
                <div class="party-card" style="padding:0;overflow:hidden;">
                  <button onclick="window.__porraActions.toggleRankDetail('${r.prediction.friendKey}')"
                    style="width:100%;border:none;background:transparent;color:inherit;padding:12px 14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;text-align:left;">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <span class="badge tabular" style="font-weight:800;">#${idx + 1}</span>
                      <div>
                        <div style="font-size:14px;font-weight:800;">${escapeHtml(r.prediction.friendName)}</div>
                        <div class="text-muted tabular" style="font-size:12px;">
                          Acertados: +${r.totalMatched} · Desviación: −${r.totalMissed} · Plenos exactos: ${r.exactPartyHits}
                        </div>
                      </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;">
                      <strong class="tabular" style="font-size:15px;color:var(--primary);">${r.totalPoints} pts</strong>
                      <span class="text-muted">${isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  ${isOpen ? `
                    <div style="border-top:1px solid var(--border);background:var(--card);padding:12px;">
                      <div class="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Partido</th>
                              <th class="text-right">Predicho</th>
                              <th class="text-right">Real</th>
                              <th class="text-right">Acertados (+1)</th>
                              <th class="text-right">Fallados (−1)</th>
                              <th class="text-right">Puntos</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${r.breakdown.map(b => `
                              <tr>
                                <td>
                                  <div style="display:flex;align-items:center;gap:6px;">
                                    <span class="party-dot" style="background:${b.party.color};margin-top:0;"></span>
                                    <strong>${escapeHtml(b.party.abbr)}</strong>
                                  </div>
                                </td>
                                <td class="text-right tabular">${b.pred}</td>
                                <td class="text-right tabular"><strong>${b.real}</strong></td>
                                <td class="text-right tabular text-success">+${b.matched}</td>
                                <td class="text-right tabular ${b.missed === 0 ? 'text-muted' : 'text-error'}">
                                  ${b.missed === 0 ? '0' : '−' + b.missed}
                                </td>
                                <td class="text-right tabular"><strong>${b.points}</strong></td>
                              </tr>
                            `).join('')}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `}
    </div>
  `;
}

function renderOfficialEditorBox(catalog) {
  const total = getTotalSeats(state.ranking.officialDraftSeats);
  const needsAdminCode = state.backend.mode === 'supabase' || state.backend.mode === 'server';

  return `
    <div class="card stack-md" style="border-color:var(--primary);">
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;">
        <div>
          <strong style="font-size:15px;">Cargar resultados oficiales del 29-N</strong>
          <div class="text-muted" style="font-size:12px;">Introduce los escaños definitivos (deben sumar exactamente 350).</div>
        </div>
        <span id="official-draft-badge" class="badge ${total === 350 ? 'badge-success' : 'badge-warning'} tabular">${total} / 350 esc.</span>
      </div>

      <div class="grid-3" style="max-height:320px;overflow-y:auto;padding-right:4px;">
        ${catalog.map(p => `
          <div class="party-card" style="padding:8px 10px;gap:6px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
              <span style="font-weight:700;font-size:12px;">${escapeHtml(p.abbr)}</span>
              <div style="display:flex;align-items:center;gap:4px;">
                <input class="seat-input tabular" style="width:52px;height:30px;font-size:13px;" type="number" min="0" max="350"
                  value="${state.ranking.officialDraftSeats[p.id] || 0}"
                  oninput="window.__porraActions.setOfficialDraftSeat('${p.id}', this.value)" />
                <span class="text-muted" style="font-size:11px;">esc</span>
                <input class="pct-input tabular" style="width:52px;height:30px;font-size:11px;" type="number" step="0.1" min="0" max="100"
                  value="${state.ranking.officialDraftPct[p.id] || 0}"
                  oninput="window.__porraActions.setOfficialDraftPct('${p.id}', this.value)" />
                <span class="text-muted" style="font-size:11px;">%</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <div style="display:flex;flex-wrap:wrap;align-items:end;gap:10px;border-top:1px solid var(--border);padding-top:12px;">
        <div style="width:140px;">
          <label class="label">Participación (%)</label>
          <input class="input tabular" type="number" step="0.1" min="0" max="100"
            value="${state.ranking.officialDraftTurnout}"
            oninput="window.__porraActions.setOfficialDraftTurnout(this.value)" />
        </div>
        ${needsAdminCode ? `
          <div style="flex:1;min-width:190px;">
            <label class="label">Código de organizador (para publicar)</label>
            <input class="input" type="password" value="${escapeHtml(state.ranking.adminCode)}"
              oninput="window.__porraActions.setAdminCode(this.value)"
              placeholder="Tu clave del archivo SQL o server.py" />
          </div>
        ` : ''}
        <button class="btn btn-primary" onclick="window.__porraActions.publishOfficialResults()">
          Publicar resultados y calcular ranking
        </button>
      </div>
    </div>
  `;
}

// =============================================================================
// VISTA 4: EXPLICACIÓN DEL SISTEMA DE PUNTUACIÓN (+1 / -1)
// =============================================================================
function renderScoringGuideView() {
  const sample = scoreParty(state.calc.pred, state.calc.real);

  return `
    <div class="stack-md">
      <div class="card stack-md">
        <div>
          <span class="badge badge-primary">Regla oficial de la porra</span>
          <h2 style="margin:8px 0 4px;font-size:18px;">Sistema de puntuación: +1 por diputado acertado y −1 por diputado no acertado</h2>
          <p class="text-muted" style="margin:0;">
            Cada partido político se evalúa de forma individual comparando los diputados que predijiste frente a los que obtuvo realmente en el Congreso.
          </p>
        </div>

        <div class="formula-box stack-sm">
          <div><strong>Fórmula por partido:</strong></div>
          <div>
            <code>Puntos del partido = Diputados acertados − Diputados de diferencia</code>
          </div>
          <div class="text-muted" style="font-size:12px;">
            Donde <strong>Diputados acertados</strong> = <code>mín(Predicción, Resultado real)</code> (+1 punto cada uno) y <strong>Diputados de diferencia</strong> = <code>|Predicción − Resultado real|</code> (−1 punto por cada diputado predicho de más o de menos).
          </div>
          <div class="text-muted" style="font-size:12px;">
            La <strong>puntuación total</strong> es la suma de todos los partidos (máximo posible: <strong>350 puntos</strong> si clavas los 350 escaños).
          </div>
        </div>

        <div class="grid-2">
          <div class="party-card">
            <strong>Ejemplo 1 · Te pasas por arriba (caso PP)</strong>
            <div class="text-muted">El PP saca <strong>120</strong> diputados y tú predijiste <strong>140</strong>:</div>
            <div class="tabular">
              • Acertados: <strong class="text-success">+120</strong> (los 120 reales están dentro de tus 140)<br/>
              • No acertados (desviación): <strong class="text-error">−20</strong> (pusiste 20 de más)<br/>
              • Resultado en el PP: <strong>120 − 20 = 100 puntos</strong>
            </div>
          </div>

          <div class="party-card">
            <strong>Ejemplo 2 · Te quedas corto</strong>
            <div class="text-muted">Un partido saca <strong>120</strong> diputados y tú predijiste <strong>100</strong>:</div>
            <div class="tabular">
              • Acertados: <strong class="text-success">+100</strong><br/>
              • No acertados (desviación): <strong class="text-error">−20</strong> (faltaron 20 por predecir)<br/>
              • Resultado: <strong>100 − 20 = 80 puntos</strong>
            </div>
          </div>

          <div class="party-card">
            <strong>Ejemplo 3 · Pleno exacto</strong>
            <div class="text-muted">Un partido saca <strong>36</strong> diputados y tú predijiste <strong>36</strong>:</div>
            <div class="tabular">
              • Acertados: <strong class="text-success">+36</strong> · Desviación: <strong>0</strong><br/>
              • Resultado: <strong>+36 puntos</strong>
            </div>
          </div>

          <div class="party-card">
            <strong>Ejemplo 4 · Partido sin escaños</strong>
            <div class="text-muted">Predijiste <strong>3</strong> diputados a un partido que finalmente saca <strong>0</strong>:</div>
            <div class="tabular">
              • Acertados: <strong>0</strong> · Desviación: <strong class="text-error">−3</strong><br/>
              • Resultado: <strong>−3 puntos</strong> (si predijiste 0 y sacó 0, suma 0)
            </div>
          </div>
        </div>
      </div>

      <!-- Calculadora interactiva -->
      <div class="card stack-md">
        <div>
          <strong style="font-size:15px;">Calculadora interactiva de puntos por partido</strong>
          <div class="text-muted" style="font-size:12px;">Prueba cualquier combinación para ver cuántos puntos sumaría en un partido.</div>
        </div>

        <div class="grid-3" style="align-items:center;">
          <div>
            <label class="label" for="calc-real">Diputados reales del partido</label>
            <input id="calc-real" class="input tabular" type="number" min="0" max="350" value="${state.calc.real}"
              oninput="window.__porraActions.updateCalc('real', this.value)" />
          </div>
          <div>
            <label class="label" for="calc-pred">Tu predicción</label>
            <input id="calc-pred" class="input tabular" type="number" min="0" max="350" value="${state.calc.pred}"
              oninput="window.__porraActions.updateCalc('pred', this.value)" />
          </div>
          <div id="calc-result-box" class="formula-box tabular">
            <div>Acertados: <strong class="text-success">+${sample.matched}</strong></div>
            <div>Desviación: <strong class="text-error">−${sample.missed}</strong></div>
            <div style="font-size:16px;font-weight:800;margin-top:4px;">Total: ${sample.points} puntos</div>
          </div>
        </div>

        <div class="text-muted" style="font-size:12px;border-top:1px solid var(--border);padding-top:10px;">
          <strong>Criterios de desempate en el ranking:</strong> 1) Mayor número de partidos clavados con exactitud, 2) Menor error acumulado en % de voto (si se rellenó), 3) Quién guardó antes su porra.
        </div>
      </div>
    </div>
  `;
}

// =============================================================================
// VISTA 5: BASE OFICIAL 23-J (2023) Y ENCUESTAS 29-N (2026)
// =============================================================================
function renderBaseView() {
  const catalog = getFullCatalog();
  const map23 = {};
  catalog.forEach(p => { if (p.seats23 > 0) map23[p.id] = p.seats23; });

  return `
    <div class="stack-md">
      <div class="grid-2">
        <div class="card stack-sm">
          <div>
            <strong style="font-size:15px;">Congreso 23-J de 2023 (Base oficial)</strong>
            <div class="text-muted" style="font-size:12px;">Fuente: Junta Electoral Central / BOE / Ministerio del Interior</div>
          </div>
          ${renderHemicycleSVG(map23, catalog)}
          ${renderPactCalculatorHtml(map23, catalog)}
          <div class="grid-2" style="gap:8px;font-size:12px;">
            <div class="formula-box">
              <div class="text-muted">Censo electoral</div>
              <strong class="tabular">${OFFICIAL_23J_SUMMARY.census.toLocaleString('es-ES')}</strong>
            </div>
            <div class="formula-box">
              <div class="text-muted">Participación (censo esp. / total)</div>
              <strong class="tabular">${OFFICIAL_23J_SUMMARY.turnoutResPct}% / ${OFFICIAL_23J_SUMMARY.turnoutTotalPct}%</strong>
            </div>
            <div class="formula-box">
              <div class="text-muted">Votos válidos</div>
              <strong class="tabular">${OFFICIAL_23J_SUMMARY.validVotes.toLocaleString('es-ES')}</strong>
            </div>
            <div class="formula-box">
              <div class="text-muted">Blanco / Nulos</div>
              <strong class="tabular">${OFFICIAL_23J_SUMMARY.blankVotes.toLocaleString('es-ES')} / ${OFFICIAL_23J_SUMMARY.nullVotes.toLocaleString('es-ES')}</strong>
            </div>
          </div>
        </div>

        <div class="card stack-sm">
          <strong style="font-size:15px;">Criterios de ordenación de candidaturas (29-N 2026)</strong>
          <p class="text-muted" style="margin:0;font-size:12px;">
            Las candidaturas aparecen agrupadas según las encuestas de noviembre de 2026 (CIS Estudio nº 3584, 40dB, GAD3, Sigma Dos y agregadores de medios) y los datos del BOE núm. 273:
          </p>
          <div class="stack-sm">
            ${Object.values(POLL_TIERS).map(t => `
              <div class="formula-box">
                <div style="font-weight:700;font-size:12px;">${escapeHtml(t.label)}</div>
                <div class="text-muted" style="font-size:12px;margin-top:2px;">${escapeHtml(t.description)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="card stack-sm">
        <strong style="font-size:15px;">Tabla completa de referencia (23-J 2023 y 29-N 2026)</strong>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Partido / Coalición</th>
                <th>Grupo encuestas 29-N</th>
                <th class="text-right">Esc. 23-J</th>
                <th class="text-right">% 23-J</th>
                <th class="text-right">Votos 23-J</th>
                <th>Expectativa / Notas 29-N</th>
              </tr>
            </thead>
            <tbody>
              ${catalog.map(p => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span class="party-dot" style="background:${p.color};margin-top:0;"></span>
                      <div>
                        <strong>${escapeHtml(p.abbr)}</strong>
                        <div class="text-muted" style="font-size:11px;">${escapeHtml(p.scope)}</div>
                      </div>
                    </div>
                  </td>
                  <td><span class="badge" style="font-size:11px;">${escapeHtml(POLL_TIERS[p.pollTier]?.shortLabel || 'Otro')}</span></td>
                  <td class="text-right tabular"><strong>${p.seats23}</strong></td>
                  <td class="text-right tabular">${p.pct23 ? p.pct23.toFixed(2) + '%' : '—'}</td>
                  <td class="text-right tabular text-muted">${p.votes23 ? p.votes23.toLocaleString('es-ES') : '—'}</td>
                  <td class="text-muted" style="max-width:290px;">${escapeHtml(p.pollRange26 ? p.pollRange26 + ' · ' : '')}${escapeHtml(p.note26 || '')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// =============================================================================
// MODAL DE CONFIGURACIÓN DE NUBE GRATUITA (SUPABASE)
// =============================================================================
function openCloudModal() {
  const modal = document.getElementById('cloud-modal');
  const body = document.getElementById('cloud-modal-body');
  const saved = getSavedCloudOverride();
  const cfg = window.PORRA_CONFIG || {};
  const currUrl = saved.SUPABASE_URL || cfg.SUPABASE_URL || '';
  const currKey = saved.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY || '';

  body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <strong style="font-size:16px;">Almacenamiento compartido gratuito (Supabase)</strong>
      <button class="btn btn-sm" onclick="window.__porraActions.closeCloudModal()">Cerrar</button>
    </div>

    <div class="formula-box stack-sm" style="font-size:12px;">
      <div><strong>Cómo activarlo gratis para todos tus amigos (3 pasos):</strong></div>
      <div>1. Crea un proyecto gratuito en <strong>supabase.com</strong> y pega el contenido de <code>supabase_schema.sql</code> en <em>SQL Editor → Run</em>.</div>
      <div>2. Copia tu <strong>Publishable key</strong> (<em>Settings → API Keys</em>, empieza por <code>sb_publishable_...</code>; nunca uses la <em>Secret key</em>) y tu <strong>Project URL</strong> (<em>Settings → Data API</em> o botón <em>Connect</em>).</div>
      <div>3. Para que les funcione a tus amigos al abrir el enlace, pégalos en <code>js/config.js</code> antes de subir la web a GitHub Pages / Netlify. También puedes probarlos aquí al instante:</div>
    </div>

    <div class="stack-sm">
      <div>
        <label class="label">Supabase Project URL</label>
        <input id="cloud-url-input" class="input" type="url" value="${escapeHtml(currUrl)}"
          placeholder="https://tuproyecto.supabase.co" />
      </div>
      <div>
        <label class="label">Supabase Publishable Key (o Anon Key)</label>
        <input id="cloud-key-input" class="input" type="text" value="${escapeHtml(currKey)}"
          placeholder="sb_publishable_... (o eyJhbGciOiJIUzI1NiIs...)" />
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
      <button class="btn" onclick="window.__porraActions.clearCloudOverride()">Usar config.js / local</button>
      <button class="btn btn-primary" onclick="window.__porraActions.saveCloudOverride()">Guardar y conectar</button>
    </div>
  `;

  modal.classList.remove('hidden');
}

function closeCloudModal() {
  document.getElementById('cloud-modal').classList.add('hidden');
}

// =============================================================================
// ACCIONES EXPUESTAS PARA LOS EVENTOS DEL DOM
// =============================================================================
window.__porraActions = {
  switchTab(tab) {
    state.activeTab = tab;
    updateChrome();
    renderApp();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('porra29n_theme', isDark ? 'dark' : 'light'); } catch {}
  },

  setFriendName(val) {
    state.editor.friendName = val;
  },

  setTurnout(val) {
    state.editor.turnout = val;
  },

  setComment(val) {
    state.editor.comment = val;
  },

  setSearch(val) {
    state.editor.search = val;
    const list = document.getElementById('predict-party-list');
    if (list) list.innerHTML = buildPredictPartyCardsHtml();
  },

  setFilterTier(tier) {
    state.editor.filterTier = tier;
    renderApp();
  },

  togglePactParty(partyId) {
    const idx = state.pactSelectedIds.indexOf(partyId);
    if (idx >= 0) {
      state.pactSelectedIds.splice(idx, 1);
    } else {
      state.pactSelectedIds.push(partyId);
    }
    if (state.activeTab === 'predict') {
      updatePredictSeatsUi();
    } else {
      renderApp();
    }
  },

  clearPact() {
    state.pactSelectedIds = [];
    if (state.activeTab === 'predict') {
      updatePredictSeatsUi();
    } else {
      renderApp();
    }
  },

  adjustSeat(partyId, delta) {
    if (isDeadlinePassed()) return;
    const curr = parseInt(state.editor.seats[partyId] || 0, 10) || 0;
    const next = Math.max(0, Math.min(350, curr + delta));
    state.editor.seats[partyId] = next;
    const input = document.getElementById(`seat-input-${partyId}`);
    if (input) input.value = next;
    updatePredictSeatsUi();
  },

  setSeatDirect(partyId, rawVal) {
    if (isDeadlinePassed()) return;
    let num = parseInt(rawVal, 10);
    if (isNaN(num) || num < 0) num = 0;
    if (num > 350) num = 350;
    state.editor.seats[partyId] = num;
    updatePredictSeatsUi();
  },

  setPctDirect(partyId, rawVal) {
    if (isDeadlinePassed()) return;
    let num = parseFloat(rawVal);
    if (isNaN(num) || num < 0) num = 0;
    if (num > 100) num = 100;
    state.editor.pct[partyId] = num;
    updatePredictSeatsUi();
  },

  copy23J() {
    if (isDeadlinePassed()) return;
    getFullCatalog().forEach(p => {
      state.editor.seats[p.id] = p.seats23 || 0;
      state.editor.pct[p.id] = p.pct23 || 0;
    });
    renderApp();
    showToast('Resultados oficiales 23-J cargados en tu borrador');
  },

  zeroAll() {
    if (isDeadlinePassed()) return;
    getFullCatalog().forEach(p => {
      state.editor.seats[p.id] = 0;
      state.editor.pct[p.id] = 0;
    });
    renderApp();
    showToast('Todos los escaños puestos a 0', 'warning');
  },

  newFriendDraft() {
    state.editor.editingKey = null;
    state.editor.friendName = '';
    state.editor.turnout = 70.4;
    state.editor.comment = '';
    initEditorDefaults();
    renderApp();
  },

  loadFriendToEditor(friendKey) {
    const f = state.predictions.find(p => p.friendKey === friendKey);
    if (!f) return;
    state.editor.editingKey = f.friendKey;
    state.editor.friendName = f.friendName;
    state.editor.turnout = f.turnout ?? 70.4;
    state.editor.comment = f.comment || '';
    (f.customParties || []).forEach(cp => {
      if (cp && cp.id && !state.customParties.some(x => x.id === cp.id)) {
        state.customParties.push(cp);
      }
    });
    getFullCatalog().forEach(p => {
      state.editor.seats[p.id] = f.seats?.[p.id] || 0;
      state.editor.pct[p.id] = f.pct?.[p.id] || 0;
    });
    state.activeTab = 'predict';
    updateChrome();
    renderApp();
    showToast(`Cargada la porra de ${f.friendName}`);
  },

  toggleCustomDrawer() {
    state.editor.showCustomDrawer = !state.editor.showCustomDrawer;
    renderApp();
  },

  addCustomParty() {
    const nameEl = document.getElementById('custom-party-name');
    const scopeEl = document.getElementById('custom-party-scope');
    const rawName = (nameEl?.value || '').trim();
    const rawScope = (scopeEl?.value || '').trim() || 'Candidatura BOE';
    if (!rawName) {
      showToast('Escribe el nombre o siglas del partido', 'warning');
      return;
    }
    const id = 'custom_' + slugifyFriendKey(rawName);
    if (!getFullCatalog().some(p => p.id === id)) {
      state.customParties.push({
        id,
        abbr: rawName.slice(0, 16),
        name: rawName,
        color: '#6366F1',
        scope: rawScope
      });
    }
    state.editor.seats[id] = 0;
    state.editor.pct[id] = 0;
    state.editor.showCustomDrawer = false;
    renderApp();
    showToast(`"${rawName}" añadido a la lista`);
  },

  async saveMyPrediction() {
    if (isDeadlinePassed()) {
      showToast('La porra cerró el 28 de noviembre a las 23:59.', 'error');
      return;
    }
    const name = (state.editor.friendName || '').trim();
    if (!name) {
      showToast('Escribe tu nombre para guardar la porra', 'warning');
      return;
    }
    const total = getTotalSeats(state.editor.seats);
    if (total !== 350) {
      showToast(`Debes repartir exactamente 350 diputados (ahora tienes ${total})`, 'warning');
      return;
    }

    const friendKey = state.editor.editingKey || slugifyFriendKey(name);
    const cleanSeats = {};
    const cleanPct = {};
    const usedCustom = [];

    getFullCatalog().forEach(p => {
      const s = parseInt(state.editor.seats[p.id] || 0, 10) || 0;
      const pc = parseFloat(state.editor.pct[p.id] || 0) || 0;
      if (s > 0) cleanSeats[p.id] = s;
      if (pc > 0) cleanPct[p.id] = pc;
      if (p.isCustom && (s > 0 || pc > 0)) {
        usedCustom.push({ id: p.id, abbr: p.abbr, name: p.name, color: p.color, scope: p.scope });
      }
    });

    state.saving = true;
    renderApp();
    try {
      const saved = await savePrediction(state.backend, {
        friendKey,
        friendName: name,
        seats: cleanSeats,
        pct: cleanPct,
        turnout: parseFloat(state.editor.turnout || 70.4) || null,
        comment: state.editor.comment,
        customParties: usedCustom
      });

      await refreshFromBackend();
      state.editor.editingKey = saved.friendKey;
      state.group.selectedFriendKey = saved.friendKey;
      updateChrome();
      showToast(`¡Porra de ${saved.friendName} guardada!`);
    } catch (err) {
      showToast(`Error al guardar: ${err.message}`, 'error');
    } finally {
      state.saving = false;
      renderApp();
    }
  },

  async removeEditingFriend() {
    if (!state.editor.editingKey || isDeadlinePassed()) return;
    const key = state.editor.editingKey;
    const name = state.editor.friendName;
    try {
      await deletePrediction(state.backend, key);
      await refreshFromBackend();
      state.editor.editingKey = null;
      state.editor.friendName = '';
      initEditorDefaults();
      updateChrome();
      renderApp();
      showToast(`Porra de ${name} eliminada`, 'warning');
    } catch (err) {
      showToast(`No se pudo eliminar: ${err.message}`, 'error');
    }
  },

  async refreshAll() {
    try {
      await refreshFromBackend();
      updateChrome();
      renderApp();
      showToast('Datos actualizados');
    } catch (err) {
      showToast(`Error al actualizar: ${err.message}`, 'error');
    }
  },

  setGroupView(mode) {
    state.group.viewMode = mode;
    renderApp();
  },

  toggleGroupActiveFilter(checked) {
    state.group.onlyActiveParties = checked;
    renderApp();
  },

  selectGroupFriend(key) {
    state.group.selectedFriendKey = key;
    renderApp();
  },

  inspectFriendCard(key) {
    state.group.selectedFriendKey = key;
    state.group.viewMode = 'cards';
    renderApp();
  },

  toggleDemoResults() {
    state.ranking.demoResultsActive = !state.ranking.demoResultsActive;
    renderApp();
  },

  toggleOfficialEditor() {
    state.ranking.showOfficialEditor = !state.ranking.showOfficialEditor;
    if (state.ranking.showOfficialEditor && state.officialResults) {
      state.ranking.officialDraftSeats = { ...(state.officialResults.seats || {}) };
      state.ranking.officialDraftTurnout = state.officialResults.turnout ?? 70.0;
    }
    renderApp();
  },

  setOfficialDraftSeat(partyId, val) {
    state.ranking.officialDraftSeats[partyId] = Math.max(0, Math.min(350, parseInt(val || 0, 10) || 0));
    const total = getTotalSeats(state.ranking.officialDraftSeats);
    const badge = document.getElementById('official-draft-badge');
    if (badge) {
      badge.className = 'badge tabular ' + (total === 350 ? 'badge-success' : 'badge-warning');
      badge.textContent = `${total} / 350 esc.`;
    }
  },

  setOfficialDraftPct(partyId, val) {
    state.ranking.officialDraftPct[partyId] = Math.max(0, Math.min(100, parseFloat(val || 0) || 0));
  },

  setOfficialDraftTurnout(val) {
    state.ranking.officialDraftTurnout = parseFloat(val || 70) || 70;
  },

  setAdminCode(val) {
    state.ranking.adminCode = val;
  },

  async publishOfficialResults() {
    const total = getTotalSeats(state.ranking.officialDraftSeats);
    if (total !== 350) {
      showToast(`Los resultados oficiales deben sumar 350 escaños (ahora suman ${total})`, 'warning');
      return;
    }
    const cleanSeats = {};
    const cleanPct = {};
    Object.entries(state.ranking.officialDraftSeats).forEach(([k, v]) => {
      const n = parseInt(v || 0, 10) || 0;
      if (n > 0) cleanSeats[k] = n;
    });
    Object.entries(state.ranking.officialDraftPct).forEach(([k, v]) => {
      const n = parseFloat(v || 0) || 0;
      if (n > 0) cleanPct[k] = n;
    });

    try {
      await saveOfficialResults(state.backend, {
        adminCode: state.ranking.adminCode,
        seats: cleanSeats,
        pct: cleanPct,
        turnout: state.ranking.officialDraftTurnout
      });
      await refreshFromBackend();
      state.ranking.showOfficialEditor = false;
      state.ranking.demoResultsActive = false;
      renderApp();
      showToast('Resultados oficiales guardados y ranking actualizado');
    } catch (err) {
      showToast(`Error al publicar: ${err.message}`, 'error');
    }
  },

  async removeOfficialResults() {
    if (state.backend.mode !== 'local' && !state.ranking.adminCode.trim()) {
      state.ranking.showOfficialEditor = true;
      renderApp();
      showToast('Introduce el código de organizador y vuelve a pulsar "Borrar resultados"', 'warning');
      return;
    }
    try {
      await clearOfficialResults(state.backend, state.ranking.adminCode);
      await refreshFromBackend();
      renderApp();
      showToast('Resultados oficiales eliminados', 'warning');
    } catch (err) {
      showToast(`No se pudieron borrar: ${err.message}`, 'error');
    }
  },

  toggleRankDetail(friendKey) {
    state.ranking.expandedFriendKey = state.ranking.expandedFriendKey === friendKey ? null : friendKey;
    renderApp();
  },

  updateCalc(field, val) {
    const num = Math.max(0, Math.min(350, parseInt(val || 0, 10) || 0));
    state.calc[field] = num;
    const res = scoreParty(state.calc.pred, state.calc.real);
    const box = document.getElementById('calc-result-box');
    if (box) {
      box.innerHTML = `
        <div>Acertados: <strong class="text-success">+${res.matched}</strong></div>
        <div>Desviación: <strong class="text-error">−${res.missed}</strong></div>
        <div style="font-size:16px;font-weight:800;margin-top:4px;">Total: ${res.points} puntos</div>
      `;
    }
  },

  openCloudModal,
  closeCloudModal,

  async saveCloudOverride() {
    const url = document.getElementById('cloud-url-input')?.value || '';
    const key = document.getElementById('cloud-key-input')?.value || '';
    if (!url.trim() || !key.trim()) {
      showToast('Introduce la URL y la Anon Key de Supabase', 'warning');
      return;
    }
    saveCloudOverrideConfig(url, key);
    closeCloudModal();
    state.loading = true;
    renderApp();
    try {
      state.backend = await detectBackendMode();
      await refreshFromBackend();
      showToast('Conectado a Supabase correctamente');
    } catch (err) {
      showToast(`Error conectando a Supabase: ${err.message}`, 'error');
    } finally {
      state.loading = false;
      updateChrome();
      renderApp();
    }
  },

  async clearCloudOverride() {
    saveCloudOverrideConfig('', '');
    closeCloudModal();
    state.loading = true;
    renderApp();
    try {
      state.backend = await detectBackendMode();
      await refreshFromBackend();
    } finally {
      state.loading = false;
      updateChrome();
      renderApp();
      showToast('Ajustes de nube limpiados', 'warning');
    }
  }
};

bootstrap();

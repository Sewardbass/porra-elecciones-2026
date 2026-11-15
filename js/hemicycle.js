// Renderizador SVG del hemiciclo del Congreso de los Diputados (350 escaños)

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getTotalSeats(seatsMap) {
  return Object.values(seatsMap || {}).reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0);
}

export function getTotalPct(pctMap) {
  return Object.values(pctMap || {}).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
}

export function renderHemicycleSVG(seatsMap, catalog, options = {}) {
  const radii = [56, 68, 80, 92, 104, 116, 128];
  const counts = [30, 37, 44, 50, 57, 63, 69]; // suma = 350
  const cx = 160;
  const cy = 148;
  const dots = [];

  for (let rIdx = 0; rIdx < radii.length; rIdx++) {
    const r = radii[rIdx];
    const n = counts[rIdx];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const angle = Math.PI * (1 - t);
      dots.push({
        angle,
        r,
        x: cx + r * Math.cos(angle),
        y: cy - r * Math.sin(angle)
      });
    }
  }

  // Ordenar de izquierda (pi) a derecha (0) formando columnas limpias
  dots.sort((a, b) => b.angle - a.angle || a.r - b.r);

  const seatColors = [];
  const activeParties = (catalog || [])
    .map(p => ({ party: p, seats: parseInt(seatsMap?.[p.id] || 0, 10) || 0 }))
    .filter(x => x.seats > 0)
    .sort((a, b) => b.seats - a.seats);

  activeParties.forEach(item => {
    for (let k = 0; k < item.seats && seatColors.length < 350; k++) {
      seatColors.push({ color: item.party.color, title: `${item.party.abbr} (${item.seats})` });
    }
  });

  const circles = dots.map((d, idx) => {
    const assigned = seatColors[idx];
    const fill = assigned ? assigned.color : 'var(--border)';
    const opacity = assigned ? '1' : '0.45';
    return `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="3.4" fill="${fill}" fill-opacity="${opacity}"><title>${assigned ? escapeHtml(assigned.title) : 'Sin asignar'}</title></circle>`;
  }).join('');

  const total = getTotalSeats(seatsMap);
  const label = options.label || 'de 350 escaños';

  return `
    <div class="hemicycle-wrap">
      <svg viewBox="0 0 320 166" class="hemicycle-svg" role="img" aria-label="Hemiciclo de 350 escaños">
        ${circles}
        <line x1="160" y1="12" x2="160" y2="152" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="3 3" />
        <text x="160" y="9" text-anchor="middle" fill="var(--muted)" font-size="9.5" font-weight="600">176 (Mayoría)</text>
        <text x="160" y="137" text-anchor="middle" fill="var(--text)" font-size="19" font-weight="800" class="tabular">${total}</text>
        <text x="160" y="152" text-anchor="middle" fill="var(--muted)" font-size="10">${escapeHtml(label)}</text>
      </svg>
    </div>
  `;
}

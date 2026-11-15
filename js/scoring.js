// Motor de puntuación de La Porra 29-N
// Regla exacta:
//   Por cada partido i:
//     - Diputados acertados = min(predicción_i, real_i)  -> +1 punto cada uno
//     - Diputados no acertados (desviación) = |predicción_i - real_i| -> -1 punto cada uno
//     - Puntos en el partido i = min(predicción_i, real_i) - |predicción_i - real_i|
//   Ejemplo: Real = 120, Predicción = 140 -> 120 acertados - 20 de desviación = 100 puntos.
//   Máximo posible = 350 puntos (pleno absoluto en los 350 escaños).

export function scoreParty(predictedSeats, realSeats) {
  const pred = Math.max(0, parseInt(predictedSeats || 0, 10) || 0);
  const real = Math.max(0, parseInt(realSeats || 0, 10) || 0);
  const matched = Math.min(pred, real);
  const diff = pred - real;
  const missed = Math.abs(diff);
  const points = matched - missed;

  return {
    pred,
    real,
    matched,
    diff,
    missed,
    points
  };
}

export function evaluatePrediction(prediction, officialResults, catalog) {
  const predSeats = prediction?.seats || {};
  const realSeats = officialResults?.seats || {};
  const predPct = prediction?.pct || {};
  const realPct = officialResults?.pct || {};

  const partyIds = new Set([
    ...catalog.map(p => p.id),
    ...Object.keys(predSeats),
    ...Object.keys(realSeats)
  ]);

  let totalMatched = 0;
  let totalMissed = 0;
  let totalPoints = 0;
  let exactPartyHits = 0;
  let absPctError = 0;
  const breakdown = [];

  partyIds.forEach(id => {
    const partyMeta = catalog.find(p => p.id === id) || {
      id,
      abbr: id.toUpperCase(),
      name: id,
      color: '#64748B',
      scope: 'Otra'
    };

    const pS = parseInt(predSeats[id] || 0, 10) || 0;
    const rS = parseInt(realSeats[id] || 0, 10) || 0;
    const pP = parseFloat(predPct[id] || 0) || 0;
    const rP = parseFloat(realPct[id] || 0) || 0;

    if (pS === 0 && rS === 0 && pP === 0 && rP === 0) return;

    const sp = scoreParty(pS, rS);
    totalMatched += sp.matched;
    totalMissed += sp.missed;
    totalPoints += sp.points;
    absPctError += Math.abs(pP - rP);

    if (pS === rS && (rS > 0 || pP > 0 || rP > 0)) {
      exactPartyHits += 1;
    }

    breakdown.push({
      party: partyMeta,
      ...sp,
      predPct: pP,
      realPct: rP
    });
  });

  // Ordenar desglose: primero partidos con escaños reales o predichos, luego por % voto
  breakdown.sort((a, b) =>
    b.real - a.real ||
    b.pred - a.pred ||
    b.realPct - a.realPct ||
    b.predPct - a.predPct
  );

  // Detectar mejor acierto y mayor desviación entre partidos relevantes
  const relevant = breakdown.filter(b => b.real >= 1 || b.pred >= 1);
  const bestHit = relevant.slice().sort((a, b) => a.missed - b.missed || b.real - a.real)[0] || null;
  const biggestMiss = relevant.slice().sort((a, b) => b.missed - a.missed || b.real - a.real)[0] || null;

  return {
    prediction,
    totalPoints,
    totalMatched,
    totalMissed,
    exactPartyHits,
    absPctError: Number(absPctError.toFixed(2)),
    bestHit,
    biggestMiss,
    breakdown
  };
}

export function rankPredictions(predictions, officialResults, catalog) {
  return (predictions || [])
    .map(pred => evaluatePrediction(pred, officialResults, catalog))
    .sort((a, b) =>
      // 1. Mayor puntuación total (+1 acertados -1 fallados)
      b.totalPoints - a.totalPoints ||
      // 2. Desempate: más plenos exactos en partidos
      b.exactPartyHits - a.exactPartyHits ||
      // 3. Desempate: menor error en % de voto (si se rellenó)
      a.absPctError - b.absPctError ||
      // 4. Desempate: quién guardó antes su porra
      new Date(a.prediction.updatedAt || 0).getTime() - new Date(b.prediction.updatedAt || 0).getTime()
    );
}

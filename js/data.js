// Datos oficiales del 23-J de 2023 (Junta Electoral Central / BOE / Ministerio del Interior)
// y candidaturas proclamadas para el 29-N de 2026 (BOE núm. 273 / Civio),
// ordenadas según su expectativa de representación en encuestas de noviembre de 2026
// (CIS Estudio nº 3584, 40dB, GAD3, Sigma Dos y agregadores de medios).

export const OFFICIAL_23J_SUMMARY = {
  date: '23 de julio de 2023',
  census: 37469458,
  voters: 24952447,
  turnoutResPct: 70.39,
  turnoutTotalPct: 66.59,
  validVotes: 24688087,
  blankVotes: 200673,
  nullVotes: 264360,
  totalSeats: 350
};

export const POLL_TIERS = {
  likely: {
    id: 'likely',
    label: 'Con proyección en encuestas (29-N)',
    shortLabel: 'Proyección encuestas',
    description: 'Partidos a los que las encuestas de noviembre de 2026 asignan escaños habitualmente.'
  },
  borderline: {
    id: 'borderline',
    label: 'En disputa / Límite (0–2 esc.)',
    shortLabel: 'En disputa (0–2)',
    description: 'Formaciones que oscilan entre 0 y 2 escaños según el sondeo o circunscripción.'
  },
  extra: {
    id: 'extra',
    label: 'Extraparlamentarios y otras candidaturas BOE',
    shortLabel: 'Otros partidos BOE',
    description: 'Candidaturas proclamadas sin proyección de escaño en los promedios nacionales.'
  }
};

// Ordenado por probabilidad de obtener escaños según encuestas de noviembre de 2026
export const PARTIES_CATALOG = [
  // --- TIER 1: PROYECCIÓN HABITUAL DE ESCAÑOS EN ENCUESTAS 29-N ---
  {
    id: 'pp',
    abbr: 'PP',
    name: 'Partido Popular',
    color: '#1D84CE',
    scope: 'Estatal (52 circ.)',
    pollTier: 'likely',
    pollRange26: '98–137 esc. (CIS / privadas)',
    seats23: 137,
    pct23: 33.06,
    votes23: 8160837,
    note26: 'Concurre en toda España (acuerdos territoriales como UPN-PP en Navarra).'
  },
  {
    id: 'psoe',
    abbr: 'PSOE',
    name: 'Partido Socialista Obrero Español',
    color: '#E31E24',
    scope: 'Estatal (52 circ.)',
    pollTier: 'likely',
    pollRange26: '103–143 esc. (privadas / CIS)',
    seats23: 121,
    pct23: 31.68,
    votes23: 7821718,
    note26: 'Concurre en las 52 circunscripciones (PSC en Cataluña).'
  },
  {
    id: 'vox',
    abbr: 'Vox',
    name: 'Vox',
    color: '#63BE21',
    scope: 'Estatal (52 circ.)',
    pollTier: 'likely',
    pollRange26: '57–67 esc. (CIS / agregadores)',
    seats23: 33,
    pct23: 12.38,
    votes23: 3057000,
    note26: 'Presente en las 52 circunscripciones al Congreso.'
  },
  {
    id: 'fa',
    abbr: 'Frente Amplio',
    name: 'Frente Amplio (Sumar / IU / Más Madrid / Comuns)',
    color: '#E51C6B',
    scope: 'Estatal (46 circ.)',
    pollTier: 'likely',
    pollRange26: '7–11 esc. (encuestas 29-N)',
    seats23: 31,
    pct23: 12.33,
    votes23: 3044996,
    note26: 'En 2023 concurrió como coalición Sumar (31 esc. junto a Podemos y territoriales).'
  },
  {
    id: 'erc',
    abbr: 'ERC',
    name: 'Esquerra Republicana de Catalunya',
    color: '#FFB232',
    scope: 'Cataluña (4 circ.)',
    pollTier: 'likely',
    pollRange26: '7–14 esc. (agregadores / CIS)',
    seats23: 7,
    pct23: 1.89,
    votes23: 466020,
    note26: 'Concurre en Cataluña (campaña conjunta con Podemos en Cataluña según CIS).'
  },
  {
    id: 'bildu',
    abbr: 'EH Bildu',
    name: 'Euskal Herria Bildu',
    color: '#A3C936',
    scope: 'País Vasco y Navarra',
    pollTier: 'likely',
    pollRange26: '6–10 esc. (agregadores / CIS)',
    seats23: 6,
    pct23: 1.36,
    votes23: 335129,
    note26: 'Concurre en Álava, Bizkaia, Gipuzkoa y Navarra.'
  },
  {
    id: 'junts',
    abbr: 'Junts',
    name: 'Junts per Catalunya',
    color: '#00C3B2',
    scope: 'Cataluña (4 circ.)',
    pollTier: 'likely',
    pollRange26: '2–7 esc. (CIS / agregadores)',
    seats23: 7,
    pct23: 1.60,
    votes23: 395429,
    note26: 'Concurre en Barcelona, Girona, Lleida y Tarragona.'
  },
  {
    id: 'pnv',
    abbr: 'EAJ-PNV',
    name: 'Euzko Alderdi Jeltzalea - PNV',
    color: '#008A45',
    scope: 'País Vasco y Navarra',
    pollTier: 'likely',
    pollRange26: '2–5 esc. (CIS / agregadores)',
    seats23: 5,
    pct23: 1.12,
    votes23: 277289,
    note26: 'Concurre en las circunscripciones vascas.'
  },
  {
    id: 'compromis',
    abbr: 'Compromís',
    name: 'Compromís – Front Valencià',
    color: '#F97316',
    scope: 'Com. Valenciana (3 circ.)',
    pollTier: 'likely',
    pollRange26: '2–6 esc. (agregadores / CIS)',
    seats23: 0,
    pct23: 0,
    votes23: 0,
    note26: 'En 2023 concurrió dentro de Sumar; en 2026 presenta marca territorial valenciana.'
  },
  {
    id: 'adelante',
    abbr: 'Adelante And.',
    name: 'Adelante Andalucía',
    color: '#15803D',
    scope: 'Andalucía',
    pollTier: 'likely',
    pollRange26: '0–4 esc. (media / CIS 3–4)',
    seats23: 0,
    pct23: 0.03,
    votes23: 9064,
    note26: 'El CIS proyecta 3–4 diputados (1,5% nacional concentrado en Andalucía).'
  },
  {
    id: 'bng',
    abbr: 'BNG',
    name: 'Bloque Nacionalista Galego',
    color: '#76B3DD',
    scope: 'Galicia (4 circ.)',
    pollTier: 'likely',
    pollRange26: '2–3 esc. (encuestas 29-N)',
    seats23: 1,
    pct23: 0.62,
    votes23: 153995,
    note26: 'Tendencia estable/al alza en Galicia respecto a 2023.'
  },
  {
    id: 'cca',
    abbr: 'CCa',
    name: 'Coalición Canaria – Municipalistas 1º Canarias',
    color: '#EAB308',
    scope: 'Canarias (2 circ.)',
    pollTier: 'likely',
    pollRange26: '1–2 esc. (encuestas 29-N)',
    seats23: 1,
    pct23: 0.47,
    votes23: 116363,
    note26: 'Concurre en Las Palmas y Santa Cruz de Tenerife.'
  },

  // --- TIER 2: EN DISPUTA / LÍMITE DE REPRESENTACIÓN (0-2 ESCAÑOS) ---
  {
    id: 'salf',
    abbr: 'SALF',
    name: 'Se Acabó La Fiesta',
    color: '#8A5A2B',
    scope: 'Estatal (46 circ.)',
    pollTier: 'borderline',
    pollRange26: '0–2 esc. (1,4%–2,2% voto)',
    seats23: 0,
    pct23: 0,
    votes23: 0,
    note26: 'No concurrió al 23-J; en el límite del umbral provincial en grandes circunscripciones.'
  },
  {
    id: 'podemos',
    abbr: 'Podemos',
    name: 'Podemos',
    color: '#7B3FA0',
    scope: 'Estatal (41 circ.)',
    pollTier: 'borderline',
    pollRange26: '0–1 esc. (1,1%–1,8% voto)',
    seats23: 0,
    pct23: 0,
    votes23: 0,
    note26: 'En 2023 fue en Sumar; en 2026 concurre por separado en 41 circunscripciones.'
  },
  {
    id: 'upn',
    abbr: 'UPN',
    name: 'Unión del Pueblo Navarro',
    color: '#2B5B9E',
    scope: 'Navarra (1 circ.)',
    pollTier: 'borderline',
    pollRange26: '0–2 esc. (acuerdo UPN-PP en Navarra)',
    seats23: 1,
    pct23: 0.21,
    votes23: 52188,
    note26: 'En algunas encuestas aparece integrado en las listas conjuntas UPN-PP por Navarra.'
  },
  {
    id: 'upc',
    abbr: 'UPC',
    name: 'Unidad del Pueblo Canario',
    color: '#0EA5E9',
    scope: 'Canarias (2 circ.)',
    pollTier: 'borderline',
    pollRange26: '0–2 esc. (CIS nov. 2026)',
    seats23: 0,
    pct23: 0,
    votes23: 0,
    note26: 'Recogido por el macrobarómetro del CIS con opciones en Canarias.'
  },
  {
    id: 'arames',
    abbr: 'Ara Més',
    name: 'Ara Més – Front Ampli',
    color: '#16A34A',
    scope: 'Illes Balears (1 circ.)',
    pollTier: 'borderline',
    pollRange26: '0–1 esc. (CIS nov. 2026)',
    seats23: 0,
    pct23: 0,
    votes23: 0,
    note26: 'Coalición territorial balear vinculada al espacio progresista.'
  },
  {
    id: 'cha',
    abbr: 'CHA',
    name: 'Chunta Aragonesista',
    color: '#EA580C',
    scope: 'Aragón (3 circ.)',
    pollTier: 'borderline',
    pollRange26: '0–1 esc. (disputa por Zaragoza)',
    seats23: 0,
    pct23: 0,
    votes23: 0,
    note26: 'En 2023 integrada en Sumar; disputa representación en Zaragoza.'
  },
  {
    id: 'ac',
    abbr: 'Aliança Cat.',
    name: 'Aliança Catalana',
    color: '#1E40AF',
    scope: 'Cataluña (4 circ.)',
    pollTier: 'borderline',
    pollRange26: '0 esc. en la mayoría de sondeos',
    seats23: 0,
    pct23: 0,
    votes23: 0,
    note26: 'Concurre en circunscripciones catalanas; por debajo del umbral provincial en medias.'
  },

  // --- TIER 3: EXTRAPARLAMENTARIOS Y OTRAS CANDIDATURAS DEL BOE ---
  {
    id: 'pacma',
    abbr: 'PACMA',
    name: 'Partido Animalista Con el Medio Ambiente',
    color: '#8DC63F',
    scope: 'Estatal (~30–37 circ.)',
    pollTier: 'extra',
    pollRange26: 'Sin representación prevista',
    seats23: 0,
    pct23: 0.69,
    votes23: 169237,
    note26: 'Fuerza extraparlamentaria más votada en el 23-J de 2023.'
  },
  {
    id: 'cup',
    abbr: 'CUP-PR',
    name: "Candidatura d'Unitat Popular",
    color: '#F59E0B',
    scope: 'Cataluña',
    pollTier: 'extra',
    pollRange26: 'Sin representación prevista',
    seats23: 0,
    pct23: 0.40,
    votes23: 98794,
    note26: 'Perdió sus escaños en 2023.'
  },
  {
    id: 'fo',
    abbr: 'Frente Obrero',
    name: 'Frente Obrero',
    color: '#991B1B',
    scope: 'Estatal (52 circ.)',
    pollTier: 'extra',
    pollRange26: 'Sin representación prevista',
    seats23: 0,
    pct23: 0.19,
    votes23: 46605,
    note26: 'Concurre en las 52 circunscripciones al Congreso en 2026.'
  },
  {
    id: 'nc',
    abbr: 'NC-bc',
    name: 'Nueva Canarias - Bloque Canarista',
    color: '#10B981',
    scope: 'Canarias (2 circ.)',
    pollTier: 'extra',
    pollRange26: 'Sin representación prevista',
    seats23: 0,
    pct23: 0.18,
    votes23: 45557,
    note26: 'Circunscripciones canarias.'
  },
  {
    id: 'te',
    abbr: 'Teruel Existe',
    name: 'Teruel Existe (EXISTE)',
    color: '#059669',
    scope: 'Teruel (1 circ.)',
    pollTier: 'extra',
    pollRange26: 'Sin representación asegurada',
    seats23: 0,
    pct23: 0.08,
    votes23: 20298,
    note26: '11.348 votos en Teruel en 2023 (sin escaño).'
  },
  {
    id: 'soria',
    abbr: 'Soria ¡Ya!',
    name: 'Soria ¡Ya!',
    color: '#D97706',
    scope: 'Soria (1 circ.)',
    pollTier: 'extra',
    pollRange26: 'Sin representación asegurada',
    seats23: 0,
    pct23: 0.03,
    votes23: 9626,
    note26: '19,21% en la provincia de Soria en 2023 (sin escaño).'
  },
  {
    id: 'eb',
    abbr: 'Escaños en Blanco',
    name: 'Escaños en Blanco',
    color: '#94A3B8',
    scope: 'Varias circ.',
    pollTier: 'extra',
    pollRange26: 'Sin representación prevista',
    seats23: 0,
    pct23: 0.03,
    votes23: 8287,
    note26: 'Deja vacíos los escaños que pudiera obtener.'
  },
  {
    id: 'pcte',
    abbr: 'PCTE',
    name: 'Partido Comunista de los Trabajadores de España',
    color: '#B91C1C',
    scope: 'Estatal (39 circ.)',
    pollTier: 'extra',
    pollRange26: 'Sin representación prevista',
    seats23: 0,
    pct23: 0.07,
    votes23: 17918,
    note26: 'Concurre en 39 circunscripciones en 2026.'
  },
  {
    id: 'rcero',
    abbr: 'Recortes Cero',
    name: 'Recortes Cero',
    color: '#0D9488',
    scope: 'Varias circ.',
    pollTier: 'extra',
    pollRange26: 'Sin representación prevista',
    seats23: 0,
    pct23: 0.09,
    votes23: 23254,
    note26: 'Candidatura extraparlamentaria.'
  },
  {
    id: 'upl',
    abbr: 'UPL',
    name: 'Unión del Pueblo Leonés',
    color: '#A855F7',
    scope: 'León / Castilla y León',
    pollTier: 'extra',
    pollRange26: 'Sin representación prevista',
    seats23: 0,
    pct23: 0.09,
    votes23: 23010,
    note26: 'Ámbito leonés.'
  },
  {
    id: 'pumj',
    abbr: 'PUM+J',
    name: 'Por Un Mundo Más Justo',
    color: '#38BDF8',
    scope: 'Varias circ.',
    pollTier: 'extra',
    pollRange26: 'Sin representación prevista',
    seats23: 0,
    pct23: 0.09,
    votes23: 22391,
    note26: 'Candidatura extraparlamentaria.'
  },
  {
    id: 'gbai',
    abbr: 'Geroa Bai',
    name: 'Geroa Bai',
    color: '#EF4444',
    scope: 'Navarra (1 circ.)',
    pollTier: 'extra',
    pollRange26: 'Sin representación prevista',
    seats23: 0,
    pct23: 0.04,
    votes23: 9839,
    note26: 'Circunscripción de Navarra.'
  },
  {
    id: 'cs',
    abbr: 'CS',
    name: 'Ciudadanos',
    color: '#FB923C',
    scope: 'Varias circ.',
    pollTier: 'extra',
    pollRange26: 'Sin representación prevista',
    seats23: 0,
    pct23: 0,
    votes23: 0,
    note26: 'No concurrió al 23-J de 2023.'
  },
  {
    id: 'volt',
    abbr: 'Volt',
    name: 'Volt España',
    color: '#6D28D9',
    scope: 'Varias circ.',
    pollTier: 'extra',
    pollRange26: 'Sin representación prevista',
    seats23: 0,
    pct23: 0,
    votes23: 0,
    note26: 'Partido paneuropeo.'
  },
  {
    id: 'jaen',
    abbr: 'JM+',
    name: 'Jaén Merece Más',
    color: '#0284C7',
    scope: 'Jaén (1 circ.)',
    pollTier: 'extra',
    pollRange26: 'Sin representación prevista',
    seats23: 0,
    pct23: 0,
    votes23: 0,
    note26: 'Ámbito provincial de Jaén.'
  },
  {
    id: 'fejons',
    abbr: 'FE de las JONS',
    name: 'Falange Española de las JONS',
    color: '#52525B',
    scope: 'Varias circ.',
    pollTier: 'extra',
    pollRange26: 'Sin representación prevista',
    seats23: 0,
    pct23: 0,
    votes23: 0,
    note26: 'Candidatura extraparlamentaria.'
  }
];

export function mergeCatalogWithCustom(customParties = []) {
  const map = new Map();
  PARTIES_CATALOG.forEach(p => map.set(p.id, p));
  (customParties || []).forEach(cp => {
    if (cp && cp.id && !map.has(cp.id)) {
      map.set(cp.id, {
        id: cp.id,
        abbr: cp.abbr || cp.name?.slice(0, 14) || cp.id,
        name: cp.name || cp.abbr || cp.id,
        color: cp.color || '#6366F1',
        scope: cp.scope || 'Candidatura BOE',
        pollTier: 'extra',
        pollRange26: 'Añadida manualmente',
        seats23: 0,
        pct23: 0,
        votes23: 0,
        note26: 'Candidatura añadida por un participante.',
        isCustom: true
      });
    }
  });
  return Array.from(map.values());
}

export function slugifyFriendKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || ('amigo-' + Date.now().toString(36));
}

export function slugifyGroupKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'general';
}

export function formatGroupLabel(groupKey) {
  const clean = slugifyGroupKey(groupKey);
  if (clean === 'general') return 'General';
  return clean
    .split('-')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

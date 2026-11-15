// Configuración general de La Porra 29-N (Elecciones Generales España 2026)
// Rellena SUPABASE_URL y SUPABASE_ANON_KEY (con tu Publishable key "sb_publishable_..." o anon key)
// tras crear tu proyecto gratuito en supabase.com (o pruébalo desde "Nube / Ajustes" en la web).

window.PORRA_CONFIG = {
  // Fecha de las elecciones: Domingo 29 de noviembre de 2026
  ELECTION_DATE_LABEL: 'Domingo 29 de noviembre de 2026',

  // Cierre automático de edición de predicciones: Sábado 28 de noviembre de 2026 a las 23:59:59 (hora peninsular CET, UTC+1)
  DEADLINE_ISO: '2026-11-28T23:59:59+01:00',
  DEADLINE_LABEL: 'Sábado 28 de noviembre de 2026 a las 23:59 (CET)',

  // Almacenamiento compartido gratuito con Supabase (dejar vacío para usar servidor local Python o modo local)
  SUPABASE_URL: 'https://fijefyeqcxxgzukazgku.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_zjKdqO8JMEu47_wolmbvFg_KbLGTXak',

  // Nombre de la porra mostrado en cabecera
  POOL_TITLE: 'Porra Elecciones España 2026',
  POOL_SUBTITLE: 'Congreso de los Diputados · 350 escaños'
};

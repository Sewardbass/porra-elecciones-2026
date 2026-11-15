-- =============================================================================
-- ESQUEMA SUPABASE PARA LA PORRA ELECCIONES ESPAÑA 2026 (29-N)
-- Ejecuta este script completo en: Supabase -> SQL Editor -> New Query -> Run
-- Es seguro re-ejecutarlo sobre una base ya creada (migra grupos y PIN).
-- IMPORTANTE: Si es tu primera instalación, cambia 'CAMBIA-ESTE-CODIGO' abajo
-- por tu código secreto de organizador antes de ejecutarlo.
-- =============================================================================

-- Función auxiliar para sumar los escaños de un objeto JSONB
create or replace function public.jsonb_sum_seats(p_seats jsonb)
returns integer
language sql
immutable
as $$
  select coalesce(sum((value)::integer), 0)
  from jsonb_each_text(coalesce(p_seats, '{}'::jsonb));
$$;

-- Validar que todos los escaños sean enteros >= 0
create or replace function public.jsonb_all_non_negative_seats(p_seats jsonb)
returns boolean
language sql
immutable
as $$
  select not exists (
    select 1
    from jsonb_each_text(coalesce(p_seats, '{}'::jsonb))
    where (value)::integer < 0 or (value)::integer > 350
  );
$$;

-- Normalizar identificador de grupo (?grupo=...)
create or replace function public.normalize_group_key(p_group_key text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      left(
        trim(both '-' from regexp_replace(lower(trim(coalesce(p_group_key, ''))), '[^a-z0-9-]+', '-', 'g')),
        40
      ),
      ''
    ),
    'general'
  );
$$;

-- Hash SHA-256 del PIN con sal de grupo y participante
create or replace function public.hash_prediction_pin(
  p_group_key text,
  p_friend_key text,
  p_pin text
)
returns text
language sql
immutable
as $$
  select encode(sha256((p_group_key || ':' || p_friend_key || ':' || p_pin)::bytea), 'hex');
$$;

-- 1. Tabla de predicciones por grupo (?grupo=amigos, ?grupo=familia, etc.)
create table if not exists public.predictions (
  group_key text not null default 'general',
  friend_key text not null,
  friend_name text not null check (char_length(trim(friend_name)) between 1 and 40),
  seats jsonb not null default '{}'::jsonb,
  pct jsonb not null default '{}'::jsonb,
  turnout numeric(5,2),
  comment text default '',
  custom_parties jsonb not null default '[]'::jsonb,
  has_pin boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (group_key, friend_key),
  constraint seats_valid_range check (public.jsonb_all_non_negative_seats(seats)),
  constraint seats_sum_350 check (public.jsonb_sum_seats(seats) = 350)
);

-- Migración idempotente por si la tabla ya existía sin group_key o sin has_pin
alter table public.predictions add column if not exists group_key text not null default 'general';
alter table public.predictions add column if not exists has_pin boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'predictions'
      and c.contype = 'p'
      and pg_get_constraintdef(c.oid) like '%(group_key, friend_key)%'
  ) then
    alter table public.predictions drop constraint if exists predictions_pkey;
    alter table public.predictions add primary key (group_key, friend_key);
  end if;
end $$;

create index if not exists predictions_group_updated_idx
  on public.predictions (group_key, updated_at desc);

-- 2. Tabla privada de PINs de 4 dígitos (inaccesible desde el navegador)
create table if not exists public.prediction_pins (
  group_key text not null,
  friend_key text not null,
  pin_hash text not null,
  primary key (group_key, friend_key)
);

-- Sincronizar bandera has_pin en filas preexistentes
update public.predictions p
set has_pin = exists (
  select 1 from public.prediction_pins k
  where k.group_key = p.group_key and k.friend_key = p.friend_key
)
where p.has_pin is distinct from exists (
  select 1 from public.prediction_pins k
  where k.group_key = p.group_key and k.friend_key = p.friend_key
);

-- 3. Tabla global del escrutinio oficial tras el 29-N (aplica a todos los grupos)
create table if not exists public.official_results (
  id integer primary key default 1 check (id = 1),
  seats jsonb not null default '{}'::jsonb,
  pct jsonb not null default '{}'::jsonb,
  turnout numeric(5,2),
  published_at timestamptz not null default now(),
  constraint official_seats_valid_range check (public.jsonb_all_non_negative_seats(seats)),
  constraint official_seats_sum_350 check (public.jsonb_sum_seats(seats) = 350)
);

-- 4. Configuración privada del organizador (inaccesible desde el navegador)
create table if not exists public.pool_admin (
  id integer primary key default 1 check (id = 1),
  admin_code text not null
);

-- CAMBIA 'CAMBIA-ESTE-CODIGO' POR TU CLAVE DE ORGANIZADOR ANTES DE EJECUTAR (si ya existe, se conserva):
insert into public.pool_admin (id, admin_code)
values (1, 'CAMBIA-ESTE-CODIGO')
on conflict (id) do nothing;

-- Habilitar Row Level Security (RLS)
alter table public.predictions enable row level security;
alter table public.prediction_pins enable row level security;
alter table public.official_results enable row level security;
alter table public.pool_admin enable row level security;

-- Limpiar políticas previas (las escrituras pasan obligatoriamente por RPC verificando PIN)
drop policy if exists "Lectura publica de predicciones" on public.predictions;
drop policy if exists "Insertar antes del cierre 28N 2359" on public.predictions;
drop policy if exists "Actualizar antes del cierre 28N 2359" on public.predictions;
drop policy if exists "Eliminar antes del cierre 28N 2359" on public.predictions;
drop policy if exists "Lectura publica de resultados" on public.official_results;

-- Todos los miembros del enlace pueden leer predicciones y resultados oficiales
create policy "Lectura publica de predicciones"
  on public.predictions for select
  to anon, authenticated
  using (true);

create policy "Lectura publica de resultados"
  on public.official_results for select
  to anon, authenticated
  using (true);

-- RPC para guardar o actualizar predicción protegiéndola con PIN de 4 dígitos y cierre 28/11 23:59 CET
create or replace function public.save_prediction(
  p_group_key text,
  p_friend_key text,
  p_friend_name text,
  p_pin text,
  p_seats jsonb,
  p_pct jsonb,
  p_turnout numeric,
  p_comment text,
  p_custom_parties jsonb
)
returns public.predictions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group text;
  v_key text;
  v_name text;
  v_pin text;
  v_pin_hash text;
  v_existing_pin_hash text;
  v_row public.predictions;
begin
  if now() > '2026-11-28 23:59:59+01'::timestamptz then
    raise exception 'El plazo para guardar o modificar la porra cerró el sábado 28 de noviembre a las 23:59.';
  end if;

  v_group := public.normalize_group_key(p_group_key);
  v_key := trim(coalesce(p_friend_key, ''));
  v_name := trim(coalesce(p_friend_name, ''));
  v_pin := trim(coalesce(p_pin, ''));

  if v_key = '' or char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'Nombre o identificador de participante inválido.';
  end if;

  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe tener exactamente 4 dígitos numéricos.';
  end if;

  if not public.jsonb_all_non_negative_seats(p_seats) or public.jsonb_sum_seats(p_seats) <> 350 then
    raise exception 'Los escaños deben sumar exactamente 350.';
  end if;

  v_pin_hash := public.hash_prediction_pin(v_group, v_key, v_pin);

  select pin_hash into v_existing_pin_hash
  from public.prediction_pins
  where group_key = v_group and friend_key = v_key;

  if v_existing_pin_hash is not null and v_existing_pin_hash <> v_pin_hash then
    raise exception 'PIN incorrecto. Solo quien creó esta porra puede modificarla.';
  end if;

  insert into public.predictions (
    group_key, friend_key, friend_name, seats, pct, turnout, comment, custom_parties, has_pin, updated_at
  )
  values (
    v_group,
    v_key,
    v_name,
    p_seats,
    coalesce(p_pct, '{}'::jsonb),
    p_turnout,
    left(coalesce(p_comment, ''), 200),
    coalesce(p_custom_parties, '[]'::jsonb),
    true,
    now()
  )
  on conflict (group_key, friend_key) do update
  set friend_name = excluded.friend_name,
      seats = excluded.seats,
      pct = excluded.pct,
      turnout = excluded.turnout,
      comment = excluded.comment,
      custom_parties = excluded.custom_parties,
      has_pin = true,
      updated_at = now()
  returning * into v_row;

  insert into public.prediction_pins (group_key, friend_key, pin_hash)
  values (v_group, v_key, v_pin_hash)
  on conflict (group_key, friend_key) do update
  set pin_hash = excluded.pin_hash;

  return v_row;
end;
$$;

-- RPC para borrar una predicción verificando el PIN de 4 dígitos y el plazo
create or replace function public.delete_prediction(
  p_group_key text,
  p_friend_key text,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group text;
  v_key text;
  v_pin text;
  v_pin_hash text;
  v_existing_pin_hash text;
begin
  if now() > '2026-11-28 23:59:59+01'::timestamptz then
    raise exception 'La porra ya está cerrada y no se pueden eliminar predicciones.';
  end if;

  v_group := public.normalize_group_key(p_group_key);
  v_key := trim(coalesce(p_friend_key, ''));
  v_pin := trim(coalesce(p_pin, ''));

  select pin_hash into v_existing_pin_hash
  from public.prediction_pins
  where group_key = v_group and friend_key = v_key;

  if v_existing_pin_hash is not null then
    if v_pin !~ '^[0-9]{4}$' then
      raise exception 'Introduce el PIN de 4 dígitos para eliminar esta porra.';
    end if;
    v_pin_hash := public.hash_prediction_pin(v_group, v_key, v_pin);
    if v_existing_pin_hash <> v_pin_hash then
      raise exception 'PIN incorrecto. No se puede eliminar esta porra.';
    end if;
  end if;

  delete from public.predictions where group_key = v_group and friend_key = v_key;
  delete from public.prediction_pins where group_key = v_group and friend_key = v_key;
end;
$$;

-- RPC protegida por el código del organizador para publicar los resultados del 29-N
create or replace function public.save_official_results(
  p_admin_code text,
  p_seats jsonb,
  p_pct jsonb,
  p_turnout numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text;
begin
  select admin_code into v_expected from public.pool_admin where id = 1;
  if v_expected is null or trim(coalesce(p_admin_code, '')) <> v_expected then
    raise exception 'Código de organizador incorrecto.';
  end if;

  if public.jsonb_sum_seats(p_seats) <> 350 then
    raise exception 'Los escaños oficiales deben sumar exactamente 350.';
  end if;

  insert into public.official_results (id, seats, pct, turnout, published_at)
  values (1, p_seats, coalesce(p_pct, '{}'::jsonb), p_turnout, now())
  on conflict (id) do update
  set seats = excluded.seats,
      pct = excluded.pct,
      turnout = excluded.turnout,
      published_at = now();
end;
$$;

create or replace function public.clear_official_results(p_admin_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text;
begin
  select admin_code into v_expected from public.pool_admin where id = 1;
  if v_expected is null or trim(coalesce(p_admin_code, '')) <> v_expected then
    raise exception 'Código de organizador incorrecto.';
  end if;

  delete from public.official_results where id = 1;
end;
$$;

grant execute on function public.save_prediction(text, text, text, text, jsonb, jsonb, numeric, text, jsonb) to anon, authenticated;
grant execute on function public.delete_prediction(text, text, text) to anon, authenticated;
grant execute on function public.save_official_results(text, jsonb, jsonb, numeric) to anon, authenticated;
grant execute on function public.clear_official_results(text) to anon, authenticated;

notify pgrst, 'reload schema';

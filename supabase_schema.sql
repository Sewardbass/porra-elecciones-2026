-- =============================================================================
-- ESQUEMA SUPABASE PARA LA PORRA ELECCIONES ESPAÑA 2026 (29-N)
-- Ejecuta este script completo en: Supabase -> SQL Editor -> New Query -> Run
-- IMPORTANTE: Cambia 'CAMBIA-ESTE-CODIGO' abajo por tu código secreto de
-- organizador antes de ejecutarlo (sirve para cargar el escrutinio final).
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

-- 1. Tabla de predicciones de los amigos (sin PIN requerido)
create table if not exists public.predictions (
  friend_key text primary key,
  friend_name text not null check (char_length(trim(friend_name)) between 1 and 40),
  seats jsonb not null default '{}'::jsonb,
  pct jsonb not null default '{}'::jsonb,
  turnout numeric(5,2),
  comment text default '',
  custom_parties jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint seats_valid_range check (public.jsonb_all_non_negative_seats(seats)),
  constraint seats_sum_350 check (public.jsonb_sum_seats(seats) = 350)
);

-- 2. Tabla del escrutinio oficial tras el 29-N
create table if not exists public.official_results (
  id integer primary key default 1 check (id = 1),
  seats jsonb not null default '{}'::jsonb,
  pct jsonb not null default '{}'::jsonb,
  turnout numeric(5,2),
  published_at timestamptz not null default now(),
  constraint official_seats_valid_range check (public.jsonb_all_non_negative_seats(seats)),
  constraint official_seats_sum_350 check (public.jsonb_sum_seats(seats) = 350)
);

-- 3. Configuración privada del organizador (inaccesible desde el navegador)
create table if not exists public.pool_admin (
  id integer primary key default 1 check (id = 1),
  admin_code text not null
);

-- CAMBIA 'CAMBIA-ESTE-CODIGO' POR TU CLAVE DE ORGANIZADOR ANTES DE EJECUTAR:
insert into public.pool_admin (id, admin_code)
values (1, 'CAMBIA-ESTE-CODIGO')
on conflict (id) do nothing;

-- Habilitar Row Level Security (RLS)
alter table public.predictions enable row level security;
alter table public.official_results enable row level security;
alter table public.pool_admin enable row level security;

-- Limpiar políticas previas si se re-ejecuta el script
drop policy if exists "Lectura publica de predicciones" on public.predictions;
drop policy if exists "Insertar antes del cierre 28N 2359" on public.predictions;
drop policy if exists "Actualizar antes del cierre 28N 2359" on public.predictions;
drop policy if exists "Eliminar antes del cierre 28N 2359" on public.predictions;
drop policy if exists "Lectura publica de resultados" on public.official_results;

-- Todos pueden ver las predicciones de todos
create policy "Lectura publica de predicciones"
  on public.predictions for select
  to anon, authenticated
  using (true);

-- Cualquier amigo puede crear, modificar o borrar hasta el sábado 28/11/2026 23:59:59 CET (UTC+1)
create policy "Insertar antes del cierre 28N 2359"
  on public.predictions for insert
  to anon, authenticated
  with check (now() <= '2026-11-28 23:59:59+01'::timestamptz);

create policy "Actualizar antes del cierre 28N 2359"
  on public.predictions for update
  to anon, authenticated
  using (now() <= '2026-11-28 23:59:59+01'::timestamptz)
  with check (now() <= '2026-11-28 23:59:59+01'::timestamptz);

create policy "Eliminar antes del cierre 28N 2359"
  on public.predictions for delete
  to anon, authenticated
  using (now() <= '2026-11-28 23:59:59+01'::timestamptz);

-- Todos pueden leer los resultados oficiales
create policy "Lectura publica de resultados"
  on public.official_results for select
  to anon, authenticated
  using (true);

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

grant execute on function public.save_official_results(text, jsonb, jsonb, numeric) to anon, authenticated;
grant execute on function public.clear_official_results(text) to anon, authenticated;

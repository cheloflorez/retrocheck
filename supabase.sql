-- Pegar y ejecutar en Supabase: SQL Editor > New query > Run

create table if not exists public.checklist (
  id int primary key,
  data jsonb not null default '[]'::jsonb,      -- secciones y cards
  progress jsonb not null default '{}'::jsonb,  -- tildes
  updated_at timestamptz not null default now()
);

-- Fila unica que usa la web
insert into public.checklist (id) values (1) on conflict (id) do nothing;

-- Acceso abierto (sin login): cualquiera con la URL puede leer y editar
alter table public.checklist enable row level security;

create policy "leer" on public.checklist for select to anon using (true);
create policy "insertar" on public.checklist for insert to anon with check (true);
create policy "editar" on public.checklist for update to anon using (true) with check (true);

-- Cambios en vivo para todos
alter publication supabase_realtime add table public.checklist;

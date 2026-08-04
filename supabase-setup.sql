-- Ejecuta esto en Supabase: Project > SQL Editor > New query > Run

create table cuaderno (
  id text primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into cuaderno (id, data) values ('main', '[]'::jsonb);

alter table cuaderno enable row level security;

-- Política simple: cualquiera con la anon key puede leer/escribir.
-- Suficiente para uso interno entre personas de confianza.
create policy "acceso app" on cuaderno
  for all
  using (true)
  with check (true);

-- Activa la sincronización en tiempo real entre dispositivos
alter publication supabase_realtime add table cuaderno;

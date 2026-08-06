-- ============================================================================
-- DIPREM CRM — Migración 0023 (Neon): ecosistema del proyecto (Fase B)
-- proyecto_empresas: qué empresas participan en cada proyecto del mercado y
-- con qué rol (mandante / EPC / contratista / proveedor).
--   · El MANDANTE se deriva solo del cuenta_id del proyecto — para lo ya
--     cargado (backfill al final) y para cada import futuro (trigger).
--   · EPC / contratistas / proveedores se vinculan a mano desde la ficha del
--     proyecto: ese conocimiento hoy vive en la cabeza del equipo y no se
--     guarda en ninguna parte. fuente='sugerido_ia' queda reservado para el
--     motor de IA (Fase C), siempre confirmado por un humano.
-- Sin superficie nueva de PII: la ficha muestra nombres/cargos que la RLS de
-- contactos ya permite a los roles operativos; teléfonos y correos siguen
-- saliendo ÚNICAMENTE por revelar_contactos()/revelar_contacto() con su cuota.
-- ============================================================================

create table public.proyecto_empresas (
  id          uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos_mercado(id) on delete cascade,
  cuenta_id   uuid not null references cuentas(id) on delete cascade,
  rol_vinculo text not null
    check (rol_vinculo in ('mandante', 'epc', 'contratista', 'proveedor')),
  fuente      text not null default 'manual'
    check (fuente in ('derivado', 'manual', 'sugerido_ia')),
  creado_por  uuid references usuarios(id),
  creado_en   timestamptz not null default now(),
  unique (proyecto_id, cuenta_id, rol_vinculo)
);

create index proyecto_empresas_proyecto_idx on proyecto_empresas (proyecto_id);
create index proyecto_empresas_cuenta_idx   on proyecto_empresas (cuenta_id);

alter table proyecto_empresas enable row level security;

-- Ver vínculos = poder ver el Radar: hereda la política de proyectos_mercado
-- (admin, gerente, revisor) a través del exists.
create policy proyecto_empresas_select on proyecto_empresas
  for select to authenticated
  using (exists (select 1 from proyectos_mercado p where p.id = proyecto_id));

-- Vincular y desvincular: solo gerente y admin (el revisor consulta, no toca;
-- el ejecutivo no ve el mercado).
create policy proyecto_empresas_insert on proyecto_empresas
  for insert to authenticated
  with check (public.es_admin() or public.rol_actual() = 'gerente');

create policy proyecto_empresas_delete on proyecto_empresas
  for delete to authenticated
  using (public.es_admin() or public.rol_actual() = 'gerente');

grant select, insert, delete on proyecto_empresas to authenticated;

-- creado_por lo sella el servidor (mismo patrón anti-suplantación que los
-- contactos en 0018): la app no puede atribuir el vínculo a otra persona.
create function public.sellar_creado_por_vinculo()
returns trigger language plpgsql as $$
begin
  new.creado_por := coalesce(public.usuario_actual(), new.creado_por);
  return new;
end $$;

create trigger proyecto_empresas_sello
  before insert on proyecto_empresas
  for each row execute function public.sellar_creado_por_vinculo();

-- Mandante derivado automáticamente al crear un proyecto (o al vincularle
-- cuenta después). SECURITY DEFINER: corre como dueño para que el insert
-- derivado no dependa del rol de quien importa.
create function public.derivar_mandante_proyecto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cuenta_id is not null then
    insert into proyecto_empresas (proyecto_id, cuenta_id, rol_vinculo, fuente)
    values (new.id, new.cuenta_id, 'mandante', 'derivado')
    on conflict (proyecto_id, cuenta_id, rol_vinculo) do nothing;
  end if;
  return new;
end $$;

create trigger proyectos_mercado_mandante
  after insert or update of cuenta_id on proyectos_mercado
  for each row execute function public.derivar_mandante_proyecto();

-- ---------------------------------------------------------------------------
-- Vista dedicada por proyecto (Opción 1 aprobada): nombre + cargo + bucket,
-- SIN PII, acotada al proyecto que se está mirando. SECURITY DEFINER porque
-- el gerente no ve por tabla las cuentas del pool (RLS por propietario) y el
-- ecosistema del proyecto vive casi entero en el pool. No es un listado
-- general: cada llamada entrega un solo proyecto, y solo a gerencia.
-- ---------------------------------------------------------------------------

-- Empresas del ecosistema con conteos por bucket (para las tarjetas)
create function public.empresas_del_proyecto(p_proyecto_id uuid)
returns table (
  vinculo_id   uuid,
  cuenta_id    uuid,
  razon_social text,
  rol_mercado  text,
  rol_vinculo  text,
  fuente       text,
  n_decisores  bigint,
  n_gestores   bigint,
  n_puertas    bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.es_admin() or public.rol_actual() = 'gerente' or public.es_revisor()) then
    raise exception 'Solo gerencia puede ver el ecosistema del proyecto';
  end if;
  return query
  select pe.id, c.id, c.razon_social, c.rol_mercado, pe.rol_vinculo, pe.fuente,
         count(ct.id) filter (where public.bucket_rol(ct.rol) = 'decisor_tecnico'),
         count(ct.id) filter (where public.bucket_rol(ct.rol) = 'gestor_compra'),
         count(ct.id) filter (where public.bucket_rol(ct.rol) = 'puerta_entrada')
    from proyecto_empresas pe
    join cuentas c on c.id = pe.cuenta_id
    left join contactos ct on ct.cuenta_id = c.id and ct.opt_out_en is null
   where pe.proyecto_id = p_proyecto_id
   group by pe.id, c.id, c.razon_social, c.rol_mercado, pe.rol_vinculo, pe.fuente
   order by case pe.rol_vinculo
              when 'mandante' then 0 when 'epc' then 1
              when 'contratista' then 2 else 3
            end, c.razon_social;
end $$;

-- Contactos clave del ecosistema (filtrables por bucket en la UI): sin
-- teléfono, correo ni LinkedIn — esos siguen solo detrás de revelar_* y cuota.
create function public.contactos_del_proyecto(p_proyecto_id uuid)
returns table (
  contacto_id  uuid,
  cuenta_id    uuid,
  empresa      text,
  rol_vinculo  text,
  nombre       text,
  cargo        text,
  rol          text,
  es_principal boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.es_admin() or public.rol_actual() = 'gerente' or public.es_revisor()) then
    raise exception 'Solo gerencia puede ver el ecosistema del proyecto';
  end if;
  return query
  with vinculos as (
    -- una empresa vinculada dos veces (ej: mandante y contratista) sale una vez
    select distinct on (pe.cuenta_id) pe.cuenta_id as v_cuenta, pe.rol_vinculo as v_rol
      from proyecto_empresas pe
     where pe.proyecto_id = p_proyecto_id
     order by pe.cuenta_id,
              case pe.rol_vinculo
                when 'mandante' then 0 when 'epc' then 1
                when 'contratista' then 2 else 3
              end
  )
  select ct.id, c.id, c.razon_social, v.v_rol, ct.nombre, ct.cargo,
         ct.rol::text, ct.es_principal
    from vinculos v
    join cuentas c on c.id = v.v_cuenta
    join contactos ct on ct.cuenta_id = c.id and ct.opt_out_en is null
   order by (v.v_rol = 'mandante') desc, c.razon_social,
            ct.es_principal desc, ct.nombre;
end $$;

grant execute on function public.empresas_del_proyecto(uuid)  to authenticated;
grant execute on function public.contactos_del_proyecto(uuid) to authenticated;

-- Backfill: derivar los mandantes de todo lo ya cargado.
insert into proyecto_empresas (proyecto_id, cuenta_id, rol_vinculo, fuente)
select id, cuenta_id, 'mandante', 'derivado'
  from proyectos_mercado
 where cuenta_id is not null
on conflict (proyecto_id, cuenta_id, rol_vinculo) do nothing;

select count(*)::int as mandantes_derivados
  from proyecto_empresas
 where rol_vinculo = 'mandante' and fuente = 'derivado';

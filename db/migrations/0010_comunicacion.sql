-- ============================================================================
-- DIPREM CRM — Migración 0010: Comunicación interna
--   Notas internas sobre leads, oportunidades y cuentas (tabla `notas`, que ya
--   existe con RLS heredada del registro padre) + notificación automática al
--   ejecutivo dueño del registro cuando comenta otra persona.
-- ============================================================================

-- SECURITY DEFINER: el autor de la nota (dueño/gerente) inserta una
-- notificación para OTRO usuario (el ejecutivo del registro).
create function public.notificar_nota_interna()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_propietario uuid;
  v_titulo text;
  v_autor text;
  v_entidad_ruta text := new.entidad;
  v_entidad_id uuid := new.entidad_id;
begin
  if new.entidad = 'lead' then
    select propietario_id, nombre into v_propietario, v_titulo
      from leads where id = new.entidad_id;
  elsif new.entidad = 'oportunidad' then
    -- La notificación enlaza a la cuenta (ahí vive el hilo de la oportunidad)
    select o.propietario_id, o.nombre, o.cuenta_id
      into v_propietario, v_titulo, v_entidad_id
      from oportunidades o where o.id = new.entidad_id;
    v_entidad_ruta := 'cuenta';
  elsif new.entidad = 'cuenta' then
    select propietario_id, razon_social into v_propietario, v_titulo
      from cuentas where id = new.entidad_id;
  else
    return new; -- contactos u otras entidades: sin notificación
  end if;

  -- Sin destinatario o el autor comenta en lo suyo → nada que avisar
  if v_propietario is null or v_propietario = new.autor_id then
    return new;
  end if;

  select nombre into v_autor from usuarios where id = new.autor_id;

  insert into notificaciones (usuario_id, tipo, titulo, mensaje, entidad, entidad_id)
  values (
    v_propietario,
    'nota_interna',
    'Nueva nota interna',
    format('%s comentó en "%s": %s',
           coalesce(v_autor, 'Alguien'), v_titulo, left(new.contenido, 140)),
    v_entidad_ruta,
    v_entidad_id
  );
  return new;
end $$;

create trigger notas_notificar
  after insert on notas
  for each row execute function public.notificar_nota_interna();

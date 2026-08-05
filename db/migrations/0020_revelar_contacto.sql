-- ============================================================================
-- DIPREM CRM — Migración 0020 (Neon): revelado por CONTACTO individual
-- El botón "Mostrar" de cada tarjeta revela un solo contacto: consume 1 del
-- tope diario (no toda la cuenta, como revelar_contactos) y registra igual
-- en lecturas_sensibles. Mismas reglas: cartera propia/equipo/admin, lectura
-- jamás, opt-out sin PII, re-ver lo ya revelado es libre.
-- Si el tope diario está copado, lanza excepción con mensaje claro (es una
-- acción explícita del usuario: mejor decirlo que omitir en silencio).
-- ============================================================================
create function public.revelar_contacto(p_contacto_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_yo     uuid := public.usuario_actual();
  v_ct     contactos%rowtype;
  v_dueno  uuid;
  v_limite int;
  v_usadas int;
  v_nuevo  boolean;
begin
  if v_yo is null then
    raise exception 'Sesión sin perfil DIPREM';
  end if;
  if public.es_lectura() then
    raise exception 'El rol de solo lectura no accede a datos de contacto';
  end if;

  select ct.* into v_ct from contactos ct where ct.id = p_contacto_id;
  if not found then
    raise exception 'El contacto no existe';
  end if;
  select c.propietario_id into v_dueno from cuentas c where c.id = v_ct.cuenta_id;
  if not (v_dueno = v_yo or public.es_admin() or public.gerencia_a(v_dueno)) then
    raise exception 'La cuenta no está en tu cartera: reclámala primero';
  end if;

  -- Opt-out (Ley 21.719): jamás PII, sin consumo de cupo
  if v_ct.opt_out_en is not null then
    return jsonb_build_object(
      'id', v_ct.id, 'nombre', v_ct.nombre, 'cargo', v_ct.cargo,
      'rol', v_ct.rol, 'es_principal', v_ct.es_principal,
      'canal_preferido', v_ct.canal_preferido,
      'opt_out', true, 'omitido', false,
      'telefono', null, 'email', null, 'linkedin', null);
  end if;

  -- serializa por usuario: el cupo no se sobregira con clics paralelos
  perform pg_advisory_xact_lock(hashtext('revelaciones:' || v_yo::text));

  v_nuevo := not exists (select 1 from lecturas_sensibles ls
                          where ls.usuario_id = v_yo
                            and ls.contacto_id = p_contacto_id);
  select max_revelaciones_dia into v_limite
    from limites_rol where rol = public.rol_actual();
  select count(*) into v_usadas from lecturas_sensibles
   where usuario_id = v_yo and creado_en >= date_trunc('day', now());

  if v_nuevo then
    if v_limite is not null and v_usadas >= v_limite then
      raise exception 'Límite diario de revelaciones alcanzado (% de %): este contacto queda oculto hasta mañana',
        v_usadas, v_limite;
    end if;
    insert into lecturas_sensibles (usuario_id, contacto_id, cuenta_id)
    values (v_yo, p_contacto_id, v_ct.cuenta_id);
    v_usadas := v_usadas + 1;
  end if;

  return jsonb_build_object(
    'id', v_ct.id, 'nombre', v_ct.nombre, 'cargo', v_ct.cargo,
    'rol', v_ct.rol, 'es_principal', v_ct.es_principal,
    'canal_preferido', v_ct.canal_preferido,
    'opt_out', false, 'omitido', false,
    'telefono', v_ct.telefono, 'email', v_ct.email, 'linkedin', v_ct.linkedin,
    'usadas_hoy', v_usadas, 'limite_diario', v_limite);
end $$;

grant execute on function public.revelar_contacto(uuid) to authenticated;

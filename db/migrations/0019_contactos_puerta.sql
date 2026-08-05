-- ============================================================================
-- DIPREM CRM — Migración 0019 (Neon): contactos puerta con peso de decisión
-- Insumo de la acción de derivación (Radar/cuenta): cuando una cuenta tiene
-- puerta de entrada pero NO decisor técnico, la tarea concreta es "pedir
-- derivación" al mejor contacto puerta — ordenado por el peso_decision de la
-- regla que lo clasificó (gerente general 60 > comercial 40 > asistente 30).
--
-- SECURITY INVOKER a propósito: hereda la RLS de contactos (el ejecutivo ve
-- los de su cartera, el gerente su equipo, lectura nada) y expone SOLO
-- columnas no-PII (nombre/cargo); el teléfono sigue saliendo únicamente por
-- revelar_contactos() con su cuota.
-- ============================================================================
create view public.v_contactos_puerta
with (security_invoker = true) as
select ct.cuenta_id,
       ct.id  as contacto_id,
       ct.nombre,
       ct.cargo,
       ct.es_principal,
       coalesce(r.peso_decision, 0) as peso_decision
from contactos ct
left join lateral (
  select r.peso_decision
    from reglas_rol_contacto r
   where r.activo
     and public.sin_tildes(lower(ct.cargo)) like
         '%' || public.sin_tildes(lower(r.patron)) || '%'
   order by r.orden, r.creado_en
   limit 1
) r on true
where public.bucket_rol(ct.rol) = 'puerta_entrada'
  and ct.opt_out_en is null;

grant select on v_contactos_puerta to authenticated;

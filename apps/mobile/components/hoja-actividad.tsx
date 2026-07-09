import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_TIPO_ACTIVIDAD,
  ICONOS_TIPO_ACTIVIDAD,
  es,
  esquemaActividad,
  type TipoActividad,
} from "@diprem/core";
import { crearActividad, listarCuentas, listarOportunidades } from "@diprem/api";
import { supabase } from "@/lib/supabase";
import { useSesion } from "@/lib/sesion";
import {
  BotonPrimario,
  CampoSeleccionLista,
  CampoTexto,
  HojaFormulario,
} from "@/components/formularios";

/** Chips de agendamiento sin fricción (sin selector de fecha nativo). */
function opcionesHorario(): { etiqueta: string; fecha: Date }[] {
  const opciones: { etiqueta: string; fecha: Date }[] = [];
  const ahora = new Date();
  for (const hora of [9, 11, 14, 16, 18]) {
    const f = new Date();
    f.setHours(hora, 0, 0, 0);
    if (f > ahora) opciones.push({ etiqueta: `${es.miDia.hoy} ${hora}:00`, fecha: f });
  }
  for (const hora of [9, 14]) {
    const f = new Date();
    f.setDate(f.getDate() + 1);
    f.setHours(hora, 0, 0, 0);
    opciones.push({ etiqueta: `${es.miDia.manana} ${hora}:00`, fecha: f });
  }
  return opciones;
}

export function HojaActividad({
  visible,
  tipo,
  registroRapido,
  oportunidadFija,
  onCerrar,
}: {
  visible: boolean;
  tipo: TipoActividad;
  /** true = gestión ya realizada (se guarda completada, 2 toques) */
  registroRapido: boolean;
  oportunidadFija?: { id: string; nombre: string; cuenta_id: string } | null;
  onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const { perfil } = useSesion();

  const [asunto, setAsunto] = useState("");
  const [cuentaSel, setCuentaSel] = useState<{ id: string; nombre: string } | null>(null);
  const [oportunidadSel, setOportunidadSel] = useState<{ id: string; nombre: string } | null>(null);
  const [horario, setHorario] = useState<Date | null>(null);
  const [resultado, setResultado] = useState("");
  const [proximaAccion, setProximaAccion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: cuentas } = useQuery({
    queryKey: ["cuentas", ""],
    queryFn: () => listarCuentas(supabase),
    enabled: visible && !oportunidadFija,
  });
  const { data: oportunidades } = useQuery({
    queryKey: ["oportunidades", {}],
    queryFn: () => listarOportunidades(supabase),
    enabled: visible && !oportunidadFija,
  });

  const oportunidadesDeCuenta = (oportunidades ?? []).filter(
    (o) => !cuentaSel || o.cuenta_id === cuentaSel.id,
  );

  const guardar = useMutation({
    mutationFn: async () => {
      if (!perfil) throw new Error(es.comunes.errorGenerico);
      const datos = esquemaActividad.parse({
        tipo,
        asunto:
          asunto ||
          `${ETIQUETAS_TIPO_ACTIVIDAD[tipo]}${
            oportunidadFija ? ` — ${oportunidadFija.nombre}` : cuentaSel ? ` — ${cuentaSel.nombre}` : ""
          }`,
        cuenta_id: oportunidadFija?.cuenta_id ?? cuentaSel?.id ?? null,
        oportunidad_id: oportunidadFija?.id ?? oportunidadSel?.id ?? null,
        fecha_programada: registroRapido
          ? new Date().toISOString()
          : (horario ?? new Date()).toISOString(),
        proxima_accion: proximaAccion || null,
      });
      await crearActividad(supabase, {
        ...datos,
        propietario_id: perfil.id,
        ...(registroRapido
          ? {
              estado: "completada" as const,
              completada_en: new Date().toISOString(),
              resultado: resultado || null,
            }
          : {}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agenda"] });
      void queryClient.invalidateQueries({ queryKey: ["actividades"] });
      void queryClient.invalidateQueries({ queryKey: ["seguimientos"] });
      void queryClient.invalidateQueries({ queryKey: ["oportunidades"] });
      setAsunto("");
      setCuentaSel(null);
      setOportunidadSel(null);
      setHorario(null);
      setResultado("");
      setProximaAccion("");
      setError(null);
      onCerrar();
    },
    onError: (e: Error) => setError(e.message),
  });

  const titulo = `${ICONOS_TIPO_ACTIVIDAD[tipo]} ${
    registroRapido ? "Registrar" : "Agendar"
  } ${ETIQUETAS_TIPO_ACTIVIDAD[tipo].toLowerCase()}`;

  return (
    <HojaFormulario visible={visible} titulo={titulo} onCerrar={onCerrar}>
      {oportunidadFija ? (
        <View className="mb-3 rounded-lg bg-blue-50 p-3">
          <Text className="text-sm font-medium text-diprem">
            {oportunidadFija.nombre}
          </Text>
        </View>
      ) : (
        <>
          <CampoSeleccionLista
            etiqueta={es.crm.cuenta}
            seleccionado={cuentaSel}
            opciones={(cuentas ?? []).map((c) => ({ id: c.id, nombre: c.razon_social }))}
            onSeleccionar={(op) => {
              setCuentaSel(op);
              setOportunidadSel(null);
            }}
            opcional
          />
          {cuentaSel && oportunidadesDeCuenta.length > 0 && (
            <CampoSeleccionLista
              etiqueta={es.crm.oportunidades}
              seleccionado={oportunidadSel}
              opciones={oportunidadesDeCuenta.map((o) => ({ id: o.id, nombre: o.nombre }))}
              onSeleccionar={setOportunidadSel}
              opcional
            />
          )}
        </>
      )}

      <CampoTexto
        etiqueta={es.actividades.asunto}
        valor={asunto}
        onCambio={setAsunto}
        opcional
        placeholder={`${ETIQUETAS_TIPO_ACTIVIDAD[tipo]}…`}
      />

      {registroRapido ? (
        <>
          <CampoTexto
            etiqueta={es.actividades.resultado}
            valor={resultado}
            onCambio={setResultado}
            opcional
            placeholder="¿Qué pasó? ¿Qué se acordó?"
          />
          <CampoTexto
            etiqueta={es.actividades.proximaAccion}
            valor={proximaAccion}
            onCambio={setProximaAccion}
            opcional
            placeholder="Ej: enviar propuesta el lunes"
          />
        </>
      ) : (
        <View className="mb-3">
          <Text className="mb-1 text-sm font-medium text-slate-700">
            {es.actividades.fechaProgramada}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {opcionesHorario().map((op) => (
              <Pressable
                key={op.etiqueta}
                onPress={() => setHorario(op.fecha)}
                className={`rounded-full px-3 py-1.5 ${
                  horario?.getTime() === op.fecha.getTime() ? "bg-diprem" : "bg-slate-200"
                }`}
              >
                <Text
                  className={`text-sm ${
                    horario?.getTime() === op.fecha.getTime()
                      ? "text-white"
                      : "text-slate-700"
                  }`}
                >
                  {op.etiqueta}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {error && <Text className="mb-2 text-sm text-red-600">{error}</Text>}
      <BotonPrimario
        texto={guardar.isPending ? es.comunes.guardando : es.comunes.guardar}
        deshabilitado={guardar.isPending}
        onPress={() => guardar.mutate()}
      />
    </HojaFormulario>
  );
}

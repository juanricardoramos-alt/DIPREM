import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_TIPO_ACTIVIDAD,
  ICONOS_TIPO_ACTIVIDAD,
  es,
  formatearFechaLarga,
  formatearHora,
  formatearMonto,
  limitesDiaLocal,
  ordenarPorUrgencia,
  type Actividad,
  type TipoActividad,
} from "@diprem/core";
import {
  agendaDelDia,
  completarActividad,
  oportunidadesAbiertas,
} from "@diprem/api";
import { supabase } from "@/lib/supabase";
import { useSesion } from "@/lib/sesion";
import { BotonPrimario, HojaFormulario } from "@/components/formularios";
import { HojaActividad } from "@/components/hoja-actividad";

const ACCIONES: { tipo: TipoActividad; rapido: boolean; etiqueta: string }[] = [
  { tipo: "llamada", rapido: true, etiqueta: "Registrar llamada" },
  { tipo: "whatsapp", rapido: true, etiqueta: "Registrar WhatsApp" },
  { tipo: "reunion", rapido: false, etiqueta: "Agendar reunión" },
  { tipo: "visita_terreno", rapido: false, etiqueta: "Agendar visita" },
];

export default function PantallaMiDia() {
  const { perfil } = useSesion();
  const queryClient = useQueryClient();

  const [hoja, setHoja] = useState<{
    tipo: TipoActividad;
    rapido: boolean;
    oportunidad?: { id: string; nombre: string; cuenta_id: string };
  } | null>(null);
  const [completando, setCompletando] = useState<Actividad | null>(null);
  const [resultado, setResultado] = useState("");
  const [proximaAccion, setProximaAccion] = useState("");

  const { inicio, fin } = limitesDiaLocal();
  const agendaQuery = useQuery({
    queryKey: ["agenda", inicio],
    queryFn: () => agendaDelDia(supabase, inicio, fin),
    enabled: Boolean(perfil),
  });
  const abiertasQuery = useQuery({
    queryKey: ["seguimientos"],
    queryFn: () => oportunidadesAbiertas(supabase),
    enabled: Boolean(perfil),
  });

  const completar = useMutation({
    mutationFn: async () => {
      if (!completando) return;
      await completarActividad(supabase, completando.id, {
        resultado: resultado || null,
        proxima_accion: proximaAccion || null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agenda"] });
      void queryClient.invalidateQueries({ queryKey: ["seguimientos"] });
      void queryClient.invalidateQueries({ queryKey: ["oportunidades"] });
      setCompletando(null);
      setResultado("");
      setProximaAccion("");
    },
  });

  const agenda = agendaQuery.data?.agenda ?? [];
  const vencidas = agendaQuery.data?.vencidas ?? [];
  const seguimientos = ordenarPorUrgencia(abiertasQuery.data ?? []).slice(0, 10);
  const conAlerta = seguimientos.filter((s) => s.alerta !== "ok").length;
  const completadasHoy = agenda.filter((a) => a.estado === "completada").length;
  const pendientesHoy =
    agenda.filter((a) => a.estado === "pendiente").length + vencidas.length;

  const nombre = perfil?.nombre.split(" ")[0] ?? "";

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={
        <RefreshControl
          refreshing={agendaQuery.isRefetching || abiertasQuery.isRefetching}
          onRefresh={() => {
            void agendaQuery.refetch();
            void abiertasQuery.refetch();
          }}
        />
      }
    >
      {/* Cabecera + resumen del día */}
      <View className="bg-diprem px-5 pb-5 pt-3">
        <Text className="text-lg font-semibold text-white">
          {es.fase0.bienvenida}, {nombre} 👋
        </Text>
        <Text className="mt-0.5 text-sm capitalize text-blue-100">
          {formatearFechaLarga()}
        </Text>
        <View className="mt-3 flex-row gap-2">
          <View className="flex-1 rounded-xl bg-white/15 p-2.5">
            <Text className="text-lg font-bold text-white">{completadasHoy}</Text>
            <Text className="text-xs text-blue-100">{es.miDia.completadasHoy}</Text>
          </View>
          <View className="flex-1 rounded-xl bg-white/15 p-2.5">
            <Text className="text-lg font-bold text-white">{pendientesHoy}</Text>
            <Text className="text-xs text-blue-100">{es.miDia.pendientesHoy}</Text>
          </View>
          <View className="flex-1 rounded-xl bg-white/15 p-2.5">
            <Text className="text-lg font-bold text-white">{conAlerta}</Text>
            <Text className="text-xs text-blue-100">{es.miDia.alertasSeguimiento}</Text>
          </View>
        </View>
      </View>

      {/* Registro rápido: 2 toques */}
      <View className="px-4 pt-4">
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {es.miDia.registroRapido}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {ACCIONES.map((accion) => (
            <Pressable
              key={accion.tipo}
              onPress={() => setHoja({ tipo: accion.tipo, rapido: accion.rapido })}
              className="w-[48%] flex-row items-center gap-2 rounded-xl bg-white p-3.5 shadow-sm active:bg-slate-100"
            >
              <Text className="text-xl">{ICONOS_TIPO_ACTIVIDAD[accion.tipo]}</Text>
              <Text className="flex-1 text-sm font-medium text-slate-700">
                {accion.etiqueta}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setHoja({ tipo: "tarea", rapido: false })}
            className="w-[48%] flex-row items-center gap-2 rounded-xl bg-white p-3.5 shadow-sm active:bg-slate-100"
          >
            <Text className="text-xl">{ICONOS_TIPO_ACTIVIDAD.tarea}</Text>
            <Text className="flex-1 text-sm font-medium text-slate-700">Nueva tarea</Text>
          </Pressable>
        </View>
      </View>

      {/* Agenda de hoy */}
      <View className="px-4 pt-5">
        <Text className="mb-2 text-lg font-semibold">{es.miDia.agendaHoy}</Text>
        {agenda.length === 0 && (
          <Text className="rounded-xl bg-white p-4 text-center text-sm text-slate-400">
            {es.miDia.sinAgenda}
          </Text>
        )}
        {agenda.map((actividad) => (
          <FilaActividad
            key={actividad.id}
            actividad={actividad}
            onCompletar={() => setCompletando(actividad)}
          />
        ))}

        {vencidas.length > 0 && (
          <>
            <Text className="mb-2 mt-4 text-sm font-semibold text-red-600">
              ⚠️ {es.miDia.vencidas} ({vencidas.length})
            </Text>
            {vencidas.map((actividad) => (
              <FilaActividad
                key={actividad.id}
                actividad={actividad}
                vencida
                onCompletar={() => setCompletando(actividad)}
              />
            ))}
          </>
        )}
      </View>

      {/* Seguimientos pendientes */}
      <View className="px-4 py-5">
        <Text className="mb-2 text-lg font-semibold">{es.miDia.seguimientos}</Text>
        {seguimientos.length === 0 && (
          <Text className="rounded-xl bg-white p-4 text-center text-sm text-slate-400">
            {es.miDia.sinSeguimientos}
          </Text>
        )}
        {seguimientos.map((seguimiento) => (
          <View
            key={seguimiento.id}
            className={`mb-2 rounded-xl border-l-4 bg-white p-4 shadow-sm ${
              seguimiento.alerta === "critico"
                ? "border-l-red-500"
                : seguimiento.alerta === "atencion"
                  ? "border-l-amber-400"
                  : "border-l-emerald-400"
            }`}
          >
            <Text className="font-semibold" numberOfLines={1}>
              {seguimiento.nombre}
            </Text>
            <Text className="mt-0.5 text-sm text-slate-500" numberOfLines={1}>
              {seguimiento.cuenta?.razon_social} ·{" "}
              {formatearMonto(seguimiento.monto, seguimiento.moneda)}
            </Text>
            <View className="mt-2 flex-row items-center justify-between">
              <Text
                className={`text-xs font-medium ${
                  seguimiento.alerta === "critico"
                    ? "text-red-600"
                    : seguimiento.alerta === "atencion"
                      ? "text-amber-600"
                      : "text-emerald-600"
                }`}
              >
                {es.miDia.diasSinContacto(seguimiento.dias_sin_contacto)}
              </Text>
              <Pressable
                onPress={() =>
                  setHoja({
                    tipo: "llamada",
                    rapido: true,
                    oportunidad: {
                      id: seguimiento.id,
                      nombre: seguimiento.nombre,
                      cuenta_id: seguimiento.cuenta_id,
                    },
                  })
                }
                className="rounded-full bg-diprem px-3 py-1.5 active:bg-diprem-oscuro"
              >
                <Text className="text-xs font-medium text-white">
                  {es.miDia.registrarGestion}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      {/* Hojas */}
      {hoja && (
        <HojaActividad
          visible
          tipo={hoja.tipo}
          registroRapido={hoja.rapido}
          oportunidadFija={hoja.oportunidad ?? null}
          onCerrar={() => setHoja(null)}
        />
      )}
      <HojaFormulario
        visible={completando !== null}
        titulo={`✓ ${es.actividades.completarTitulo}`}
        onCerrar={() => setCompletando(null)}
      >
        <Text className="mb-3 text-base font-medium">{completando?.asunto}</Text>
        <Text className="mb-1 text-sm font-medium text-slate-700">
          {es.actividades.resultado} (opcional)
        </Text>
        <TextInput
          className="mb-3 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
          value={resultado}
          onChangeText={setResultado}
          placeholder="¿Qué pasó?"
        />
        <Text className="mb-1 text-sm font-medium text-slate-700">
          {es.actividades.proximaAccion} (opcional)
        </Text>
        <TextInput
          className="mb-4 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
          value={proximaAccion}
          onChangeText={setProximaAccion}
          placeholder="Ej: agendar visita a faena"
        />
        <BotonPrimario
          texto={completar.isPending ? es.comunes.guardando : es.miDia.completar}
          deshabilitado={completar.isPending}
          onPress={() => completar.mutate()}
        />
      </HojaFormulario>
    </ScrollView>
  );
}

function FilaActividad({
  actividad,
  vencida = false,
  onCompletar,
}: {
  actividad: Actividad;
  vencida?: boolean;
  onCompletar: () => void;
}) {
  const hecha = actividad.estado === "completada";
  return (
    <View
      className={`mb-2 flex-row items-center gap-3 rounded-xl bg-white p-3.5 shadow-sm ${
        hecha ? "opacity-60" : ""
      } ${vencida ? "border border-red-200" : ""}`}
    >
      <Text className="text-xl">{ICONOS_TIPO_ACTIVIDAD[actividad.tipo]}</Text>
      <View className="min-w-0 flex-1">
        <Text
          className={`font-medium ${hecha ? "line-through text-slate-400" : ""}`}
          numberOfLines={1}
        >
          {actividad.asunto}
        </Text>
        <Text className="text-xs text-slate-500" numberOfLines={1}>
          {actividad.fecha_programada ? formatearHora(actividad.fecha_programada) : ""}
          {actividad.cuenta?.razon_social ? ` · ${actividad.cuenta.razon_social}` : ""}
          {` · ${ETIQUETAS_TIPO_ACTIVIDAD[actividad.tipo]}`}
        </Text>
      </View>
      {!hecha ? (
        <Pressable
          onPress={onCompletar}
          className="h-8 w-8 items-center justify-center rounded-full border-2 border-diprem active:bg-blue-50"
        >
          <Text className="text-diprem">✓</Text>
        </Pressable>
      ) : (
        <Text className="text-xs text-emerald-600">✓</Text>
      )}
    </View>
  );
}

import { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_MODALIDAD,
  MONEDAS,
  es,
  esquemaOportunidad,
  formatearMonto,
  type ModalidadContrato,
  type Moneda,
  type Oportunidad,
} from "@diprem/core";
import {
  crearOportunidad,
  listarCuentas,
  listarEtapas,
  listarMotivosPerdida,
  listarOportunidades,
  moverOportunidad,
  obtenerEquipo,
} from "@diprem/api";
import { supabase } from "@/lib/supabase";
import { useSesion } from "@/lib/sesion";
import {
  BotonPrimario,
  CampoOpciones,
  CampoSeleccionLista,
  CampoTexto,
  HojaFormulario,
} from "@/components/formularios";

export default function PantallaOportunidades() {
  const queryClient = useQueryClient();
  const { perfil } = useSesion();

  const [etapaFiltro, setEtapaFiltro] = useState<string | null>(null);
  const [moviendo, setMoviendo] = useState<Oportunidad | null>(null);
  const [motivoPara, setMotivoPara] = useState<{
    oportunidad: Oportunidad;
    etapaId: string;
  } | null>(null);
  const [formAbierto, setFormAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formulario nueva oportunidad
  const [nombre, setNombre] = useState("");
  const [cuentaSel, setCuentaSel] = useState<{ id: string; nombre: string } | null>(null);
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<Moneda | null>(null);
  const [modalidad, setModalidad] = useState<ModalidadContrato>("proyecto");

  const { data: etapas } = useQuery({
    queryKey: ["etapas"],
    queryFn: () => listarEtapas(supabase),
  });
  const oportunidadesQuery = useQuery({
    queryKey: ["oportunidades", {}],
    queryFn: () => listarOportunidades(supabase),
  });
  const { data: cuentas } = useQuery({
    queryKey: ["cuentas", ""],
    queryFn: () => listarCuentas(supabase),
    enabled: formAbierto,
  });
  const { data: motivos } = useQuery({
    queryKey: ["motivos_perdida"],
    queryFn: () => listarMotivosPerdida(supabase),
    enabled: motivoPara !== null,
  });
  const { data: equipo } = useQuery({
    queryKey: ["equipo", perfil?.equipo_id],
    queryFn: () => obtenerEquipo(supabase, perfil?.equipo_id ?? null),
    enabled: Boolean(perfil),
  });

  const etapasActivas = etapas?.filter((e) => e.activa) ?? [];
  const oportunidades = oportunidadesQuery.data ?? [];
  const visibles = etapaFiltro
    ? oportunidades.filter((o) => o.etapa_id === etapaFiltro)
    : oportunidades.filter((o) => !o.cerrada_en);

  const invalidar = () =>
    void queryClient.invalidateQueries({ queryKey: ["oportunidades"] });

  const mover = useMutation({
    mutationFn: (args: {
      id: string;
      etapaId: string;
      motivo?: { motivo_perdida_id: string };
    }) => moverOportunidad(supabase, args.id, args.etapaId, args.motivo),
    onSuccess: () => {
      invalidar();
      setMoviendo(null);
      setMotivoPara(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const crear = useMutation({
    mutationFn: async () => {
      if (!perfil) throw new Error(es.comunes.errorGenerico);
      const primeraEtapa = etapasActivas.find((e) => !e.es_ganada && !e.es_perdida);
      if (!primeraEtapa) throw new Error(es.comunes.errorGenerico);
      const datos = esquemaOportunidad.parse({
        nombre,
        cuenta_id: cuentaSel?.id ?? "",
        monto: monto || 0,
        moneda: moneda ?? equipo?.moneda_default ?? "USD",
        modalidad_contrato: modalidad,
      });
      await crearOportunidad(supabase, {
        ...datos,
        propietario_id: perfil.id,
        etapa_id: primeraEtapa.id,
      });
    },
    onSuccess: () => {
      invalidar();
      setFormAbierto(false);
      setNombre("");
      setCuentaSel(null);
      setMonto("");
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  function elegirEtapa(oportunidad: Oportunidad, etapaId: string) {
    const etapa = etapasActivas.find((e) => e.id === etapaId);
    if (!etapa) return;
    if (etapa.es_perdida) {
      setMoviendo(null);
      setMotivoPara({ oportunidad, etapaId });
      return;
    }
    mover.mutate({ id: oportunidad.id, etapaId });
  }

  const nombreEtapa = (id: string) => etapas?.find((e) => e.id === id)?.nombre ?? "—";

  return (
    <View className="flex-1 bg-slate-50">
      {/* Filtro por etapa (tarjetas móvil = embudo en chips) */}
      <View className="bg-white pb-3 pt-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-3">
          <Pressable
            onPress={() => setEtapaFiltro(null)}
            className={`mr-2 rounded-full px-3 py-1.5 ${
              etapaFiltro === null ? "bg-diprem" : "bg-slate-200"
            }`}
          >
            <Text
              className={`text-sm ${etapaFiltro === null ? "text-white" : "text-slate-700"}`}
            >
              Abiertas
            </Text>
          </Pressable>
          {etapasActivas.map((etapa) => {
            const cantidad = oportunidades.filter((o) => o.etapa_id === etapa.id).length;
            return (
              <Pressable
                key={etapa.id}
                onPress={() => setEtapaFiltro(etapa.id)}
                className={`mr-2 rounded-full px-3 py-1.5 ${
                  etapaFiltro === etapa.id ? "bg-diprem" : "bg-slate-200"
                }`}
              >
                <Text
                  className={`text-sm ${
                    etapaFiltro === etapa.id ? "text-white" : "text-slate-700"
                  }`}
                >
                  {etapa.nombre} ({cantidad})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {error && <Text className="px-4 pt-2 text-sm text-red-600">{error}</Text>}

      <FlatList
        data={visibles}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-4 gap-2 pb-24"
        refreshControl={
          <RefreshControl
            refreshing={oportunidadesQuery.isRefetching}
            onRefresh={() => void oportunidadesQuery.refetch()}
          />
        }
        ListEmptyComponent={
          <Text className="mt-10 text-center text-slate-400">
            {oportunidadesQuery.isLoading ? es.comunes.cargando : es.crm.sinOportunidades}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setMoviendo(item)}
            className="rounded-xl bg-white p-4 shadow-sm active:bg-slate-100"
          >
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 font-semibold" numberOfLines={1}>
                {item.nombre}
              </Text>
              <Text className="ml-2 text-xs font-medium text-diprem">
                {nombreEtapa(item.etapa_id)}
              </Text>
            </View>
            <Text className="mt-0.5 text-sm text-slate-500">
              {item.cuenta?.razon_social ?? "—"}
            </Text>
            <Text className="mt-1 text-base font-bold text-slate-800">
              {formatearMonto(item.monto, item.moneda)}
            </Text>
            <Text className="text-xs text-slate-400">
              {ETIQUETAS_MODALIDAD[item.modalidad_contrato]}
              {item.probabilidad != null ? ` · ${item.probabilidad}%` : ""}
            </Text>
          </Pressable>
        )}
      />

      {/* Botón flotante nueva oportunidad */}
      <Pressable
        onPress={() => setFormAbierto(true)}
        className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-diprem shadow-lg active:bg-diprem-oscuro"
      >
        <Text className="text-2xl font-bold text-white">＋</Text>
      </Pressable>

      {/* Mover de etapa (1 toque en la tarjeta) */}
      <HojaFormulario
        visible={moviendo !== null}
        titulo={`${es.crm.moverA} — ${moviendo?.nombre ?? ""}`}
        onCerrar={() => setMoviendo(null)}
      >
        {etapasActivas
          .filter((e) => e.id !== moviendo?.etapa_id)
          .map((etapa) => (
            <Pressable
              key={etapa.id}
              onPress={() => moviendo && elegirEtapa(moviendo, etapa.id)}
              className="mb-2 rounded-lg bg-white p-3"
            >
              <Text className="text-base">
                {etapa.nombre}
                {etapa.es_ganada ? " ✅" : etapa.es_perdida ? " ❌" : ""}
              </Text>
            </Pressable>
          ))}
      </HojaFormulario>

      {/* Motivo de pérdida obligatorio */}
      <HojaFormulario
        visible={motivoPara !== null}
        titulo={es.crm.motivoPerdida}
        onCerrar={() => setMotivoPara(null)}
      >
        {motivos?.map((motivo) => (
          <Pressable
            key={motivo.id}
            onPress={() =>
              motivoPara &&
              mover.mutate({
                id: motivoPara.oportunidad.id,
                etapaId: motivoPara.etapaId,
                motivo: { motivo_perdida_id: motivo.id },
              })
            }
            className="mb-2 rounded-lg bg-white p-3"
          >
            <Text className="text-base">{motivo.nombre}</Text>
          </Pressable>
        ))}
      </HojaFormulario>

      {/* Nueva oportunidad */}
      <HojaFormulario
        visible={formAbierto}
        titulo={es.crm.nuevaOportunidad}
        onCerrar={() => setFormAbierto(false)}
      >
        <CampoTexto
          etiqueta={es.crm.nombreOportunidad}
          valor={nombre}
          onCambio={setNombre}
          placeholder="Ej: Auditoría HSE — faena"
        />
        <CampoSeleccionLista
          etiqueta={es.crm.cuenta}
          seleccionado={cuentaSel}
          opciones={(cuentas ?? []).map((c) => ({ id: c.id, nombre: c.razon_social }))}
          onSeleccionar={setCuentaSel}
        />
        <CampoTexto
          etiqueta={`${es.crm.monto} (${moneda ?? equipo?.moneda_default ?? "USD"})`}
          valor={monto}
          onCambio={setMonto}
          teclado="numeric"
          opcional
        />
        <CampoSeleccionLista
          etiqueta={es.crm.moneda}
          seleccionado={
            moneda
              ? { id: moneda, nombre: moneda }
              : equipo?.moneda_default
                ? { id: equipo.moneda_default, nombre: `${equipo.moneda_default} (equipo)` }
                : null
          }
          opciones={MONEDAS.map((m) => ({ id: m, nombre: m }))}
          onSeleccionar={(op) => setMoneda((op?.id as Moneda) ?? null)}
          opcional
        />
        <CampoOpciones
          etiqueta={es.crm.modalidad}
          valor={modalidad}
          opciones={ETIQUETAS_MODALIDAD}
          onCambio={setModalidad}
        />
        {error && <Text className="mb-2 text-sm text-red-600">{error}</Text>}
        <BotonPrimario
          texto={crear.isPending ? es.comunes.guardando : es.comunes.crear}
          deshabilitado={crear.isPending}
          onPress={() => crear.mutate()}
        />
      </HojaFormulario>
    </View>
  );
}

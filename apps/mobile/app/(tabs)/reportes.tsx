import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  ETIQUETAS_TIPO_META,
  es,
  etiquetaPeriodo,
  formatearMonto,
  periodoActual,
  porcentajeMeta,
  semaforoMeta,
  type MetaAvance,
  type RankingFila,
} from "@diprem/core";
import { listarAvanceMetas, listarRanking } from "@diprem/api";
import { supabase } from "@/lib/supabase";
import { useSesion } from "@/lib/sesion";

const COLOR_SEMAFORO = {
  verde: "bg-emerald-500",
  ambar: "bg-amber-400",
  rojo: "bg-red-500",
} as const;

export default function PantallaReportes() {
  const { perfil } = useSesion();
  const periodo = periodoActual();
  const esEjecutivo = perfil?.rol === "ejecutivo";

  const metasQuery = useQuery({
    queryKey: ["avance_metas", periodo, perfil?.id],
    queryFn: () =>
      listarAvanceMetas(supabase, {
        periodo,
        ...(esEjecutivo ? { usuario_id: perfil?.id } : {}),
      }),
    enabled: Boolean(perfil),
    retry: false,
  });
  const rankingQuery = useQuery({
    queryKey: ["ranking"],
    queryFn: () => listarRanking(supabase),
    enabled: Boolean(perfil),
    retry: false,
  });

  const metas = metasQuery.data ?? [];
  const ranking = rankingQuery.data ?? [];
  const mio = ranking.find((r) => r.usuario_id === perfil?.id);
  const misMetas = metas.filter((m) => m.usuario_id === perfil?.id);
  const cerradas = Number(mio?.adjudicadas_mes ?? 0) + Number(mio?.perdidas_mes ?? 0);
  const conversion = cerradas
    ? `${Math.round((Number(mio?.adjudicadas_mes ?? 0) / cerradas) * 100)}%`
    : "—";

  if (metasQuery.error) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-8">
        <Text className="text-center text-sm text-amber-700">
          ⚠️ {(metasQuery.error as Error).message}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-slate-50"
      refreshControl={
        <RefreshControl
          refreshing={metasQuery.isRefetching || rankingQuery.isRefetching}
          onRefresh={() => {
            void metasQuery.refetch();
            void rankingQuery.refetch();
          }}
        />
      }
    >
      {/* Avance de metas */}
      <View className="px-4 pt-4">
        <Text className="text-lg font-semibold">
          {es.reportes.avanceMetas}
        </Text>
        <Text className="mb-2 text-xs capitalize text-slate-400">
          {etiquetaPeriodo(periodo)}
        </Text>
        <View className="rounded-xl bg-white p-4 shadow-sm">
          {(esEjecutivo ? misMetas : metas).length === 0 && (
            <Text className="text-center text-sm text-slate-400">
              {es.reportes.sinMetas}
            </Text>
          )}
          {(esEjecutivo ? misMetas : metas).map((meta) => (
            <BarraMetaMovil key={meta.id} meta={meta} conNombre={!esEjecutivo} />
          ))}
        </View>
      </View>

      {/* KPIs personales */}
      {mio && (
        <View className="px-4 pt-5">
          <Text className="mb-2 text-lg font-semibold">{es.reportes.kpis}</Text>
          <View className="flex-row flex-wrap gap-2">
            <Kpi titulo={es.reportes.kpiActividades} valor={String(mio.actividades_mes)} />
            <Kpi titulo={es.reportes.kpiAdjudicadas} valor={String(mio.adjudicadas_mes)} />
            <Kpi titulo={es.reportes.kpiNuevas} valor={String(mio.nuevas_mes)} />
            <Kpi titulo={es.reportes.kpiConversion} valor={conversion} />
          </View>
        </View>
      )}

      {/* Referencia del equipo */}
      {ranking.length > 1 && (
        <View className="px-4 py-5">
          <Text className="text-lg font-semibold">{es.reportes.comparativa}</Text>
          <Text className="mb-2 text-xs text-slate-400">
            {es.reportes.comparativaNota}
          </Text>
          <View className="rounded-xl bg-white p-4 shadow-sm">
            {ranking.map((fila: RankingFila, i) => (
              <View
                key={fila.usuario_id}
                className={`flex-row items-center justify-between py-2 ${
                  i > 0 ? "border-t border-slate-100" : ""
                }`}
              >
                <Text
                  className={`flex-1 text-sm ${
                    fila.usuario_id === perfil?.id ? "font-bold text-diprem" : ""
                  }`}
                  numberOfLines={1}
                >
                  {i + 1}. {fila.nombre}
                  {fila.usuario_id === perfil?.id ? " (tú)" : ""}
                </Text>
                <Text className="text-sm text-slate-500">
                  {fila.actividades_mes} gestiones · {fila.adjudicadas_mes} 🏆
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function BarraMetaMovil({ meta, conNombre }: { meta: MetaAvance; conNombre: boolean }) {
  const pct = porcentajeMeta(meta);
  const color = COLOR_SEMAFORO[semaforoMeta(meta)];
  const esMonto = meta.tipo === "monto_adjudicado" && meta.moneda;
  return (
    <View className="mb-3">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-sm font-medium" numberOfLines={1}>
          {conNombre ? `${meta.ejecutivo} · ` : ""}
          {ETIQUETAS_TIPO_META[meta.tipo]}
        </Text>
        <Text className="text-xs text-slate-500">
          {esMonto
            ? formatearMonto(Number(meta.avance), meta.moneda!)
            : Number(meta.avance)}{" "}
          / {esMonto ? formatearMonto(Number(meta.objetivo), meta.moneda!) : Number(meta.objetivo)} · {pct}%
        </Text>
      </View>
      <View className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <View
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </View>
    </View>
  );
}

function Kpi({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <View className="w-[48%] rounded-xl bg-white p-3 shadow-sm">
      <Text className="text-xs text-slate-400">{titulo}</Text>
      <Text className="mt-0.5 text-xl font-bold">{valor}</Text>
    </View>
  );
}

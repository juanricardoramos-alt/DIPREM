import { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_CALIFICACION,
  ETIQUETAS_ESTADO_LEAD,
  ETIQUETAS_FUENTE,
  ETIQUETAS_VERTICAL,
  es,
  esquemaCuenta,
  esquemaLead,
  type CalificacionLead,
  type FuenteLead,
  type Lead,
  type VerticalCuenta,
} from "@diprem/core";
import {
  convertirLead,
  crearCuenta,
  crearLead,
  listarCuentas,
  listarLeads,
} from "@diprem/api";
import { supabase } from "@/lib/supabase";
import { useSesion } from "@/lib/sesion";
import {
  BotonPrimario,
  CampoOpciones,
  CampoTexto,
  HojaFormulario,
} from "@/components/formularios";

type Segmento = "cuentas" | "leads";

export default function PantallaCuentas() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { perfil } = useSesion();

  const [segmento, setSegmento] = useState<Segmento>("cuentas");
  const [busqueda, setBusqueda] = useState("");
  const [formCuenta, setFormCuenta] = useState(false);
  const [formLead, setFormLead] = useState(false);
  const [convirtiendo, setConvirtiendo] = useState<Lead | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Formularios (estado controlado, mínimo de campos)
  const [razonSocial, setRazonSocial] = useState("");
  const [vertical, setVertical] = useState<VerticalCuenta>("mineria");
  const [nombreLead, setNombreLead] = useState("");
  const [empresaLead, setEmpresaLead] = useState("");
  const [telefonoLead, setTelefonoLead] = useState("");
  const [fuente, setFuente] = useState<FuenteLead>("referido");
  const [calificacion, setCalificacion] = useState<CalificacionLead>("tibio");

  const cuentasQuery = useQuery({
    queryKey: ["cuentas", busqueda],
    queryFn: () => listarCuentas(supabase, busqueda),
    enabled: segmento === "cuentas",
  });
  const leadsQuery = useQuery({
    queryKey: ["leads", busqueda],
    queryFn: () => listarLeads(supabase, busqueda),
    enabled: segmento === "leads",
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ["cuentas"] });
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
    void queryClient.invalidateQueries({ queryKey: ["oportunidades"] });
  };

  const crearCuentaM = useMutation({
    mutationFn: async () => {
      if (!perfil) throw new Error(es.comunes.errorGenerico);
      const datos = esquemaCuenta.parse({ razon_social: razonSocial, vertical });
      await crearCuenta(supabase, {
        ...datos,
        propietario_id: perfil.id,
        equipo_id: perfil.equipo_id,
      });
    },
    onSuccess: () => {
      invalidar();
      setFormCuenta(false);
      setRazonSocial("");
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const crearLeadM = useMutation({
    mutationFn: async () => {
      if (!perfil) throw new Error(es.comunes.errorGenerico);
      const datos = esquemaLead.parse({
        nombre: nombreLead,
        empresa: empresaLead,
        telefono: telefonoLead,
        fuente,
        calificacion,
      });
      await crearLead(supabase, { ...datos, propietario_id: perfil.id });
    },
    onSuccess: () => {
      invalidar();
      setFormLead(false);
      setNombreLead("");
      setEmpresaLead("");
      setTelefonoLead("");
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const convertirM = useMutation({
    mutationFn: async () => {
      if (!convirtiendo) throw new Error(es.comunes.errorGenerico);
      return convertirLead(supabase, {
        lead_id: convirtiendo.id,
        razon_social: razonSocial || convirtiendo.empresa || "",
        vertical,
      });
    },
    onSuccess: (resultado) => {
      invalidar();
      setConvirtiendo(null);
      setError(null);
      router.push(`/cuenta/${resultado.cuenta_id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const cargando =
    segmento === "cuentas" ? cuentasQuery.isLoading : leadsQuery.isLoading;

  return (
    <View className="flex-1 bg-slate-50">
      {/* Segmento + búsqueda + crear */}
      <View className="bg-white px-4 pb-3 pt-2">
        <View className="flex-row rounded-lg bg-slate-100 p-1">
          {(["cuentas", "leads"] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSegmento(s)}
              className={`flex-1 items-center rounded-md py-1.5 ${
                segmento === s ? "bg-white shadow-sm" : ""
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  segmento === s ? "text-diprem" : "text-slate-500"
                }`}
              >
                {s === "cuentas" ? es.nav.cuentas : es.crm.leads}
              </Text>
            </Pressable>
          ))}
        </View>
        <View className="mt-2 flex-row gap-2">
          <TextInput
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            placeholder={es.comunes.buscar}
            value={busqueda}
            onChangeText={setBusqueda}
          />
          <Pressable
            onPress={() =>
              segmento === "cuentas" ? setFormCuenta(true) : setFormLead(true)
            }
            className="items-center justify-center rounded-lg bg-diprem px-4"
          >
            <Text className="text-lg font-bold text-white">＋</Text>
          </Pressable>
        </View>
      </View>

      {segmento === "cuentas" ? (
        <FlatList
          data={cuentasQuery.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerClassName="p-4 gap-2"
          refreshControl={
            <RefreshControl
              refreshing={cuentasQuery.isRefetching}
              onRefresh={() => void cuentasQuery.refetch()}
            />
          }
          ListEmptyComponent={
            <Text className="mt-10 text-center text-slate-400">
              {cargando ? es.comunes.cargando : es.crm.sinCuentas}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/cuenta/${item.id}`)}
              className="rounded-xl bg-white p-4 shadow-sm active:bg-slate-100"
            >
              <Text className="text-base font-semibold">{item.razon_social}</Text>
              <Text className="mt-0.5 text-sm text-slate-500">
                {ETIQUETAS_VERTICAL[item.vertical]}
                {item.pais ? ` · ${item.pais}` : ""}
                {item.propietario?.nombre ? ` · ${item.propietario.nombre}` : ""}
              </Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={leadsQuery.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerClassName="p-4 gap-2"
          refreshControl={
            <RefreshControl
              refreshing={leadsQuery.isRefetching}
              onRefresh={() => void leadsQuery.refetch()}
            />
          }
          ListEmptyComponent={
            <Text className="mt-10 text-center text-slate-400">
              {cargando ? es.comunes.cargando : es.crm.sinLeads}
            </Text>
          }
          renderItem={({ item }) => (
            <View className="rounded-xl bg-white p-4 shadow-sm">
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold">{item.nombre}</Text>
                <Text className="text-xs text-slate-500">
                  {ETIQUETAS_ESTADO_LEAD[item.estado]}
                </Text>
              </View>
              <Text className="mt-0.5 text-sm text-slate-500">
                {item.empresa ?? "—"} · {ETIQUETAS_FUENTE[item.fuente]} ·{" "}
                {ETIQUETAS_CALIFICACION[item.calificacion]}
              </Text>
              {item.estado !== "convertido" && item.estado !== "descartado" && (
                <Pressable
                  onPress={() => {
                    setRazonSocial(item.empresa ?? "");
                    setConvirtiendo(item);
                  }}
                  className="mt-2 self-start rounded-full bg-diprem px-3 py-1"
                >
                  <Text className="text-xs font-medium text-white">
                    {es.crm.convertir} →
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        />
      )}

      {/* Nueva cuenta */}
      <HojaFormulario
        visible={formCuenta}
        titulo={es.crm.nuevaCuenta}
        onCerrar={() => setFormCuenta(false)}
      >
        <CampoTexto
          etiqueta={es.crm.razonSocial}
          valor={razonSocial}
          onCambio={setRazonSocial}
        />
        <CampoOpciones
          etiqueta={es.crm.vertical}
          valor={vertical}
          opciones={ETIQUETAS_VERTICAL}
          onCambio={setVertical}
        />
        {error && <Text className="mb-2 text-sm text-red-600">{error}</Text>}
        <BotonPrimario
          texto={crearCuentaM.isPending ? es.comunes.guardando : es.comunes.guardar}
          deshabilitado={crearCuentaM.isPending}
          onPress={() => crearCuentaM.mutate()}
        />
      </HojaFormulario>

      {/* Nuevo lead */}
      <HojaFormulario
        visible={formLead}
        titulo={es.crm.nuevoLead}
        onCerrar={() => setFormLead(false)}
      >
        <CampoTexto etiqueta={es.crm.nombre} valor={nombreLead} onCambio={setNombreLead} />
        <CampoTexto
          etiqueta={es.crm.empresa}
          valor={empresaLead}
          onCambio={setEmpresaLead}
          opcional
        />
        <CampoTexto
          etiqueta={es.crm.telefono}
          valor={telefonoLead}
          onCambio={setTelefonoLead}
          opcional
          teclado="phone-pad"
        />
        <CampoOpciones
          etiqueta={es.crm.fuente}
          valor={fuente}
          opciones={ETIQUETAS_FUENTE}
          onCambio={setFuente}
        />
        <CampoOpciones
          etiqueta={es.crm.calificacion}
          valor={calificacion}
          opciones={ETIQUETAS_CALIFICACION}
          onCambio={setCalificacion}
        />
        {error && <Text className="mb-2 text-sm text-red-600">{error}</Text>}
        <BotonPrimario
          texto={crearLeadM.isPending ? es.comunes.guardando : es.comunes.guardar}
          deshabilitado={crearLeadM.isPending}
          onPress={() => crearLeadM.mutate()}
        />
      </HojaFormulario>

      {/* Convertir lead */}
      <HojaFormulario
        visible={convirtiendo !== null}
        titulo={es.crm.convertirLead}
        onCerrar={() => setConvirtiendo(null)}
      >
        <CampoTexto
          etiqueta={es.crm.razonSocial}
          valor={razonSocial}
          onCambio={setRazonSocial}
        />
        <CampoOpciones
          etiqueta={es.crm.vertical}
          valor={vertical}
          opciones={ETIQUETAS_VERTICAL}
          onCambio={setVertical}
        />
        {error && <Text className="mb-2 text-sm text-red-600">{error}</Text>}
        <BotonPrimario
          texto={convertirM.isPending ? es.comunes.guardando : es.crm.convertir}
          deshabilitado={convertirM.isPending}
          onPress={() => convertirM.mutate()}
        />
      </HojaFormulario>
    </View>
  );
}

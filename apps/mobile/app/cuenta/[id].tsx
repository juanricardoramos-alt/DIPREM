import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_ESTADO_CUENTA,
  ETIQUETAS_MODALIDAD,
  ETIQUETAS_VERTICAL,
  es,
  esquemaContacto,
  formatearMonto,
} from "@diprem/core";
import {
  crearContacto,
  listarContactos,
  listarEtapas,
  listarOportunidades,
  obtenerCuenta,
} from "@diprem/api";
import { supabase } from "@/lib/supabase";
import {
  BotonPrimario,
  CampoTexto,
  HojaFormulario,
} from "@/components/formularios";

export default function PantallaDetalleCuenta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [formContacto, setFormContacto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [cargo, setCargo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: cuenta } = useQuery({
    queryKey: ["cuenta", id],
    queryFn: () => obtenerCuenta(supabase, id),
  });
  const { data: contactos } = useQuery({
    queryKey: ["contactos", id],
    queryFn: () => listarContactos(supabase, id),
  });
  const { data: oportunidades } = useQuery({
    queryKey: ["oportunidades", { cuenta_id: id }],
    queryFn: () => listarOportunidades(supabase, { cuenta_id: id }),
  });
  const { data: etapas } = useQuery({
    queryKey: ["etapas"],
    queryFn: () => listarEtapas(supabase),
  });

  const agregarContacto = useMutation({
    mutationFn: async () => {
      const datos = esquemaContacto.parse({
        nombre,
        cargo,
        telefono,
        email: correo,
      });
      await crearContacto(supabase, id, datos);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contactos", id] });
      setFormContacto(false);
      setNombre("");
      setCargo("");
      setTelefono("");
      setCorreo("");
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const nombreEtapa = (etapaId: string) =>
    etapas?.find((e) => e.id === etapaId)?.nombre ?? "—";

  if (!cuenta) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <Text className="text-slate-400">{es.comunes.cargando}</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-slate-50">
      <Stack.Screen options={{ headerTitle: cuenta.razon_social }} />

      <View className="bg-diprem px-5 pb-5 pt-4">
        <Text className="text-xl font-bold text-white">{cuenta.razon_social}</Text>
        <Text className="mt-1 text-sm text-blue-100">
          {ETIQUETAS_VERTICAL[cuenta.vertical]} ·{" "}
          {ETIQUETAS_ESTADO_CUENTA[cuenta.estado]}
          {cuenta.pais ? ` · ${cuenta.pais}` : ""}
        </Text>
        {cuenta.propietario?.nombre && (
          <Text className="mt-0.5 text-xs text-blue-200">
            {es.crm.propietario}: {cuenta.propietario.nombre}
          </Text>
        )}
      </View>

      {/* Contactos */}
      <View className="px-4 pt-5">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-lg font-semibold">{es.crm.contactos}</Text>
          <Pressable
            onPress={() => setFormContacto(true)}
            className="rounded-full bg-diprem px-3 py-1"
          >
            <Text className="text-xs font-medium text-white">
              + {es.crm.nuevoContacto}
            </Text>
          </Pressable>
        </View>
        {(contactos?.length ?? 0) === 0 && (
          <Text className="rounded-xl bg-white p-4 text-center text-sm text-slate-400">
            {es.crm.sinContactos}
          </Text>
        )}
        {contactos?.map((contacto) => (
          <View key={contacto.id} className="mb-2 rounded-xl bg-white p-4 shadow-sm">
            <Text className="font-semibold">
              {contacto.nombre}
              {contacto.es_principal ? " ⭐" : ""}
            </Text>
            {contacto.cargo && (
              <Text className="text-sm text-slate-500">{contacto.cargo}</Text>
            )}
            <Text className="mt-1 text-sm text-slate-600">
              {[contacto.telefono, contacto.email].filter(Boolean).join(" · ") || "—"}
            </Text>
          </View>
        ))}
      </View>

      {/* Oportunidades */}
      <View className="px-4 py-5">
        <Text className="mb-2 text-lg font-semibold">{es.crm.oportunidades}</Text>
        {(oportunidades?.length ?? 0) === 0 && (
          <Text className="rounded-xl bg-white p-4 text-center text-sm text-slate-400">
            {es.crm.sinOportunidades}
          </Text>
        )}
        {oportunidades?.map((op) => (
          <View key={op.id} className="mb-2 rounded-xl bg-white p-4 shadow-sm">
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 font-semibold" numberOfLines={1}>
                {op.nombre}
              </Text>
              <Text className="ml-2 text-xs font-medium text-diprem">
                {nombreEtapa(op.etapa_id)}
              </Text>
            </View>
            <Text className="mt-1 text-sm text-slate-600">
              {formatearMonto(op.monto, op.moneda)} ·{" "}
              {ETIQUETAS_MODALIDAD[op.modalidad_contrato]}
            </Text>
          </View>
        ))}
      </View>

      {/* Nuevo contacto */}
      <HojaFormulario
        visible={formContacto}
        titulo={es.crm.nuevoContacto}
        onCerrar={() => setFormContacto(false)}
      >
        <CampoTexto etiqueta={es.crm.nombre} valor={nombre} onCambio={setNombre} />
        <CampoTexto etiqueta={es.crm.cargo} valor={cargo} onCambio={setCargo} opcional />
        <CampoTexto
          etiqueta={es.crm.telefono}
          valor={telefono}
          onCambio={setTelefono}
          opcional
          teclado="phone-pad"
        />
        <CampoTexto
          etiqueta={es.crm.correo}
          valor={correo}
          onCambio={setCorreo}
          opcional
          teclado="email-address"
        />
        {error && <Text className="mb-2 text-sm text-red-600">{error}</Text>}
        <BotonPrimario
          texto={agregarContacto.isPending ? es.comunes.guardando : es.comunes.guardar}
          deshabilitado={agregarContacto.isPending}
          onPress={() => agregarContacto.mutate()}
        />
      </HojaFormulario>
    </ScrollView>
  );
}

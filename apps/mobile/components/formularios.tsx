import { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

/** Primitivas de formulario móviles (registro sin fricción: pocas, grandes). */

export function CampoTexto({
  etiqueta,
  valor,
  onCambio,
  opcional,
  teclado,
  placeholder,
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  opcional?: boolean;
  teclado?: "default" | "email-address" | "phone-pad" | "numeric";
  placeholder?: string;
}) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-sm font-medium text-slate-700">
        {etiqueta}
        {opcional ? " (opcional)" : ""}
      </Text>
      <TextInput
        className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
        value={valor}
        onChangeText={onCambio}
        keyboardType={teclado ?? "default"}
        autoCapitalize={teclado === "email-address" ? "none" : "sentences"}
        placeholder={placeholder}
      />
    </View>
  );
}

export function CampoOpciones<T extends string>({
  etiqueta,
  valor,
  opciones,
  onCambio,
}: {
  etiqueta: string;
  valor: T;
  opciones: Record<T, string> | [T, string][];
  onCambio: (v: T) => void;
}) {
  const pares = Array.isArray(opciones)
    ? opciones
    : (Object.entries(opciones) as [T, string][]);
  return (
    <View className="mb-3">
      <Text className="mb-1 text-sm font-medium text-slate-700">{etiqueta}</Text>
      <View className="flex-row flex-wrap gap-2">
        {pares.map(([v, etiquetaOpcion]) => (
          <Pressable
            key={v}
            onPress={() => onCambio(v)}
            className={`rounded-full px-3 py-1.5 ${
              valor === v ? "bg-diprem" : "bg-slate-200"
            }`}
          >
            <Text
              className={`text-sm ${valor === v ? "text-white" : "text-slate-700"}`}
            >
              {etiquetaOpcion}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Selector de un elemento desde una lista (cuentas, etapas…) vía modal. */
export function CampoSeleccionLista({
  etiqueta,
  seleccionado,
  opciones,
  onSeleccionar,
  opcional,
}: {
  etiqueta: string;
  seleccionado: { id: string; nombre: string } | null;
  opciones: { id: string; nombre: string }[];
  onSeleccionar: (opcion: { id: string; nombre: string } | null) => void;
  opcional?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <View className="mb-3">
      <Text className="mb-1 text-sm font-medium text-slate-700">
        {etiqueta}
        {opcional ? " (opcional)" : ""}
      </Text>
      <Pressable
        onPress={() => setAbierto(true)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2.5"
      >
        <Text className={seleccionado ? "text-base" : "text-base text-slate-400"}>
          {seleccionado?.nombre ?? "Seleccionar…"}
        </Text>
      </Pressable>
      <Modal visible={abierto} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[70%] rounded-t-2xl bg-white p-4">
            <Text className="mb-3 text-lg font-semibold">{etiqueta}</Text>
            <FlatList
              data={opciones}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onSeleccionar(item);
                    setAbierto(false);
                  }}
                  className="border-b border-slate-100 py-3"
                >
                  <Text className="text-base">{item.nombre}</Text>
                </Pressable>
              )}
            />
            <Pressable onPress={() => setAbierto(false)} className="mt-3 items-center py-2">
              <Text className="text-slate-500">Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function BotonPrimario({
  texto,
  onPress,
  deshabilitado,
}: {
  texto: string;
  onPress: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      className={`items-center rounded-lg py-3 ${
        deshabilitado ? "bg-slate-300" : "bg-diprem active:bg-diprem-oscuro"
      }`}
    >
      <Text className="text-base font-semibold text-white">{texto}</Text>
    </Pressable>
  );
}

/** Hoja modal genérica para formularios. */
export function HojaFormulario({
  visible,
  titulo,
  onCerrar,
  children,
}: {
  visible: boolean;
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 justify-end bg-black/40">
        <View className="max-h-[90%] rounded-t-2xl bg-slate-50 p-5">
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-bold">{titulo}</Text>
            <Pressable onPress={onCerrar} hitSlop={10}>
              <Text className="text-lg text-slate-400">✕</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

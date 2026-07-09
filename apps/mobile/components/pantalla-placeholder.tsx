import { Text, View } from "react-native";
import { es } from "@diprem/core";

export function PantallaPlaceholder({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion: string;
}) {
  return (
    <View className="flex-1 items-center justify-center bg-slate-50 px-8">
      <Text className="text-center text-xl font-bold text-slate-800">
        {titulo}
      </Text>
      <Text className="mt-3 text-center text-base text-slate-600">
        {descripcion}
      </Text>
      <Text className="mt-2 text-center text-sm text-slate-400">
        {es.comunes.proximamente}
      </Text>
    </View>
  );
}

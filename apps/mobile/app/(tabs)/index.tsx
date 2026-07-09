import { Text, View } from "react-native";
import { es } from "@diprem/core";
import { useSesion } from "@/lib/sesion";
import { PantallaPlaceholder } from "@/components/pantalla-placeholder";

export default function PantallaMiDia() {
  const { perfil } = useSesion();
  const nombre = perfil?.nombre.split(" ")[0] ?? "";

  return (
    <View className="flex-1 bg-slate-50">
      <View className="bg-diprem px-6 pb-6 pt-4">
        <Text className="text-lg font-semibold text-white">
          {es.fase0.bienvenida}, {nombre} 👋
        </Text>
        {perfil && (
          <Text className="mt-0.5 text-sm text-blue-100">
            {es.roles[perfil.rol]}
          </Text>
        )}
      </View>
      <PantallaPlaceholder
        titulo={es.nav.miDia}
        descripcion={es.fase0.descripcionMiDia}
      />
    </View>
  );
}

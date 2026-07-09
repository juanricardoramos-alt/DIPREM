import { Pressable, Text, View } from "react-native";
import { es } from "@diprem/core";
import { supabase } from "@/lib/supabase";
import { useSesion } from "@/lib/sesion";

export default function PantallaPerfil() {
  const { perfil, sesion } = useSesion();

  async function salir() {
    await supabase.auth.signOut();
    // El ProveedorSesion redirige a login automáticamente.
  }

  return (
    <View className="flex-1 bg-slate-50 px-6 py-8">
      <View className="rounded-2xl bg-white p-6 shadow-sm">
        <Text className="text-xl font-bold text-slate-800">
          {perfil?.nombre ?? "—"}
        </Text>
        <Text className="mt-1 text-sm text-slate-500">
          {perfil ? es.roles[perfil.rol] : ""}
        </Text>
        <Text className="mt-1 text-sm text-slate-500">
          {sesion?.user.email ?? ""}
        </Text>
      </View>

      <Pressable
        onPress={salir}
        className="mt-6 items-center rounded-lg border border-slate-300 bg-white py-3 active:bg-slate-100"
      >
        <Text className="text-base font-medium text-slate-700">
          {es.auth.salir}
        </Text>
      </Pressable>
    </View>
  );
}

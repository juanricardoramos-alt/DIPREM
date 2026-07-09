import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ProveedorSesion, useSesion } from "@/lib/sesion";
import "../global.css";

function NavegacionProtegida() {
  const { sesion, cargando } = useSesion();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (cargando) return;
    const enGrupoAuth = segments[0] === "(auth)";

    if (!sesion && !enGrupoAuth) {
      router.replace("/(auth)/login");
    } else if (sesion && enGrupoAuth) {
      router.replace("/(tabs)");
    }
  }, [sesion, cargando, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)/login" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function LayoutRaiz() {
  return (
    <ProveedorSesion>
      <StatusBar style="dark" />
      <NavegacionProtegida />
    </ProveedorSesion>
  );
}

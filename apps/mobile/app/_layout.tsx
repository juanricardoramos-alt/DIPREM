import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { es } from "@diprem/core";
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
      <Stack.Screen
        name="cuenta/[id]"
        options={{ headerShown: true, headerTitle: es.crm.cuenta, headerBackTitle: es.comunes.volver }}
      />
    </Stack>
  );
}

export default function LayoutRaiz() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ProveedorSesion>
        <StatusBar style="dark" />
        <NavegacionProtegida />
      </ProveedorSesion>
    </QueryClientProvider>
  );
}

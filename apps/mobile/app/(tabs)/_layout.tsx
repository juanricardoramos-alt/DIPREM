import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { es } from "@diprem/core";

// Misma paleta del sistema de diseño web (apps/web/app/globals.css)
const COLOR_DIPREM = "#1d5b94";

export default function LayoutTabs() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLOR_DIPREM,
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: es.nav.miDia,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="today-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="cuentas"
        options={{
          title: es.nav.cuentas,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="oportunidades"
        options={{
          title: es.nav.oportunidades,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trending-up-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="reportes"
        options={{
          title: es.nav.reportes,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: es.nav.perfil,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

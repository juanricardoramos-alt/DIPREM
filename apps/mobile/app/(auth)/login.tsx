import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { es, esquemaLogin } from "@diprem/core";
import { supabase } from "@/lib/supabase";

export default function PantallaLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function ingresar() {
    setError(null);

    const datos = esquemaLogin.safeParse({ email: email.trim(), password });
    if (!datos.success) {
      setError(datos.error.issues[0]?.message ?? es.auth.errores.generico);
      return;
    }

    setCargando(true);
    const { error: errorAuth } = await supabase.auth.signInWithPassword(datos.data);
    setCargando(false);

    if (errorAuth) {
      setError(
        errorAuth.message.includes("Invalid login credentials")
          ? es.auth.errores.credenciales
          : es.auth.errores.generico,
      );
    }
    // Si no hay error, el ProveedorSesion redirige a (tabs) automáticamente.
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 items-center justify-center bg-slate-50 px-6"
    >
      <View className="w-full max-w-sm rounded-2xl bg-white p-6 shadow">
        <Text className="text-2xl font-bold text-diprem">{es.app.nombre}</Text>
        <Text className="mt-1 text-sm text-slate-500">{es.app.lema}</Text>

        <Text className="mt-6 text-sm font-medium text-slate-700">
          {es.auth.email}
        </Text>
        <TextInput
          className="mt-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <Text className="mt-4 text-sm font-medium text-slate-700">
          {es.auth.password}
        </Text>
        <TextInput
          className="mt-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
        />

        {error && <Text className="mt-3 text-sm text-red-600">{error}</Text>}

        <Pressable
          onPress={ingresar}
          disabled={cargando}
          className="mt-6 items-center rounded-lg bg-diprem py-3 active:bg-diprem-oscuro"
        >
          {cargando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-base font-semibold text-white">
              {es.auth.entrar}
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

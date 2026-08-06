import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@diprem/core", "@diprem/api"],
  async redirects() {
    // La ruta vieja /cuentas sigue funcionando para marcadores y enlaces guardados
    return [
      { source: "/cuentas", destination: "/empresas", permanent: true },
      { source: "/cuentas/:id", destination: "/empresas/:id", permanent: true },
    ];
  },
};

export default nextConfig;

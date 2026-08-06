"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProveedorAvisos } from "@/components/avisos";

export function Proveedores({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ProveedorAvisos>{children}</ProveedorAvisos>
    </QueryClientProvider>
  );
}

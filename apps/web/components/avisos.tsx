"use client";

/**
 * Avisos globales (toasts): confirmación visible de cada acción.
 * Uso: const avisar = useAvisar(); … avisar(es.confirmaciones.guardado);
 * Para errores: avisar(mensajeError(e), "error").
 */

import { createContext, useCallback, useContext, useRef, useState } from "react";

type TipoAviso = "ok" | "error";

interface Aviso {
  id: number;
  texto: string;
  tipo: TipoAviso;
}

const ContextoAvisos = createContext<(texto: string, tipo?: TipoAviso) => void>(() => {});

export function useAvisar() {
  return useContext(ContextoAvisos);
}

const DURACION_MS = 3500;

export function ProveedorAvisos({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguienteId = useRef(1);

  const avisar = useCallback((texto: string, tipo: TipoAviso = "ok") => {
    const id = siguienteId.current++;
    setAvisos((previos) => [...previos.slice(-2), { id, texto, tipo }]);
    setTimeout(() => {
      setAvisos((previos) => previos.filter((a) => a.id !== id));
    }, DURACION_MS);
  }, []);

  return (
    <ContextoAvisos.Provider value={avisar}>
      {children}
      {avisos.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-8 print:hidden">
          {avisos.map((aviso) => (
            <div
              key={aviso.id}
              role="status"
              className={`pointer-events-auto max-w-[92vw] truncate rounded-full px-4 py-2 text-sm font-medium shadow-lg ${
                aviso.tipo === "ok"
                  ? "bg-emerald-600 text-white"
                  : "bg-red-600 text-white"
              }`}
            >
              {aviso.texto}
            </div>
          ))}
        </div>
      )}
    </ContextoAvisos.Provider>
  );
}

import { es } from "@diprem/core";

export function PantallaPlaceholder({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{titulo}</h1>
      <div className="mt-6 rounded-xl border border-dashed border-borde bg-superficie p-10 text-center">
        <p className="text-tinta-suave">{descripcion}</p>
        <p className="mt-2 text-sm text-tinta-tenue">{es.comunes.proximamente}</p>
      </div>
    </div>
  );
}

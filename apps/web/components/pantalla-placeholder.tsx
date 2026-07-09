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
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-slate-600">{descripcion}</p>
        <p className="mt-2 text-sm text-slate-400">{es.comunes.proximamente}</p>
      </div>
    </div>
  );
}

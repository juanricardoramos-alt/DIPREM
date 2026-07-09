import { es } from "@diprem/core";
import { PantallaPlaceholder } from "@/components/pantalla-placeholder";

export default function PaginaActividades() {
  return (
    <PantallaPlaceholder
      titulo={es.nav.actividades}
      descripcion={es.fase0.descripcionActividades}
    />
  );
}

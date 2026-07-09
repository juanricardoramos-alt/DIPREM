import { es } from "@diprem/core";
import { PantallaPlaceholder } from "@/components/pantalla-placeholder";

export default function PaginaReportes() {
  return (
    <PantallaPlaceholder
      titulo={es.nav.reportes}
      descripcion={es.fase0.descripcionReportes}
    />
  );
}

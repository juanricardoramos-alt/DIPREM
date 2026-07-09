import { es } from "@diprem/core";
import { PantallaPlaceholder } from "@/components/pantalla-placeholder";

export default function PaginaOportunidades() {
  return (
    <PantallaPlaceholder
      titulo={es.nav.oportunidades}
      descripcion={es.fase0.descripcionOportunidades}
    />
  );
}

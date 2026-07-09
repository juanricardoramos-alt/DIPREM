import { es } from "@diprem/core";
import { PantallaPlaceholder } from "@/components/pantalla-placeholder";

export default function PantallaOportunidades() {
  return (
    <PantallaPlaceholder
      titulo={es.nav.oportunidades}
      descripcion={es.fase0.descripcionOportunidades}
    />
  );
}

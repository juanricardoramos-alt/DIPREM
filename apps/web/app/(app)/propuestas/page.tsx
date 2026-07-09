import { es } from "@diprem/core";
import { PantallaPlaceholder } from "@/components/pantalla-placeholder";

export default function PaginaPropuestas() {
  return (
    <PantallaPlaceholder
      titulo={es.nav.propuestas}
      descripcion={es.fase0.descripcionPropuestas}
    />
  );
}

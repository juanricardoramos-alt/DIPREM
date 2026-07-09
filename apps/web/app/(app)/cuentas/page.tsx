import { es } from "@diprem/core";
import { PantallaPlaceholder } from "@/components/pantalla-placeholder";

export default function PaginaCuentas() {
  return (
    <PantallaPlaceholder
      titulo={es.nav.cuentas}
      descripcion={es.fase0.descripcionCuentas}
    />
  );
}

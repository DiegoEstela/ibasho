import { redirect } from "next/navigation";

/** «Más» ya no es una página: en el teléfono es un menú y en escritorio todo está en la barra lateral. */
export default function Page() {
  redirect("/inicio");
}

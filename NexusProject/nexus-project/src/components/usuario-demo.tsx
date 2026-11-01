"use client";
import { useEffect, useState } from "react";
type Usuario = { userId: string; nombre: string };
export function UsuarioDemo() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [actual, setActual] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let activo = true;
    fetch("/api/demo/sesion", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (activo) {
          setUsuarios(data.usuarios ?? []);
          setActual(data.usuario?.userId ?? "");
        }
      })
      .catch(() => {
        if (activo) setError("No se pudo consultar la sesión demo.");
      });
    return () => {
      activo = false;
    };
  }, []);
  return (
    <div
      style={{ padding: "12px 20px", background: "#eef3f0", color: "#18382c" }}
    >
      <label>
        Usuario de demostración{" "}
        <select
          aria-label="Usuario de demostración"
          value={actual}
          disabled={ocupado}
          onChange={async (e) => {
            setOcupado(true);
            setError("");
            try {
              const r = await fetch("/api/demo/sesion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: e.target.value }),
              });
              if (!r.ok) throw new Error();
              window.location.reload();
            } catch {
              setError("No se pudo cambiar el usuario demo.");
              setOcupado(false);
            }
          }}
        >
          <option value="" disabled>
            Seleccionar usuario
          </option>
          {usuarios.map((u) => (
            <option key={u.userId} value={u.userId}>
              {u.nombre}
            </option>
          ))}
        </select>
      </label>
      <span> · Identidad ficticia, sin autenticación productiva.</span>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

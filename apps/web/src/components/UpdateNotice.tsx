import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { availableVersion, hasLocalDraft } from "../lib/updates";

/** Updating the notification worker does not reload the page or replace its subscription. */
export function UpdateNotice() {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const current = document.querySelector<HTMLMetaElement>('meta[name="bicho-release"]')?.content ?? "";
    let disposed = false;
    let lastCheck = 0;
    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < 15_000) return;
      lastCheck = Date.now();
      const version = await availableVersion(current);
      if (!disposed && version) setAvailable(true);
      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker.getRegistration("/").then((registration) => registration?.update()).catch(() => {});
      }
    };
    void check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    const timer = window.setInterval(check, 60_000);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
    };
  }, []);
  if (!available) return null;
  const update = () => {
    if (client.isMutating() || document.querySelector('[data-bicho-busy="true"]')) {
      setBusy(true);
      return;
    }
    if (hasLocalDraft(document) && !window.confirm("Tienes texto sin guardar. ¿Quieres descartarlo y actualizar BichO?")) return;
    location.reload();
  };
  return <div role="status" className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-fg shadow-lg">
    <span>{busy ? "Espera a que termine la operación y pulsa Actualizar." : "Hay una actualización de BichO."}</span>
    <button type="button" className="shrink-0 underline" onClick={update}>Actualizar</button>
  </div>;
}

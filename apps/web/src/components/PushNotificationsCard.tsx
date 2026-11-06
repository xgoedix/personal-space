import { type ReactNode, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PushStatus } from "@talorys/shared";
import { Send, Trash2 } from "lucide-react";
import { Badge, Button, Card, ErrorNotice, Switch } from "./ui";
import { useApiMutation } from "../hooks/queries";
import { api } from "../lib/api";
import { currentSubscription, disablePush, enablePush, pushBlocker, thisDeviceId } from "../lib/push";
import { relativeTime } from "../lib/utils";
import { useI18n } from "../lib/i18n";

const KEY = ["push"] as const;

const BLOCKER_TEXT = {
  "ios-not-installed": "En iPhone, añade la aplicación a la pantalla de inicio desde Compartir en Safari. Ábrela desde su icono y vuelve aquí.",
  unsupported: "Este navegador no admite notificaciones push.",
  denied: "Las notificaciones están bloqueadas. Actívalas en los ajustes del navegador y recarga.",
} as const;

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-5 text-fg-subtle">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Settings card for Web Push: this device's switch, the device list and a test send. */
export function PushNotificationsCard() {
  const status = useQuery({ queryKey: KEY, queryFn: () => api<PushStatus>("/push") });
  const s = status.data;
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-fg-subtle">Notificaciones</h2>
      <Card>
        <div className="divide-y divide-border">
          {status.error ? (
            <div className="px-5 py-4"><ErrorNotice error={status.error} onRetry={() => void status.refetch()} /></div>
          ) : !s ? null : !s.available ? (
            <Row label="Notificaciones" hint="Las notificaciones aún no están configuradas en esta instalación.">
              <Badge>No disponible</Badge>
            </Row>
          ) : (
            <PushControls status={s} />
          )}
        </div>
      </Card>
    </section>
  );
}

function usePushMutations() {
  const qc = useQueryClient();
  const setStatus = (s: PushStatus) => qc.setQueryData(KEY, s);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  useEffect(() => {
    void currentSubscription().then((s) => setSubscribed(!!s), () => setSubscribed(false));
  }, []);
  const toggle = useApiMutation(
    async (v: { on: boolean; publicKey: string }) => (v.on ? (await enablePush(v.publicKey)).status : disablePush()),
    {
      success: (s) => (s.devices.some((d) => d.id === thisDeviceId()) ? "Notificaciones activadas en este dispositivo" : "Notificaciones desactivadas en este dispositivo"),
      onSuccess: (s, v) => { setStatus(s); setSubscribed(v.on); },
    },
  );
  const remove = useApiMutation((id: string) => api<PushStatus>(`/push/subscriptions/${id}`, { method: "DELETE" }), {
    success: "Dispositivo eliminado",
    onSuccess: setStatus,
  });
  const test = useApiMutation(() => api<{ result: { sent: number; gone: number; failed: number }; status: PushStatus }>("/push/test", { method: "POST" }), {
    success: (r) => (r.result.sent > 0 ? `Prueba enviada a ${r.result.sent} dispositivo(s)` : "No se ha podido contactar con ningún dispositivo"),
    onSuccess: (r) => setStatus(r.status),
  });
  return { subscribed, toggle, remove, test };
}

function PushControls({ status: s }: { status: PushStatus }) {
  const i18n = useI18n();
  const { subscribed, toggle, remove, test } = usePushMutations();
  const blocker = pushBlocker();
  const current = thisDeviceId();
  return (
    <>
      <Row label="Este dispositivo" hint={blocker ? BLOCKER_TEXT[blocker] : "Recibe recordatorios incluso cuando la aplicación esté cerrada."}>
        <Switch
          checked={subscribed === true && !blocker}
          onChange={(on) => toggle.mutate({ on, publicKey: s.public_key! })}
          label="Notificaciones en este dispositivo"
          disabled={!!blocker || subscribed === null || toggle.isPending}
        />
      </Row>
      {s.devices.map((d) => (
        <Row key={d.id} label={d.label} hint={`${d.service} · añadido ${relativeTime(d.created_at, i18n)}${d.failures ? ` · ${d.failures} envíos fallidos` : ""}`}>
          <div className="flex items-center gap-2">
            {d.id === current && <Badge tone="accent">Este dispositivo</Badge>}
            <Button variant="ghost" aria-label={`Eliminar ${d.label}`} onClick={() => remove.mutate(d.id)} disabled={remove.isPending}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </Row>
      ))}
      <Row label="Enviar una prueba" hint={`${s.devices.length} de ${s.max_devices} dispositivos registrados.`}>
        <Button variant="outline" onClick={() => test.mutate(undefined)} disabled={s.devices.length === 0 || test.isPending}>
          <Send className="h-4 w-4" /> Enviar prueba
        </Button>
      </Row>
    </>
  );
}

import guide from "../../../../docs/bicho-v3-atajos.md?raw";
import { Markdown } from "../components/Markdown";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
	ArrowLeft,
	Plus,
	Trash2,
	ArrowUp,
	ArrowDown,
	Pencil,
	Check,
	CalendarDays,
} from "lucide-react";
import type {
	Birthday,
	BichoEvent,
	Checklist,
	ChecklistItem,
	RemoteTokenInfo,
	SavedLink,
} from "@talorys/shared";
import { api } from "../lib/api";
import { useApiMutation, useMemories } from "../hooks/queries";
import { Button, Dialog } from "../components/ui";

export const bichoKeys = [
	["lists"],
	["birthdays"],
	["saved-links"],
	["calendar-events"],
	["automations"],
	["notes"],
	["siri-tokens"],
];
export const useLists = () =>
	useQuery({
		queryKey: ["lists"],
		queryFn: () => api<{ lists: Checklist[] }>("/lists"),
		refetchInterval: 30_000,
	});
export const useBirthdays = () =>
	useQuery({
		queryKey: ["birthdays"],
		queryFn: () => api<{ birthdays: Birthday[]; time: string }>("/birthdays"),
		refetchInterval: 30_000,
	});
export const useSavedLinks = () =>
	useQuery({
		queryKey: ["saved-links"],
		queryFn: () => api<{ links: SavedLink[] }>("/saved-links"),
		refetchInterval: 30_000,
	});
const useEvents = () =>
	useQuery({
		queryKey: ["calendar-events"],
		queryFn: () => api<{ events: BichoEvent[] }>("/calendar/events"),
		refetchInterval: 30_000,
	});
const useSiriTokens = () =>
	useQuery({
		queryKey: ["siri-tokens"],
		queryFn: () => api<{ tokens: RemoteTokenInfo[] }>("/remote/tokens"),
		refetchInterval: 30_000,
	});
function Failure({ error }: { error: unknown }) {
	return error ? (
		<p className="form-error" role="alert">
			{error instanceof Error
				? error.message
				: "No se ha podido completar la operación."}
		</p>
	) : null;
}
function Heading({ title }: { title: string }) {
	return (
		<>
			<Link className="back-link" to="/">
				<ArrowLeft size={16} /> Mi espacio
			</Link>
			<header className="page-heading">
				<h1>{title}</h1>
			</header>
		</>
	);
}

export function ListsPage() {
	const query = useLists();
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const create = useApiMutation(
		() => api("/lists", { method: "POST", body: { name, items: [] } }),
		{
			invalidate: bichoKeys,
			onSuccess: () => {
				setCreating(false);
				setName("");
			},
			quiet: true,
		},
	);
	return (
		<div className="collection-page tone-lavender">
			<div className="section-pigment" aria-hidden="true" />
			<Heading title="Listas" />
			<div className="collection-tools">
				<button type="button" className="dark-button" onClick={() => setCreating(true)}>
					<Plus size={18} /> <span>Nueva lista</span>
				</button>
			</div>
			{query.isPending && <p role="status">Cargando listas…</p>}
			<Failure error={query.error} />
			<div className="editorial-grid bicho-lists">
				{query.data?.lists.map((list) => (
					<ListCard key={list.id} list={list} />
				))}
			</div>
			{query.data?.lists.length === 0 && (
				<p className="space-empty">Crea una lista aquí o cuéntaselo a BichO.</p>
			)}
			<Dialog
				open={creating}
				onClose={() => setCreating(false)}
				title="Nueva lista"
			>
				<form
					className="space-form"
					onSubmit={(e) => {
						e.preventDefault();
						create.mutate(undefined);
					}}
				>
					<label>
						Nombre
						<input
							autoFocus
							required
							maxLength={200}
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</label>
					<Failure error={create.error} />
					<Button type="submit" loading={create.isPending}>
						Crear lista
					</Button>
				</form>
			</Dialog>
		</div>
	);
}
function ListCard({ list }: { list: Checklist }) {
	const [text, setText] = useState("");
	const [edit, setEdit] = useState<ChecklistItem | "name" | null>(null);
	const [value, setValue] = useState("");
	const [remove, setRemove] = useState<ChecklistItem | "list" | null>(null);
	const change = useApiMutation(
		(v: { path: string; method: string; body?: unknown }) => api(v.path, v),
		{
			invalidate: bichoKeys,
			quiet: true,
			onSuccess: () => {
				setEdit(null);
				setRemove(null);
				setText("");
			},
		},
	);
	function reorder(index: number, delta: number) {
		const ids = list.items.map((i) => i.id);
		[ids[index], ids[index + delta]] = [ids[index + delta]!, ids[index]!];
		change.mutate({
			path: `/lists/${list.id}/order`,
			method: "PUT",
			body: { ids },
		});
	}
	return (
		<article className="editorial-card list-card">
			<div className="list-heading">
				<h2>{list.name}</h2>
				<span className="section-hint">
					{list.items.filter((i) => i.completed).length}/{list.items.length}
				</span>
				<button type="button"
					className="round-button"
					aria-label={`Renombrar ${list.name}`}
					onClick={() => {
						setEdit("name");
						setValue(list.name);
					}}
				>
					<Pencil size={15} />
				</button>
				<button type="button"
					className="round-button"
					aria-label={`Eliminar lista ${list.name}`}
					onClick={() => setRemove("list")}
				>
					<Trash2 size={15} />
				</button>
			</div>
			<ul className="checklist">
				{list.items.map((i, index) => (
					<li key={i.id}>
						<button type="button"
							className="task-check"
							disabled={change.isPending}
							role="checkbox"
							aria-checked={i.completed}
							aria-label={i.text}
							onClick={() =>
								change.mutate({
									path: `/list-items/${i.id}`,
									method: "PATCH",
									body: { completed: !i.completed },
								})
							}
						>
							{i.completed && <Check size={16} />}
						</button>
						<span className={i.completed ? "checked-text" : ""}>{i.text}</span>
						<div className="item-actions">
							<button type="button"
								aria-label={`Editar ${i.text}`}
								onClick={() => {
									setEdit(i);
									setValue(i.text);
								}}
							>
								<Pencil size={14} />
							</button>
							<button type="button"
								disabled={index === 0 || change.isPending}
								aria-label={`Subir ${i.text}`}
								onClick={() => reorder(index, -1)}
							>
								<ArrowUp size={14} />
							</button>
							<button type="button"
								disabled={index === list.items.length - 1 || change.isPending}
								aria-label={`Bajar ${i.text}`}
								onClick={() => reorder(index, 1)}
							>
								<ArrowDown size={14} />
							</button>
							<button type="button"
								aria-label={`Eliminar ${i.text}`}
								onClick={() => setRemove(i)}
							>
								<Trash2 size={14} />
							</button>
						</div>
					</li>
				))}
			</ul>
			<form
				className="inline-add"
				onSubmit={(e) => {
					e.preventDefault();
					change.mutate({
						path: `/lists/${list.id}/items`,
						method: "POST",
						body: { items: [text] },
					});
				}}
			>
				<input
					aria-label={`Añadir a ${list.name}`}
					placeholder="Añadir elemento…"
					required
					maxLength={200}
					value={text}
					onChange={(e) => setText(e.target.value)}
				/>
				<button type="submit"
					className="round-button"
					aria-label="Añadir elemento"
					disabled={change.isPending || !text.trim()}
				>
					<Plus size={18} />
				</button>
			</form>
			<Failure error={change.error} />
			<Dialog
				open={!!edit}
				onClose={() => setEdit(null)}
				title={edit === "name" ? "Nombre de la lista" : "Editar elemento"}
			>
				<form
					className="space-form"
					onSubmit={(e) => {
						e.preventDefault();
						if (edit)
							change.mutate({
								path:
									edit === "name"
										? `/lists/${list.id}`
										: `/list-items/${edit.id}`,
								method: "PATCH",
								body: edit === "name" ? { name: value } : { text: value },
							});
					}}
				>
					<label>
						Texto
						<input
							required
							maxLength={200}
							value={value}
							onChange={(e) => setValue(e.target.value)}
						/>
					</label>
					<Failure error={change.error} />
					<Button type="submit" loading={change.isPending}>Guardar</Button>
				</form>
			</Dialog>
			<Dialog
				open={!!remove}
				onClose={() => setRemove(null)}
				title="¿Eliminar?"
				footer={
					<>
						<Button variant="ghost" onClick={() => setRemove(null)}>
							Conservar
						</Button>
						<Button
							loading={change.isPending}
							onClick={() =>
								remove &&
								change.mutate({
									path:
										remove === "list"
											? `/lists/${list.id}`
											: `/list-items/${remove.id}`,
									method: "DELETE",
									body: { confirm: true },
								})
							}
						>
							Eliminar
						</Button>
					</>
				}
			>
				<p>
					{remove === "list"
						? `Se eliminará «${list.name}» con todos sus elementos.`
						: remove?.text}
				</p>
				<Failure error={change.error} />
			</Dialog>
		</article>
	);
}

export function PeoplePage() {
	const query = useBirthdays();
	const memories = useMemories(undefined, "active");
	const [edit, setEdit] = useState<Birthday | "new" | null>(null);
	const [remove, setRemove] = useState<Birthday | null>(null);
	const [calendar, setCalendar] = useState<Birthday | null>(null);
	const del = useApiMutation(
		(id: string) =>
			api(`/birthdays/${id}`, { method: "DELETE", body: { confirm: true } }),
		{ invalidate: bichoKeys, quiet: true, onSuccess: () => setRemove(null) },
	);
	const prepare = useApiMutation(
		(id: string) =>
			api(`/birthdays/${id}/calendar`, {
				method: "POST",
				body: { confirm: true },
			}),
		{
			invalidate: bichoKeys,
			quiet: true,
			onSuccess: () => setCalendar(null),
			success:
				"Fecha preparada en Hoy. Autoriza allí su envío a tu conexión de Siri.",
		},
	);
	return (
		<div className="collection-page tone-yellow">
			<div className="section-pigment" aria-hidden="true" />
			<Heading title="Personas" />
			<div className="collection-tools">
				<button type="button" className="dark-button" onClick={() => setEdit("new")}>
					<Plus size={18} /> <span>Añadir cumpleaños</span>
				</button>
			</div>
			<p className="section-hint">
				Aviso anual a las {query.data?.time ?? "11:00"} · Europe/Madrid. El 29
				de febrero se celebra el 28 en años no bisiestos.
			</p>
			{query.isPending && <p role="status">Cargando personas…</p>}
			<Failure error={query.error} />
			<div className="editorial-grid">
				{query.data?.birthdays.map((b, i) => (
					<article
						className={`editorial-card birthday-card card-${i % 4}`}
						key={b.id}
					>
						<button type="button" className="card-open" onClick={() => setEdit(b)}>
							<span className="card-kicker eyebrow">
								{b.day} / {b.month}
								{b.birth_year ? ` / ${b.birth_year}` : ""}
							</span>
							<h2>{b.name}</h2>
							<p>{b.notes}</p>
							<small>
								{b.next_run
									? `Próximo aviso: ${new Date(b.next_run).toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
									: "Aviso pendiente de activar: abre y guarda el cumpleaños."}
							</small>
						</button>
						<button type="button"
							className="card-delete"
							aria-label={`Eliminar cumpleaños de ${b.name}`}
							onClick={() => setRemove(b)}
						>
							<Trash2 size={15} />
						</button>
						<button type="button"
							className="text-link birthday-export"
							onClick={() => setCalendar(b)}
						>
							<CalendarDays size={15} /> Copiar próxima fecha a Calendario
						</button>
					</article>
				))}
			</div>
			{query.data?.birthdays.length === 0 && (
				<p className="space-empty">
					Cuéntame cuándo cumple años alguien o añádelo aquí.
				</p>
			)}
			{!!memories.data?.memories.some((m) => m.category === "person") && (
				<section className="reminder-section">
					<h2>Otros recuerdos personales</h2>
					{memories.data.memories
						.filter((m) => m.category === "person")
						.map((m) => (
							<p key={m.id}>{m.content}</p>
						))}
					<Link className="text-link" to="/memory">
						Editar recuerdos
					</Link>
					<p className="section-hint">
						Los recuerdos antiguos se conservan. Añade sus cumpleaños con una
						fecha concreta para activar el aviso anual.
					</p>
				</section>
			)}
			{edit && <BirthdayEditor value={edit} onClose={() => setEdit(null)} />}
			<Dialog
				open={!!remove}
				onClose={() => setRemove(null)}
				title="¿Eliminar cumpleaños?"
				footer={
					<>
						<Button variant="ghost" onClick={() => setRemove(null)}>
							Conservar
						</Button>
						<Button
							loading={del.isPending}
							onClick={() => remove && del.mutate(remove.id)}
						>
							Eliminar y cancelar aviso
						</Button>
					</>
				}
			>
				<p>
					Se eliminará el cumpleaños de {remove?.name} y su aviso anual de
					BichO. Una copia ya creada en Apple Calendar se elimina allí.
				</p>
				<Failure error={del.error} />
			</Dialog>
			<Dialog
				open={!!calendar}
				onClose={() => setCalendar(null)}
				title="Copiar próxima fecha"
				footer={
					<Button
						loading={prepare.isPending}
						onClick={() => calendar && prepare.mutate(calendar.id)}
					>
						Preparar esta fecha
					</Button>
				}
			>
				<p>
					Prepara solo el próximo cumpleaños de {calendar?.name} como evento en
					BichO. Después, en Hoy, autoriza una conexión de Siri y ejecuta
					«Calendario de BichO». El aviso anual de BichO sigue funcionando de
					forma independiente.
				</p>
				<Failure error={prepare.error} />
			</Dialog>
		</div>
	);
}
function BirthdayEditor({
	value,
	onClose,
}: {
	value: Birthday | "new";
	onClose: () => void;
}) {
	const old = value === "new" ? null : value;
	const [name, setName] = useState(old?.name ?? "");
	const [day, setDay] = useState(old?.day?.toString() ?? "");
	const [month, setMonth] = useState(old?.month?.toString() ?? "");
	const [year, setYear] = useState(old?.birth_year?.toString() ?? "");
	const [notes, setNotes] = useState(old?.notes ?? "");
	const save = useApiMutation(
		() =>
			api(`/birthdays${old ? `/${old.id}` : ""}`, {
				method: old ? "PATCH" : "POST",
				body: {
					name,
					day: Number(day),
					month: Number(month),
					birth_year: year ? Number(year) : null,
					notes,
				},
			}),
		{ invalidate: bichoKeys, quiet: true, onSuccess: onClose },
	);
	return (
		<Dialog
			open
			onClose={onClose}
			title={old ? "Editar cumpleaños" : "Añadir cumpleaños"}
		>
			<form
				className="space-form"
				onSubmit={(e) => {
					e.preventDefault();
					save.mutate(undefined);
				}}
			>
				<label>
					Persona
					<input
						autoFocus
						required
						maxLength={200}
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				</label>
				<div className="date-parts">
					<label>
						Día
						<input
							required
							inputMode="numeric"
							type="number"
							min="1"
							max="31"
							value={day}
							onChange={(e) => setDay(e.target.value)}
						/>
					</label>
					<label>
						Mes
						<input
							required
							inputMode="numeric"
							type="number"
							min="1"
							max="12"
							value={month}
							onChange={(e) => setMonth(e.target.value)}
						/>
					</label>
					<label>
						Año (opcional)
						<input
							inputMode="numeric"
							type="number"
							min="1"
							max="9999"
							value={year}
							onChange={(e) => setYear(e.target.value)}
						/>
					</label>
				</div>
				<label>
					Notas
					<textarea
						maxLength={2000}
						rows={3}
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
					/>
				</label>
				<Failure error={save.error} />
				<Button type="submit" loading={save.isPending}>Guardar y activar aviso anual</Button>
			</form>
		</Dialog>
	);
}

export function CalendarEvents() {
	const query = useEvents();
	const tokens = useSiriTokens();
	const [selected, setSelected] = useState("");
	const [share, setShare] = useState<BichoEvent | null>(null);
	const [recover, setRecover] = useState<BichoEvent | null>(null);
	const reset = useApiMutation(
		() =>
			api(`/calendar/events/${recover!.id}/reset`, {
				method: "POST",
				body: { confirmed_absent: true },
			}),
		{ invalidate: bichoKeys, quiet: true, onSuccess: () => setRecover(null) },
	);
	const authorize = useApiMutation(
		() =>
			api(`/calendar/events/${share!.id}/authorize`, {
				method: "POST",
				body: { confirmed: true, token_id: selected },
			}),
		{
			invalidate: bichoKeys,
			quiet: true,
			onSuccess: () => setShare(null),
			success:
				"Autorizado para Atajos. Ejecuta «Calendario de BichO» para elegir calendario y crearlo.",
		},
	);
	return (
		<section className="reminder-section">
			<h2>
				<CalendarDays size={18} /> Eventos
			</h2>
			<Failure error={query.error} />
			{query.data?.events.map((e) => (
				<div className="calendar-row" key={e.id}>
					<strong>{e.title}</strong>
					<time>
						{new Date(e.start_at).toLocaleString("es-ES", {
							timeZone: e.timezone,
						})}
					</time>
					<small>
						{e.apple_status === "created"
							? `Creado en Apple Calendar${e.calendar_name ? ` · ${e.calendar_name}` : ""} (confirmado por Atajos)`
							: e.apple_status === "claimed"
								? "Envío pendiente de confirmar: comprueba Calendario antes de repetir."
								: e.apple_status === "error"
									? "Error al crear en Apple Calendar."
									: "Guardado en BichO · Apple Calendar pendiente"}
					</small>
					{e.apple_status === "claimed" && (
						<button type="button" className="text-link" onClick={() => setRecover(e)}>
							Recuperar envío interrumpido
						</button>
					)}
					{e.apple_status !== "created" && (
						<button type="button" className="text-link" onClick={() => setShare(e)}>
							Autorizar envío a Atajos
						</button>
					)}
				</div>
			))}
			{query.data?.events.length === 0 && (
				<p>
					Aún no hay eventos. Cuéntale a BichO la fecha, hora y duración de tu
					cita.
				</p>
			)}
			<Dialog
				open={!!recover}
				onClose={() => setRecover(null)}
				title="Comprueba primero Apple Calendar"
				footer={
					<Button
						loading={reset.isPending}
						onClick={() => reset.mutate(undefined)}
					>
						He comprobado que no existe; permitir reintento
					</Button>
				}
			>
				<p>
					Busca «{recover?.title}» en todos tus calendarios y en la fecha de la
					cita. Continúa solo si no existe y ningún otro dispositivo está
					creando el evento. Si ya existe, ejecuta de nuevo el Atajo para que lo
					encuentre por su marca y confirme el resultado. Reiniciar sin
					comprobarlo puede crear un duplicado.
				</p>
				<Failure error={reset.error} />
			</Dialog>
			<Dialog
				open={!!share}
				onClose={() => setShare(null)}
				title="Autorizar evento para Atajos"
			>
				<form
					className="space-form"
					onSubmit={(e) => {
						e.preventDefault();
						authorize.mutate(undefined);
					}}
				>
					<p>
						La conexión elegida podrá consultar este evento y comunicar el
						resultado. El Atajo te pedirá permiso antes de crearlo en tu
						calendario.
					</p>
					<label>
						Conexión de Siri
						<select
							required
							value={selected}
							onChange={(e) => setSelected(e.target.value)}
						>
							<option value="">Elige una conexión</option>
							{tokens.data?.tokens
								.filter((t) => t.capability === "capture")
								.map((t) => (
									<option key={t.id} value={t.id}>
										{t.name}
									</option>
								))}
						</select>
					</label>
					<Link className="text-link" to="/settings">
						Gestionar conexiones en Ajustes
					</Link>
					<Failure error={authorize.error} />
					<Button type="submit" loading={authorize.isPending} disabled={!selected}>
						Autorizar este evento
					</Button>
				</form>
			</Dialog>
		</section>
	);
}

export function SiriSettings() {
	const tokens = useSiriTokens();
	const [name, setName] = useState("Siri · iPhone");
	const [secret, setSecret] = useState("");
	const [revoke, setRevoke] = useState<RemoteTokenInfo | null>(null);
	const create = useApiMutation(
		async () => {
			await api("/remote/status", { method: "PATCH", body: { enabled: true } });
			return api<{ token: RemoteTokenInfo & { token: string } }>(
				"/remote/tokens",
				{
					method: "POST",
					body: { name, scope: "write", capability: "capture" },
				},
			);
		},
		{
			invalidate: bichoKeys,
			quiet: true,
			onSuccess: (r) => setSecret(r.token.token),
		},
	);
	const remove = useApiMutation(
		(id: string) => api(`/remote/tokens/${id}`, { method: "DELETE" }),
		{
			invalidate: bichoKeys,
			quiet: true,
			onSuccess: () => {
				setRevoke(null);
				setSecret("");
			},
		},
	);
	return (
		<section className="settings-block">
			<h2>Siri y Atajos</h2>
			<p>
				Una conexión de captura puede guardar instrucciones y consultar listas,
				cumpleaños y eventos autorizados. No puede leer tus notas, borrar datos
				ni gestionar ajustes.
			</p>
			<form
				className="space-form"
				onSubmit={(e: FormEvent) => {
					e.preventDefault();
					create.mutate(undefined);
				}}
			>
				<label>
					Nombre de la conexión
					<input
						value={name}
						maxLength={64}
						required
						onChange={(e) => setName(e.target.value)}
					/>
				</label>
				<Button type="submit" loading={create.isPending}>
					Crear conexión de Siri
				</Button>
				<Failure error={create.error} />
			</form>
			{secret && (
				<div className="space-form">
					<label>
						Token privado · solo se muestra esta vez
						<input
							type="password"
							readOnly
							value={secret}
							autoComplete="off"
							aria-label="Token privado de Siri"
						/>
					</label>
					<button type="button"
						className="dark-button"
						onClick={() => void navigator.clipboard.writeText(secret)}
					>
						Copiar token
					</button>
					<button type="button" className="text-link" onClick={() => setSecret("")}>
						Ya lo he guardado en Atajos
					</button>
					<p className="section-hint">
						Pégalo solo en la cabecera Authorization de tu Atajo. No lo
						compartas ni publiques el Atajo con el token incluido.
					</p>
				</div>
			)}
			<Failure error={tokens.error} />
			{tokens.data?.tokens
				.filter((t) => t.capability === "capture")
				.map((t) => (
					<div className="reminder-row" key={t.id}>
						<span>
							{t.name} · …{t.hint}
						</span>
						<button type="button" className="text-link" onClick={() => setRevoke(t)}>
							Revocar
						</button>
					</div>
				))}
			<p>
				<Link className="text-link" to="/settings/siri">
					Configurar «Apunta en Bicho» y Apple Calendar
				</Link>
			</p>
			<p className="section-hint">
				Máximo 20 capturas al día por conexión, además del límite de IA de tu
				instalación. Siri puede pedir desbloquear el iPhone. BichO no abre
				conversaciones en ChatGPT.
			</p>
			<Dialog
				open={!!revoke}
				onClose={() => setRevoke(null)}
				title="¿Revocar esta conexión?"
				footer={
					<Button
						loading={remove.isPending}
						onClick={() => revoke && remove.mutate(revoke.id)}
					>
						Revocar
					</Button>
				}
			>
				<p>
					{revoke?.name} dejará de poder enviar instrucciones inmediatamente.
				</p>
				<Failure error={remove.error} />
			</Dialog>
		</section>
	);
}

export function SiriGuide() {
	return (
		<div className="collection-page siri-guide">
			<Link className="back-link" to="/settings">
				<ArrowLeft size={16} /> Ajustes
			</Link>
			<p>
				Origen de esta instalación: <code>{window.location.origin}</code>
			</p>
			<Markdown content={guide} />
		</div>
	);
}

export function BichoAdvancedSettings() {
	const settings = useQuery({
		queryKey: ["settings"],
		queryFn: () =>
			api<{
				settings: { timezone: string; limits: { maxAiRequestsPerDay: number } };
			}>("/settings").then((r) => r.settings),
	});
	const birthday = useBirthdays();
	const [time, setTime] = useState("");
	const [zone, setZone] = useState("");
	const [file, setFile] = useState<{ name: string; data: unknown } | null>(
		null,
	);
	const [localError, setLocalError] = useState<unknown>(null);
	const [result, setResult] = useState("");
	const saveTime = useApiMutation(
		() =>
			api("/birthday-settings", {
				method: "PATCH",
				body: { time: time || birthday.data?.time || "11:00" },
			}),
		{
			invalidate: bichoKeys,
			quiet: true,
			success: "Hora de los cumpleaños actualizada.",
		},
	);
	const saveZone = useApiMutation(
		() =>
			api("/settings", {
				method: "PATCH",
				body: { timezone: zone || settings.data?.timezone || "Europe/Madrid" },
			}),
		{
			invalidate: [["settings"], ["automations"]],
			quiet: true,
			success: "Zona horaria actualizada.",
		},
	);
	const restore = useApiMutation(
		() =>
			api<{
				summary: {
					lists: number;
					list_items: number;
					birthdays: number;
					notes: number;
					tasks: number;
				};
			}>("/import", { method: "POST", body: file!.data }),
		{
			invalidate: [...bichoKeys, ["settings"], ["tasks"], ["memories"]],
			quiet: true,
			onSuccess: () => {
				setFile(null);
				setResult(
					"Copia importada. Las automatizaciones nuevas quedan pausadas. Revisa tus cumpleaños y guarda los que quieras activar.",
				);
			},
		},
	);
	async function download() {
		try {
			setLocalError(null);
			const backup = await api("/export");
			const url = URL.createObjectURL(
				new Blob([JSON.stringify(backup, null, 2)], {
					type: "application/json",
				}),
			);
			const link = document.createElement("a");
			link.href = url;
			link.download = `bicho-copia-${new Date().toISOString().slice(0, 10)}.json`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (e) {
			setLocalError(e);
		}
	}
	return (
		<div className="collection-page settings-page">
			<Link className="back-link" to="/settings">
				<ArrowLeft size={16} /> Ajustes
			</Link>
			<header className="page-heading">
				<h1>Datos y preferencias</h1>
			</header>
			<section className="settings-block">
				<h2>Copias de seguridad</h2>
				<p>
					La exportación incluye notas, tareas, listas con sus casillas,
					personas, eventos, conversaciones y configuración. No incluye
					contraseña, sesiones, tokens ni claves push. Guarda la copia en un
					lugar privado.
				</p>
				<button type="button" className="dark-button" onClick={() => void download()}>
					Descargar copia JSON
				</button>
				<form className="space-form">
					<label>
						Importar una copia
						<input
							type="file"
							accept="application/json,.json"
							onChange={(e) => {
								const f = e.target.files?.[0];
								e.target.value = "";
								if (!f) return;
								setLocalError(null);
								if (f.size > 10 * 1024 * 1024) {
									setLocalError(new Error("La copia supera 10 MB."));
									return;
								}
								void f
									.text()
									.then((text) =>
										setFile({ name: f.name, data: JSON.parse(text) }),
									)
									.catch(() =>
										setLocalError(
											new Error("No se puede leer esta copia JSON."),
										),
									);
							}}
						/>
					</label>
				</form>
				<Failure error={localError} />
				{result && <p role="status">{result}</p>}
			</section>
			<section className="settings-block">
				<h2>Hora de los cumpleaños</h2>
				<form
					className="space-form"
					onSubmit={(e) => {
						e.preventDefault();
						saveTime.mutate(undefined);
					}}
				>
					<label>
						Europe/Madrid · todos los años
						<input
							type="time"
							required
							value={time || birthday.data?.time || "11:00"}
							onChange={(e) => setTime(e.target.value)}
						/>
					</label>
					<p>
						Se actualizarán los avisos de cumpleaños. Para el 29 de febrero se
						usa el 28 en años no bisiestos.
					</p>
					<Failure error={saveTime.error} />
					<Button type="submit" loading={saveTime.isPending}>Guardar hora</Button>
				</form>
			</section>
			<section className="settings-block">
				<h2>Zona horaria de tareas y citas</h2>
				<form
					className="space-form"
					onSubmit={(e) => {
						e.preventDefault();
						saveZone.mutate(undefined);
					}}
				>
					<label>
						Zona IANA
						<input
							required
							value={zone || settings.data?.timezone || "Europe/Madrid"}
							onChange={(e) => setZone(e.target.value)}
						/>
					</label>
					<p>
						Los cumpleaños siempre usan Europe/Madrid. La IA interpreta «mañana»
						y otras fechas relativas con esta zona.
					</p>
					<Failure error={saveZone.error} />
					<Button type="submit" loading={saveZone.isPending}>Guardar zona</Button>
				</form>
			</section>
			<Dialog
				open={!!file}
				onClose={() => setFile(null)}
				title="¿Importar esta copia?"
				footer={
					<>
						<Button variant="ghost" onClick={() => setFile(null)}>
							Cancelar
						</Button>
						<Button
							loading={restore.isPending}
							onClick={() => restore.mutate(undefined)}
						>
							Importar copia
						</Button>
					</>
				}
			>
				<p>{file?.name}</p>
				<p>
					Se combinará con tus datos actuales: no se borran elementos locales y
					las ediciones más recientes se conservan. No se crean eventos en Apple
					Calendar. Los avisos nuevos se importan pausados para que puedas
					revisarlos.
				</p>
				<Failure error={restore.error} />
			</Dialog>
		</div>
	);
}

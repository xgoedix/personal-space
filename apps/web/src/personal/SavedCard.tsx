import { useState } from "react";
import { ArrowUpRight, Image as ImageIcon, Trash2 } from "lucide-react";
import type { Note } from "@talorys/shared";
import { noteBody, safeLink } from "./model";

export function SavedCard({ note, index, edit, remove }: {
  note: Note; index: number; edit: () => void; remove: () => void;
}) {
  const url = safeLink(noteBody(note));
  const src = `/api/saved-links/${encodeURIComponent(note.id)}/preview?v=${encodeURIComponent(note.updated_at)}`;
  const [failed, setFailed] = useState("");
  return <article className={`editorial-card saved-card card-${index % 4}`}>
    <button type="button" className="card-open" aria-label={`GUARDADO ${note.title}. Editar`} onClick={edit}>
      <span className="saved-picture" aria-hidden="true">
        <ImageIcon size={24} strokeWidth={1.3}/>
        {url && failed !== src && <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)}/>}
      </span>
      <h2>{note.title}</h2>
    </button>
    {url && <a className="saved-domain" href={url} target="_blank" rel="noopener noreferrer">
      {new URL(url).hostname}<ArrowUpRight size={15} aria-hidden="true"/>
    </a>}
    <button type="button" className="card-delete" aria-label={`Eliminar ${note.title}`} onClick={remove}><Trash2 size={15}/></button>
  </article>;
}

"use client";
import { CheckCheck, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { swipeIntent, type ChatMessage } from "@/lib/chat/messages";
import { localeTag } from "@/lib/i18n/config";

type Action = { id:string; kind:"menu" | "swipe" } | null;
export function ChatMessageRow({ message, action, setAction, onEdit, onDelete, busy }: {
  message: ChatMessage; action:Action; setAction:(action:Action)=>void;
  onEdit:()=>void; onDelete:()=>void; busy:boolean;
}) {
  const { t, locale } = useI18n();
  const row = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gesture = useRef<{x:number;y:number;scroll:boolean} | null>(null);
  const [drag, setDrag] = useState(0);
  const open = action?.id === message.id ? action.kind : null;
  const editable = message.own && !message.deletedAt;
  const clearPress = () => clearTimeout(press.current);
  useEffect(() => () => clearTimeout(press.current), []);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!row.current?.contains(event.target as Node)) setAction(null); };
    document.addEventListener("pointerdown", close);
    if (open === "menu") {
      row.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus({preventScroll:true});
      const history = row.current?.closest<HTMLElement>(".chat-live-thread");
      const bounds = row.current?.getBoundingClientRect(), visible = history?.getBoundingClientRect();
      if (history && bounds && visible) {
        if (bounds.bottom > visible.bottom) history.scrollTop += bounds.bottom - visible.bottom;
        else if (bounds.top < visible.top) history.scrollTop -= visible.top - bounds.top;
      }
    }
    return () => document.removeEventListener("pointerdown", close);
  }, [open, setAction]);
  function closeMenu() { setAction(null); menuButton.current?.focus({preventScroll:true}); }
  return <div ref={row} className={"chat-message-row " + (message.own ? "is-own" : "is-peer")}
    onKeyDown={event => { if (event.key === "Escape") { closeMenu(); setDrag(0); } }}>
    <div className="chat-swipe-track">
      {open === "swipe" && editable ? <button className="chat-trash-action" type="button" disabled={busy} aria-label={t("messages.delete")} onClick={onDelete}><Trash2 size={21} /></button> : null}
      <div className={"message-bubble " + (message.own ? "outgoing" : "incoming") + (message.deletedAt ? " is-deleted" : "")}
        style={{transform:`translateX(${open === "swipe" ? -60 : drag}px)`}}
        onContextMenu={event => { if (editable) { event.preventDefault(); setAction({id:message.id,kind:"menu"}); } }}
        onPointerDown={event => {
          if (!editable || busy || event.pointerType === "mouse" || (event.target as Element).closest("button")) return;
          gesture.current = {x:event.clientX,y:event.clientY,scroll:false};
          press.current = setTimeout(() => { gesture.current=null; setAction({id:message.id,kind:"menu"}); }, 500);
        }}
        onPointerMove={event => {
          const start=gesture.current; if (!start) return;
          const dx=event.clientX-start.x,dy=event.clientY-start.y;
          if (Math.abs(dx)>8 || Math.abs(dy)>8) clearPress();
          const intent=swipeIntent(dx,dy);
          if (intent === "scroll") { start.scroll=true; setDrag(0); }
          if (!start.scroll && (intent === "left" || intent === "right")) setDrag(Math.max(-60,Math.min(0,dx)));
        }}
        onPointerUp={event => {
          clearPress(); const start=gesture.current; gesture.current=null; setDrag(0);
          if (!start || start.scroll) return;
          const intent=swipeIntent(event.clientX-start.x,event.clientY-start.y);
          if (intent === "left") setAction({id:message.id,kind:"swipe"});
          if (intent === "right") setAction(null);
        }}
        onPointerCancel={() => { clearPress(); gesture.current=null; setDrag(0); }}>
        <p>{message.deletedAt ? t("messages.deleted") : message.body}</p>
        <div className="chat-message-meta">
          {message.editedAt && !message.deletedAt ? <span>{t("messages.edited")}</span> : null}
          <time dateTime={message.sentAt}>{new Intl.DateTimeFormat(localeTag(locale), {dateStyle:"short",timeStyle:"short"}).format(new Date(message.sentAt))}</time>
          {message.own && message.read ? <CheckCheck size={16} aria-label={t("messages.read")} /> : null}
          {editable ? <button ref={menuButton} type="button" className="chat-message-more" aria-label={t("messages.actions")} aria-haspopup="menu" aria-expanded={open === "menu"}
            disabled={busy} onClick={() => setAction(open === "menu" ? null : {id:message.id,kind:"menu"})}><MoreHorizontal size={19} /></button> : null}
        </div>
      </div>
    </div>
    {open === "menu" && editable ? <div className="chat-message-menu" role="menu" aria-label={t("messages.actions")}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
          const index=items.indexOf(document.activeElement as HTMLButtonElement); items[(index+1)%items.length]?.focus();
        }
      }}>
      <button type="button" role="menuitem" disabled={busy} onClick={onEdit}><Pencil size={18} />{t("messages.edit")}</button>
      <button type="button" role="menuitem" disabled={busy} onClick={onDelete}><Trash2 size={18} />{t("messages.delete")}</button>
    </div> : null}
  </div>;
}

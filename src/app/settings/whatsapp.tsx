"use client";
import { useState, useTransition } from "react";
import { setWhatsAppAction } from "../actions";

export function WhatsAppRow({ phone }: { phone: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (p: string | null) =>
    start(async () => {
      const r = await setWhatsAppAction(p);
      if (r.ok) {
        setEditing(false);
        setError(null);
      } else setError(r.error);
    });
  return (
    <div className="border-b border-surface py-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] text-muted">WhatsApp</span>
        {phone && !editing ? (
          <button onClick={() => save(null)} disabled={pending} className="text-[15px] font-bold text-muted">Turn off</button>
        ) : !editing ? (
          <button onClick={() => setEditing(true)} className="text-[15px] font-bold text-accent">Turn on</button>
        ) : null}
      </div>
      {phone && !editing ? <p className="num mt-1 text-[15px] font-bold">{phone}</p> : null}
      {!phone && !editing ? <p className="mt-1 text-[13px] text-muted">Get a message when a payment fails or your payout is sent.</p> : null}
      {editing ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save(value);
          }}
        >
          <input autoFocus inputMode="tel" aria-label="WhatsApp number" placeholder="+234 803 123 4567" value={value} onChange={(e) => setValue(e.target.value)} className="num h-11 flex-1 rounded-xl border border-[#E4E4E7] px-3 text-[15px]" />
          <button disabled={pending} className="h-11 rounded-xl bg-text px-4 text-[15px] font-bold text-white">Save</button>
        </form>
      ) : null}
      {error ? <p role="alert" className="mt-1 text-[13px] text-failed">{error}</p> : null}
    </div>
  );
}

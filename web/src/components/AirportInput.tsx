import { useId, useMemo, useState } from 'react';
import { airport, flagEmoji, searchAirports } from '../lib/geo.ts';

export function AirportInput({ value, onChange, placeholder }: { value: string; onChange: (iata: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const results = useMemo(() => (open ? searchAirports(text, 6) : []), [text, open]);
  const known = airport(value);

  const pick = (iata: string) => {
    onChange(iata);
    setText(iata);
    setOpen(false);
  };

  return (
    <div className="suggest">
      <input
        className="input code"
        value={text}
        placeholder={placeholder || 'City or code'}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={listId}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setOpen(true);
          if (airport(v)) onChange(v.toUpperCase());
        }}
      />
      {known && !open && <div className="tiny muted" style={{ marginTop: 4 }}>{flagEmoji(known.country)} {known.city} · {known.name}</div>}
      {results.length > 0 && (
        <div className="suggest-list" id={listId} role="listbox">
          {results.map((a) => (
            <button key={a.iata} type="button" role="option" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(a.iata)}>
              <span className="code mono">{a.iata}</span>
              <span className="grow">
                <b className="small">{flagEmoji(a.country)} {a.city}</b>
                <div className="tiny muted">{a.name}</div>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

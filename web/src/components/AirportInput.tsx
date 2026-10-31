import { useId, useMemo, useRef, useState } from 'react';
import { airport, flagEmoji, searchAirports } from '../lib/geo.ts';

export function AirportInput({ value, onChange, placeholder }: { value: string; onChange: (iata: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const results = useMemo(() => (open ? searchAirports(text, 6) : []), [text, open]);
  const known = airport(value);
  const settleTimer = useRef<number>();

  const pick = (iata: string) => {
    clearTimeout(settleTimer.current);
    onChange(iata);
    setText(iata);
    setOpen(false);
  };

  // Typing a city and moving on (without tapping a suggestion) picks the best match.
  const settle = () => {
    setOpen(false);
    const q = text.trim();
    if (!q || airport(value)?.iata === q.toUpperCase()) return;
    const best = searchAirports(q, 1)[0];
    if (best && q.length >= 3) pick(best.iata);
    else onChange('');
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
        enterKeyHint="next"
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          // Enter (the phone keyboard's Go/Next key) or Tab accepts the top suggestion.
          if ((e.key === 'Enter' || e.key === 'Tab') && results.length && !airport(value)) {
            if (e.key === 'Enter') e.preventDefault();
            pick(results[0].iata);
          }
        }}
        onBlur={() => { settleTimer.current = window.setTimeout(settle, 150); }}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setOpen(true);
          onChange(airport(v) ? v.toUpperCase() : '');
        }}
      />
      {known && !open && <div className="tiny muted" style={{ marginTop: 4 }}>{flagEmoji(known.country)} {known.city} · {known.name}</div>}
      {!known && !open && text.trim().length > 0 && <div className="tiny" style={{ marginTop: 4, color: 'var(--bad)' }}>Pick an airport from the list</div>}
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

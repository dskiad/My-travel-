import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MemberCard, ProgramLogo, formatMemberNumber } from '../components/MemberCard.tsx';
import { Barcode } from '../components/Barcode.tsx';
import { ConfirmButton, Field, Sheet, copyText, toast } from '../components/ui.tsx';
import { deleteMembership, moveMembership, saveMembership, useStore } from '../lib/store.ts';
import { KIND_LABEL, PROGRAMS, PROGRAM_BY_ID, programOf, type Program, type ProgramKind } from '../lib/loyalty.ts';
import type { Membership } from '../lib/types.ts';

type Editing = Partial<Membership> & { programId: string };

export default function Wallet() {
  const { memberships, settings } = useStore();
  const [params, setParams] = useSearchParams();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [query, setQuery] = useState('');
  const showing = memberships.find((m) => m.id === params.get('show'));
  const show = (id?: string) => setParams(id ? { show: id } : {}, { replace: true });

  const byKind = useMemo(() => {
    const groups = new Map<ProgramKind, Membership[]>();
    for (const m of memberships) {
      const k = programOf(m).kind;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(m);
    }
    return [...groups.entries()];
  }, [memberships]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROGRAMS.filter((p) => !q || `${p.name} ${p.brand} ${p.airlines?.join(' ')}`.toLowerCase().includes(q));
  }, [query]);

  const startNew = (p: Program | null) => {
    setPicking(false);
    setEditing({
      programId: p ? p.id : 'custom', holderName: settings.name, memberNumber: '',
      barcode: p?.kind === 'hotel' || p?.kind === 'lounge' ? 'qr' : 'code128',
    });
  };

  return (
    <main className="page">
      <header className="page-header">
        <div><div className="eyebrow">Wallet</div><h1>Membership cards</h1></div>
        <button className="btn accent" onClick={() => { setQuery(''); setPicking(true); }}>+ Add</button>
      </header>

      {memberships.length === 0 ? (
        <div className="card empty">
          <div className="big">💳</div>
          <h2>All your member numbers, one tap away</h2>
          <p className="muted small">Add frequent-flyer, hotel, car-rental and lounge memberships. Show the card at check-in or the lounge desk, copy the number into a booking, and see which card to use on each flight.</p>
          <button className="btn primary" onClick={() => setPicking(true)}>Add your first card</button>
        </div>
      ) : (
        byKind.map(([kind, list]) => (
          <section key={kind} className="section">
            <div className="section-title"><h2>{KIND_LABEL[kind]}</h2><span className="small muted">{list.length}</span></div>
            <div className="wallet-stack">
              {list.map((m) => <MemberCard key={m.id} membership={m} onClick={() => show(m.id)} />)}
            </div>
          </section>
        ))
      )}

      {picking && (
        <Sheet title="Add a membership" onClose={() => setPicking(false)}>
          <input className="input" autoFocus placeholder="Search Aegean, Marriott, Priority Pass…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="stack" style={{ marginTop: 12 }}>
            {(Object.keys(KIND_LABEL) as ProgramKind[]).map((kind) => {
              const items = filtered.filter((p) => p.kind === kind);
              if (!items.length) return null;
              return (
                <div key={kind}>
                  <div className="month" style={{ marginTop: 6 }}>{KIND_LABEL[kind]}</div>
                  <div className="stack" style={{ gap: 8 }}>
                    {items.map((p) => (
                      <button key={p.id} className="flight-row" style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => startNew(p)}>
                        <ProgramLogo program={p} className="logo" />
                        <div className="r-main"><b>{p.name}</b><div className="r-sub">{[p.brand, p.alliance].filter(Boolean).join(' · ')}</div></div>
                        <span className="faint">＋</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <button className="btn" onClick={() => startNew(null)}>Something else — create a custom card</button>
          </div>
        </Sheet>
      )}

      {editing && <EditSheet value={editing} onClose={() => setEditing(null)} />}

      {showing && !editing && (
        <Sheet title={programOf(showing).name} onClose={() => show()}>
          <div className="show-card">
            <MemberCard membership={showing} />
            {showing.barcode !== 'none' && <Barcode value={showing.memberNumber} format={showing.barcode} />}
            <div className="mono" style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '.08em' }}>{formatMemberNumber(showing.memberNumber)}</div>
            {showing.expiry && <p className="small muted">Valid until {showing.expiry}</p>}
            {showing.notes && <p className="small muted">{showing.notes}</p>}
            <div className="grid-2" style={{ width: '100%' }}>
              <button className="btn primary" onClick={() => copyText(showing.memberNumber.replace(/\s+/g, ''), 'Member number copied')}>Copy number</button>
              <button className="btn" onClick={() => setEditing(showing)}>Edit</button>
              <button className="btn sm" onClick={() => moveMembership(showing.id, -1)}>↑ Move up</button>
              <button className="btn sm" onClick={() => moveMembership(showing.id, 1)}>↓ Move down</button>
            </div>
            <ConfirmButton label="Delete card" confirmLabel="Tap again to delete this card" onConfirm={() => { deleteMembership(showing.id); show(); toast('Card deleted'); }} />
          </div>
        </Sheet>
      )}
    </main>
  );
}

function EditSheet({ value, onClose }: { value: Editing; onClose: () => void }) {
  const [m, setM] = useState<Editing>(value);
  const set = (patch: Partial<Membership>) => setM((x) => ({ ...x, ...patch }));
  const program = PROGRAM_BY_ID[m.programId] as Program | undefined;
  const preview = { id: 'preview', createdAt: '', barcode: 'none', memberNumber: '', ...m } as Membership;

  const save = () => {
    if (!m.memberNumber?.trim()) return;
    saveMembership({ ...m, memberNumber: m.memberNumber.trim(), barcode: m.barcode || 'code128' } as Membership);
    toast(value.id ? 'Card updated' : 'Card added to your wallet');
    onClose();
  };

  return (
    <Sheet title={value.id ? 'Edit card' : 'New card'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <MemberCard membership={{ ...preview, memberNumber: m.memberNumber || '0000 0000' }} />
        {!program && (
          <div className="grid-2">
            <Field label="Programme name"><input className="input" value={m.customName || ''} onChange={(e) => set({ customName: e.target.value })} required /></Field>
            <Field label="Card colour"><input className="input" type="color" value={m.customColor || '#334155'} onChange={(e) => set({ customColor: e.target.value })} style={{ padding: 4 }} /></Field>
          </div>
        )}
        <Field label="Member number">
          <input className="input code" inputMode="text" autoFocus value={m.memberNumber || ''} onChange={(e) => set({ memberNumber: e.target.value })} required />
        </Field>
        <div className="grid-2">
          <Field label="Status / tier">
            {program?.tiers ? (
              <select className="input" value={m.tier || ''} onChange={(e) => set({ tier: e.target.value })}>
                <option value="">—</option>{program.tiers.map((t) => <option key={t}>{t}</option>)}
              </select>
            ) : <input className="input" value={m.tier || ''} onChange={(e) => set({ tier: e.target.value })} placeholder="Gold" />}
          </Field>
          <Field label="Valid until"><input className="input" type="month" value={m.expiry || ''} onChange={(e) => set({ expiry: e.target.value })} /></Field>
          <Field label="Name on card"><input className="input" value={m.holderName || ''} onChange={(e) => set({ holderName: e.target.value })} /></Field>
          <Field label="Barcode at the desk">
            <select className="input" value={m.barcode || 'code128'} onChange={(e) => set({ barcode: e.target.value as Membership['barcode'] })}>
              <option value="code128">Barcode</option><option value="qr">QR code</option><option value="none">None</option>
            </select>
          </Field>
        </div>
        <Field label="Notes"><input className="input" value={m.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="PIN hint, partner number, guest allowance…" /></Field>
        <button className="btn primary">{value.id ? 'Save changes' : 'Add to wallet'}</button>
      </form>
    </Sheet>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MemberCard, ProgramLogo, formatMemberNumber } from '../components/MemberCard.tsx';
import { Barcode } from '../components/Barcode.tsx';
import { ConfirmButton, Field, Sheet, copyText, toast } from '../components/ui.tsx';
import { deleteMembership, moveMembership, saveMembership, useStore } from '../lib/store.ts';
import { KIND_LABEL, PROGRAMS, PROGRAM_BY_ID, programOf, type Program, type ProgramKind } from '../lib/loyalty.ts';
import type { Membership } from '../lib/types.ts';
import { matchProgram } from '../lib/loyalty.ts';
import { readCards, type CardDraft } from '../lib/api.ts';
import { GmailPicker } from '../components/GmailPicker.tsx';
import { emailText, gmailAvailable, gmailErrorText, LOYALTY_QUERY } from '../lib/gmail.ts';


type Editing = Partial<Membership> & { programId: string };

export default function Wallet() {
  const { memberships, settings } = useStore();
  const [params, setParams] = useSearchParams();
  const [picking, setPicking] = useState(false);
  const [importing, setImporting] = useState(false);
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
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <button className="btn sm" onClick={() => setImporting(true)}>⬇ Import</button>
          <button className="btn accent sm" onClick={() => { setQuery(''); setPicking(true); }}>+ Add</button>
        </div>
      </header>

      {memberships.length === 0 ? (
        <div className="card empty">
          <div className="big">💳</div>
          <h2>All your member numbers, one tap away</h2>
          <p className="muted small">Add frequent-flyer, hotel, car-rental and lounge memberships. Show the card at check-in or the lounge desk, copy the number into a booking, and see which card to use on each flight.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => setImporting(true)}>Import from Google Wallet or Gmail</button>
            <button className="btn" onClick={() => setPicking(true)}>Add by hand</button>
          </div>
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
      {importing && <ImportSheet existing={memberships} holder={settings.name} onClose={() => setImporting(false)} />}

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

interface Found extends CardDraft { programId: string; tierName: string; duplicate: boolean }

/** Bring cards in from Wallet screenshots or programme emails in Gmail. */
function ImportSheet({ existing, holder, onClose }: { existing: Membership[]; holder: string; onClose: () => void }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [gmail, setGmail] = useState(false);
  useEffect(() => { gmailAvailable().then(setGmail); }, []);

  const known = new Set(existing.map((m) => `${m.programId}|${m.memberNumber.replace(/\s+/g, '')}`));
  const review = (cards: CardDraft[]) => {
    const list = cards.map((c) => {
      const p = matchProgram(c.program, c.company);
      const programId = p?.id || 'custom';
      const tierName = (p?.tiers?.find((t) => c.tier && c.tier.toLowerCase().includes(t.toLowerCase())) || c.tier || '').trim();
      return { ...c, programId, tierName, duplicate: known.has(`${programId}|${c.memberNumber.replace(/\s+/g, '')}`) };
    });
    setFound(list);
    setPicked(new Set(list.map((c, i) => (c.duplicate ? -1 : i)).filter((i) => i >= 0)));
    if (!list.length) setError('No membership numbers found there. Try a clearer screenshot of the card.');
  };

  const run = async (label: string, job: () => Promise<CardDraft[]>) => {
    setError(''); setBusy(label);
    try { review(await job()); } catch (e) {
      setError((e as { code?: string }).code ? gmailErrorText(e) : (e as Error).message);
    } finally { setBusy(''); }
  };

  const save = () => {
    let n = 0;
    found?.forEach((c, i) => {
      if (!picked.has(i)) return;
      saveMembership({
        programId: c.programId,
        customName: c.programId === 'custom' ? (c.program || c.company || 'Membership') : undefined,
        memberNumber: c.memberNumber.trim(),
        tier: c.tierName || undefined,
        holderName: c.holderName || holder || undefined,
        expiry: /^\d{4}-\d{2}$/.test(c.expiry) ? c.expiry : undefined,
        barcode: 'code128',
      } as Membership);
      n++;
    });
    toast(`${n} card${n === 1 ? '' : 's'} added to your wallet`);
    onClose();
  };

  return (
    <Sheet title="Import membership cards" onClose={onClose}>
      {!found ? (
        <div className="stack">
          <label className="dropzone">
            <span style={{ fontSize: '2rem' }}>📱</span>
            <b>{busy || 'Upload card screenshots'}</b>
            <span className="small muted">Google Wallet, Apple Wallet or airline app · you can pick several</span>
            <input type="file" accept="image/*" multiple hidden disabled={!!busy}
              onChange={(e) => {
                const files = [...(e.target.files || [])].slice(0, 10);
                e.target.value = '';
                if (files.length) run(`Reading ${files.length} card${files.length === 1 ? '' : 's'}…`, () => readCards({ files }));
              }} />
          </label>
          <details className="how">
            <summary>How to get them from Google Wallet</summary>
            <ol><li>Open Google Wallet and tap a miles or membership card.</li><li>Take a screenshot (repeat for each card).</li><li>Upload them all here at once.</li></ol>
            <p className="tiny" style={{ marginTop: 6 }}>Google doesn’t let other apps read your Wallet directly. Bank and credit cards are ignored.</p>
          </details>
          {gmail && (
            <div className="stack" style={{ marginTop: 6 }}>
              <h3>Or find them in Gmail</h3>
              <p className="small muted">Welcome emails and miles statements usually show your member number.</p>
              <GmailPicker query={LOYALTY_QUERY} searchLabel="Find my miles & membership emails" pickLabel="Read" busy={busy}
                onPick={(t) => run('Reading the email…', async () => readCards({ text: (await emailText(t.threadId)).text }))} />
            </div>
          )}
          {error && <div className="notice error small" role="alert">{error}</div>}
        </div>
      ) : (
        <div className="stack">
          {found.map((c, i) => {
            const p = PROGRAM_BY_ID[c.programId] as Program | undefined;
            return (
              <label key={i} className="flight-row review-item">
                <input type="checkbox" checked={picked.has(i)} onChange={() => setPicked((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
                {p ? <ProgramLogo program={p} className="logo" /> : <span className="logo"><b>{(c.program || '?').slice(0, 2)}</b></span>}
                <div className="r-main">
                  <b className="small">{p?.name || c.program || c.company}</b>
                  <div className="mono small">{formatMemberNumber(c.memberNumber)}</div>
                  <div className="r-sub">{[c.tierName, c.duplicate && 'already in your wallet'].filter(Boolean).join(' · ')}</div>
                </div>
              </label>
            );
          })}
          <div className="row">
            <button className="btn" onClick={() => setFound(null)}>Back</button>
            <button className="btn primary grow" disabled={!picked.size} onClick={save}>Add {picked.size} to wallet</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

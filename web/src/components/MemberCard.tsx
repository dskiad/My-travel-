import { useState } from 'react';
import { logoUrls } from '../lib/airlines.ts';
import { programOf, type Program } from '../lib/loyalty.ts';
import type { Membership } from '../lib/types.ts';
import { IS_ARTIFACT } from '../lib/platform.ts';
import { embeddedLogo } from '../lib/logos.ts';
import { tierLook } from '../lib/loyalty.ts';

export function formatMemberNumber(n: string) {
  const clean = n.replace(/\s+/g, '');
  return /^\d{8,}$/.test(clean) ? clean.replace(/(.{4})(?=.)/g, '$1 ') : n;
}

function programLogos(p: Program): string[] {
  if (IS_ARTIFACT) return [embeddedLogo(p.airlines?.[0])].filter((u): u is string => !!u);
  const urls = p.airlines?.length ? logoUrls(p.airlines[0]) : [];
  if (p.domain) urls.push(`https://www.google.com/s2/favicons?domain=${p.domain}&sz=128`);
  return urls;
}

export function ProgramLogo({ program, className = 'mc-logo' }: { program: Program; className?: string }) {
  const urls = programLogos(program);
  const [i, setI] = useState(0);
  return (
    <span className={className}>
      {i < urls.length
        ? <img src={urls[i]} alt="" loading="lazy" onError={() => setI(i + 1)} />
        : <b style={{ color: program.color, fontFamily: 'var(--font-display)' }}>{program.name.slice(0, 2).toUpperCase()}</b>}
    </span>
  );
}

export function MemberCard({ membership, onClick }: { membership: Membership; onClick?: () => void }) {
  const p = programOf(membership);
  // Elite cards look like the real thing: gold, silver, platinum, diamond or black.
  const look = tierLook(membership.tier);
  const ink = look?.ink || p.ink || '#fff';
  return (
    <button
      className={`member-card${look ? ` tier-${look.id}` : ''}`}
      onClick={onClick}
      style={{ background: look?.background || `linear-gradient(135deg, ${p.color}, color-mix(in srgb, ${p.color} 55%, #000))`, color: ink }}
    >
      <div className="mc-top">
        <ProgramLogo program={p} />
        <div style={{ minWidth: 0 }}>
          <div className="mc-name">{p.name}</div>
          <div className="mc-brand">{[p.brand, p.alliance].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="mc-number">{formatMemberNumber(membership.memberNumber)}</div>
      <div className="mc-foot">
        <span>{membership.holderName || ' '}</span>
        {membership.tier && <span className="mc-tier">{membership.tier}</span>}
      </div>
    </button>
  );
}

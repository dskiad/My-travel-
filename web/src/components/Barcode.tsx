import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

/** Scannable member number for lounge desks, hotel and rental counters. */
export function Barcode({ value, format }: { value: string; format: 'code128' | 'qr' }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    if (format === 'qr') {
      QRCode.toString(value, { type: 'svg', margin: 1, width: 240 }).then(setQr).catch(() => setError(true));
    } else if (svgRef.current) {
      try {
        JsBarcode(svgRef.current, value, { format: 'CODE128', displayValue: false, height: 90, margin: 0, width: 2.2 });
      } catch {
        setError(true);
      }
    }
  }, [value, format]);

  if (error) return <p className="small muted">This number can't be shown as a barcode.</p>;
  return (
    <div className="barcode-box">
      {format === 'qr'
        ? <div style={{ width: 240 }} dangerouslySetInnerHTML={{ __html: qr }} />
        : <svg ref={svgRef} aria-label={`Barcode for ${value}`} />}
    </div>
  );
}

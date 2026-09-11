import { LOGO_BLACK_DATA_URI } from '@/lib/og/serverAssets';

export function SharingBrand({ size = 24 }: { size?: number }) {
    // Match the mark's stroke to the wordmark; crop only transparent PNG padding.
    const scale = size / (0.954 * 0.477 * 1354);
    return <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.42, fontSize: size, fontFamily: 'Relative Book Pro', fontWeight: 400 }}>
        <div style={{ display: 'flex', position: 'relative', overflow: 'hidden', width: 777 * scale, height: 646 * scale }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_BLACK_DATA_URI} width={1606 * scale} height={1354 * scale} alt="" style={{ position: 'absolute', left: -414 * scale, top: -354 * scale }} />
        </div>
        <span>OpenCouncil</span>
    </div>;
}

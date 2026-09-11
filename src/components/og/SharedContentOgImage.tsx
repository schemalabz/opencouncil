import { LOGO_BLACK_DATA_URI } from '@/lib/og/serverAssets';
import { truncatePreview } from '@/lib/sharing/excerptSelector';

interface Props {
    label: string; title: string; text: string; attribution?: string; context?: string; administrativeBody?: string; quote?: boolean;
    passages?: { speakerName: string; text: string }[];
    additionalSpeakers?: string;
    speakerImage?: string | null;
}

// Match the mark stroke to the brand wordmark, as documented by layout/Logo.
const WORDMARK_SIZE = 24;
const LOGO_SCALE = WORDMARK_SIZE / (0.954 * 0.477 * 1354);

export function SharedContentOgImage({ label, title, text, attribution, context, administrativeBody, quote, passages, additionalSpeakers, speakerImage }: Props) {
    const preview = truncatePreview(text.replace(/\s+/g, ' ').trim(), 310);
    return <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '44px 58px', background: '#faf8f5', color: '#24211e', fontFamily: 'Inter' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 26, borderBottom: '1px solid #ded8d1' }}>
            <span style={{ display: 'flex', color: '#ae3904', fontSize: 19, fontWeight: 600 }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: WORDMARK_SIZE, fontFamily: 'Relative Book Pro', fontWeight: 400 }}>
                <div style={{ display: 'flex', position: 'relative', overflow: 'hidden', width: 777 * LOGO_SCALE, height: 646 * LOGO_SCALE }}>
                    {/* Crop only transparent padding; preserve the PNG's natural geometry. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={LOGO_BLACK_DATA_URI} width={1606 * LOGO_SCALE} height={1354 * LOGO_SCALE} alt="" style={{ position: 'absolute', left: -414 * LOGO_SCALE, top: -354 * LOGO_SCALE }} />
                </div>
                <span>OpenCouncil</span>
            </div>
        </div>
        <div style={{ display: 'flex', marginTop: 26, fontSize: 23, color: '#6b6056', lineHeight: 1.35 }}>{truncatePreview(title, 95)}</div>
        {passages ? <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 16, padding: '12px 0' }}>
            {passages.slice(0, 2).map((passage, index) => <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 600, color: '#6b6056' }}>{truncatePreview(passage.speakerName, 80)}</span>
                <span style={{ fontSize: 27, fontWeight: 500, lineHeight: 1.3 }}>{`«${truncatePreview(passage.text, 120)}»`}</span>
            </div>)}
            {additionalSpeakers && <span style={{ fontSize: 16, color: '#6b6056' }}>{additionalSpeakers}</span>}
        </div> : <div style={{ display: 'flex', flex: 1, alignItems: 'center', padding: '18px 0', fontSize: preview.length > 210 ? 32 : 39, fontWeight: 500, lineHeight: 1.35 }}>{quote ? `«${preview}»` : preview}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, borderTop: '1px solid #ded8d1', paddingTop: 21 }}>
            {attribution && <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 21, fontWeight: 600 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {speakerImage && <img src={speakerImage} alt="" width={42} height={42} style={{ borderRadius: 21, objectFit: 'cover' }} />}
                {truncatePreview(attribution, 100)}
            </div>}
            {administrativeBody && <span style={{ display: 'flex', fontSize: 18, fontWeight: 500, color: '#4b423a' }}>{truncatePreview(administrativeBody, 110)}</span>}
            {context && <span style={{ display: 'flex', fontSize: 17, color: '#6b6056' }}>{truncatePreview(context, 120)}</span>}
        </div>
    </div>;
}

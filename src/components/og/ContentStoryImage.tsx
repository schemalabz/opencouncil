import { storyPreview } from '@/lib/sharing/story';
import { SharingBrand } from './SharingBrand';

export interface ContentStoryImageProps {
    kind: 'subject' | 'contribution' | 'excerpt';
    label: string;
    title: string;
    text?: string;
    speakerName?: string;
    speakerImage?: string | null;
    passages?: { speakerName: string; text: string }[];
    city: string;
    administrativeBody?: string;
    date: string;
    warning?: string;
    summaryLabel: string;
    previewLabel: string;
}

export function ContentStoryImage({ kind, label, title, text, speakerName, speakerImage, passages, city, administrativeBody, date, warning, summaryLabel, previewLabel }: ContentStoryImageProps) {
    const groups = passages?.slice(0, 2) ?? [];
    const multiple = groups.length > 1;
    const summary = text ? storyPreview(text, kind === 'subject' ? 240 : 370) : '';
    return <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '156px 88px 240px', background: '#faf8f5', color: '#24211e', fontFamily: 'Inter' }}>
        <SharingBrand size={42} />
        <div style={{ display: 'flex', marginTop: 65, paddingTop: 28, borderTop: '2px solid #ded8d1', color: '#b83d05', fontSize: 25, fontWeight: 600 }}>{label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', padding: '38px 0', gap: 30 }}>
            {kind === 'subject' ? <div style={{ display: 'flex', fontSize: title.length > 95 ? 57 : 68, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-1.7px' }}>{storyPreview(title, 170)}</div>
                : <div style={{ display: 'flex', color: '#70665c', fontSize: 30, lineHeight: 1.4 }}>{storyPreview(title, 115)}</div>}
            {kind === 'contribution' && <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {speakerImage && <img src={speakerImage} alt="" width={94} height={94} style={{ borderRadius: 47, objectFit: 'cover' }} />}
                <span style={{ display: 'flex', flex: 1, fontSize: (speakerName?.length ?? 0) > 45 ? 51 : 62, lineHeight: 1.17, fontWeight: 600, letterSpacing: '-1px' }}>{storyPreview(speakerName ?? '', 85)}</span>
            </div>}
            {kind === 'excerpt' ? <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                {groups.map((group, index) => {
                    const quote = storyPreview(group.text, multiple ? 180 : 420);
                    return <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 19 }}>
                        <div style={{ display: 'flex', fontSize: multiple ? 39 : quote.length > 240 ? 43 : 54, fontWeight: 500, lineHeight: 1.32, letterSpacing: '-0.7px' }}>{`«${quote}»`}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#70665c', fontSize: 26, lineHeight: 1.35 }}>
                            <div style={{ width: 28, height: 2, background: '#fc550a', flexShrink: 0 }} />
                            <span style={{ display: 'flex', flex: 1 }}>{storyPreview(group.speakerName, 70)}</span>
                        </div>
                    </div>;
                })}
            </div> : summary && <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                <span style={{ fontSize: 22, color: '#70665c' }}>{summaryLabel}</span>
                <div style={{ display: 'flex', fontSize: kind === 'subject' ? 41 : summary.length > 300 ? 44 : 51, lineHeight: 1.35, letterSpacing: '-0.5px' }}>{summary}</div>
            </div>}
            {warning && <div style={{ display: 'flex', padding: '20px 24px', background: '#f8ece1', borderRadius: 12, color: '#8b350e', fontSize: 24, lineHeight: 1.45 }}>{warning}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', paddingTop: 30, borderTop: '2px solid #ded8d1', gap: 12 }}>
            <span style={{ display: 'flex', fontSize: 29, fontWeight: 600 }}>{storyPreview(city, 65)}</span>
            {administrativeBody && <span style={{ display: 'flex', fontSize: 25, lineHeight: 1.35, color: '#554b42' }}>{storyPreview(administrativeBody, 100)}</span>}
            <span style={{ fontSize: 23, color: '#70665c' }}>{date}</span>
            <span style={{ display: 'flex', fontSize: 21, lineHeight: 1.4, color: '#70665c', marginTop: 18 }}>{previewLabel}</span>
        </div>
    </div>;
}

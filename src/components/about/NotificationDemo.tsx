import { Check, CheckCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

/**
 * WhatsApp mobile chat mock — styled to closely match the real WhatsApp UI.
 * Uses the actual WhatsApp color palette and bubble shapes with CSS tails.
 */
export default function NotificationDemo() {
    const t = useTranslations('about.demos.notification')

    return (
        <div className="w-full max-w-sm mx-auto overflow-hidden rounded-2xl shadow-lg border border-black/10">
            {/* Status bar (phone) */}
            <div className="flex items-center justify-between px-4 py-1 bg-[#075E54] text-white text-[10px]">
                <span>09:15</span>
                <div className="flex items-center gap-1">
                    {/* Signal bars */}
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="white"><rect x="0" y="7" width="2" height="3" /><rect x="3" y="5" width="2" height="5" /><rect x="6" y="2" width="2" height="8" /><rect x="9" y="0" width="2" height="10" opacity="0.4" /></svg>
                    {/* WiFi */}
                    <svg width="12" height="10" viewBox="0 0 16 12" fill="white"><path d="M8 10.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM8 7c1.7 0 3.2.7 4.3 1.8l-1.4 1.4C10 9.4 9 9 8 9s-2 .4-2.8 1.2L3.7 8.8C4.8 7.7 6.3 7 8 7zm0-3.5c2.7 0 5.1 1.1 6.9 2.8L13.5 7.7C12 6.3 10.1 5.5 8 5.5S4 6.3 2.5 7.7L1.1 6.3C2.9 4.6 5.3 3.5 8 3.5z" /></svg>
                    {/* Battery */}
                    <svg width="18" height="10" viewBox="0 0 20 10" fill="white"><rect x="0" y="1" width="16" height="8" rx="1" stroke="white" strokeWidth="1" fill="none" /><rect x="1.5" y="2.5" width="10" height="5" rx="0.5" fill="white" /><rect x="17" y="3" width="2" height="4" rx="0.5" /></svg>
                </div>
            </div>

            {/* WhatsApp header */}
            <div className="flex items-center gap-2.5 px-3 py-2" style={{ backgroundColor: '#075E54' }}>
                {/* Back arrow */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
                {/* Avatar — OpenCouncil logo */}
                <div className="h-9 w-9 rounded-full bg-white flex-shrink-0 overflow-hidden">
                    <Image src="/logo.png" alt="OpenCouncil" width={36} height={36} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-white truncate">OpenCouncil</p>
                    <p className="text-[11px] text-white/70">online</p>
                </div>
                {/* Header icons */}
                <div className="flex items-center gap-4">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M15.9 14.3H15l-.3-.3c1-1.1 1.6-2.7 1.6-4.3 0-3.7-3-6.7-6.7-6.7S3 6 3 9.7s3 6.7 6.7 6.7c1.6 0 3.2-.6 4.3-1.6l.3.3v.8l5.1 5.1 1.5-1.5-5-5.2zm-6.2 0c-2.6 0-4.6-2.1-4.6-4.6s2.1-4.6 4.6-4.6 4.6 2.1 4.6 4.6-2 4.6-4.6 4.6z" /></svg>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
                </div>
            </div>

            {/* Chat area with WhatsApp wallpaper pattern */}
            <div
                className="px-2.5 py-3 space-y-1.5 min-h-[220px]"
                style={{
                    backgroundColor: '#ECE5DD',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9c2b7' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
            >
                {/* Date chip */}
                <div className="flex justify-center mb-1">
                    <span className="text-[11px] text-[#667781] bg-white/90 rounded-lg px-3 py-1 shadow-sm">
                        {t('today')}
                    </span>
                </div>

                {/* Incoming message — OpenCouncil notification */}
                <div className="flex justify-start">
                    <div className="relative max-w-[88%] rounded-lg shadow-sm px-2.5 pt-1.5 pb-1" style={{ backgroundColor: '#FFFFFF' }}>
                        {/* Tail */}
                        <div className="absolute -left-2 top-0 w-0 h-0 border-t-[8px] border-t-white border-r-[8px] border-r-transparent" />
                        {/* Sender name */}
                        <p className="text-[12.5px] font-medium mb-0.5" style={{ color: '#075E54' }}>
                            {t('senderName')}
                        </p>
                        {/* Message body */}
                        <p className="text-[14px] text-[#111B21] leading-[19px]">
                            {t('messageBody')}
                        </p>
                        <div className="mt-1.5 space-y-1">
                            <div className="flex items-start gap-1.5">
                                <span className="text-[13px] leading-[18px]">📍</span>
                                <p className="text-[13.5px] text-[#111B21] leading-[18px]">
                                    <span className="font-medium">{t('item1Title')}</span>
                                    <span className="text-[#667781]"> — {t('item1Location')}</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-1.5">
                                <span className="text-[13px] leading-[18px]">🚗</span>
                                <p className="text-[13.5px] text-[#111B21] leading-[18px]">
                                    <span className="font-medium">{t('item2Title')}</span>
                                    <span className="text-[#667781]"> — {t('item2Location')}</span>
                                </p>
                            </div>
                        </div>
                        {/* Link preview */}
                        <p className="text-[13px] mt-1.5 text-[#027eb5] underline-offset-2">
                            {t('viewSummaries')}
                        </p>
                        {/* Timestamp + read receipt */}
                        <div className="flex justify-end items-center gap-1 -mt-0.5">
                            <span className="text-[11px] text-[#667781]">09:15</span>
                            <CheckCheck className="h-[14px] w-[14px] text-[#53BDEB]" />
                        </div>
                    </div>
                </div>

                {/* User reply */}
                <div className="flex justify-end">
                    <div className="relative max-w-[65%] rounded-lg shadow-sm px-2.5 pt-1.5 pb-1" style={{ backgroundColor: '#DCF8C6' }}>
                        {/* Tail */}
                        <div className="absolute -right-2 top-0 w-0 h-0 border-t-[8px] border-t-[#DCF8C6] border-l-[8px] border-l-transparent" />
                        <p className="text-[14px] text-[#111B21] leading-[19px]">{t('reply')}</p>
                        <div className="flex justify-end items-center gap-1 -mt-0.5">
                            <span className="text-[11px] text-[#667781]">09:17</span>
                            <Check className="h-[14px] w-[14px] text-[#667781]" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Input bar */}
            <div className="flex items-center gap-1.5 px-1.5 py-1.5" style={{ backgroundColor: '#F0F2F5' }}>
                <div className="flex-1 flex items-center bg-white rounded-full px-3 py-1.5">
                    {/* Emoji icon */}
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#54656F" className="flex-shrink-0"><path d="M9.153 11.603c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962zm5.694 0c.795 0 1.439-.879 1.439-1.962s-.644-1.962-1.439-1.962-1.439.879-1.439 1.962.644 1.962 1.439 1.962zM12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8zm-1.019-5.219c-1.567 0-2.832.716-3.552 1.799l1.36.86c.438-.695 1.221-1.159 2.192-1.159.966 0 1.751.461 2.192 1.159l1.36-.86c-.72-1.083-1.985-1.799-3.552-1.799z" /></svg>
                    <span className="flex-1 text-[15px] text-[#667781] ml-2">{t('inputPlaceholder')}</span>
                </div>
                {/* Mic button */}
                <div className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#00A884' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" /></svg>
                </div>
            </div>
        </div>
    )
}

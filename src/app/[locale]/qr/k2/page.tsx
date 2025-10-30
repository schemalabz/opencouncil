import { redirect } from 'next/navigation';

export default function QRK2Page({
    params: { locale }
}: {
    params: { locale: string }
}) {
    // Redirect to the Zografou city page for this locale
    redirect(`/${locale}/zografou`);
}



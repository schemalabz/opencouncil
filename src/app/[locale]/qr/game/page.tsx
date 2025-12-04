import { redirect } from 'next/navigation';

export default function QRGamePage({
    params: { locale }
}: {
    params: { locale: string }
}) {
    // Redirect to the Chania city page for this locale
    redirect(`/${locale}/chania`);
}


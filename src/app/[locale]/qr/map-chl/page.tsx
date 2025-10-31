import { redirect } from 'next/navigation';

export default function QRMapChlPage({
    params: { locale }
}: {
    params: { locale: string }
}) {
    // Redirect to the Chalandri city page for this locale
    redirect(`/${locale}/chalandri`);
}

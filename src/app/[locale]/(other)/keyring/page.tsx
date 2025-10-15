import { redirect } from 'next/navigation';

export default function KeyringPage({
    params: { locale }
}: {
    params: { locale: string }
}) {
    // Redirect to homepage for now - can be changed later as needed
    redirect(`/${locale}/chalandri`);
}


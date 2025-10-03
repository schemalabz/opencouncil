import { redirect } from 'next/navigation';

export default function TShirtPage({
    params: { locale }
}: {
    params: { locale: string }
}) {
    // Redirect to homepage for now - can be changed later as needed
    redirect(`/${locale}`);
}

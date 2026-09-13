import { CityHeader } from "@/components/layout/CityHeader";
import Footer from "@/components/layout/Footer";
import { getRealm } from "@/lib/realm.server";

export default async function CityInnerLayout(
    props: {
        children: React.ReactNode,
        params: Promise<{ locale: string, cityId: string }>
    }
) {
    const [{ locale, cityId }, realm] = await Promise.all([props.params, getRealm()]);

    return (
        <>
            <CityHeader cityId={cityId} locale={locale} />
            {props.children}
            <Footer realm={realm} />
        </>
    );
}

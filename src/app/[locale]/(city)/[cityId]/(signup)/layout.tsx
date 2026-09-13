import { CityHeader } from "@/components/layout/CityHeader";

/**
 * The city's signup flows — notifications and the petition — without the
 * site footer. Each flow ends in its own action bar, which on a phone
 * sticks to the bottom of the screen; a footer under it would only put
 * a second scroll below the one the reader is in.
 */
export default async function CitySignupLayout(
    props: {
        children: React.ReactNode,
        params: Promise<{ locale: string, cityId: string }>
    }
) {
    const { locale, cityId } = await props.params;

    return (
        <>
            <CityHeader cityId={cityId} locale={locale} />
            {props.children}
        </>
    );
}

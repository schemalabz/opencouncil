import { HeroBento } from './HeroBento';
import { StatTiles } from './StatTiles';
import { CityBrowse } from './CityBrowse';
import { CoverageBand } from './CoverageBand';
import { HowItWorks } from './HowItWorks';
import { FooterBand } from './FooterBand';

/**
 * Landing redesign — iteration 1 (issue #208).
 *
 * Full-bleed bento layout in a wide container (fixes the narrow centered ribbon).
 * Currently driven by mock data (see ./mockData.ts); swap for server queries as
 * the real endpoints land. The original landing at /(other)/page.tsx is untouched.
 */
export function LandingV2() {
    return (
        <div className="mx-auto w-full max-w-[1600px] space-y-24 px-4 py-10 sm:px-6 sm:py-16 sm:space-y-32 lg:px-8">
            <HeroBento />
            <StatTiles />
            <CityBrowse />
            <CoverageBand />
            <HowItWorks />
            <FooterBand />
        </div>
    );
}

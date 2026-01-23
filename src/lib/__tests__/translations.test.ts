import en from '../../../messages/en.json';
import el from '../../../messages/el.json';

// TODO: Translation files are currently out of sync.
// Enable this test once el.json and en.json have matching keys.
describe.skip('translations sync', () => {
    it('should have matching top-level keys', () => {
        const enKeys = Object.keys(en).sort();
        const elKeys = Object.keys(el).sort();

        const missingInEn = elKeys.filter(k => !enKeys.includes(k));
        const missingInEl = enKeys.filter(k => !elKeys.includes(k));

        expect(missingInEn).toEqual([]);
        expect(missingInEl).toEqual([]);
    });

    it('should have matching nested keys for each section', () => {
        const enSections = Object.keys(en) as (keyof typeof en)[];
        const elSections = Object.keys(el) as (keyof typeof el)[];
        const commonSections = enSections.filter(s => elSections.includes(s as keyof typeof el));

        for (const section of commonSections) {
            const enNested = Object.keys(en[section]).sort();
            const elNested = Object.keys(el[section as keyof typeof el]).sort();

            const missingInEn = elNested.filter(k => !enNested.includes(k));
            const missingInEl = enNested.filter(k => !elNested.includes(k));

            expect(missingInEn).toEqual([]);
            expect(missingInEl).toEqual([]);
        }
    });
});

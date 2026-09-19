"use client";

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { diavgeiaSearchUrl } from '@/components/meetings/decisions/pdfUrl';
import type { ReadDiavgeiaUnitEntry } from '@/lib/utils/diavgeiaUnitScope';

/** Both identifiers open the same listing, so they wear the same link style. */
const LINK = 'underline underline-offset-2 hover:text-foreground';

/** What separates one clause from the next, inside the sentence. */
const COMMA = ', ';

/**
 * Where this meeting's decisions come from, as the end of the status line's
 * last-check sentence: the organisation, then every configured unit, each one a
 * link into the listing it names.
 *
 * The clauses continue the sentence the caller opened — «Τελευταίος έλεγχος στη
 * Διαύγεια: {date}, στον οργανισμό 6104, στη μονάδα 100084744». Printed as bare
 * fragments beside it they read as a machine's trailing metadata, not as the
 * answer to "where do these decisions come from?".
 *
 * `dated` is which sentence that is. A date ends the sentence, so the first
 * clause needs a comma to stand apart from it. «Δεν έχει ελεγχθεί ακόμη» ends
 * in the verb the clause qualifies, and every catalog opens the clause with a
 * preposition, so the clause continues it directly — «Δεν έχει ελεγχθεί ακόμη
 * στον οργανισμό 6104». The comma there reopened the trailing-metadata reading
 * on the one state every unpolled meeting shows.
 *
 * Every admin sees it. The ids are not secrets, and the actual numbers are what
 * a person checking a municipality's configuration came to read, so they stay
 * on the line rather than behind a named link. The sentence wraps, so a phone
 * keeps them.
 */
export function DiavgeiaSourceLink({ diavgeiaUid, pollScope, dated }: {
    diavgeiaUid: string | null;
    pollScope: ReadDiavgeiaUnitEntry[];
    dated: boolean;
}) {
    const t = useTranslations('admin.decisionsPage');

    // No organisation id is not a clause of the last-check sentence: there is
    // nothing to poll at all. It stays the separate sentence it is today.
    if (!diavgeiaUid) {
        return (
            <>
                <span aria-hidden>{' · '}</span>
                <span className="text-amber-700">{t('scope.noOrg')}</span>
            </>
        );
    }

    return (
        <>
            {dated ? COMMA : ' '}
            <a href={diavgeiaSearchUrl(diavgeiaUid)} target="_blank" rel="noopener noreferrer" className={LINK}>
                {t('scope.org', { org: diavgeiaUid })}
            </a>
            {pollScope.length === 0 && (
                <>
                    {COMMA}
                    <span className="text-amber-700">{t('scope.orgWide')}</span>
                </>
            )}
            {pollScope.map(({ entry, scope, error }) => (
                <Fragment key={entry}>
                    {COMMA}
                    {scope === null ? (
                        // A malformed entry marks itself, so the valid ones beside it
                        // still show. Nothing else on this line would say that the
                        // scope a poll reads is broken.
                        <span className="text-amber-700" title={error ?? undefined}>
                            {t('scope.malformed', { error: entry })}
                        </span>
                    ) : (
                        <a
                            href={diavgeiaSearchUrl(diavgeiaUid, scope)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={LINK}
                        >
                            {scope.signer
                                ? t('scope.unitSigner', { unit: scope.unit, signer: scope.signer })
                                : t('scope.unit', { unit: scope.unit })}
                        </a>
                    )}
                </Fragment>
            ))}
        </>
    );
}

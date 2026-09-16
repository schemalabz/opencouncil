import type { PersonClaimStatus } from "@/lib/db/personClaim";

/** A claim status as `/api/join` reports it through `?claim=`. */
export type ClaimQueryStatus = PersonClaimStatus | "invalid";

/** The message key under `Profile.claim` for each status. */
export type ClaimMessageKey = "linked" | "alreadyYours" | "alreadyLinked" | "notFound" | "invalid";

const CLAIM_MESSAGE_KEY: Record<ClaimQueryStatus, ClaimMessageKey> = {
    linked: "linked",
    already_yours: "alreadyYours",
    already_linked: "alreadyLinked",
    not_found: "notFound",
    invalid: "invalid",
};

/** The message key for a `?claim=` value, or null for anything `/api/join` does not send. */
export function claimMessageKey(claim: string | undefined): ClaimMessageKey | null {
    return claim && Object.hasOwn(CLAIM_MESSAGE_KEY, claim) ? CLAIM_MESSAGE_KEY[claim as ClaimQueryStatus] : null;
}

/** A claim that did not link anybody: the only results a signed-out scanner sees. */
export function isClaimFailure(key: ClaimMessageKey): boolean {
    return key === "alreadyLinked" || key === "notFound" || key === "invalid";
}

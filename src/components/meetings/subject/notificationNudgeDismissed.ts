const DISMISSED_KEY = "notification-nudge-dismissed";

export function isNudgeDismissed(): boolean {
    try {
        return sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
        return false;
    }
}

export function setNudgeDismissed(): void {
    try {
        sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
        // sessionStorage unavailable — ignore
    }
}

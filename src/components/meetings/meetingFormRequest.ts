/**
 * The id that the meeting form sends. PUT identifies the meeting by the URL,
 * so an edit sends none. A new meeting sends an id only when the admin typed
 * one: without it the API makes the id from the date, and adds _2, _3 when the
 * day already has a meeting. A typed id that is taken fails, as it should.
 */
export function meetingIdForRequest(typedId: string | undefined, editing: boolean): string | undefined {
    if (editing) return undefined;
    return typedId?.trim() || undefined;
}

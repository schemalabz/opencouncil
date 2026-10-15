export function sendPetitionReceivedAdminAlert() { /* noop */ }
export function sendUserOnboardedAdminAlert() { /* noop */ }
export function sendNotificationSignupAdminAlert() { /* noop */ }
// Records the alerts so that a test can read what the admins were told.
export const sendAgendaReadingAlert = jest.fn().mockResolvedValue(undefined)

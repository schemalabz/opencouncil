# Administrator Authentication

OpenCouncil has entities like Cities, Parties and People (see db/schema.prisma).

Separately we also have User Accounts, which can belong to either citizens or administrators.
We'll concern ourselves with citizen authentication and citizen authenticated feaures later.
For now, we'll focus on administrating opencouncil.

Users Accounts have an email address, and user accounts can optionally *administer* one or more entities,
for example a city, a party or a person. A user that can administer a city can add new city council meetings
or edit existing ones. They can also administer all parties in that city, and all people in the city. Similarly,
a person that administers a party can administer all people that belong to the party. dministering generally means
editing and deleting stuff (e.g. editing a party color, deleting a person etc). There's lots of details here about
what each user should be able to do -- but the first step is enabling users to administer entities.

So we want some kind of an Administers relation, which has a user on one side, and an entity on the other side:
either a city, a party or a person, or a superadmin flag. Superadmins can do everything and can also access /admin.

We also want an "onboarded" flag on Users, and an optional phone.

When users login, they are redirected to /profile. This is a common entry point for both citizen signups and
administrator signups. There, they can edit the following info:

1. Their full name (mandatory to onboard)
2. Their phone number (optional)
2. Their communication preferences (can we occasionally contact them with news and updates, off by default)?

If the user is not onboarded, they are kindly asked for these two things. When they save these details for the first time
then they are "onboarded", but /profile still lets them edit these things.

/profile primarily shows them what they can administer:
1. If they're a superadmin, they are told that that they can access /admin and are offered an option to go there.
2. If they administer one or more thing, they are told that they can administer that thing and are offered an option to go there.
3. If they administer nothing, then they are thanked for signing up with something like:
Ευχαριστούμε για την εγγαρφή σας!
Αν είστε δημότης, δεν υπάρχουν ακόμα πολλά πράγματα που μπορείτε να κάνετε σαν συνεδεμένος χρήστης.
Αν είστε δημοτικός σύμβουλος ή υπάλληλος δήμου και θέλετε να επεξεργαστείτε κάτι στο OpenCouncil, τότε καλέστε μας στο {env.CONTACT_PHONE}.


Importantly, src/lib/auth.js needs to be updated!
## Admins of one administrative body (#828)

`Administers` has a fourth scope: `administrativeBodyId`. A body admin runs one
body, for example the secretary of a youth council. They manage the body's
meetings and members and nothing else in the city.

The check in `src/lib/auth.ts` accepts these shapes:

- `{}`: superadmin only.
- `{ cityId }`: an admin of the city. A body admin never passes this shape, so a
  mutation that nobody converts stays closed to them.
- `{ cityId, councilMeetingId }`: an admin of the city, or an admin of the body
  that holds the meeting.
- `{ cityId, administrativeBodyId }`: an admin of the city, or an admin of that
  body. The body must belong to the city.
- `{ partyId }`: an admin of the party, or of its city.
- `{ personId }`: an admin of the person, of its city, or a body admin who owns
  the person. A body admin owns a person when the person has at least one role
  and every role is on a body they hold.

A body admin can: create, edit and release a meeting of their body, upload its
recording and agenda, start its tasks, edit its transcript and speakers, and
make highlights. They see the unreleased meetings of their bodies
(`getUnreleasedScope`). They add and edit members of their bodies; every role in
the payload must be on a body they hold (`getRoleLimitForCity`,
`validateRolesForBodyAdmin`). They change the body's YouTube channel and contact
emails. They invite and remove admins of the same body through
`/api/cities/{cityId}/administrative-bodies/{bodyId}/admins`.

A body admin cannot: open the city form, delete a meeting, complete a human
review, send notifications, poll decisions, edit parties, or edit a person with
a seat elsewhere. A person who claimed their own page edits name and photo
only; their form sends no roles.

The MCP admin tools (`create_meeting`, `update_meeting`, `start_task`) apply the
same scope.

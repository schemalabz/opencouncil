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
body. An example is the secretary of a youth council. A body admin manages the
meetings and the members of that body. They manage nothing else in the city.

### The scopes of the check

The check in `src/lib/auth.ts` accepts these shapes:

- `{}`: a superadmin only.
- `{ cityId }`: an admin of the city. A body admin never passes this shape. A
  mutation that nobody converts therefore stays closed to them.
- `{ cityId, councilMeetingId }`: an admin of the city, or an admin of the body
  that holds the meeting.
- `{ cityId, administrativeBodyId }`: an admin of the city, or an admin of that
  body. The body must belong to the city.
- `{ partyId }`: an admin of the party, or an admin of its city.
- `{ personId }`: an admin of the person, an admin of its city, or a body admin
  who owns the person.

A body admin owns a person when two conditions are true:

- The person has at least one role.
- Every role of the person is on a body that the admin holds.

### What a body admin can do

A body admin can do these things for the meetings of their bodies:

- Create, edit and release a meeting.
- Upload the recording and the agenda.
- Start the tasks `processAgenda`, `transcribe`, `fixTranscript`, `summarize`
  and `generateHighlight`.
- Replay or delete the rows of those five tasks. `taskScope` in
  `src/lib/tasks/types.ts` sets this rule.
- Edit the transcript and the speakers.
- Make highlights.
- See the unreleased meetings. `getUnreleasedScope` sets this rule.
- Move a meeting between two bodies that they administer.

A body admin can also do these things:

- Add and edit the members of their bodies. Every role in the payload must be
  on a body that they hold. `getRoleLimitForCity` and
  `validateRolesForBodyAdmin` apply this rule.
- Change the YouTube channel and the contact emails of their body.

A body has a maximum of 20 admins. The city Team tab and `/admin/team` invite
and remove them, through `/api/admin/grants`. The section on granular
permissions below says who can do that. Only an admin of the city or of a
higher scope can remove the last admin of a body.

### What stays with the city

A body admin cannot do these things:

- Open the city form.
- Move a meeting to a body that they do not administer.
- Delete a meeting.
- Complete a human review.
- Send the transcript.
- Send notifications directly. The `processAgenda` and `summarize` tasks
  create notifications. The notification behavior of the body decides what
  happens with them, and only a superadmin sets it.
- Poll decisions.
- Run or delete voiceprint tasks.
- Edit parties.
- Edit a person who has a role outside the bodies of the admin.

A person who claimed their own page edits their name and photo only. Their form
sends no roles.

The MCP admin tools `create_meeting`, `update_meeting` and `start_task` apply
the same scopes.

A service holds a machine account: a user that a superadmin creates on
`/admin/machines` and that never signs in. Its address is on a reserved
domain. A superadmin mints its MCP tokens on that page. A token acts with the
rights of its account, the superadmin flag and the grants, like the token of a
person. The REST routes accept a session only.

## Granular permissions (#875)

A grant is a row of `Administers`: one role, at one scope, for one account.
The scope is a realm, a city, an administrative body, a party, or a person. The
role says what the account can do there. `src/lib/auth/rights.ts` maps each
role to its rights.

| Role         | What the account can do at its scope                              |
| ------------ | ----------------------------------------------------------------- |
| `admin`      | Everything, including the invites and the roles of the Team tab.  |
| `records`    | Meetings, transcripts, subjects, people, parties, decisions.      |
| `meetings`   | Meetings and their tasks, and the release of a meeting.           |
| `highlights` | Highlights, including the ones of an unreleased meeting.          |
| `viewer`     | Read an unreleased meeting. No edit.                              |

A right resolves on the scope of the target and on every scope above it. An
`admin` of a city holds every right of every body, party and person of the
city. A superadmin holds every right everywhere. `hasRight(right, target)`
in `src/lib/auth.ts` answers the question on the server.

### Who grants

An account grants a role at a scope when it holds `admin` at that scope or
above it. An `admin` of a body invites to that body only. An `admin` of a
city invites to the city and to each of its bodies, parties and people. A
superadmin invites anywhere. `canGrant` in `src/lib/auth/rights.ts` applies
this rule, and `/api/admin/grants` refuses the rest.

### The Team tab

The city page has a Team tab for every account that holds `admin` on the
city, on one of its bodies, or above. The tab lists the members of the city
and of each body the account administers, with their role and their scope. It
lists the open invites under them. The tab has one dialog: an email, a role,
and a scope the account can grant. An account that administers one body only
sees no scope control: the dialog invites to that body.

The superadmin page `/admin/team` lists the same rows for every realm the
account administers, and for every realm when it is a superadmin. The
profile page lists what the signed-in account holds, one row per scope, with
the kind of the scope and the role.

### The lifecycle of an invite

An invite is a grant row with `acceptedAt` null. It is not a right yet. The
account holds the right after its first sign-in, which sets `acceptedAt`. An
account that signed in before gets the right at once, and a notice email
says so. An invite that nobody accepts expires `PENDING_GRANT_DAYS` days (14)
after its creation. The Team tab shows the invite as open or expired, and
offers to resend or to withdraw it. A resend creates a fresh row and revokes
the old one. A scope holds 20 members at most. The cap counts people, not
rows: a second role of a member is free, and an open invite counts.

A withdrawal, and a removal of a member, set `revokedAt` on the row and keep
it. The history of a grant stays: who gave it, when, and who revoked it. The
users page `/admin/users` shows the date and the inviter of each row of an
account.

### What a deletion leaves

An account is personal data. A deletion removes it, and the cascade removes
its grant rows. When the account held a role, the app posts a Discord admin
alert with each role and its scope, and nothing else. See
`docs/admin-alerts.md`. The alert goes when the account deletes itself on the
profile page and when a superadmin deletes it on `/admin/users`.

### Voiceprint consent

Only the account that claimed the person by its QR code sets the voiceprint
consent of that person. An account that a superadmin gave the person to edits
the page of the person, and has no consent box. The consent is a first-person
statement, and the claim is what makes the account the person.

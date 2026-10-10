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
- Run the roster tools of their bodies (#829): import a pasted list of
  members, end a membership, start a new term, and make the claim links of the
  members who have no account. `src/lib/db/bodyMembers.ts` gates each one on
  the body. An import with no start date starts the memberships where the
  last membership of the body ended, so the members of a new term stay out of
  the minutes of the old term. A claim link claims the whole person, so it
  goes only to a member whose every role is on the body. A member with a seat
  elsewhere in the municipality gets their link from the city admin.

A person whose every role is on a secondary body consents to a voiceprint from
their own account only (#829). `voiceprintNeedsOwnConsent` in
`src/lib/utils/bodyTier.ts` names the rule. A superadmin cannot record a
consent for them, and no voiceprint task starts for them without that consent.
The consent counts only from the account that claimed their page: a delegate
that a superadmin added cannot give it, and a consent from any other account
does not start a voiceprint. The same account alone adds their photo.
`withPersonImageAuthorized` in `src/lib/db/personImage.ts` refuses a photo from
any other account, and the member form of a secondary body offers no photo
field.
- Change the YouTube channel and the contact emails of their body.
- Invite and remove the admins of their body through
  `/api/cities/{cityId}/administrative-bodies/{bodyId}/admins`.

The page of the body, at `/{cityId}/bodies/{bodyId}`, holds these forms: the
meeting form, the member form, the contact settings and the list of admins.
The profile of a body admin links to it.

A body has a maximum of 20 admins. Only a city admin or a superadmin can remove
the last admin of a body.

### What stays with the city

A body admin cannot do these things:

- Open the city form.
- Move a meeting to a body that they do not administer.
- Delete a meeting.
- Complete a human review.
- Send the transcript.
- Send notifications.
- Poll decisions.
- Run or delete voiceprint tasks.
- Edit parties.
- Edit a person who has a role outside the bodies of the admin.

A person who claimed their own page edits their name and photo only. Their form
sends no roles.

The MCP admin tools `create_meeting`, `update_meeting` and `start_task` apply
the same scopes.

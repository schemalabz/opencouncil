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
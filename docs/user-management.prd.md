# User Management

(see docs/auth.prd.md first, and db/schema.prisma)

Super-admins can _create_ new users by providing an email address and name. Once a user is created, 
they can be signed-in normally into via a magic link that's emailed to them.

Additionally, super-admins can _invite_ users that exist in the system and are not yet
onboarded (see db/schema.prisma). Inviting a user simply sends them an email (see existing emails in
src/lib/email/templates) telling them they've been invited. The invite email should include the user's name.

Importantly, super-admins can give _administrative rights_ to users through a UI by adding and removing rows on the
Administers table (see db/schema.prisma). 

This functionality should be implemented nicely with good UX on /admin (see src/app/(main)/[locale]/admin), with shadcn
components etc.
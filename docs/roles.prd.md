# Rebuilding roles

See db/schema.prisma for important context.

This document describes how to implement the change of moving person roles into its own
relation on OpenCouncil.

Before this change, OpenCouncil had Cities, which had people, parties and council meetings.
Each person might also have had a party. Some council meetings may have had an Administrative Body.
People also optionally had "roles" (e.g. deputy mayor, mayor, chair etc), which was a string field
on the Person table.

We'd now like to create a separate Role relation, which will deprecate:
1. The string role field on people.
2. The party_id on people.

The new Role relation will connect a person to one of {Party, City, Admininstrative Body}
A single person may have multiple roles, e.g. they may be a deputy mayor on the city,
and a member of the city council, and a member of a party.

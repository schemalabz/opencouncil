# Role Management in OpenCouncil

This document describes the Role model in OpenCouncil and how it relates to People, Cities, Parties and Administrative Bodies.

## Current Schema

The Role model connects a Person to:
- A City (e.g. as Mayor)
- A Party (e.g. as Party Member) 
- An Administrative Body (e.g. as Committee Chair)

Key characteristics:
- Each Person can have multiple roles
- A Person can only have one role per {City, Party, Administrative Body} combination
- Roles have both Greek and English names (name, name_en)
- Roles can be marked as "head" positions (isHead)
- Roles can have start and end dates
- All roles are tied to a specific City

## Migration from Legacy Schema

This new Role model replaces:
1. The `role` and `role_en` string fields on the Person model
2. The direct Party-Person relationship via `partyId` on Person

The Person-City relationship remains, as it represents the primary scope/realm of the Person.

## Example Role Combinations

A single Person could have these roles simultaneously:
- City role: Deputy Mayor of Athens
- Party role: Member of Party A
- Administrative Body role: Chair of Finance Committee

But they cannot have multiple roles within the same context (e.g. cannot be both Chair and Vice Chair of the same Administrative Body).

## Action plan:
1. Create the new Role relation
2. Change the code to use the new role relation and ignore the deprecated textual role field on Person
3. Write a script that creates rows for the Role relation based on the deprecated party membership.
4. Remove the old role field

# Role Management in OpenCouncil

This document describes the Role model in OpenCouncil and how it relates to People, Cities, Parties and Administrative Bodies.

## Current Schema

The Role model connects a Person to one of three entity types:
- **City** (city-level roles like "Mayor")
- **Party** (party membership)
- **Administrative Body** (committee/community membership)

Key characteristics:
- Each Person can have multiple roles
- A Person can only have one role per {City, Party, Administrative Body} combination
- Roles have both Greek and English names (name, name_en)
- Roles can be marked as "head" positions (isHead)
- Roles can have start and end dates

## Role Data Model - Flexible Patterns

The system supports two valid patterns for storing roles. Both patterns are valid and can coexist in the same database.

### Pattern A: Explicit City Scope (Recommended)

In this pattern, **all roles include `cityId`** to specify the city context. The role type is determined by which additional field is set:

- **City-level role**: Only `cityId` is set
  - Example: `{cityId: "athens", partyId: null, administrativeBodyId: null}` → Mayor of Athens

- **Party role**: `cityId` + `partyId` are set
  - Example: `{cityId: "athens", partyId: "partyA", administrativeBodyId: null}` → Member of Party A in Athens

- **Administrative Body role**: `cityId` + `administrativeBodyId` are set
  - Example: `{cityId: "athens", partyId: null, administrativeBodyId: "community5"}` → Member of 5th Municipal Community

**Advantages**:
- Simpler queries (no need to join through Party/AdministrativeBody to get city)
- Consistent data pattern
- Explicit city context for all roles

### Pattern B: Implicit City Scope

In this pattern, only city-level roles have `cityId` set. Party and administrative body roles derive the city from the entity:

- **City-level role**: Only `cityId` is set
  - Example: `{cityId: "athens", partyId: null, administrativeBodyId: null}` → Mayor of Athens

- **Party role**: Only `partyId` is set (city derived from `Party.cityId`)
  - Example: `{cityId: null, partyId: "partyA", administrativeBodyId: null}` → Member of Party A

- **Administrative Body role**: Only `administrativeBodyId` is set (city derived from `AdministrativeBody.cityId`)
  - Example: `{cityId: null, partyId: null, administrativeBodyId: "community5"}` → Member of 5th Municipal Community

**Advantages**:
- More normalized (no redundant cityId)
- Clear semantic distinction (cityId = city-level role)

### Validation Rules (Both Patterns)

1. A role **cannot** have both `partyId` and `administrativeBodyId` set
2. If `cityId` is set, it must match the person's current city context
3. City-level roles (no party/admin body) **must** have `cityId`
4. Party and administrative body entities must belong to the current city
5. The unique constraint `@@unique([personId, cityId, partyId, administrativeBodyId])` ensures:
   - One city-level role per person per city
   - One party role per person per (city, party) pair
   - One admin body role per person per (city, admin body) pair

### Recommendation

**Use Pattern A (Explicit City Scope)** for new code:
- Provides consistency
- Simplifies queries
- Makes the city context explicit
- The import script (`scripts/insert_athens_communities.ts`) uses this pattern

Pattern B is supported for backward compatibility.

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

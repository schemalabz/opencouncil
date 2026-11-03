import { Building, Flag, Globe, Landmark, User, type LucideIcon } from 'lucide-react';
import type { AdminEntityType } from '@/lib/db/adminEntities';

/** The icon of each kind of scope, the same on the Team page and on the profile. */
export const SCOPE_ICON: Record<AdminEntityType, LucideIcon> = {
    realm: Globe,
    city: Building,
    body: Landmark,
    party: Flag,
    person: User,
};

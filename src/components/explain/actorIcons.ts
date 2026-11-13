import { Bot, Landmark, UserRound, type LucideIcon } from 'lucide-react';
import type { Actor } from '@/lib/explain/aiLiteracy';

/** The icon that stands for each actor across the explain page. */
export const ACTOR_ICON: Record<Actor, LucideIcon> = { ai: Bot, opencouncil: UserRound, municipality: Landmark };

import "server-only";
import type { City } from "@prisma/client";
import prisma from "./prisma";

/**
 * Create a city with no auth check, for a caller that has already authorized
 * the write: `createCity` after its session gate, and the MCP admin tools,
 * which carry a token instead of a session. Lives in a non-"use server"
 * module so it is not registered as a Server Action: cities.ts is one, and a
 * client could otherwise invoke this write directly and bypass the gate.
 *
 * `peopleOrdering` stays a column with its default but nothing reads or writes
 * it any more: one order applies to every city.
 */
export async function createCityDirect(cityData: Omit<City, 'createdAt' | 'updatedAt' | 'peopleOrdering'>): Promise<City> {
    return prisma.city.create({ data: cityData });
}

/** The English name of a city, for an alert that needs nothing else of it. */
export async function getCityNameEnAndTimezone(cityId: string): Promise<{ name_en: string; timezone: string } | null> {
    return prisma.city.findUnique({ where: { id: cityId }, select: { name_en: true, timezone: true } });
}

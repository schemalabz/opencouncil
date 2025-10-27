import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const notification = await prisma.notification.findUnique({
            where: { id: params.id },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true
                    }
                },
                city: true,
                meeting: {
                    include: {
                        administrativeBody: true
                    }
                },
                subjects: {
                    include: {
                        subject: {
                            include: {
                                topic: true,
                                location: true
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'asc'
                    }
                }
            }
        });

        if (!notification) {
            return NextResponse.json(
                { error: 'Notification not found' },
                { status: 404 }
            );
        }

        // Get location coordinates if subjects have locations
        const locationIds = notification.subjects
            .map(ns => ns.subject.locationId)
            .filter((id): id is string => id !== null);

        let locationCoordinates: Record<string, [number, number]> = {};

        if (locationIds.length > 0) {
            const coords = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
                SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
                FROM "Location"
                WHERE id = ANY(${locationIds})
                AND type = 'point'
            `;

            locationCoordinates = coords.reduce((acc, loc) => {
                acc[loc.id] = [loc.x, loc.y];
                return acc;
            }, {} as Record<string, [number, number]>);
        }

        // Add coordinates to the response
        const enrichedNotification = {
            ...notification,
            subjects: notification.subjects.map(ns => ({
                ...ns,
                subject: {
                    ...ns.subject,
                    location: ns.subject.location ? {
                        ...ns.subject.location,
                        coordinates: ns.subject.locationId ? locationCoordinates[ns.subject.locationId] : null
                    } : null
                }
            }))
        };

        return NextResponse.json(enrichedNotification);

    } catch (error) {
        console.error('Error fetching notification:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}


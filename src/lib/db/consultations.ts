import { Consultation } from '@prisma/client';
import prisma from "./prisma";

export async function getConsultationsForCity(cityId: string): Promise<Consultation[]> {
    return await prisma.consultation.findMany({
        where: {
            cityId,
            isActive: true,
            endDate: {
                gte: new Date() // Only show consultations that haven't ended yet
            }
        },
        orderBy: {
            endDate: 'asc'
        }
    });
}

export async function getConsultationById(cityId: string, consultationId: string): Promise<Consultation | null> {
    return await prisma.consultation.findFirst({
        where: {
            id: consultationId,
            cityId,
            isActive: true
        }
    });
}

export async function getAllConsultationsForCity(cityId: string): Promise<Consultation[]> {
    return await prisma.consultation.findMany({
        where: {
            cityId
        },
        orderBy: {
            endDate: 'desc'
        }
    });
} 
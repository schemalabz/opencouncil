import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/db/prisma';
import { sendEmail } from '@/lib/email/resend';
import { sendWhatsAppMessage, sendSMSMessage } from '@/lib/notifications/bird';
import { updateDeliveryStatus } from '@/lib/db/notifications';

/**
 * Resend a single delivery - resets it to pending and sends it again
 * This explicitly overrides the "don't resend sent deliveries" logic
 */
export async function POST(request: NextRequest) {
    try {
        const currentUser = await getCurrentUser();

        if (!currentUser?.isSuperAdmin) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { deliveryId } = body;

        if (!deliveryId) {
            return NextResponse.json(
                { error: 'deliveryId is required' },
                { status: 400 }
            );
        }

        console.log(`Admin ${currentUser.email} resending delivery ${deliveryId}`);

        // Get the delivery with all notification data
        const delivery = await prisma.notificationDelivery.findUnique({
            where: { id: deliveryId },
            include: {
                notification: {
                    include: {
                        user: true,
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
                                        topic: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!delivery) {
            return NextResponse.json(
                { error: 'Delivery not found' },
                { status: 404 }
            );
        }

        // Reset delivery to pending (this allows resending even if already sent)
        await prisma.notificationDelivery.update({
            where: { id: deliveryId },
            data: {
                status: 'pending',
                sentAt: null,
                messageSentVia: null
            }
        });

        console.log(`Reset delivery ${deliveryId} to pending status`);

        // Now send the delivery
        let success = false;
        let sentVia = null;

        if (delivery.medium === 'email') {
            // Send email
            if (!delivery.email || !delivery.title || !delivery.body) {
                await updateDeliveryStatus(deliveryId, 'failed');
                return NextResponse.json(
                    { error: 'Missing email, title, or body' },
                    { status: 400 }
                );
            }

            const result = await sendEmail({
                from: 'OpenCouncil <notifications@opencouncil.gr>',
                to: delivery.email,
                subject: delivery.title,
                html: delivery.body
            });

            if (result.success) {
                await updateDeliveryStatus(deliveryId, 'sent');
                success = true;
                console.log(`Email resent successfully to ${delivery.email}`);
            } else {
                await updateDeliveryStatus(deliveryId, 'failed');
                console.error(`Failed to resend email to ${delivery.email}`);
            }

        } else if (delivery.medium === 'message') {
            // Send message (WhatsApp with SMS fallback)
            if (!delivery.phone) {
                await updateDeliveryStatus(deliveryId, 'failed');
                return NextResponse.json(
                    { error: 'Missing phone number' },
                    { status: 400 }
                );
            }

            const notification = delivery.notification;
            const meeting = notification.meeting;

            // Prepare WhatsApp template parameters
            const templateParams = {
                date: meeting.dateTime.toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' }),
                cityName: notification.city.name,
                subjectsSummary: notification.subjects.slice(0, 3).map((ns: any) => ns.subject.name).join(', '),
                adminBody: meeting.administrativeBody?.name || 'Συνεδρίαση',
                notificationId: notification.id
            };

            // Try WhatsApp first
            const whatsappResult = await sendWhatsAppMessage(
                delivery.phone,
                notification.type,
                templateParams
            );

            if (whatsappResult.success) {
                await updateDeliveryStatus(deliveryId, 'sent', 'whatsapp');
                success = true;
                sentVia = 'whatsapp';
                console.log(`WhatsApp message resent successfully to ${delivery.phone}`);
            } else {
                // Fallback to SMS
                console.log(`WhatsApp failed, falling back to SMS for ${delivery.phone}`);
                const smsResult = await sendSMSMessage(delivery.phone, delivery.body || '');

                if (smsResult.success) {
                    await updateDeliveryStatus(deliveryId, 'sent', 'sms');
                    success = true;
                    sentVia = 'sms';
                    console.log(`SMS resent successfully to ${delivery.phone}`);
                } else {
                    await updateDeliveryStatus(deliveryId, 'failed');
                    console.error(`Failed to resend message to ${delivery.phone} via WhatsApp and SMS`);
                }
            }
        }

        if (success) {
            return NextResponse.json({
                success: true,
                medium: delivery.medium,
                sentVia
            });
        } else {
            return NextResponse.json(
                { error: 'Failed to send delivery' },
                { status: 500 }
            );
        }

    } catch (error) {
        console.error('Error resending delivery:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}


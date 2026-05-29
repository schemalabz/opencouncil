import { Metadata } from 'next';
import Link from 'next/link';
import type { Message } from '@prisma/client';
import { getConversationSummaries } from '@/lib/db/conversations';
import { formatNumericDateTime } from '@/lib/formatters/time';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ExpandableTableRow } from '@/components/ui/expandable-table-row';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, MessageSquare, ChevronRight } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { ReplyForm } from '@/components/admin/conversations/ReplyForm';
import { SendTemplateDialog } from '@/components/admin/conversations/SendTemplateDialog';
import { ScrollableThread } from '@/components/admin/conversations/ScrollableThread';
import { ConversationsPagination } from '@/components/admin/conversations/ConversationsPagination';

export const metadata: Metadata = {
    title: 'Conversations - Admin',
    description: 'Inbound and outbound message threads, grouped by participant.',
};

const PREVIEW_MAX = 120;
const PAGE_SIZE = 50;

function truncate(s: string, max = PREVIEW_MAX) {
    return s.length <= max ? s : `${s.slice(0, max).trimEnd()}…`;
}

function statusBadgeVariant(status: Message['status']) {
    return status === 'failed' ? 'destructive' : 'outline';
}

function directionBadgeVariant(direction: Message['direction']) {
    return direction === 'inbound' ? 'default' : 'secondary';
}

/**
 * WhatsApp keeps its brand mark (in-house green); SMS falls back to a generic
 * chat-bubble icon. Both carry an aria-label for screen readers since they're
 * the sole indicator that a "channel" badge would have shown.
 */
function ChannelIcon({ channel }: { channel: Message['channel'] }) {
    if (channel === 'whatsapp') {
        return <FaWhatsapp className="h-4 w-4 text-[#25D366]" aria-label="WhatsApp" />;
    }
    return <MessageSquare className="h-4 w-4 text-muted-foreground" aria-label="SMS" />;
}

/**
 * Cells for the visible row. Same layout for plain rows and expandable rows
 * so columns stay aligned regardless of which renderer the row uses.
 */
function ConversationCells({
    phone,
    lastMessage,
    messageCount,
}: {
    phone: string;
    lastMessage: Message;
    messageCount: number;
}) {
    return (
        <>
            <TableCell className="font-mono">{phone}</TableCell>
            <TableCell className="hidden lg:table-cell">
                <ChannelIcon channel={lastMessage.channel} />
            </TableCell>
            <TableCell className="max-w-md break-words">{truncate(lastMessage.body)}</TableCell>
            <TableCell>
                <Badge variant={directionBadgeVariant(lastMessage.direction)}>
                    {lastMessage.direction}
                </Badge>
            </TableCell>
            <TableCell>
                <Badge variant={statusBadgeVariant(lastMessage.status)}>
                    {lastMessage.status}
                </Badge>
            </TableCell>
            <TableCell className="hidden lg:table-cell tabular-nums">{messageCount}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatNumericDateTime(lastMessage.createdAt)}
            </TableCell>
        </>
    );
}

/**
 * Stacked card content for one conversation. Used on mobile in place of a
 * table row. Layout matches the spec: phone + channel inline at top, body
 * below, direction + status inline, timestamp at the bottom.
 */
function ConversationMobileCardContent({
    phone,
    lastMessage,
    messageCount,
}: {
    phone: string;
    lastMessage: Message;
    messageCount: number;
}) {
    return (
        <div className="flex flex-col gap-2 text-left">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-sm truncate">{phone}</span>
                    <ChannelIcon channel={lastMessage.channel} />
                </div>
                {messageCount > 1 && (
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {messageCount} messages
                    </span>
                )}
            </div>
            <p className="text-sm break-words">{truncate(lastMessage.body)}</p>
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <Badge variant={directionBadgeVariant(lastMessage.direction)}>
                        {lastMessage.direction}
                    </Badge>
                    <Badge variant={statusBadgeVariant(lastMessage.status)}>
                        {lastMessage.status}
                    </Badge>
                </div>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
                {formatNumericDateTime(lastMessage.createdAt)}
            </span>
        </div>
    );
}

/**
 * Mobile card wrapper. Multi-message threads use a native `<details>` element
 * for expansion (oldest-first thread view inside) — no client component or
 * state needed. Single-message threads render as a plain styled card.
 */
function ConversationMobileCard({
    phone,
    messages,
    lastMessage,
    messageCount,
}: {
    phone: string;
    messages: Message[];
    lastMessage: Message;
    messageCount: number;
}) {
    const replyTarget = lastMessage.conversationId
        ? {
            conversationId: lastMessage.conversationId,
            phone,
            channel: lastMessage.channel,
        }
        : null;
    const expandable = messageCount > 1 || replyTarget !== null;

    if (expandable) {
        return (
            <details className="group rounded-md border bg-background overflow-hidden">
                <summary className="cursor-pointer list-none p-3 flex items-start gap-2">
                    <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                    <div className="flex-1 min-w-0">
                        <ConversationMobileCardContent
                            phone={phone}
                            lastMessage={lastMessage}
                            messageCount={messageCount}
                        />
                    </div>
                </summary>
                <div className="border-t bg-muted/30 p-3">
                    <ThreadDetail messages={messages} replyTarget={replyTarget} />
                </div>
            </details>
        );
    }
    return (
        <div className="rounded-md border bg-background p-3">
            <ConversationMobileCardContent
                phone={phone}
                lastMessage={lastMessage}
                messageCount={messageCount}
            />
        </div>
    );
}

/**
 * Chat-style thread view — outbound messages align right with a tinted bubble
 * (our side), inbound messages align left in a muted bubble (their side).
 * Timestamp + non-final status sits above each bubble. Oldest first.
 */
function ThreadDetail({
    messages,
    replyTarget,
}: {
    messages: Message[];
    /**
     * If the conversation has a Bird conversationId we can post replies to it
     * via the Conversations API. Carries the channel so the reply goes out on
     * the right WA/SMS channel. Without it, no Bird thread exists yet so a
     * free-form reply has nowhere to go.
     */
    replyTarget?: { conversationId: string; phone: string; channel: Message['channel'] } | null;
}) {
    return (
        <div className="flex flex-col">
            {/* Capped + scrollable thread; auto-scrolls to bottom on mount so
              * the latest message is in view when the row first opens. */}
            <ScrollableThread>
                {messages.map((m) => {
                    const isOutbound = m.direction === 'outbound';
                    const showStatus = m.status === 'failed' || m.status === 'pending';
                    const showFailureReason = m.status === 'failed' && m.failureReason;
                    return (
                        <li
                            key={m.id}
                            className={`flex flex-col gap-1 ${isOutbound ? 'items-end' : 'items-start'}`}
                        >
                            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground tabular-nums">
                                <span>{formatNumericDateTime(m.createdAt)}</span>
                                {showStatus && (
                                    <span
                                        className={
                                            m.status === 'failed'
                                                ? 'text-destructive font-medium'
                                                : 'font-medium'
                                        }
                                    >
                                        · {m.status}
                                    </span>
                                )}
                            </div>
                            {showFailureReason && (
                                <div className="max-w-[80%] rounded-lg bg-red-100 dark:bg-red-900/30 px-3 py-1.5 text-xs text-red-700 dark:text-red-300 break-words">
                                    {m.failureReason}
                                </div>
                            )}
                            <div
                                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm break-words ${isOutbound
                                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                                    : 'bg-muted-foreground/15 text-foreground rounded-bl-sm'
                                    }`}
                            >
                                {m.body}
                            </div>
                        </li>
                    );
                })}
            </ScrollableThread>
            {/* Reply form sits outside the scroll container so it stays
              * visible regardless of how long the thread gets. */}
            {replyTarget && (
                <ReplyForm
                    conversationId={replyTarget.conversationId}
                    phone={replyTarget.phone}
                    channel={replyTarget.channel}
                />
            )}
        </div>
    );
}

interface PageProps {
    searchParams: { all?: string; page?: string };
}

export default async function ConversationsPage({ searchParams }: PageProps) {
    // Default view hides outbound-only threads (broadcasts no one answered,
    // failed deliveries) so the admin can focus on conversations that need
    // attention. `?all=1` opts back into the full unfiltered list.
    const showAll = searchParams.all === '1';
    const requestedPage = Number.parseInt(searchParams.page ?? '', 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const { conversations, total } = await getConversationSummaries({
        onlyWithInbound: !showAll,
        page,
        pageSize: PAGE_SIZE,
    });
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="container mx-auto py-8">
            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <div className="flex items-baseline gap-3">
                    <h1 className="text-3xl font-bold">Conversations</h1>
                    <p className="text-sm text-muted-foreground">
                        {total} {total === 1 ? 'thread' : 'threads'}
                        {!showAll && ' with replies'}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Link
                        href={showAll ? '?' : '?all=1'}
                        className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                    >
                        {showAll ? 'Only with replies' : 'Show all threads'}
                    </Link>
                    <SendTemplateDialog />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Threads</CardTitle>
                </CardHeader>
                <CardContent>
                    {conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
                            <MessageCircle className="h-10 w-10" />
                            <p className="font-medium">
                                {showAll ? 'No conversations yet' : 'No replies yet'}
                            </p>
                            <p className="text-sm">
                                {showAll
                                    ? 'Send a test WhatsApp from the trigger above to see it land here.'
                                    : 'No participant has replied yet. Switch to "Show all threads" to see outbound-only messages.'}
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Mobile: stacked card layout — visible below md. */}
                            <ul className="md:hidden flex flex-col gap-3">
                                {conversations.map((c) => {
                                    const lastMessage = c.messages[c.messages.length - 1];
                                    const count = c.messages.length;
                                    // Composite key — same phone on WA + SMS is two rows.
                                    const key = `${c.channel}:${c.phone}`;
                                    return (
                                        <li key={key}>
                                            <ConversationMobileCard
                                                phone={c.phone}
                                                messages={c.messages}
                                                lastMessage={lastMessage}
                                                messageCount={count}
                                            />
                                        </li>
                                    );
                                })}
                            </ul>
                            <div className="hidden md:block">
                                <Table className="table-auto">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12" />
                                            <TableHead>Phone</TableHead>
                                            <TableHead className="hidden lg:table-cell">Channel</TableHead>
                                            <TableHead>Last message</TableHead>
                                            <TableHead>Direction</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="hidden lg:table-cell">Messages</TableHead>
                                            <TableHead className="text-right">Last activity</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {conversations.map((c) => {
                                            const lastMessage = c.messages[c.messages.length - 1];
                                            const count = c.messages.length;
                                            const replyTarget = lastMessage.conversationId
                                                ? {
                                                    conversationId: lastMessage.conversationId,
                                                    phone: c.phone,
                                                    channel: lastMessage.channel,
                                                }
                                                : null;
                                            const expandable = count > 1 || replyTarget !== null;
                                            // Composite key — same phone on WA + SMS is two rows.
                                            const rowKey = `${c.channel}:${c.phone}`;

                                            if (expandable) {
                                                return (
                                                    <ExpandableTableRow
                                                        key={rowKey}
                                                        rowId={rowKey}
                                                        ariaLabel={`${c.channel} conversation with ${c.phone}`}
                                                        expandedContent={
                                                            <ThreadDetail
                                                                messages={c.messages}
                                                                replyTarget={replyTarget}
                                                            />
                                                        }
                                                    >
                                                        <ConversationCells
                                                            phone={c.phone}
                                                            lastMessage={lastMessage}
                                                            messageCount={count}
                                                        />
                                                    </ExpandableTableRow>
                                                );
                                            }
                                            return (
                                                <TableRow key={rowKey}>
                                                    {/* Spacer to align with the expander column on multi-message rows. */}
                                                    <TableCell className="w-12" />
                                                    <ConversationCells
                                                        phone={c.phone}
                                                        lastMessage={lastMessage}
                                                        messageCount={count}
                                                    />
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                            <ConversationsPagination currentPage={page} totalPages={totalPages} pageSize={PAGE_SIZE} />
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

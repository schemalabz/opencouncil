"use client"
import { ChatInterface } from "@/components/chat/ChatInterface";
import ChatLayout from "@/components/chat/ChatLayout";

export default function ChatPage() {
    return (
        <ChatLayout>
            <ChatInterface />
        </ChatLayout>
    );
} 
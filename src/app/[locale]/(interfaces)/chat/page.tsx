"use client"
import { ChatInterface } from "@/components/chat/ChatInterface";
import { Suspense } from "react";

export default function ChatPage() {
    return <Suspense fallback={<div>Loading...</div>}>
        <ChatInterface />
    </Suspense>

} 
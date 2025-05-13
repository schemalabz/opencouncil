import { Metadata } from "next";
import { SignupPageContent } from "@/components/signup/SignupPageContent";

export const metadata: Metadata = {
    title: "Γραφτείτε στις ενημερώσεις | OpenCouncil",
    description: "Λάβετε ενημερώσεις για θέματα που συζητιούνται στα δημοτικά συμβούλια που σας ενδιαφέρουν",
};

export default function SignupPage() {
    return <SignupPageContent />;
}
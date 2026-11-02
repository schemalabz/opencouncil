import { getAllTopicsWithSubjectCount } from "@/lib/db/topics";
import { getRealm } from "@/lib/realm.server";
import { ALL_REALMS } from "@/lib/realm";
import { TopicsTable } from "@/components/admin/topics/topics-table";
import { getAdminRealms } from "@/lib/auth";

export default async function TopicsAdminPage() {
    // Every realm for a superadmin; the realms of a realm admin otherwise.
    const realms = (await getAdminRealms()) ?? [...ALL_REALMS];
    // New topics default to the realm of the host the admin is on, so a topic
    // created on .fr lands in the France realm rather than silently defaulting
    // to Greece. A realm admin on a host outside their realms gets their first realm.
    const [topics, hostRealm] = await Promise.all([
        getAllTopicsWithSubjectCount(),
        getRealm(),
    ]);
    const defaultRealm = realms.includes(hostRealm) ? hostRealm : realms[0];
    return <TopicsTable initialTopics={topics} realms={realms} defaultRealm={defaultRealm} />;
}

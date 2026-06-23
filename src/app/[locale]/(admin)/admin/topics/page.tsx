import { getAllTopicsWithSubjectCount } from "@/lib/db/topics";
import { getRealm } from "@/lib/realm.server";
import { TopicsTable } from "@/components/admin/topics/topics-table";

export default async function TopicsAdminPage() {
    // Admin is cross-realm (shows every realm grouped), but new topics default to
    // the realm of the host the admin is on, so a topic created on .fr lands in
    // the France realm rather than silently defaulting to Greece.
    const [topics, realm] = await Promise.all([
        getAllTopicsWithSubjectCount(),
        getRealm(),
    ]);
    return <TopicsTable initialTopics={topics} defaultRealm={realm} />;
}

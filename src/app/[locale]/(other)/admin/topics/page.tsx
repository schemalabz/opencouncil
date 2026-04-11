import { getAllTopicsWithSubjectCount } from "@/lib/db/topics";
import { TopicsTable } from "@/components/admin/topics/topics-table";

export default async function TopicsAdminPage() {
    const topics = await getAllTopicsWithSubjectCount();
    return <TopicsTable initialTopics={topics} />;
}

import ElasticsearchStatus from '@/components/admin/elasticsearch/Status';

export default function Page() {
    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
            <ElasticsearchStatus />
        </div>
    );
}

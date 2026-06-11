import { withUserAuthorizedToEdit } from '@/lib/auth';
import ElasticsearchStatus from '@/components/admin/elasticsearch/Status';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Elasticsearch Status - OpenCouncil Admin',
  description: 'Monitor Elasticsearch sync status',
};

/**
 * Elasticsearch Status Admin Page
 * 
 * Provides monitoring of Elasticsearch sync status via pgsync
 */
export default async function ElasticsearchAdminPage() {
  // Ensure user has admin permissions
  await withUserAuthorizedToEdit({});
  
  return (
    <div className="container mx-auto py-6">
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Elasticsearch Status</h1>
          <p className="text-muted-foreground">
            Monitor Elasticsearch sync status. Data is synced automatically via pgsync.
          </p>
        </div>
        
        {/* Status Display */}
        <ElasticsearchStatus />
      </div>
    </div>
  );
} 
import { withUserAuthorizedToEdit } from '@/lib/auth';
import ElasticsearchManagement from '@/components/admin/elasticsearch/ElasticsearchManagement';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Elasticsearch Management - OpenCouncil Admin',
  description: 'Manage Elasticsearch connector configuration and monitor sync status',
};

/**
 * Elasticsearch Management Admin Page
 * 
 * Provides a dedicated interface for managing Elasticsearch connector configurations,
 * monitoring sync status, and preventing data loss incidents through validation
 */
export default async function ElasticsearchAdminPage() {
  // Ensure user has admin permissions
  await withUserAuthorizedToEdit({});
  
  return (
    <div className="container mx-auto py-6">
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Elasticsearch Management</h1>
          <p className="text-muted-foreground">
            Manage Elasticsearch connector configuration and monitor sync status.
            Configure which cities are included in search indexing and validate 
            configurations before applying them.
          </p>
        </div>
        
        {/* Main Management Interface */}
        <ElasticsearchManagement />
      </div>
    </div>
  );
} 
import { Metadata } from 'next';
import ReactSwagger from '@/components/ReactSwagger';
import { buildCanonicalAlternates } from '@/lib/utils/hreflang';
import { getCurrentUser } from '@/lib/auth';
import { getOpenApiSpec } from '@/lib/openapi';
import { filterSpecByAccessLevel, getUserAccessLevel } from '@/lib/utils/openapi';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'API | OpenCouncil',
    alternates: await buildCanonicalAlternates('/docs'),
  };
}

export default async function ApiDoc() {
  const user = await getCurrentUser();
  const userLevel = getUserAccessLevel(user);
  const filteredSpec = filterSpecByAccessLevel(getOpenApiSpec(), userLevel);

  return (
    <div className="container mx-auto py-10">
      <ReactSwagger spec={filteredSpec as Record<string, unknown>} />
    </div>
  );
}

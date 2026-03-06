import fs from 'fs';
import Link from 'next/link';
import yaml from 'js-yaml';
import ReactSwagger from '@/components/ReactSwagger';
import { getCurrentUser } from '@/lib/auth';
import { filterSpecByAccessLevel, getUserAccessLevel, type AccessLevel, type OpenApiSpec } from '@/lib/utils/openapi';

async function getSpec(): Promise<OpenApiSpec> {
  const yamlString = fs.readFileSync('./swagger.yaml', 'utf8');
  return yaml.load(yamlString) as OpenApiSpec;
}

type Props = {
  params: { locale: string };
};

export default async function ApiDoc({ params }: Props) {
  const [spec, user] = await Promise.all([getSpec(), getCurrentUser()]);

  const userLevel = getUserAccessLevel(user);

  const filteredSpec = filterSpecByAccessLevel(spec, userLevel);
  const totalPaths = Object.keys(spec.paths ?? {}).length;
  const visiblePaths = Object.keys(filteredSpec.paths ?? {}).length;

  return (
    <div className="container mx-auto py-10">
      <AccessBanner
        userLevel={userLevel}
        locale={params.locale}
        totalPaths={totalPaths}
        visiblePaths={visiblePaths}
      />
      <ReactSwagger spec={filteredSpec as Record<string, unknown>} />
    </div>
  );
}

type BannerProps = {
  userLevel: AccessLevel;
  locale: string;
  totalPaths: number;
  visiblePaths: number;
};

function AccessBanner({ userLevel, locale, totalPaths, visiblePaths }: BannerProps) {
  const hiddenPaths = totalPaths - visiblePaths;

  if (userLevel === 'superadmin') {
    return (
      <div className="mb-6 rounded-md border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800">
        <strong>Superadmin view.</strong> All {totalPaths} API paths are visible.
      </div>
    );
  }

  if (userLevel === 'admin') {
    return (
      <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Admin view.</strong> Showing {visiblePaths} of {totalPaths} paths.
        Superadmin-only endpoints are hidden.
      </div>
    );
  }

  if (userLevel === 'user') {
    return (
      <div className="mb-6 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        <strong>Authenticated view.</strong> Showing {visiblePaths} of {totalPaths} paths.
        Admin and superadmin endpoints are hidden.
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
      <strong>Public view.</strong> Showing {visiblePaths} of {totalPaths} paths.{' '}
      {hiddenPaths > 0 && (
        <>
          <Link
            href={`/${locale}/sign-in`}
            className="font-medium underline hover:text-gray-900"
          >
            Sign in
          </Link>{' '}
          to see {hiddenPaths} additional endpoint{hiddenPaths !== 1 ? 's' : ''} for authenticated
          and admin users.
        </>
      )}
    </div>
  );
}

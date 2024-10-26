import fs from 'fs';
import yaml from 'js-yaml';
import ReactSwagger from '@/components/ReactSwagger';

async function getSpec() {
  const yamlString = fs.readFileSync('./swagger.yaml', 'utf8');
  const spec = yaml.load(yamlString);
  return spec as Record<string, any>;
}

export default async function ApiDoc() {
  const spec = await getSpec();

  return (
    <div className="container mx-auto py-10">
      <ReactSwagger spec={spec} />
    </div>
  );
}

'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

type Props = {
  spec: Record<string, any>,
};

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

function ReactSwagger({ spec }: Props) {
  return (
    <SwaggerUI
      spec={spec}
      defaultModelsExpandDepth={-1}
      docExpansion="list"
      showExtensions={true}
      showCommonExtensions={true}
      tryItOutEnabled={true}
    />
  );
}

export default ReactSwagger;

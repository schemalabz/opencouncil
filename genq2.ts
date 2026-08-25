process.env.SKIP_ENV_VALIDATION='1'; process.env.ELASTICSEARCH_INDEX='t1';
import { buildSearchQuery } from './src/lib/search/query';
const NO:any={cityIds:null,dateRange:null,isLatest:null,locationName:null};
const q:any=buildSearchQuery({} as any, NO); delete q.index; console.log(JSON.stringify(q));

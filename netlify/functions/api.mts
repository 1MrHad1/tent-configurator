import type { Config } from '@netlify/functions';
import { handleApi } from '../../server/router';

export default (req: Request) => handleApi(req);

export const config: Config = { path: '/api/*' };

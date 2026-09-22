import { tablerIconSvg } from '../utils/tablerIcon';

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const name = typeof query.name === 'string' ? query.name : '';
  return { svg: tablerIconSvg(name) };
});

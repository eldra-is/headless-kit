import type { EldraHttpClient, EldraHttpRequest } from '../types';

export function stubHttpClient(handler: (request: EldraHttpRequest) => unknown): EldraHttpClient {
  return (async (request: EldraHttpRequest) => handler(request)) as EldraHttpClient;
}

import type { paths } from './v1';

export type { paths as EldraContractPaths } from './v1';
export { ELDRA_CONTRACT_VERSION } from './version';

export type EldraContractPath = keyof paths;
export type EldraContractMethod<Path extends EldraContractPath> = keyof paths[Path];

type JsonContent<Response> = Response extends { content: { 'application/json': infer Body } }
  ? Body
  : never;

type SuccessResponse<Responses> = Responses extends { 200: infer Response }
  ? JsonContent<Response>
  : Responses extends { 201: infer Response }
    ? JsonContent<Response>
    : never;

export type EldraContractResponse<
  Path extends EldraContractPath,
  Method extends EldraContractMethod<Path>,
> = paths[Path][Method] extends { responses: infer Responses } ? SuccessResponse<Responses> : never;

export type EldraContractBody<
  Path extends EldraContractPath,
  Method extends EldraContractMethod<Path>,
> = paths[Path][Method] extends { requestBody?: infer Body }
  ? JsonContent<NonNullable<Body>>
  : never;

export type EldraContractQuery<
  Path extends EldraContractPath,
  Method extends EldraContractMethod<Path>,
> = paths[Path][Method] extends { parameters: { query?: infer Query } }
  ? NonNullable<Query>
  : never;

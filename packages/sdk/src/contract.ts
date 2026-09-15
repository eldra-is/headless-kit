// The gateway's OpenAPI document is generated into the consumer's project by the Vite plugin, which
// fills this interface in:
//
//   declare module '@eldrajs/sdk' { interface EldraContract { paths: paths } }
//
// Until that happens every response type below is `unknown` and every request type is a plain
// object — never a guess.
export interface EldraContract {}

type Paths = EldraContract extends { paths: infer P } ? P : never;
type Generated = [Paths] extends [never] ? false : true;

export type EldraContractPaths = Paths;
export type EldraContractPath = Generated extends true ? keyof Paths : string;
export type EldraContractMethod<Path extends EldraContractPath> = Generated extends true
  ? keyof Paths[Path & keyof Paths]
  : string;

type Operation<Path, Method> = Path extends keyof Paths
  ? Method extends keyof Paths[Path]
    ? Paths[Path][Method]
    : never
  : never;

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
> = Generated extends true
  ? Operation<Path, Method> extends { responses: infer Responses }
    ? SuccessResponse<Responses>
    : never
  : unknown;

export type EldraContractBody<
  Path extends EldraContractPath,
  Method extends EldraContractMethod<Path>,
> = Generated extends true
  ? Operation<Path, Method> extends { requestBody?: infer Body }
    ? JsonContent<NonNullable<Body>>
    : never
  : Record<string, unknown>;

export type EldraContractQuery<
  Path extends EldraContractPath,
  Method extends EldraContractMethod<Path>,
> = Generated extends true
  ? Operation<Path, Method> extends { parameters: { query?: infer Query } }
    ? NonNullable<Query>
    : never
  : Record<string, unknown>;

// Reach into a generated shape without assuming it is one: `unknown` in, `unknown` out.
export type EldraContractProp<T, K extends PropertyKey> = T extends object
  ? K extends keyof T
    ? NonNullable<T[K]>
    : unknown
  : unknown;

export type EldraContractItem<T> = NonNullable<T> extends readonly (infer Item)[] ? Item : unknown;

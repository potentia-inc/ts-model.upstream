import { Upstream, UpstreamOrId, Upstreams } from './upstream.js';
type Hint = {
    type: 'same' | 'diff';
    upstream: UpstreamOrId;
};
type PoolOptions = {
    ttl: number;
    minFailures: number;
    minWeight: number;
    decay: number;
};
export declare class Pool {
    #private;
    constructor(upstreams: Upstreams, type: string, options?: Partial<PoolOptions>);
    sample(hint?: Hint): Promise<Upstream>;
    succeed(id: UpstreamOrId): void;
    fail(id: UpstreamOrId): void;
}
export {};

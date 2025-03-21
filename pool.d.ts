import { Upstream, UpstreamOrId, Upstreams } from './upstream.js';
type Hint = {
    type: 'same' | 'diff';
    upstream: UpstreamOrId;
};
type PoolOptions = {
    ttl: number;
    minFailures: number;
    cooldown: number;
    minCooldown: number;
    maxCooldown: number;
};
export declare class Pool {
    #private;
    constructor(upstreams: Upstreams, type: string, options?: Partial<PoolOptions>);
    sample(hint?: Hint): Promise<Upstream>;
    succeed(upstream: UpstreamOrId): void;
    fail(upstream: UpstreamOrId): void;
    debug(): void;
}
export {};

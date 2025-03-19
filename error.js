export * from '@potentia/model/error';
export class UpstreamError extends Error {
    constructor(message) {
        super(message ?? 'Unknown Upstream Error');
    }
}
export class NoUpstreamError extends UpstreamError {
    constructor(message) {
        super(message ?? 'No Upstream');
    }
}
//# sourceMappingURL=error.js.map
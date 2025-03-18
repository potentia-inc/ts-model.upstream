export * from '@potentia/model/error'

export class UpstreamError extends Error {
  constructor(message?: string) {
    super(message ?? 'Unknown Upstream Error')
  }
}

export class NoUpstreamError extends UpstreamError {
  constructor(message?: string) {
    super(message ?? 'No Upstream')
  }
}

import assert from 'node:assert'
import {
  Filter,
  InsertionOf,
  Model,
  ModelOrId,
  Models,
  UUID_DOC_SCHEMA,
  UpdateFilter,
  UuidDoc,
  pickIdOrNil,
  toUnsetOrNil,
} from './model.js'
import { Nil, TypeOrNil, toUuid, isNullish } from './type.js'
import { option } from './util.js'

export const UPSTREAM_NAME = 'upstreams'

export type UpstreamOrId = ModelOrId<UpstreamDoc, Upstream>
export type UpstreamOrNil = TypeOrNil<Upstream>

export type UpstreamDoc = UuidDoc & {
  type: string
  host: string
  path?: string
  headers?: Record<string, string>
  searchs?: Record<string, string>
  auth?: Record<string, string>
  interval?: number
  weight?: number
}

type UpstreamOptions = {
  path?: string
  searchs?: Record<string, string>
}

export class Upstream extends Model<UpstreamDoc> {
  type: string
  host: string
  path?: string
  headers: Record<string, string>
  searchs: Record<string, string>
  auth: Record<string, string>
  interval: number
  weight: number

  url(options: UpstreamOptions = {}): URL {
    const url = new URL(this.host)
    const path = options.path ?? this.path
    if (!isNullish(path)) {
      if (!url.pathname.endsWith('/')) url.pathname += '/'
      url.pathname += path
    }
    for (const [k, v] of new URLSearchParams({
      ...this.searchs,
      ...options.searchs,
    })) {
      url.searchParams.append(k, v)
    }
    return url
  }

  link(options: UpstreamOptions = {}): string {
    return this.url(options).toString()
  }

  constructor(doc: UpstreamDoc) {
    super(doc)

    this.type = doc.type
    this.host = doc.host
    this.path = doc.path
    this.headers = doc.headers ?? {}
    this.searchs = doc.searchs ?? {}
    this.auth = doc.auth ?? {}
    this.interval = doc.interval ?? 0.001
    this.weight = doc.weight ?? 0
  }
}

export type UpstreamId = Upstream['id']

export const UPSTREAM_SCHEMA = {
  name: UPSTREAM_NAME,
  validator: {
    $jsonSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['_id', 'type', 'host', 'created_at'],
      properties: {
        ...UUID_DOC_SCHEMA,
        type: { type: 'string' },
        host: { type: 'string' },
        path: { type: 'string' },
        headers: { type: 'object' },
        searchs: { type: 'object' },
        auth: { type: 'object' },
        interval: { type: 'number' },
        weight: { type: 'number' },
      },
    },
  },
  indexes: {
    create_index: { keys: { created_at: 1 } },
    type_index: {
      keys: { type: 1, weight: 1 },
    },
  },
}

export type UpstreamQuery = {
  id?: UpstreamOrId
  type?: string
  gteWeight?: number
  gtWeight?: number
}
export type UpstreamInsert = {
  id?: UpstreamId
  type: string
  path?: string
  host: string
  headers?: Record<string, string>
  searchs?: Record<string, string>
  auth?: Record<string, string>
  interval?: number
  weight?: number
}
export type UpstreamUpdate = {
  type?: string
  host?: string
  path?: string
  headers?: Record<string, string>
  searchs?: Record<string, string>
  auth?: Record<string, string>
  interval?: number
  weight?: number
}

export type UpstreamSort = {
  createdAt: 'asc' | 'desc'
}

export class Upstreams extends Models<
  UpstreamDoc,
  Upstream,
  UpstreamQuery,
  UpstreamInsert,
  UpstreamUpdate,
  UpstreamSort
> {
  get name(): string {
    return UPSTREAM_NAME
  }

  $model(doc: UpstreamDoc): Upstream {
    return new Upstream(doc)
  }

  $sort(sort?: UpstreamSort) {
    return isNullish(sort) ? Nil : { ...option('created_at', sort.createdAt) }
  }

  $query(query: UpstreamQuery): Filter<UpstreamDoc> {
    const { gtWeight, gteWeight } = query
    return {
      _id: pickIdOrNil(query.id),
      type: pickIdOrNil(query.type),
      weight:
        isNullish(gtWeight) && isNullish(gteWeight)
          ? Nil
          : {
              $gt: gtWeight,
              $gte: gteWeight,
            },
    }
  }

  $insert(values: UpstreamInsert): InsertionOf<UpstreamDoc> {
    const { type, host, path, headers, searchs, auth, interval, weight } =
      values
    assertInterval(interval)
    assertWeight(weight)
    const _id = values.id ?? toUuid()
    return { _id, type, host, path, headers, searchs, auth, interval, weight }
  }

  $set(values: UpstreamUpdate): UpdateFilter<UpstreamDoc> {
    const { type, host, path, headers, searchs, auth, interval, weight } =
      values
    assertInterval(interval)
    assertWeight(weight)
    return { type, host, path, headers, searchs, auth, interval, weight }
  }

  $unset(values: UpstreamUpdate): UpdateFilter<UpstreamDoc> {
    return {
      path: toUnsetOrNil(values, 'path'),
      headers: toUnsetOrNil(values, 'headers'),
      searchs: toUnsetOrNil(values, 'searchs'),
      auth: toUnsetOrNil(values, 'auth'),
      interval: toUnsetOrNil(values, 'interval'),
      weight: toUnsetOrNil(values, 'weight'),
    }
  }
}

function assertInterval(x?: number) {
  if (!isNullish(x)) assert(x >= 0.001)
}

function assertWeight(x?: number) {
  if (!isNullish(x)) assert(x >= 0)
}

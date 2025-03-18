import assert from 'node:assert'
import { randomBytes } from 'node:crypto'
import { NoUpstreamError } from '../src/error.js'
import { Connection } from '../src/mongo.js'
import { Pool } from '../src/pool.js'
import { Nil, isNullish, toUuid } from '../src/type.js'
import {
  UPSTREAM_SCHEMA,
  UpstreamInsert,
  UpstreamQuery,
  Upstreams,
} from '../src/upstream.js'
import { sleep } from '../src/util.js'

const { MONGO_URI } = process.env
assert(!isNullish(MONGO_URI))
const CONNECTION = new Connection(MONGO_URI)
const UPSTREAMS = new Upstreams({ connection: CONNECTION })

beforeAll(async () => {
  await CONNECTION.connect()
  await CONNECTION.migrate(UPSTREAM_SCHEMA)
})

afterAll(async () => {
  await CONNECTION.disconnect()
})

describe('upstream', () => {
  test('upstream', async () => {
    // insert
    const upstream = await UPSTREAMS.insertOne({
      type: randStr(),
      host: `${randHost()}/${randPath()}`,
      path: randPath(),
      headers: { a: randStr(), b: randStr() },
      searchs: { c: randStr(), d: randStr() },
      auth: { token: randStr(), key: randStr() },
      weight: 0.5,
    })

    expect(upstream.link()).toBe(
      `${upstream.host}/${upstream.path}?c=${upstream.searchs?.c}&d=${upstream.searchs?.d}`,
    )
    expect(upstream.link({ path: 'foobar', searchs: { e: 'foobar' } })).toBe(
      `${upstream.host}/foobar?c=${upstream.searchs?.c}&d=${upstream.searchs?.d}&e=foobar`,
    )

    // find
    expect(await UPSTREAMS.findOne({ type: upstream.type })).toMatchObject(
      upstream,
    )
    expect(
      await UPSTREAMS.findOne({ type: upstream.type, gteWeight: 0.5 }),
    ).toMatchObject(upstream)
    expect(
      await UPSTREAMS.findOne({ type: upstream.type, gtWeight: 0.5 }),
    ).toBeUndefined()
    expect(
      await UPSTREAMS.findOne({ type: upstream.type, gteWeight: 1 }),
    ).toBeUndefined()

    // update
    const updated = await UPSTREAMS.updateOne(upstream, {
      host: `${randHost()}/${randPath()}/`,
      path: randPath(),
      headers: Nil,
      searchs: Nil,
      auth: Nil,
      interval: 1.5,
      weight: Nil,
    })

    expect(updated.url().toString()).toBe(`${updated.host}${updated.path}`)
    expect(updated.link()).toBe(`${updated.host}${updated.path}`)

    expect(updated).toMatchObject({
      id: expect.toEqualUuid(upstream.id),
      host: expect.any(String),
      path: expect.any(String),
      headers: expect.toBeEmpty(),
      searchs: expect.toBeEmpty(),
      auth: expect.toBeEmpty(),
      interval: 1.5,
      weight: 0,
    })
  })
})

describe('pool', () => {
  test('sync', async () => {
    const type = randStr()
    const pool = new Pool(UPSTREAMS, type, { ttl: 3 })
    await insertUpstreams({ type, host: randStr(), weight: 1 })
    expect(await pool.sample()).not.toBeUndefined()
    await deleteUpstreams({ type })
    expect(await pool.sample()).not.toBeUndefined() // not sync yet
    await sleep(4000)
    await expect(() => pool.sample()).rejects.toThrow(NoUpstreamError)
  })

  test('NoUpstreamError', async () => {
    const type = randStr()
    const pool = new Pool(UPSTREAMS, type, { ttl: 3 })
    await insertUpstreams({ type, host: randStr() }) // no weight
    await expect(() => pool.sample()).rejects.toThrow(NoUpstreamError)
  })

  test('same', async () => {
    const type = randStr()
    const pool = new Pool(UPSTREAMS, type, { ttl: 10 })
    await insertUpstreams({ type, host: randStr(), weight: 1 }, 10)
    const upstream = await pool.sample()
    for (let i = 0; i < 20; ++i) {
      const sampled = await pool.sample({ type: 'same', upstream })
      expect(sampled.id).toEqualUuid(upstream.id)
    }
    await deleteUpstreams({ type })
  })

  test('same but get different upstream', async () => {
    const type = randStr()
    const pool = new Pool(UPSTREAMS, type, { ttl: 10 })
    await insertUpstreams({ type, host: randStr(), weight: 1 })
    const id = toUuid()
    for (let i = 0; i < 20; ++i) {
      const upstream = await pool.sample({ type: 'same', upstream: id })
      expect(upstream.id).not.toEqualUuid(id)
    }
    await deleteUpstreams({ type })
  })

  test('diff', async () => {
    const type = randStr()
    const pool = new Pool(UPSTREAMS, type, { ttl: 10 })
    await insertUpstreams({ type, host: randStr(), weight: 1 }, 2)
    const upstream = await pool.sample()
    for (let i = 0; i < 20; ++i) {
      const sampled = await pool.sample({ type: 'diff', upstream })
      expect(sampled.id).not.toEqualUuid(upstream.id)
    }
    await deleteUpstreams({ type })
  })

  test('diff but get same upstream', async () => {
    const type = randStr()
    const pool = new Pool(UPSTREAMS, type, { ttl: 10 })
    await insertUpstreams({ type, host: randStr(), weight: 1 }, 1)
    const upstream = await pool.sample()
    for (let i = 0; i < 20; ++i) {
      const sampled = await pool.sample({ type: 'diff', upstream })
      expect(sampled.id).toEqualUuid(upstream.id)
    }
    await deleteUpstreams({ type })
  })

  test('cooldown', async () => {
    const type = randStr()
    const pool = new Pool(UPSTREAMS, type, {
      ttl: 10,
      minCooldown: 5,
      maxCooldown: 7,
      cooldown: 2,
      minFailures: 2,
    })
    await insertUpstreams({ type, host: randStr(), weight: 1 }, 1)

    let now = Date.now()
    const upstream = await pool.sample()

    await sample(0, 1)
    pool.fail(upstream)
    await sample(0, 1) // failures: 1
    pool.fail(upstream)
    await sample(4.8, 5.8) // failures: 2, cooldown 5s (minCooldown)
    pool.fail(upstream)
    await sample(5.8, 6.8) // failures: 3, cooldown 6s (cooldown * failures)
    pool.fail(upstream)
    await sample(6.8, 7.8) // failures: 4, cooldown 7s (maxCooldown)
    pool.succeed(upstream)
    await sample(0, 1)

    await deleteUpstreams({ type })

    async function sample(min: number, max: number) {
      await pool.sample()
      const tmp = Date.now()
      const duration = (tmp - now) / 1000
      now = tmp
      expect(duration > min && duration < max).toBeTruthy()
    }
  })

  /*
      minFailures: 3,
      minCooldown: 1,
      cooldown: 2,
      maxCooldown: 5,
      */
})

async function insertUpstreams(values: UpstreamInsert, n = 10) {
  for (let i = 0; i < n; ++i) await UPSTREAMS.insertOne(values)
}

async function deleteUpstreams(query: UpstreamQuery) {
  await UPSTREAMS.deleteMany(query)
}

function randStr(length = 4): string {
  assert(Number.isInteger(length) && length > 0)
  return randomBytes(length / 2)
    .toString('hex')
    .substring(0, length)
}

function randHost(): string {
  return `https://${randStr()}.com`
}

function randPath(): string {
  return `${randStr()}/${randStr()}`
}

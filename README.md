# @potentia/model.upstream

`Model.upstream` is a upstream pooling mechanism built on top of
[@potentia/model](https://github.com/potentia-inc/ts-model).

## Usage
```typescript
import { Pool, Upstreams } from '@potentia/model.lock'
// or
// import { Pool } from '@potentia/model.lock/pool'
// import { Upstream } from '@potentia/model.lock/upstream'

const upstreams = new Upstreams({ connection: ... })
const u = await upstreams.insertOne({
  type: 'foobar',
  host: 'https://foobar.com/api',
  path: 'foo',
  headers: { ... },
  searchs: { a: 'foo', b: 'bar' },

  // The minimum interval (in seconds) between consecutive requests. Default: 0.01.
  interval: 0.2,

  // The weight of this upstream. Set to a positive number to enable it. Default: 0.
  weight: 0.5,
})

u.url() // URL object
u.url().toString() // https://foobar.com/api/foo?a=foo&b=bar
u.link() // the same as u.url().toString()
u.link({
  path: 'bar',
  searchs: { c: 'foobar' },
}) // https://foobar.com/api/bar?a=foo&b=bar&c=foobar


const pool = new Pool(upstreams, 'foobar', {
  // TTL (in seconds) for the upstream cache.
  // Default: 60 (syncs with the database every 60 seconds).
  ttl: 60,

  // Enables weight decay when the failure count reaches minFailures.
  // Default: 0.
  minFailures: 0,

  // Mimimum weight after decay. Default: 0.01.
  minWeight: 0.1,

  // Decay factor applied to weight. Default: 0.8.
  decay: 0.5,
})

/*
Weight decay logic:
  if success:
    reset weight to its original value
  if failure:
    if failure count >= minFailures:
      weight = weight * decay
*/

// Select an upstream randomly, weighted by upstream.weight.
const u = await pool.sample()

// Pick the given upstream if available.
await pool.sample({ type: 'same', upstream: u })

// Pick a different upstream if possible.
await pool.sample({ type: 'diff', upstream: u })

// Marks u as successful (resets the failure count to 0).
pool.succeed(u)

// Marks u as failed (increments the failure count).
pool.fail(u)
```

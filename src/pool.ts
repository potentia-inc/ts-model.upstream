import assert from 'node:assert'
import { debug } from 'node:util'
import { NoUpstreamError } from './error.js'
import { pickId, pickIdOrNil } from './model.js'
import { isNullish } from './type.js'
import { Upstream, UpstreamOrId, Upstreams } from './upstream.js'
import { sleep } from './util.js'

const DEBUG = debug('potentia:model:upstream')
const DEBUG_VERBOSE = debug('potentia:model:upstream:verbose')

type Hint = {
  type: 'same' | 'diff'
  upstream: UpstreamOrId
}

type PoolOptions = {
  ttl: number
  minFailures: number
  cooldown: number
  minCooldown: number
  maxCooldown: number
}

export class Pool {
  #upstreams: Upstreams
  #type: string
  #options: PoolOptions

  #caches: Upstream[] = []
  #failures: Map<string, number> = new Map()
  #times: Map<string, number> = new Map()
  #expiresAt: number = 0

  constructor(
    upstreams: Upstreams,
    type: string,
    options: Partial<PoolOptions> = {},
  ) {
    this.#upstreams = upstreams
    this.#type = type
    this.#options = {
      ttl: options.ttl ?? 60,
      minFailures: options.minFailures ?? 0,
      cooldown: options.cooldown ?? 10,
      minCooldown: options.minCooldown ?? 0,
      maxCooldown: options.maxCooldown ?? 86400,
    }
    assert(
      this.#options.ttl >= 1 &&
        this.#options.minFailures >= 0 &&
        this.#options.cooldown >= 0 &&
        this.#options.minCooldown >= 0 &&
        this.#options.maxCooldown >= 0 &&
        this.#options.maxCooldown >= this.#options.minCooldown,
    )
  }

  async sample(hint?: Hint): Promise<Upstream> {
    await this.#sync()

    // collect the candidates
    const candidates = (() => {
      const id = pickIdOrNil(hint?.upstream)
      const filtered = this.#caches.filter((x) => {
        if (isNullish(hint)) return true
        const eq = id?.equals(x.id)
        return (hint?.type === 'diff' && !eq) || (hint?.type === 'same' && eq)
      })
      return isNullish(hint) || filtered.length > 0 ? filtered : this.#caches
    })()
    if (candidates.length === 0) throw new NoUpstreamError()

    // weighted sample a upstream
    const upstream = (() => {
      const sum = candidates.reduce((s, x) => s + x.weight, 0)
      let rand = Math.random() * sum
      for (const x of candidates) if ((rand -= x.weight) <= 0) return x
      throw new NoUpstreamError() // should not reach here!
    })()

    // wait awhile if necessary
    const key = this.#key(upstream)
    const cooldown = this.#cooldown(upstream) * 1000
    const duration = (this.#times.get(key) ?? 0) + cooldown - Date.now()
    if (duration > 0) await sleep(duration)
    this.#times.set(key, Date.now())
    DEBUG(`sample: ${candidates.length} ${key}`)
    return upstream
  }

  succeed(upstream: UpstreamOrId) {
    const key = this.#key(upstream)
    DEBUG(`succeed:${key}`)
    this.#failures.set(key, 0)
  }

  fail(upstream: UpstreamOrId) {
    const key = this.#key(upstream)
    DEBUG(`fail:${key}`)
    this.#failures.set(key, (this.#failures.get(key) ?? 0) + 1)
  }

  debug() {
    const now = new Date()
    console.error(
      now.toISOString(),
      now.getTime(),
      this.#type,
      this.#options,
      this.#expiresAt,
    )
    for (const x of this.#caches) {
      const key = this.#key(x)
      console.error(
        key,
        this.#failures.get(key) ?? 0,
        this.#times.get(key) ?? 0,
        this.#cooldown(x),
      )
    }
  }

  async #sync() {
    const now = Date.now()
    if (this.#expiresAt > now) {
      DEBUG(`sync: ignored`)
      return
    }

    const upstreams = await this.#upstreams.findMany({
      type: this.#type,
      gtWeight: 0,
    })
    const keys = new Set<string>()
    upstreams.forEach((x) => {
      keys.add(this.#key(x))
    })

    // remove upstreams
    for (const x of this.#caches) {
      const key = this.#key(x)
      if (!keys.has(key)) {
        this.#times.delete(key)
        this.#failures.delete(key)
      }
    }
    this.#caches.splice(0, this.#caches.length, ...upstreams)
    this.#expiresAt = now + this.#options.ttl * 1000
    DEBUG(`sync: ${this.#caches.length} ${this.#expiresAt}`)
    DEBUG_VERBOSE(
      JSON.stringify(
        this.#caches.map((x) => {
          const key = this.#key(x)
          return {
            key,
            weight: x.weight,
            failures: this.#failures.get(key) ?? 0,
            cooldown: this.#cooldown(x),
          }
        }),
      ),
    )
  }

  #key(upstream: UpstreamOrId): string {
    return String(pickId(upstream))
  }

  #cooldown(upstream: Upstream): number {
    const key = this.#key(upstream)
    const failures = this.#failures.get(key) ?? 0
    if (failures === 0 || failures < this.#options.minFailures) {
      return upstream.interval
    }
    const cooldown = Math.max(
      this.#options.minCooldown,
      Math.min(failures * this.#options.cooldown, this.#options.maxCooldown),
    )
    return Math.max(upstream.interval, cooldown)
  }
}

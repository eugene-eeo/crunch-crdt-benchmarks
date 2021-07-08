const level = require('leveldown')
const msgpack = require('msgpack-lite')
// const VC = require('../vector-clock')

function put(db, k, v) {
    return new Promise((resolve, reject) => {
        db.put(k, v, (err) => {
            if (err) { reject(err) }
            else     { resolve() }
        })
    })
}

function get(db, k) {
    return new Promise((resolve, reject) => {
        db.get(k, {asBuffer: true}, (err, val) => {
            if (err !== null) { reject(err) }
            else              { resolve(val) }
        })
    })
}

class OpStore {
    constructor(path) {
        this.db = level(path)
        this._open = new Promise((resolve, reject) => {
            this.db.open((err) => {
                if (err) { reject(err) }
                else     { resolve() }
            })
        })
    }

    key(op) {
        return `${op.id} ${op.clock[op.id]}`
    }

    async add(op) {
        await this._open
        await put(this.db, this.key(op), msgpack.encode(op))
    }

    async get_op(user, seq) {
        const buf = await get(this.db, `${user} ${seq}`)
        return msgpack.decode(buf)
    }

    async get(curr, need) {
        await this._open
        const rv = {}
        for (let key of Object.keys(need)) {
            const a = curr[key] || 0
            const b = need[key]
            for (let i = a + 1; i <= b; i++) {
                if (!rv[key])
                    rv[key] = []
                rv[key].push(await this.get_op(key, i))
            }
        }
        return rv
    }
}

module.exports = OpStore

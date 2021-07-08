//           op
// Network -----> Causality ------> CRDT
//                 Buffer            |
//                    ^   feedback   |
//                    +--------------+


class NullOp {
    constructor(op) {
        this.op = op
    }

    encode(fn) {
        return JSON.stringify(fn(this.op))
    }

    static decode(buf, fn) {
        return new NullOp(fn(JSON.parse(buf)))
    }
}


class ScalarOp {
    constructor(id, seq, op) {
        this.id = id
        this.seq = seq
        this.op = op
    }

    encode(fn) {
        return JSON.stringify([this.id, this.seq, fn(this.op)])
    }

    static decode(buf, fn) {
        const [id, seq, op] = JSON.parse(buf)
        return new ScalarOp(id, seq, fn(op))
    }
}


class VectorOp {
    constructor(id, vc, op) {
        this.id = id
        this.vc = vc
        this.op = op
    }

    get seq() {
        return this.vc[this.id]
    }

    encode(fn) {
        return JSON.stringify([this.id, this.vc, fn(this.op)])
    }

    static decode(buf, fn) {
        const [id, vc, op] = JSON.parse(buf)
        return new VectorOp(id, vc, fn(op))
    }
}


class NullBuffer {
    constructor(id, isReady, integrate) {
        this.id = id
        this.isReady = isReady
        this.integrate = integrate
    }
    local(op)  { return new NullOp(op) }
    remote(op) { this.integrate(op.op) }
}


class SCOrderBuffer extends NullBuffer {
    constructor(id, isReady, integrate) {
        super(id, isReady, integrate)
        this.pending = new Map()
        this.vv = {[id]: 0}
    }

    local(op) {
        this.vv[this.id]++
        return new ScalarOp(this.id, this.vv[this.id], op)
    }

    add_pending(op) {
        if (!this.pending.get(op.id))
            this.pending.set(op.id, [])
        this.pending.get(op.id).push(op)
    }

    canIntegrate(op) {
        return op.seq === (this.vv[op.id] || 0) + 1 && this.isReady(op.op)
    }

    drain() {
        let changed = true
        while (changed) {
            changed = false
            for (let [id, arr] of this.pending.entries()) {
                let applied = 0
                for (const op of arr) {
                    if (op.seq <= (this.vv[op.id] || 0)) {
                        applied++
                        continue
                    }
                    if (this.canIntegrate(op)) {
                        this.integrate(op.op)
                        this.vv[op.id] = op.seq
                        applied++
                        changed = true
                    } else {
                        break
                    }
                }
                arr.splice(0, applied)
                if (arr.length === 0)
                    this.pending.delete(id)
            }
        }
    }

    remote(op) {
        // fast path -- duplicate
        if (op.seq <= (this.vv[op.id] || 0)) return
        if (this.canIntegrate(op)) {
            this.integrate(op.op)
            this.vv[op.id] = op.seq
        } else {
            // slow path
            this.add_pending(op)
        }
        if (this.pending.size > 0)
            this.drain()
    }
}


// Is vc causally ready?
function causallyReady(have, author, need) {
    author = author.toString()
    for (const [key, seq] of Object.entries(need)) {
        if (!((key === author)
              ? (have[key] || 0) === seq - 1
              : (have[key] || 0) >=  seq)) {
            return false
        }
    }
    return true
}


class VCOrderBuffer extends SCOrderBuffer {
    constructor(id, __, integrate) {
        super(id,
              (op) => causallyReady(this.vv, op.id, op.vc),
              integrate)
    }

    local(op) {
        this.vv[this.id]++
        return new VectorOp(this.id, Object.assign({}, this.vv), op)
    }
}


SCOrderBuffer.Op = ScalarOp
VCOrderBuffer.Op = VectorOp


module.exports = {
    NullBuffer,
    SCOrderBuffer,
    VCOrderBuffer,
}

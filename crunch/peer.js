class Peer {
    constructor(id) {
        this.id = id
        this.vc = {[id]: 0}
        this.obs = new Set()
    }

    local(rawOp) {
        return new Op(this.id, this.increment(), rawOp)
    }

    remote(op) {
        this.obs.add(op.id)
        this.vc[op.id] = op.clock[op.id]
        return op.op
    }

    increment(rv=true) {
        this.vc[this.id]++
        if (rv) {
            // return Object.assign({}, this.vc)
            const vc = {[this.id]: this.vc[this.id]}
            if (this.obs.size > 0) {
                for (let id of this.obs)
                    vc[id] = this.vc[id]
                this.obs.clear()
            }
            return vc
        }
    }
}

class Op {
    constructor(id, clock, op) {
        this.id = id
        this.clock = clock
        this.op = op
    }

    clone() {
        return new Op(this.id, this.clock, this.op)
    }

    static decode(buf, fn) {
        const arr = JSON.parse(buf)
        return new Op(arr[0], arr[1], fn(arr[2]))
    }

    encode(fn) {
        return JSON.stringify([this.id, this.clock, fn(this.op)])
    }
}

Peer.Op = Op
module.exports = Peer

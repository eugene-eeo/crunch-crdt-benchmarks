// Wrap the SOCT2 log to follow the Peer API
// .remote(op)
// .local(rawOp)

const VC = require('../vector-clock')
const Peer = require('./peer')

class SOCT2Peer extends Peer {
    constructor(id, type) {
        super(id)
        this.log = []
        this.type = type
    }

    local(rawOp) {
        const op = super.local(rawOp)
        this.log.push(op)
        return op
    }

    remote(op) {
        super.remote(op)
        op = this._merge(op)
        this.log.push(op)
        return op.op
    }

    gc(vc) {
        const n = this.log.length;
        for (let i = n - 1; i >= 0; i--) {
            let opVc = this.log[i].clock
            if (   VC.isIdentical(opVc, vc)
                || VC.compare(opVc, vc) === VC.LT) {
                this.log.splice(i, 1)
            }
        }
    }

    _merge(op) {
        const separationIndex = this._separate(op)
        const op2 = op.clone()
        for (let i = separationIndex; i < this.log.length; i++) {
            op2.op = this.type.transform(
                op2.op,
                this.log[i].op,
                op2.id < this.log[i].id ? 'left' : 'right'
            )
        }
        return op2
    }

    _separate(op) {
        let separationIndex = 0
        let logSize = this.log.length

        for (let i = 0; i < logSize; i++) {
            let localOp = this.log[i]
            let localSite = localOp.id
            if (localOp.clock[localSite] < (op.clock[localSite] || 0)) {
                for (let j = i; j > separationIndex; j--) {
                    this._transposeBackward(j)
                }
                separationIndex++
            }
        }

        return separationIndex
    }

    _transposeBackward(index) {
        let opj = this.log[index]
        let opk = this.log[index - 1]
        let opi = new Peer.Op(
            opj.id,
            opj.clock,
            this.type.prune(opj.op, opk.op),
        )
        opk = new Peer.Op(
            opk.id,
            opk.clock,
            this.type.transform(opk.op, opi.op,
                opk.id < opi.id ? 'left' : 'right'),
        )
        this.log[index - 1] = opi
        this.log[index] = opk
    }
}

module.exports = SOCT2Peer

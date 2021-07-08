const DS_TableList = require('./DS_TableList');
const { crdt } = require('./deltaList');

module.exports = class Treedoc {
    constructor(id) {
        this.s = id;
        this.c = 0;
        this.doc = {state: crdt.base_value()};
    }

    value() {
        return crdt.getValue.call(this.doc).join('');
    }

    _nextOpID() {
        return {rID: this.s, oC: ++this.c}
    }

    static fromJSON(o) {
        const t = new Treedoc(o.s);
        t.c = o.c;
        t.doc = {state: {
            list: new DS_TableList(o.d.l),
            removed: o.d.r,
            removes: o.d.R,
            oldElements: o.d.o,
        }};
        return t;
    }

    toJSON() {
        return {
            s: this.s,
            c: this.c,
            d: {
                l: this.doc.state.list.list,
                r: this.doc.state.removed,
                R: this.doc.state.removes,
                o: this.doc.state.oldElements,
            },
        }
    }

    insertAt(pos, ch) {
        const {toNetwork} = crdt.operations.add.local.call(this.doc, pos, ch, this._nextOpID());
        this.applyRemote(toNetwork);
        return toNetwork;
    }

    deleteAt(pos) {
        const {toNetwork} = crdt.operations.delete.local.call(this.doc, pos, this._nextOpID());
        this.applyRemote(toNetwork);
        return toNetwork;
    }

    applyRemote(op) {
        if (op.d)
            return crdt.operations.delete.remote.call(this.doc, op)
        if (op.v)
            return crdt.operations.add.remote.call(this.doc, op)
    }
}

// Encode each CRDT as efficiently as possible
// Each CRDT should have its own encoding method:
//   Encoder.encodeOp(op)  --> buf
//   Encoder.decodeOp(buf) --> op
//   Encoder.encodeDoc(doc) --> obj
//   Encoder.decodeDoc(obj) --> doc


// Many CRDTs have an operation object that can be directly encoded.
// This wrapper is used to avoid calling JSON.stringify(...),
// JSON.parse(...) repeatedly.
const wrap = (enc) => ({
    encodeOp:  op  => JSON.stringify(enc.op2obj(op)),
    decodeOp:  buf => enc.obj2op(JSON.parse(buf)),
    encodeDoc: doc => JSON.stringify(enc.doc2obj(doc)),
    decodeDoc: (buf, id) => enc.obj2doc(JSON.parse(buf), id),
    ...enc,
})

const noop = x => x;
const encodings = {
    yjs() {
        const Y = require('yjs')
        return {
            encodeOp: noop, // already encoded
            decodeOp: noop,
            encodeDoc: doc => Y.encodeStateAsUpdateV2(doc),
            decodeDoc: buf => {
                const doc = new Y.Doc()
                doc.gc = false
                Y.applyUpdateV2(doc, buf)
                return doc
            },
        }
    },
    rga() {
        const RGA = require('../RGA/Content')
        const Insert = require('../RGA/Insert')
        const Delete = require('../RGA/Delete')
        const Chr = require('../RGA/Chr')
        const op2obj = x =>
            (x.chr
                ? [x.preChrId, x.chr.user, x.chr.ch, x.chr.id]
                : [x.chrId]);
        const obj2op = a =>
            (a.length === 1)
                ? new Delete(a[0])
                : new Insert(a[0], new Chr(a[1], a[2], a[3]));
        return wrap({
            op2obj: a => a.map(op2obj),
            obj2op: a => a.map(obj2op),
            doc2obj: doc => doc.toJSON(),
            obj2doc: obj => RGA.fromJSON(obj),
        })
    },
    logoot() {
        const Logoot = require('../logoot')
        return wrap({
            op2obj:  noop,
            obj2op:  noop,
            doc2obj: doc => doc.toJSON(),
            obj2doc: obj => Logoot.fromJSON(obj),
        })
    },
    woot() {
        const Woot = require('../woot-crdt/src/w-string')
        const a2id = ([site, clock]) => ({site, clock});
        const id2a = ({site, clock}) => [site, clock];
        const op2obj = o => (
            o.isDelete
                ? [id2a(o.id)]
                : [id2a(o.id), o.value, id2a(o.prevId), id2a(o.nextId)]
        );
        const obj2op = a => (
            a.length === 1
                ? {isDelete: true,  id: a2id(a[0])}
                : {isDelete: false, id: a2id(a[0]), value: a[1], prevId: a2id(a[2]), nextId: a2id(a[3])}
        );
        return wrap({
            op2obj: a => a.map(op2obj),
            obj2op: a => a.map(obj2op),
            encodeDoc: doc => doc.getState(),
            decodeDoc: buf => new Woot(null, buf),
        })
    },
    lseq() {
        const LSEQ = require('../lseqtree')
        const id2a = ({_d, _s, _c}) => ([_d, _s, _c]);
        const a2id = ([_d, _s, _c]) => ({_d, _s, _c, _base: {_b: 15}});
        const op2obj = o => (
            o.id
                ? [id2a(o.id), o.elem]
                : [id2a(o)]
        );
        const obj2op = a => (
            a.length === 2
                ? {id: a2id(a[0]), elem: a[1]}
                : a2id(a[0])
        );
        return wrap({
            op2obj: a => a.map(op2obj),
            obj2op: a => a.map(obj2op),
            doc2obj: noop,
            obj2doc: obj => (new LSEQ()).fromJSON(obj),
        })
    },
    ot() {
        const OTDoc = require('../ot-text-tp2/wrapper')
        return wrap({
            op2obj: noop,
            obj2op: noop,
            doc2obj: doc => doc.toJSON(),
            obj2doc: obj => OTDoc.fromJSON(obj),
        })
    },
    dottedLogootSplit() {
        const DottedLogootSplit = require('dotted-logootsplit')
        return wrap({
            op2obj: ops => {
                const arr = new Array(ops.length)
                for (let i = 0; i < ops.length; i++) {
                    const isDelete = ops[i].content.constructor === DottedLogootSplit.ConcatLength
                    arr[i] = [
                        isDelete ? 'D' : 'I',
                        ops[i].lowerPos.parts.map(({priority, replica, seq}) => [priority, replica, seq]),
                        isDelete
                            ? ops[i].content.length
                            : ops[i].content,
                    ]
                }
                return arr
            },
            obj2op: arr => {
                const ops = new Array(arr.length)
                for (let i = 0; i < arr.length; i++) {
                    const parts = arr[i][1].map(([priority, replica, seq]) => ({priority, replica, seq}))
                    const lowerPos = DottedLogootSplit.SimpleDotPos.fromPlain({ parts })
                    const content = arr[i][0] === 'I'
                        ? arr[i][2]
                        : new DottedLogootSplit.ConcatLength(arr[i][2])
                    ops[i] = new DottedLogootSplit.Block(lowerPos, content)
                }
                return ops
            },
            doc2obj: noop,
            obj2doc: obj => (DottedLogootSplit.avl.deltaEditableListFromPlain(
                DottedLogootSplit.SimpleDotBlockFactory,
                x => typeof x === 'string' ? x : undefined,
            )(obj)),
        })
    },
    treedoc() {
        const Treedoc = require('../treedoc')
        const id2a = ({p, d: {r, o}}) => [p, r, o];
        const a2id = ([p, r, o]) => ({p, d: {r, o}});
        return wrap({
            op2obj: a => a.map(op => (op.v
                ? [id2a(op.id), op.v]
                : [op.d.r, op.d.o, op.delID.r, op.delID.o])),
            obj2op: u => u.map(a => (a.length === 2
                ? {id: a2id(a[0]), v: a[1]}
                : {d: {r: a[0], o: a[1]}, delID: {r: a[2], o: a[3]}})),
            doc2obj: doc => doc.toJSON(),
            obj2doc: obj => Treedoc.fromJSON(obj),
        })
    },
};

module.exports = key => encodings[key]()

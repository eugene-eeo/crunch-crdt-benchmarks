// Utilities for ctx objects
// ctx: {
//   id,
//   cfg: cfg,
//   encoding: encoding,
//   peer: null | Peer,
// }
const process = require('process')
const uconf = require('./uconf')
const Peer = require('../crunch/peer')
const GENERIC_IDS = require('../generic-ids.json')


const USE_PEER = !!process.env['CRUNCH_IS_GIT']
const NO_PEER = new Set(['Yjs', 'Automerge', 'Automerge+WASM'])

// A bit of explanation: this file was created as initially, we
// wanted to measure vector clock overhead as part of the operation
// overhead -- as Yjs and Automerge bring their own causality,
// this means we have to add a wrapper on top of the _other_
// CRDTs to give them vector clocks. This wrapper is the
// Peer class:
//
//    const peer = new Peer(1)
//    const op = peer.local(op)
//    console.log(op.encode(FN))
//    // ==> '[{"1":1,},1,...]'
//    //       ^ vc, author, FN(op)
//    // FN is some function that converts the _op_, passed
//    // to peer.local(...) to another object (e.g. an array).
//
// As time went on I decided to ignore this vector clock overhead.
// However most code was already using this utility library,
// so we have this mess.
//
// Example usage, to get a RGA _context_.
//
//    const get_ctx = make_get_ctx('RGA')
//    const ctx = get_ctx(1)  // Make a document with logical id 1.
//    console.log(ctx.id)     // This is the `real' id of the document,
//                            // a random 32-bit integer. If we had
//                            // used Automerge/Yjs, this would be
//                            // equivalent to the logical id.
//
// The context includes a configuration, that tells us how to
// modify the CRDT. Configurations can be found in crunch/uconf.js.
//
//    ctx.cfg.doc => CRDT document (e.g. Automerge Document)
//    ctx.cfg.encoding => CRDT encoding (see crunch/encode.js)
//    ctx.cfg.value(doc) => string
//    ctx.cfg.local(doc, op) => operation
//    ctx.cfg.remote(doc, decoded remote op)
//
// We can then modify the context:
//
//    apply_local(ctx, [0, 0, 'h'])
//    apply_local(ctx, [1, 0, 'i'])
//    apply_remote(ctx, ...)
//    cleanup(ctx)  // when we are done


function make_get_ctx(name, args=[]) {
    const conf = uconf[name].apply(null, args)
    return function get_ctx(id, doc) {
        id = NO_PEER.has(name) ? id : GENERIC_IDS[id]
        const peer = (!USE_PEER || NO_PEER.has(name))
            ? null
            : new Peer(id)
        return {
            cfg: conf.wrap(doc || conf.createDoc(id)),
            encoding: conf.encoding,
            peer,
        }
    }
}


function cleanup(ctx) {
    if (ctx.cfg.cleanup)
        ctx.cfg.cleanup(ctx.cfg.doc)
    ctx.peer = null
    ctx.cfg = null
    ctx.encoding = null
}


function decode_op(ctx, buf) {
    // Decode operation according to ctx
    return (ctx.peer !== null)
        ? Peer.Op.decode(buf, ctx.encoding.obj2op)
        : ctx.encoding.decodeOp(buf)
}


function encode_op(ctx, op) {
    // Encode operation according to ctx
    return (ctx.peer !== null)
        ? op.encode(ctx.encoding.op2obj)
        : ctx.encoding.encodeOp(op)
}


function apply_local(ctx, edit) {
    // Apply local operation according to ctx
    return (ctx.peer !== null)
        ? ctx.peer.local(ctx.cfg.local(ctx.cfg.doc, edit))
        : ctx.cfg.local(ctx.cfg.doc, edit)
}


function apply_remote(ctx, op) {
    // Apply local operation according to ctx
    return (ctx.peer !== null)
        ? ctx.cfg.remote(ctx.cfg.doc, ctx.peer.remote(op))
        : ctx.cfg.remote(ctx.cfg.doc, op)
}


function cfg_value(ctx) {
    return ctx.cfg.value(ctx.cfg.doc)
}


module.exports = {
    NO_PEER,
    make_get_ctx,
    cleanup,
    decode_op,
    encode_op,
    apply_local,
    apply_remote,
    cfg_value,
}

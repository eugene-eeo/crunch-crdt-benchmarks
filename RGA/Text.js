'use strict';

const Chr = require('./Chr');

class Node {
  constructor(chr) {
    this.val = chr;
    this.next = null;
  }

  visibleIndexFrom(start) {
    let d = -1;
    while (start !== this) {
        d++;
        start = start.next;
        while (start !== this && start.val.del)
            start = start.next;
    }
    return d;
  }
}


// A linked-list CRDT text obj
module.exports = class Text {
  constructor() {
    this.head = new Node(new Chr(-1, 0, 0));
    this.tail = new Node(new Chr(-1, 0, 0));
    this.length = 0;
    this.map = new Map([[this.head.val.getChrId(), this.head]]);
    this.head.next = this.tail;
  }

  len() {
    return this.length;
  }

  cnt() {
    return this.map.size;
  }

  //[inside replica] add a node at location `loc`
  // `loc` should alwayws be valid because it only triggered when there is a change in editor
  add(loc, chr) {
    // Create a new Node
    let node = new Node(chr);

    let idx = 0;
    let cur = this.head;
    while (idx < loc || cur.val.del) {
      if (!cur.val.del) {
        idx++;
      }

      cur = cur.next;
    }

    // insert a node
    node.next = cur.next;
    cur.next = node;
    this.map.set(node.val.getChrId(), node);

    this.length++;

    // generate `preChrId` for other replica
    return cur.val.getChrId();
  }

  // [inside replica] remove at location `loc`
  // `loc` should alwayws be valid because it only triggered when there is a change in editor
  remove(loc) {
    let idx = -1;
    let cur = this.head;
    while (idx < loc || cur.val.del) {
      if (!cur.val.del) {
        idx++;
      }

      cur = cur.next;
    }

    if (!cur.val.del) {
      // remove the location by setting the flag
      cur.val.del = true;
      this.length--;
    }

    return cur.val.getChrId();
  }

  // [outside replica] remove a chr
  addAfter(preChrId, chr, returnIndex=false) {
    // Create a new Node
    let node = new Node(new Chr(chr.user, chr.ch, chr.id));
    // already here?
    if (this.map.has(node.val.getChrId()))
      return

    let cur = this.map.get(preChrId);
    // skip the larger ids
    while (cur.next !== this.tail && node.val.lessThan(cur.next.val)) {
      cur = cur.next;
    }

    // insert a node
    node.next = cur.next;
    cur.next = node;
    this.map.set(node.val.getChrId(), node);

    this.length++;
    if (returnIndex)
      return {index: node.visibleIndexFrom(this.head), ch: node.val.ch}
  }

  // [outside replica]remove a node with `chrId`
  removeAt(chrId, returnIndex=false) {
    let cur = this.map.get(chrId)
    if (!cur.val.del) {
      // remove the location by setting the flag
      cur.val.del = true;
      this.length--;
      if (returnIndex)
        return {index: cur.visibleIndexFrom(this.head)}
    }
  }

  // get all non-delete charactors together
  toString() {
    let cur = this.head.next;
    let str = '';
    while (cur !== this.tail) {
      if (!cur.val.del) {
        str += cur.val.ch;
      }

      cur = cur.next;
    }

    return str;
  }

  isEmpty() {
    return this.length === 0;
  }

  toJSON() {
    // Return the ordered list as POJOs
    const arr = [];
    let curr = this.head.next;
    while (curr !== this.tail) {
      arr.push(curr.val);
      curr = curr.next;
    }
    return arr;
  }

  static fromJSON(arr) {
    // Construct RGA from JSON
    const text = new Text();
    let prev = text.head;
    for (let chr of arr) {
      const node = new Node(new Chr(chr.user, chr.ch, chr.id));
      node.val.del = chr.del;
      text.map.set(node.val.getChrId(), node);
      node.next = prev.next;
      prev.next = node;
      prev = node;
    }
    return text;
  }
}

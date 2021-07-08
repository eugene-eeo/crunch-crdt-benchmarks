'use strict';

const Chr = require('./Chr');
const Insert = require('./Insert');
const Delete = require('./Delete');
const Text = require('./Text');

// editor content per user
module.exports = class Content {
  constructor(user) {
    this.user = user;
    this.text = new Text();
  }

  // apply an inner-replica operation
  apply(loc, type, ch) {
    if (type === 'ins') {
      const id = this.text.cnt();
      const chr = new Chr(this.user, ch, id);
      const preChrId = this.text.add(loc, new Chr(this.user, ch, id));
      return new Insert(preChrId, chr);
    }

    if (type === 'del') {
      return new Delete(this.text.remove(loc));
    }
  }

  applyRemote(op, returnIndex=false) {
      if (op.preChrId) {
          this.applyInsert(op, returnIndex)
      } else {
          this.applyDelete(op, returnIndex)
      }
  }

  // apply an inter-replica insert
  applyInsert(ins, returnIndex) {
    const rv = this.text.addAfter(ins.preChrId, ins.chr, returnIndex);
    return rv
  }

  // apply an inter-replica Delete
  applyDelete(del, returnIndex) {
    return this.text.removeAt(del.chrId, returnIndex);
  }

  len() {
    return this.text.len();
  }

  toString() {
    return this.text.toString();
  }

  toJSON() {
    return {
      user: this.user,
      text: this.text.toJSON(),
    };
  }

  static fromJSON(obj) {
    const content = new Content(obj.user);
    content.text = Text.fromJSON(obj.text);
    content.id = content.text.cnt();
    return content;
  }
}

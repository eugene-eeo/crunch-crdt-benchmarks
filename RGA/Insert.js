'use strict';

// insert a ch after `preChrId`
module.exports = class Insert {
  constructor(preChrId, chr) {
    this.preChrId = preChrId; // insert a ch after preChrId
    this.chr = chr;
  }
}

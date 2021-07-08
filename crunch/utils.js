const assert = require('assert');
const process = require('process');

function sortAsc(values) {
    values.sort((a, b) => {
        if (a < b) return -1;
        if (a > b) return +1;
        return 0;
    });
    return values;
}

//Credit D3: https://github.com/d3/d3-array/blob/master/LICENSE
function quantileSorted(values, p) {
    var n = values.length;
    if (!n) {
        return;
    }

    if (p <= 0 || n < 2) {
      return +values[0];
    }

    if (p >= 1) {
      return +values[n - 1];
    }

    var i = (n - 1) * p,
      i0 = Math.floor(i),
      value0 = +values[i0],
      value1 = +values[i0 + 1];

    return value0 + (value1 - value0) * (i - i0);
}

function getHeapUsed(gc) {
    if (gc) {
        assert(global.gc, 'requires --expose-gc');
        global.gc();
    }
    return process.memoryUsage().heapUsed;
}

module.exports = {
    getHeapUsed,
    BigInt,
    sortAsc,
    quantileSorted,
    median: (v) => quantileSorted(v, 0.5),
};

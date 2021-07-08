/**
 *
 * @constructor
 */
function DS_TableList(l) {
    this.list = l || [];
}

/**
 *
 * @returns {number}
 */
DS_TableList.prototype.size = function () {
    return this.list.length;
};

/**
 *
 * @returns {Array<*>}
 */
DS_TableList.prototype.asArray = function () {
    return this.list;
};

/**
 *
 * @param pos {number}
 * @param element {*}
 */
DS_TableList.prototype.put = function (pos, element) {
    this.list.splice(pos, 0, element);
    // this.list = this.list.slice(0, pos)
    //     .concat(element)
    //     .concat(this.list.slice(pos, this.size()));
};

/**
 *
 * @param pos {number}
 * @returns {*}
 */
DS_TableList.prototype.remove = function (pos) {
    var ret = this.list[pos];
    if (ret)
        this.list.splice(pos, 1);
    // this.list = this.list.slice(0, pos).concat(this.list.slice(pos + 1, this.size()));
    return ret;
};

/**
 *
 * @param pos {number}
 * @returns {*}
 */
DS_TableList.prototype.get = function (pos) {
    return this.list[pos];
};

module.exports = DS_TableList;

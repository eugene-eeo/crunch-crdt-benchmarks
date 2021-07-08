crunch
======


Structure
---------

The code is roughly structured as:

    crunch/
        data.js     datasets -- probably needs to be modified
        encode.js   CRDT encodings (for documents and operations)
        utils.js    utilities -- tbh, not used much: only getHeapUsed is
                    used across many files.
        peer.js     oh god. read bench/ctx_utils.js for an explanation.
    bench/
        ...         benchmark code.
    scripts/
        ...         misc scripts.

Not every file in bench/ is a benchmark, some are utilities.
All benchmarks produce JSON output to stdout, and can be run from
the command line.
To start with, you can read `bench/linear-time.js` and `bench/ctx_utils.js`.
If you get confused about anything, you can check the `scripts/gen-jobs.py`
file to see how the different benchmarking scripts are ran.


Setup
-----

To run the code, you would first have to do:

    $ npm install --ci .   # to install from package-lock.json

My node version is 15.0.1 -- but probably you can run it on 14.x
and nothing should break.
You then have to install `automerge` (since I used a specific commit,
I cloned the automerge repo into this repo (`./automerge`), and most
code will `require()` that path).
The specific automerge versions are:

 - a27dd61e2406e9047f68d4e3209f80b78d8d1451 (js backend)
 - 83145b82c49809aaccf7e6463e164de59225045d (wasm backend)


Linear traces
-------------

Linear traces include the automerge-perf dataset, and wikipedia traces.
The related files are:

    crunch/data.js
    bench/linear-time.js
    bench/automerge-perf-sizes.js  # Measures CRDT document sizes
    bench/automerge-pinned.js      # automerge with wasm.

You would probably want to change the paths in `crunch/data.js`, and
download the automerge-perf dataset somewhere. To download wikipedia
traces, there is a script that generates a bash script (don't ask why)
to download and convert wikipedia traces:

    $ python scripts/gen-wiki-linear.py

You can then run `bench/linear-time.js`.
As a test run you can try:

    $ mkdir .tmp   # to save the CRDT documents
    $ # runs the benchmark on microRTL
    $ node --expose-gc bench/linear-time.js -c RGA -d microRTL -n 1 > results.json
    $ # measures the document sizes and encode/decode times
    $ node --expose-gc bench/automerge-perf-sizes.js \
        .tmp/RGA-linear-time-microRTL-doc \
        RGA \
        5


Causal Traces
-------------

The related files are:

    bench/causal-traces.js
    bench/replay-causal-traces.js
    scripts/xmltrace2json

You first have to get the traces in XML format (see the email from INRIA folks).
Then you can use the `scripts/xmltrace2json` script to JSONify the traces.
To run the benchmarks you first have to generate logs using
`bench/causal-traces.js`, and then replay an individual log (or all of them)
using `bench/replay-causal-traces.js`.

You should read the `bench/causal-traces.js` code to see what it is doing.
In particular, you may need to set the `CRUNCH_WD` environment variable to
change where the logs are stored.


Git Traces
----------

Related files:

    scripts/git-extract.py
    bench/git.js              # Generates logs for git traces
    bench/git-automerge.js    # ==> for Automerge
    bench/git-yjs.js          # ==> for Yjs
    bench/replay-git.js       # Replays those logs
    bench/replay-automerge.js # ==> for Automerge
    bench/replay-yjs.js       # ==> for Yjs
    bench/git-merge.js        # Generates inputs for git-merge-run
    bench/git-merge-run.js    # Runs merging benchmarks
    bench/git-restore.js      # Restores a git version

There are many files related to this, but mostly they are quite repetitive.
E.g. once you read the `bench/git.js` file, then `git-{automerge,yjs}.js` are
quite similar, same for `bench/replay-git.js`. They required separate files
because they contained many differences in the context of offline editing.
For instance, you have to explicitly make snapshots for Yjs, and Automerge
was too slow without batching edits.

You have to first download a git repository.
Then modify and run `scripts/git-extract.py` as required (ensure that you have
first installed GitPython and have a relatively recent version of Python 3,
e.g. 3.9.x). Given a filename, it extracts commits relavant to that filename
and produces the following:

 1. An 'order file', a JSON file with information about the commits
 e.g. their parent, their hash, the hash of their file contents etc.
 The commits are stored in topological order.
 2. Compresses file contents at each commit using zlib. The compressed
 contents are stored in `BLOBS_PATH/`, with the filename being the
 hash of the contents. (see the script for `BLOBS_PATH`).

You might have to perform some manual corrections when running
`script/git-extract.py` (e.g. because it gets confused about commits),
in that case you can use the graph from `git log --graph <fn>` to
help you.

Make sure to set the `CRUNCH_IS_GIT` environment variable when running
any git benchmarks.


Microbenchmarks
---------------

Related files:

    bench/user-ops/local.js   # Local ops benchmark
    bench/user-ops/remote.js  # Remote ops benchmark (wip, not really sure if it works)
    bench/user-ops/common.js

If you've made it thus far you can probably understand the code here,
the one in the `local.js` is fairly readable. It takes a document and
a benchmark spec (e.g. `prepend:N=1000` prepends 1000 chars) and then
performs the benchmark.

`remote.js` still needs more testing.
the basic idea is that we take the operations produced by some benchmark
spec and start them at either same/different locations in the document.
for instance, inserting N=50 chars by M=10 users at either the same
location i, or different locations `i_1, ... i_10`.

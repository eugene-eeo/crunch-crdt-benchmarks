#!/usr/bin/env python

# import os.path
from itertools import product

TEMPLATE = '''\
#!/bin/bash
#SBATCH --account BERESFORD-SL3-CPU
#SBATCH -J eeojun
#SBATCH --partition cclake
#SBATCH --nodes 1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task={cc}
#SBATCH --time={time}
{prog}
'''


PRINTED_HEADER = False


def job(fn, prog, cc=4, time='4:00:00'):
    global PRINTED_HEADER
    if not PRINTED_HEADER:
        print('#!/bin/sh')
        PRINTED_HEADER = True
    prog = ' && \\\n'.join(
        '~/.nvm/versions/node/v15.0.1/bin/node --expose-gc ' + p
        if isinstance(p, str) else p[1]
        for p in prog)
    open(fn, 'w').write(TEMPLATE.format(prog=prog, cc=cc, time=time))
    print(f'sbatch {fn}')


# Linear Traces
def microLTR_RTL():
    datasets = ['microLTR', 'microRTL']
    algorithms = [
        # 'Automerge',
        # 'Automerge+WASM',
        'Logoot',
        # 'Woot',
        # 'RGA',
        # 'Treedoc',
        # 'LSEQ',
        # 'DLS',
        # 'Yjs',
    ]
    for data in datasets:
        for alg in algorithms:
            prog = []
            time = '10:00:00'
            mem_repeats = 5
            # if alg == 'Logoot':
            #     repeats = 3
            #     mem_repeats = 3
            prog.append(f'bench/linear.js -l 10 -c {alg} -d {data} -n 11 -m {mem_repeats} > res2/{alg}-{data}-10')
            prog.append(f'bench/automerge-perf-sizes.js .tmp/{alg}-linear-{data}-10k-doc {alg} 11 > res2/{alg}-{data}-10k-encdec')
            job(f'jobs/linear-{alg}-{data}', prog, time=time)
            # job(f'jobs/linear-{alg}-{data}', prog, time='02:00:00')


# Linear Traces
def linear_traces():
    datasets = [
        # 'microLTR',
        # 'microRTL',
        # 'automerge',
        '2017_in_home_video',
        '2021_Kerala_Legislative_Assembly_election',
        # 'George_W._Bush',
        # 'Jesus',
        # 'List_of_dramatic_television_series_with_LGBT_characters',
        # 'List_of_Nintendo_Switch_games_A-F',
        # 'List_of_WWE_personnel',
        # 'Spring_Championship_of_Online_Poker',
        # 'United_States',
        # 'Wikipedia',
    ]
    algorithms = [
        # # 'Automerge',
        # 'Automerge+WASM',
        'Logoot',
        # 'Woot',
        # 'RGA',
        # 'Treedoc',
        # 'LSEQ',
        # 'DLS',
        # 'Yjs',
    ]

    # mapping = {
    #     'W1': 'George_W._Bush',
    #     'W2': 'Wikipedia',
    #     'W3': 'List_of_WWE_personnel',
    #     'W4': 'United_States',
    #     'W5': 'Jesus',
    #     'W6':  'List_of_dramatic_television_series_with_LGBT_characters',
    #     'W7':  'Spring_Championship_of_Online_Poker',
    #     'W8':  '2017_in_home_video',
    #     'W9':  'List_of_Nintendo_Switch_games_A-F',
    #     'W10': '2021_Kerala_Legislative_Assembly_election',
    # }
    # finished = {
    #     'Woot':           ['W6'],
    #     'Automerge':      ['W6', 'W3'],
    #     'Automerge+WASM': ['W8', 'W10', 'W1', 'W5', 'W6', 'W3', 'W4', 'W2'],
    #     'Logoot':         ['W8', 'W1', 'W5', 'W6', 'W3', 'W4', 'W2'],
    #     'Treedoc':        ['W1', 'W5', 'W6', 'W3', 'W4', 'W2'],
    #     'RGA':            ['W8', 'W10', 'W1', 'W5', 'W6', 'W9', 'W3', 'W7', 'W4', 'W2'],
    #     'LSEQ':           ['W8', 'W10', 'W1', 'W5', 'W6', 'W9', 'W3', 'W7', 'W4', 'W2'],
    #     'DLS':            ['W8', 'W10', 'W1', 'W5', 'W6', 'W9', 'W3', 'W7', 'W4', 'W2'],
    #     'Yjs':            ['W8', 'W10', 'W1', 'W5', 'W6', 'W9', 'W3', 'W7', 'W4', 'W2'],
    # }

    for data in datasets:
        for alg in algorithms:
            prog = []
            prog.append(f'bench/linear-time.js -c {alg} -d {data} -n 11 > res2/{alg}-{data}')
            prog.append(f'bench/automerge-perf-sizes.js .tmp/{alg}-linear-time-{data}-doc {alg} 11 > res2/{alg}-{data}-encdec')
            job(f'jobs/linear-{alg}-{data}', prog, time='10:00:00')

    # for alg, done in finished.items():
    #     if alg != 'Woot':
    #         continue
    #     for ref in done:
    #         data = mapping[ref]
    #         prog = []
    #         prog.append(f'bench/automerge-perf-sizes.js .tmp/{alg}-linear-time-{data}-doc {alg} 11 > res2/{alg}-{data}-encdec')
    #         job(f'jobs/linear-{alg}-{ref}', prog, time='02:00:00')


# Causal Traces -- generate
def causal_traces_generate():
    datasets = [
        ['g1.json',   [1, 2, 3, 4, 5, 6, 9, 11, 12]],
        ['g2.json',   [1, 2, 3, 4, 6, 7, 9, 10, 12, 13, 17, 19, 20, 22, 23, 25]],
        ['g3.json',   [1, 3, 5, 6, 8, 10]],
        ['doc1.json', [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 15, 16, 17, 18, 19, 20, 21, 22]],
        ['doc2.json', [1, 2, 3, 4, 6, 10, 11, 12, 17, 19, 21, 23, 24]],
    ]
    algorithms = [
        # ['Automerge',      5],
        # ['Automerge+WASM', 5],
        # ['Logoot',         5],
        # ['Woot',           5],
        ['RGA',            10],
        # ['Treedoc',        10],
        # ['LSEQ',           10],
        # ['DLS',            10],
        # ['Yjs',            10],
    ]
    cannot = {
        # 'LSEQ': {'doc1.json', 'doc2.json', 'g1.json', 'g3.json'},
        # 'Woot': {'doc1.json', 'g2.json'},
        # 'Woot': {'g3.json', 'g1.json', 'doc2.json'},
    }
    RDS_DIR = '/rds/user/je437/hpc-work/ct'
    for data, _ in datasets:
        for alg, _ in algorithms:
            if data in cannot.get(alg, []):
                continue
            time = '10:00:00'
            if alg.startswith('Automerge'):
                time = '8:00:00'

            prog = []
            prog.append((0, f"export CRUNCH_WD='{RDS_DIR}/{alg}-{data}'"))
            prog.append((0, f"mkdir -p '{RDS_DIR}/{alg}-{data}'"))
            prog.append(f"bench/causal-traces.js -c '{alg}' -d '.causal-traces/{data}'")
            job(f"jobs/ct-{alg}-{data}-gen", prog, time=time)


# Causal Traces -- execute
def causal_traces_execute():
    datasets = [
        ['g1.json',   [1, 2, 3, 4, 5, 6, 9, 11, 12]],
        ['g2.json',   [1, 2, 3, 4, 6, 7, 9, 10, 12, 13, 17, 19, 20, 22, 23, 25]],
        ['g3.json',   [1, 3, 5, 6, 8, 10]],
        ['doc1.json', [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 15, 16, 17, 18, 19, 20, 21, 22]],
        ['doc2.json', [1, 2, 3, 4, 6, 10, 11, 12, 17, 19, 21, 23, 24]],
    ]
    algorithms = [
        # ['Automerge',      11],
        # ['Automerge+WASM', 11],
        ['Logoot',         11],
        # ['Woot',           11],
        # ['RGA',            11],
        # ['Treedoc',        11],
        # ['LSEQ',           11],
        # ['DLS',            11],
        # ['Yjs',            11],
    ]
    cannot = {
        'LSEQ': {'doc1.json', 'doc2.json', 'g1.json', 'g3.json'},
        'Woot': {'g2.json', 'g3.json', 'doc1.json'},
    }
    RDS_DIR = '/rds/user/je437/hpc-work/ct'
    for data, ids in datasets:
        for alg, repeats in algorithms:
            if data in cannot.get(alg, []):
                continue
            job(f"jobs/ct-{alg}-{data}-run", [f'bench/automerge-perf-sizes.js ".tmp/{alg}-{data}-causal-doc" {alg} > res2/{alg}-{data}-encdec'], time='01:00:00')
            for id in ids:
                prog = []
                prog.append(f"bench/replay-causal-traces.js"
                            f" -c '{alg}'"
                            f" -f '{RDS_DIR}/{alg}-{data}/{alg}-{data}-{id}'"
                            f" -i {id}"
                            f" -n {repeats} > res2/{alg}-{data}-{id}")
                prog.append(f"bench/replay-causal-traces.js"
                            f" -c '{alg}'"
                            f" -f '{RDS_DIR}/{alg}-{data}/{alg}-{data}-{id}'"
                            f" -i {id}"
                            f" -n 5 --run_gc > res2/{alg}-{data}-{id}-mem")
                job(f"jobs/ct-{alg}-{data}-{id}-run", prog, time='05:00:00')


# Git Traces -- generate
def git_traces_generate():
    datasets = [
        'Documentation-diff-options-txt.ord',
        'Documentation-git-branch-txt.ord',
        'Documentation-git-checkout-txt.ord',
        'Documentation-git-clone-txt.ord',
        'Documentation-git-commit-txt.ord',
        'Documentation-git-format-patch-txt.ord',
        'Documentation-git-p4-txt.ord',
        'Documentation-git-push-txt.ord',
        'Documentation-git-read-tree-txt.ord',
        'Documentation-git-rev-parse-txt.ord',
        'Documentation-git-send-email-txt.ord',
        'Documentation-git-submodule-txt.ord',
    ]
    algorithms = [
        # ['Automerge', 5],
        ['Logoot',    5],
        # ['Woot',      5],
        # ['RGA',       10],
        # ['Treedoc',   10],
        # ['LSEQ',      10],
        # ['DLS',       10],
        # ['Yjs',       10],
    ]
    RDS_BASE = '/rds/user/je437/hpc-work'
    RDS_DIR = '/rds/user/je437/hpc-work/git'
    blobs_dir = f'{RDS_BASE}/git-blobs'
    for data in datasets:
        for alg, _ in algorithms:
            if (alg == 'Automerge' and data == 'Documentation-diff-options-txt.ord'):
                continue
            gen = (
                'bench/git-yjs.js' if alg == 'Yjs' else
                'bench/git-automerge.js -c Automerge' if alg == 'Automerge' else
                f'bench/git.js -c {alg}'
            )
            time = '10:00:00'
            prog = []
            prog.append((0, f"export CRUNCH_WD='{RDS_DIR}/{alg}-{data}/logs'"))
            prog.append((0, "export CRUNCH_IS_GIT=1"))
            # prog.append((0, f"rm -rf '{RDS_DIR}/{alg}-{data}'"))
            prog.append((0, f"mkdir -p '{RDS_DIR}/{alg}-{data}/logs'"))
            prog.append((0, f"mkdir -p '{RDS_DIR}/{alg}-{data}/docs'"))
            prog.append((0, f"mkdir -p '{RDS_DIR}/{alg}-{data}/merges'"))
            prog.append(f"{gen} -f '{data}' -b '{blobs_dir}' -w '{RDS_DIR}/{alg}-{data}/docs'")
            log_path = (
                f"{RDS_DIR}/{alg}-{data}/docs/{alg}-{data}-1"
                if (alg == 'Automerge' or alg == 'Yjs') else
                f"{RDS_DIR}/{alg}-{data}/docs/{alg}-{data}-git-oplog"
            )
            prog.append(f"bench/git-merge.js"
                        f" -s '{RDS_DIR}/{alg}-{data}/docs/{alg}-{data}-git-snapshots'"
                        f" -o '{blobs_dir}/{data}'"
                        f" -c '{alg}'"
                        f" -f '{log_path}'"
                        f" -O '{RDS_DIR}/{alg}-{data}/merges/' > {RDS_DIR}/{alg}-{data}/merges.json")
            job(f"jobs/git-{alg}-{data}-gen", prog, time=time)


GIT_INTERESTED = dict([
    ['Documentation-diff-options-txt.ord',     [46, 53, 55, 57, 98, 161, 162, 180, 186, 201]],
    ['Documentation-git-branch-txt.ord',       [10, 16, 28, 45, 49, 62, 64, 72, 106, 109]],
    ['Documentation-git-checkout-txt.ord',     [2, 7, 17, 19, 28, 33, 35, 65, 104, 115]],
    ['Documentation-git-clone-txt.ord',        [24, 29, 30, 39, 54, 75, 91, 95, 104, 114]],
    ['Documentation-git-commit-txt.ord',       [20, 31, 32, 49, 57, 65, 69, 85, 110, 121]],
    ['Documentation-git-format-patch-txt.ord', [19, 41, 42, 51, 58, 65, 66, 68, 69, 79]],
    ['Documentation-git-p4-txt.ord',           [3, 10, 20, 22, 23, 36, 40, 41, 47, 50]],
    ['Documentation-git-push-txt.ord',         [2, 5, 6, 27, 31, 35, 41, 92, 100, 138]],
    ['Documentation-git-read-tree-txt.ord',    [4, 11, 15, 31, 34, 39, 40, 46, 56, 60]],
    ['Documentation-git-rev-parse-txt.ord',    [3, 6, 9, 39, 44, 51, 53, 54, 56, 65]],
    ['Documentation-git-send-email-txt.ord',   [2, 3, 18, 20, 27, 59, 85, 97, 121, 125]],
    ['Documentation-git-submodule-txt.ord',    [21, 43, 59, 69, 70, 81, 89, 102, 115, 117]],
])


# Git Traces -- execute
def git_traces_execute():
    datasets = [
        'Documentation-diff-options-txt.ord',
        'Documentation-git-branch-txt.ord',
        'Documentation-git-checkout-txt.ord',
        'Documentation-git-clone-txt.ord',
        'Documentation-git-commit-txt.ord',
        'Documentation-git-format-patch-txt.ord',
        'Documentation-git-p4-txt.ord',
        'Documentation-git-push-txt.ord',
        'Documentation-git-read-tree-txt.ord',
        'Documentation-git-rev-parse-txt.ord',
        'Documentation-git-send-email-txt.ord',
        'Documentation-git-submodule-txt.ord',
    ]
    algorithms = [
        # ['Automerge', 6],
        ['Logoot',    6],
        # ['Woot',      11],
        # ['RGA',       11],
        # ['Treedoc',   11],
        # ['LSEQ',      11],
        # ['DLS',       11],
        # ['Yjs',       11],
    ]
    cannot = {
        'Automerge': ['Documentation-diff-options-txt.ord'],
        'Woot':      ['Documentation-git-rev-parse-txt.ord', 'Documentation-git-send-email-txt.ord'],
    }
    RDS_DIR = '/rds/user/je437/hpc-work/git'
    for data in datasets:
        for alg, repeats in algorithms:
            if alg in cannot and data in cannot[alg]:
                continue
            workdir = f'{RDS_DIR}/{alg}-{data}'
            prog = []
            prog.append((0, f"export CRUNCH_WD='{RDS_DIR}/{alg}-{data}/logs'"))
            prog.append((0, "export CRUNCH_IS_GIT=1"))
            prog2 = prog + [
                f'bench/git-merge-run.js'
                f' -c {alg}'
                f' -i {workdir}/merges.json'
                f' -p {workdir}/docs/{alg}-{data}'
                f' -O {workdir}/merges'
                f' -n {repeats} > res2/{alg}-{data}-merges'
            ]
            logfile = '1' if alg in ('Automerge', 'Yjs') else 'git-oplog'
            prog3 = prog + [
                f'bench/git-restore.js'
                f' -c {alg}'
                f' -s {workdir}/docs/{alg}-{data}-git-snapshots'
                f' -f {workdir}/docs/{alg}-{data}-{logfile}'
                f' -n {repeats}'
                f' -o /rds/user/je437/hpc-work/git-blobs/{data} > res2/{alg}-{data}-restore'
            ]
            replay_prog = (
                'bench/replay-yjs.js' if alg == 'Yjs' else
                'bench/replay-automerge.js' if alg == 'Automerge' else
                f'bench/replay-git.js -c {alg}'
            )
            prog4 = prog + [
                f'{replay_prog}'
                f' -f {workdir}/logs/{alg}-{data}-{id}'
                f' -i {id}'
                f' -n {repeats} > res2/{alg}-{data}-replay-{id}'
                for id in GIT_INTERESTED[data]
            ]
            prog5 = prog + [
                f'bench/git-doc-state-mem.js'
                f' {workdir}/docs/'
                f' {alg}'
                f' {repeats} > res4/{alg}-{data}-encdec'
            ]
            job(f"jobs/git-{alg}-{data}-merge",   prog2, time='06:00:00')
            job(f"jobs/git-{alg}-{data}-restore", prog3, time='10:00:00')
            job(f"jobs/git-{alg}-{data}-replay",  prog4, time='10:00:00')
            job(f"jobs/git-{alg}-{data}-encdec",  prog5, time='01:00:00')


def user_ops():
    # Linear user ops matrix...
    docs = [
        # ['g1',   '.tmp/{alg}-g1.json-causal-doc'],
        ['g2',   '.tmp/{alg}-g2.json-causal-doc'],
        # ['g3',   '.tmp/{alg}-g3.json-causal-doc'],
        # ['doc1', '.tmp/{alg}-doc1.json-causal-doc'],
        # ['doc2', '.tmp/{alg}-doc2.json-causal-doc'],
    ]
    cannot = {
        'LSEQ': {'doc1', 'doc2', 'g1', 'g3'},
    }
    # algs = ['Automerge+WASM', 'Automerge', 'Logoot', 'Woot', 'RGA', 'Treedoc', 'LSEQ', 'DLS', 'Yjs']
    algs = ['Logoot']
    constants = {'p_ins': 0.80, 'M': 5}
    linear_bench_types = [
        [True,  'random_grep',  ['M']],
        [True,  'prepend',      []],
        [True,  'append',       []],
        [True,  'random_ins',   []],
        [True,  'random_del',   []],
        [True,  'random_edits', ['p_ins']],
        [False, 'n_ins_block',  []],
        [False, 'n_del_block',  []],
        # [False, 'n_move',       []],
    ]
    RDS_DIR = '/rds/user/je437/hpc-work/uo'
    for alg, [doc_desc, doc_template] in product(algs, docs):
        if alg in cannot and doc_desc in cannot[alg]:
            continue
        doc_path = doc_template.format(alg=alg)
        specs = []
        for is_block, bench_type, vars in linear_bench_types:
            Ns = [100, 500, 1000, 5000] if not is_block else [5000]
            for N in Ns:
                options = [f'N={N}']
                for var in vars:
                    if var in constants:
                        options.append(f'{var}={constants[var]}')
                spec = f'{bench_type}:{",".join(options)}'
                if spec not in specs:
                    specs.append(spec)
        prog = [
            f"bench/user-ops/local.js"
            f" -M 10"
            f" -n 11"
            f" -c {alg}"
            f" -p '{doc_path}'"
            f" {' '.join(specs)} > res2/{alg}-uo-{doc_desc}"
        ]
        job(f'jobs/uo-loc-{alg}-{doc_desc}', prog=prog, time="08:00:00")
        prog = [
            (0, f"mkdir -p '{RDS_DIR}/{alg}-uo-r1-{doc_desc}'"),
            (0, f"export CRUNCH_WD='{RDS_DIR}/{alg}-uo-r1-{doc_desc}'"),
            f"bench/user-ops/remote.js"
            f" --gen_logs"
            f" -M 10"
            f" -c {alg}"
            f" -p '{doc_path}'"
            f" {' '.join(specs)} > {RDS_DIR}/{alg}-uo-r1-{doc_desc}/traces",
            f"bench/user-ops/remote.js"
            f" -n 11"
            f" -c {alg}"
            f" -p '{doc_path}'"
            f" -f '{RDS_DIR}/{alg}-uo-r1-{doc_desc}/traces' > res2/{alg}-uo-r1-{doc_desc}"
        ]
        job(f'jobs/uo-r1-{alg}-{doc_desc}', prog=prog, time="08:00:00")


if __name__ == '__main__':
    # microLTR_RTL()
    # linear_traces()
    # micro_conc()
    # causal_traces_generate()
    # causal_traces_execute()
    # git_traces_generate()
    git_traces_execute()
    # user_ops()
    pass

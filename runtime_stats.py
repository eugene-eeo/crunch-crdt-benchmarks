import json
from statistics import stdev, mean
from tabulate import tabulate


def load(fn):
    return json.load(open(fn))


algs = [
    "Automerge+WASM",
    "Automerge",
    "Yjs",
    "RGA",
    "Logoot",
    "LSEQ",
    "Treedoc",
    "Woot",
    "DLS",
]
datas = [
    'ap',
    'george-bush.json',
    'jesus.json',
    'wikipedia.json',
    'united-states.json',
]


for data in datas:
    l_data = [['Name', 'Avg', 'Max', 'Variance', 'Sum']]
    r_data = [['Name', 'Avg', 'Max', 'Variance', 'Sum']]

    for name in algs:
        l_times = load(f'res/{name}-{data}-25k-local')['times']
        r_times = load(f'res/{name}-{data}-25k-remote')['times']

        # local
        l_max = max(l_times)
        l_sig = stdev(l_times)
        l_avg = mean(l_times)
        l_sum = sum(l_times)
        l_data.append([
            name,
            round(l_avg, 2),
            round(l_max, 2),
            round(l_sig, 2),
            round(l_sum, 2),
        ])

        # remote
        r_max = max(r_times)
        r_sig = stdev(r_times)
        r_avg = mean(r_times)
        r_sum = sum(r_times)
        r_data.append([
            name,
            r_avg,
            r_max,
            r_sig,
            r_sum,
        ])
    print()
    print('=======')
    print()
    print(data)
    print(tabulate(l_data, headers='firstrow', tablefmt='latex'))

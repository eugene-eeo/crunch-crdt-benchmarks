#!/usr/bin/env python3
import sys
import git
import json
import os.path
import zlib
from slugify import slugify
from collections import defaultdict


BLOBS_PATH = '/home/eeojun/git-blobs/'
REPO_PATH = '/home/eeojun/code/repos/git/'


def store_order(fn, order):
    fn = os.path.join(BLOBS_PATH, f'{slugify(fn)}.ord')
    with open(fn, 'w') as fp:
        json.dump(order, fp)


def store_blob(blob: git.Blob):
    fn = os.path.join(BLOBS_PATH, blob.hexsha)
    with open(fn, 'wb') as fp:
        fp.write(zlib.compress(blob.data_stream.read()))


def fill_session_ids(order):
    commits = {}
    invert_deps = defaultdict(set)
    for commit in order:
        commits[commit['commit']] = commit
        for dep in commit['deps']:
            invert_deps[dep].add(commit['commit'])

    fid = 0
    for commit in order:
        depends_on_me = invert_deps[commit['commit']]
        if 'fid' not in commit:
            fid += 1
            commit['fid'] = fid
        if len(depends_on_me) == 0:
            continue
        elif len(depends_on_me) == 1:
            [dep] = depends_on_me
            if 'fid' not in commits[dep]:
                commits[dep]['fid'] = commit['fid']
            else:
                fid += 1
                commits[dep]['fid'] = fid
        else:
            for other in depends_on_me:
                fid += 1
                commits[other]['fid'] = fid


def choice(arr, prompt):
    if len(arr) == 1:
        return arr[0]
    for i, item in enumerate(arr, 1):
        print(f' [{i}] {item}')
    while True:
        value = input(prompt + ' ')
        value = value.strip()
        if value.isnumeric() and 1 <= int(value) <= len(arr):
            return arr[int(value) - 1]


def fill_deps(repo: git.Repo, order, fn):
    tips = defaultdict(list)
    for i, info in enumerate(order):
        cm = repo.commit(info['commit'])
        # if info['blob'] in tips:
        #     print(tips[info['blob']][:10], '<->', cm.hexsha[:10])
        tips[info['blob']].append(cm.hexsha)
        info['deps'] = []
        if i == 0:
            continue
        prompt = f'{cm.hexsha[:10]} depends on?'
        info['deps'] = [choice(tips[c.tree[fn].hexsha], prompt) for c in cm.parents]


def check_exists(fn):
    order_fn = os.path.join(BLOBS_PATH, f'{slugify(fn)}.ord')
    if os.path.exists(order_fn):
        answer = input(f"file exists '{order_fn}', continue? (yes / [no]) ")
        if answer.strip() == 'yes':
            return True
        return False
    return True


def main():
    repo = git.Repo(REPO_PATH)
    fn = sys.argv[1]
    if not check_exists(fn):
        return

    commits = list(repo.iter_commits(
        paths=[fn],
        topo_order=True,
        reverse=True))

    order = []
    for commit in commits:
        blob = commit.tree[fn]
        store_blob(blob)
        order.append({
            'author': commit.author.email,
            'commit': commit.hexsha,
            'blob':   blob.hexsha,
        })

    fill_deps(repo, order, fn)
    # order.reverse()
    fill_session_ids(order)
    # order.reverse()
    store_order(fn, order)


if __name__ == '__main__':
    main()

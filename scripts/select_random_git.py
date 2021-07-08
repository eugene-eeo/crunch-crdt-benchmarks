import random
import json
import os.path


def main():
    random.seed('0xdeadbeef')
    datas = [
        ['/home/eeojun/git-blobs/', [
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
        ]],
    ]
    for blob_path, fns in datas:
        for fn in fns:
            order = json.load(open(os.path.join(blob_path, fn)))
            users = set()
            for item in order:
                users.add((item['author'], item['fid']))
            # print(len(users))
            pop = list(range(1, len(users) + 1))
            print([fn, sorted(list(random.sample(pop, 10)))])


if __name__ == '__main__':
    main()

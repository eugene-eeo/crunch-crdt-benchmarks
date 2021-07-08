# Generate script that generates linear wikipedia traces
# How did we get these articles?
# From Logoot Undo paper, and by looking at the
# https://en.wikipedia.org/wiki/Wikipedia:Most_frequently_edited_pages, namespace 0
# https://en.wikipedia.org/wiki/Special:LongPages
import slugify

titles = [
    # Most Revisions
    ['George W. Bush',        250],
    ['Wikipedia',             250],
    ['List of WWE personnel', 250],
    ['United States',         250],
    ['Jesus',                 250],
    # Longest Articles
    ['List of dramatic television series with LGBT characters', 250],
    ['Spring Championship of Online Poker',                     250],
    ['2017 in home video',                                      250],
    ['List of Nintendo Switch games (A–F)',                     250],
    ['2021 Kerala Legislative Assembly election',               250],
]

jobs = ['#!/bin/sh']
for title, num_revs in titles:
    jobs.append(f"python ./scripts/wiki.py \"{title}\"")
for title, num_revs in titles:
    jobs.append(f"./scripts/revs2trace"
                f" '.wiki-revs/{slugify.slugify_filename(title)}_ids'"
                f" '500'"
                f" '.wiki-traces/{slugify.slugify_filename(title)}'")
print('\n'.join(jobs))

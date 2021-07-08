#!/bin/bash

get_num_revs() {
    if [ "$1" = 'United States_ids' ]; then
        echo 100
        return
    fi
    echo 150
}

for data in 'George W. Bush_ids' 'Jesus_ids' 'United States_ids';
do
    for numPeers in 5 10 15 20; do
        numRevs=$(get_num_revs "$data")
        slug=$(slugify "$data")
        echo "$slug" "$numPeers" "$numRevs"
        node scripts/wiki-causal.js ".wiki-revs/${data}" "$numRevs" "$numPeers" ".causal-traces/${slug}-${numPeers}.json" &
    done
done
wait

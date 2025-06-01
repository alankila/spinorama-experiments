#!/bin/bash

# in my github pages, repository spinorama-html
# https://alankila.github.io/spinorama-html/

cd "$(dirname "$0")"

rm -rf ../spinorama-html/*
node_modules/.bin/vite build --base=/spinorama-html
mv dist/* ../spinorama-html
cd ../spinorama-html
git add .
git commit
git push

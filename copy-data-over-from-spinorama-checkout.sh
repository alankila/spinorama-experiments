#!/bin/bash

SPINORAMA="$1"
if [[ -z "$SPINORAMA" ]]; then
	echo "Usage: $0 <path to spinorama>"
	exit 1
fi

SELF="$(dirname "$0")"
cd "$SELF"
SELF="$PWD"

rm -rf "$SELF/public/measurements"
rsync -a "$SPINORAMA/datas/measurements" "$SELF/public" --include 'SPL Horizontal.txt' --include 'SPL Vertical.txt' --exclude '*.*' --exclude tmp -L

rm -rf "$SELF/public/eq"
rsync -a "$SPINORAMA/datas/eq" "$SELF/public" --include 'iir-autoeq.txt' --exclude '*.*' -L

rm -rf "$SELF/public/pictures"
mkdir "$SELF/public/pictures"
for f in png jpg; do
	for p in "$SPINORAMA/datas/pictures"/*.$f; do
		BASE="$(basename "$p")"
		convert "$p" -scale 300x500 "$SELF/public/pictures/${BASE%.$f}.webp"
	done
done

cp -a "$SPINORAMA/dist/json/metadata.json" "$SELF/src"


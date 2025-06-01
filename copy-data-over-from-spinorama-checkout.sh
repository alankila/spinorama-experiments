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
rsync -a "$SPINORAMA/datas/measurements" "$SELF/public" --include '*.txt' --exclude '*.*' --exclude tmp

rm -rf "$SELF/public/eq"
rsync -a "$SPINORAMA/datas/eq" "$SELF/public" --include 'iir-autoeq.txt' --exclude '*.*'

rm -rf "$SELF/public/pictures"
mkdir "$SELF/public/pictures"
for p in "$SPINORAMA/datas/pictures"/*.png; do
	BASE="$(basename "$p")"
	convert "$p" -scale 300x500 "$SELF/public/pictures/${BASE%.png}.webp"
done

cp -a "$SPINORAMA/dist/json/metadata.json" "$SELF/public"


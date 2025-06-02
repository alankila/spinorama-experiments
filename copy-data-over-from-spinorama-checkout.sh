#!/bin/bash

SPINORAMA="$1"
if [[ -z "$SPINORAMA" ]]; then
	echo "Usage: $0 <path to spinorama>"
	exit 1
fi

SELF="$(dirname "$0")"
cd "$SELF"
SELF="$PWD"

echo "Copying SPL files over"
rm -rf "$SELF/public/measurements"
rsync -a "$SPINORAMA/datas/measurements" "$SELF/public" --include 'SPL Horizontal.txt' --include 'SPL Vertical.txt' --include '*-M*-P*.txt' --include '* _H *.txt' --include '* _V *.txt' --exclude '*.*' -L

echo "Compressing measurements into zip archives"
for dir in "$SELF/public/measurements"/*/*; do
	pushd "$dir"
	zip --quiet -r "$dir.zip" .
	popd
	rm -rf "$dir"
done

echo "Copying iir-autoeq files over"
rm -rf "$SELF/public/eq"
rsync -a "$SPINORAMA/datas/eq" "$SELF/public" --include 'iir-autoeq.txt' --exclude '*.*' -L

echo "Copying pictures over"
rm -rf "$SELF/public/pictures"
mkdir "$SELF/public/pictures"
echo "Converting everything to webp"
for f in png jpg; do
	for p in "$SPINORAMA/datas/pictures"/*.$f; do
		BASE="$(basename "$p")"
		convert "$p" -scale 300x500 "$SELF/public/pictures/${BASE%.$f}.webp"
	done
done

echo "Take metadata.json from build"
cp -a "$SPINORAMA/dist/json/metadata.json" "$SELF/src"


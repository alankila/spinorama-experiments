#!/bin/bash

cd "$(dirname "$0")"
npm run --silent generate-metadata > src/our-metadata.json

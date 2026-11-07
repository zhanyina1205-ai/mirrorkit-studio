#!/bin/zsh
cd "${0:A:h}" || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
exec node bootstrap.cjs

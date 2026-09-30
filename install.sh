#!/usr/bin/env bash
# Symlink every skill in ./skills into the user-level skill folders, so all
# projects on this machine see them and edits here are live.
#   ~/.claude/skills  — Claude Code
#   ~/.agents/skills  — agents that read the shared folder (Codex, …)
# Re-run after adding a skill. `./install.sh --uninstall` removes the links.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
targets=("$HOME/.claude/skills" "$HOME/.agents/skills")

for target in "${targets[@]}"; do
  mkdir -p "$target"

  # Links into this repo whose skill was renamed or removed.
  for link in "$target"/*; do
    if [[ -L "$link" && ! -e "$link" && "$(readlink "$link")" == "$repo/skills/"* ]]; then
      rm "$link" && echo "removed  $link (skill no longer exists)"
    fi
  done

  for skill in "$repo"/skills/*/; do
    name="$(basename "$skill")"
    link="$target/$name"

    if [[ "${1:-}" == "--uninstall" ]]; then
      if [[ -L "$link" ]]; then rm "$link" && echo "removed  $link"; fi
      continue
    fi

    if [[ -e "$link" && ! -L "$link" ]]; then
      echo "skip     $link (a real directory exists; not overwriting)" >&2
      continue
    fi
    ln -sfn "${skill%/}" "$link"
    echo "linked   $link -> ${skill%/}"
  done
done

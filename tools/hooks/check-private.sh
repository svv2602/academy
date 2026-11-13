#!/usr/bin/env bash
# Rejects a commit that would publish private words (the child's name) or a personal e-mail address.
# The repository is public; the word list therefore lives OUTSIDE of it:
#   $ACADEMY_PRIVATE_WORDS, or ~/.config/academy/private-words.txt
# One word or word stem per line, '#' starts a comment. Matching is case-insensitive and by substring,
# so a stem also catches declined forms.
# Every grep over commit content runs with -a: without it a single binary file in the commit (a model, a clip)
# makes grep print "binary file matches" instead of the lines, and the text of the whole commit goes unchecked.
#
# Enable once per clone:  git config core.hooksPath tools/hooks
#
# Usage: check-private.sh staged          (pre-commit: added lines and names of staged files)
#        check-private.sh message <file>  (commit-msg: the commit message)
set -u
export LC_ALL=C.UTF-8

mode="${1:-staged}"
list="${ACADEMY_PRIVATE_WORDS:-$HOME/.config/academy/private-words.txt}"

if [ "$mode" = staged ]; then
  email="$(git config user.email || true)"
  case "$email" in
    *@users.noreply.github.com) ;;
    *) echo "pre-commit: user.email is not a GitHub noreply address - commit rejected." >&2; exit 1 ;;
  esac
fi

words="$(mktemp)"
trap 'rm -f "$words"' EXIT
[ -f "$list" ] && grep -v '^[[:space:]]*#' "$list" | sed 's/[[:space:]]*$//' | grep -v '^$' > "$words"

if [ ! -s "$words" ]; then
  echo "warning: no private word list at $list - the name check is skipped." >&2
  exit 0
fi

if [ "$mode" = message ]; then
  hits="$(grep -a -v '^#' "$2" | grep -a -n -i -F -f "$words" || true)"
  where="the commit message"
else
  hits="$( { git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR | sed 's/^/file name: /'
             git diff --cached -U0 --no-color --diff-filter=ACMR --text | grep -a '^+' | grep -a -v '^+++ '
           } | grep -a -n -i -F -f "$words" || true)"
  where="the staged changes"
fi

if [ -n "$hits" ]; then
  # The matched text is deliberately not printed: hook output ends up in logs and transcripts.
  echo "commit rejected: a word from the private list occurs in $where ($(printf '%s\n' "$hits" | wc -l) place(s))." >&2
  echo "Find it with:  git diff --cached --text | grep -a -n -i -F -f \"$list\"" >&2
  exit 1
fi
exit 0

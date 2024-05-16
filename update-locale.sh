#!/usr/bin/env sh

cd nightscout-follower@treehouse.org.za || exit 1

pot="gnome-shell-extension-nightscout-follower.pot"

touch "$pot"
xgettext -j ./*.js -o "$pot" --from-code UTF-8 --no-wrap
xgettext -j schemas/*.xml -o "$pot" --from-code UTF-8 --no-wrap

for po in locale/*; do
    echo "$po"
    msgmerge --backup=off -U "$po" "$pot"
done

rm "$pot"

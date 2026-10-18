#!/bin/sh
# Schedules the daily backup at 02:00 Asia/Bangkok and keeps cron in the foreground.
set -eu
mkdir -p /etc/crontabs
printf '0 2 * * * /usr/local/bin/backup.sh >> /proc/1/fd/1 2>> /proc/1/fd/2\n' > /etc/crontabs/root
exec crond -f -l 8

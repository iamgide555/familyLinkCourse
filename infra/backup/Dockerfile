FROM alpine:3.20
RUN apk add --no-cache postgresql16-client rsync rclone curl tzdata dcron coreutils
ENV TZ=Asia/Bangkok
COPY infra/backup/backup.sh /usr/local/bin/backup.sh
COPY infra/backup/restore.sh /usr/local/bin/restore.sh
COPY infra/backup/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/*.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

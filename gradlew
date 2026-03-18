#!/bin/sh
#
# Copyright © 2015-2021 the original authors.
# Gradle wrapper shell script
#

# Validate that java is installed
if ! command -v java >/dev/null 2>&1; then
    echo "ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH."
    exit 1
fi

APP_HOME="$(cd "$(dirname "$0")" && pwd)"
GRADLE_OPTS="${GRADLE_OPTS:-} -Dfile.encoding=UTF-8 -XX:+HeapDumpOnOutOfMemoryError"

exec java $GRADLE_OPTS -jar "$APP_HOME/gradle/wrapper/gradle-wrapper.jar" "$@"

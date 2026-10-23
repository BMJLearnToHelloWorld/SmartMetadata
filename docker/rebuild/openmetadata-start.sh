#!/bin/bash
# Product server entrypoint. The image unpacks the slim openmetadata-dist tarball.
# exec so the JVM inherits PID 1 and receives docker stop signals.
exec ./bin/openmetadata-server-start.sh conf/openmetadata.yaml

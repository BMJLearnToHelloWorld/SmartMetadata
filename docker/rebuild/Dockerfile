# SmartMetadata product server image.
# Unpacks the locally built slim tarball from `make slim-dist`
# (`mvn -DskipTests package -pl openmetadata-dist -am`). Same runtime shape as
# the historical development Dockerfile (distroless + local tarball), owned
# here so the product path does not build from docker/development/.

# Image refs are overridable so the China compose overlay can pin DaoCloud
# proxies without a second Dockerfile. Defaults stay official (CI / intl).
# FROM-scope ARGs must sit above the first FROM. Docker 29 / BuildKit treats
# a between-stage ARG as stage-local and blanks compose-passed TEMURIN_IMAGE /
# DISTROLESS_IMAGE (China overlay), matching the Dockerfile.ui fix pattern.
ARG ALPINE_IMAGE=alpine:3
ARG TEMURIN_IMAGE=eclipse-temurin:21-jdk
ARG DISTROLESS_IMAGE=gcr.io/distroless/cc-debian13:debug-nonroot
FROM ${ALPINE_IMAGE} AS dist

COPY openmetadata-dist/target/openmetadata-*.tar.gz /

RUN mkdir -p /opt/openmetadata && \
    tar zxvf openmetadata-*.tar.gz -C /opt/openmetadata --strip-components 1 && \
    rm openmetadata-*.tar.gz && \
    mkdir -p /opt/openmetadata/logs && \
    chown -R 65532:65532 /opt/openmetadata/logs && \
    mkdir -p /shim/bin && \
    ln -s /busybox/sh /shim/bin/sh && \
    printf '#!/busybox/sh\nexec /busybox/sh "$@"\n' > /shim/bin/bash && \
    chmod 755 /shim/bin/bash && \
    mkdir -p /shim/usr/bin && \
    ln -s /busybox/env /shim/usr/bin/env

FROM ${TEMURIN_IMAGE} AS jre-builder

RUN jlink \
      --add-modules ALL-MODULE-PATH \
      --strip-debug \
      --no-man-pages \
      --no-header-files \
      --compress=zip-6 \
      --output /javaruntime

RUN find /javaruntime/bin -type f \
      ! -name java ! -name jcmd ! -name jstack ! -name jmap \
      ! -name jinfo ! -name jps ! -name jstat ! -name jfr ! -name keytool \
      -delete

FROM ${DISTROLESS_IMAGE}

ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="/bin:${PATH}"

COPY --from=jre-builder /javaruntime ${JAVA_HOME}
COPY --from=dist /shim/bin /bin
COPY --from=dist /opt/openmetadata /opt/openmetadata
COPY --chmod=755 docker/rebuild/openmetadata-start.sh /openmetadata-start.sh
COPY --from=dist /shim/usr/bin /usr/bin

USER 65532:65532

WORKDIR /opt/openmetadata
EXPOSE 8585 8586

ENTRYPOINT [ "/bin/bash" ]
CMD ["/openmetadata-start.sh"]
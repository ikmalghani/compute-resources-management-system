FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash passwd sudo coreutils procps ca-certificates curl \
  && printf '%s\n' '%sudo ALL=(ALL:ALL) NOPASSWD:ALL' > /etc/sudoers.d/crems \
  && chmod 440 /etc/sudoers.d/crems \
  && curl -fsSL -o /tmp/code-server.deb \
    https://github.com/coder/code-server/releases/download/v4.104.1/code-server_4.104.1_amd64.deb \
  && apt-get install -y /tmp/code-server.deb \
  && rm -rf /tmp/code-server.deb /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/crems-entrypoint
COPY nvidia-smi-sim /usr/local/bin/nvidia-smi-sim
RUN sed -i 's/\r$//' /usr/local/bin/crems-entrypoint /usr/local/bin/nvidia-smi-sim \
  && chmod 755 /usr/local/bin/crems-entrypoint /usr/local/bin/nvidia-smi-sim

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/crems-entrypoint"]

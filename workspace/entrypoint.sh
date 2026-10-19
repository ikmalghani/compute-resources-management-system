#!/bin/bash
set -euo pipefail

USER_NAME="${WORKSPACE_USER:?missing workspace user}"
PROMPT_HOST="${WORKSPACE_PROMPT_HOST:?missing prompt host}"

if ! [[ "$USER_NAME" =~ ^[a-z][a-z0-9]{1,31}$ ]]; then
  echo "invalid workspace user" >&2
  exit 1
fi
if ! [[ "$PROMPT_HOST" =~ ^myspace-[a-z0-9][a-z0-9-]{0,48}$ ]]; then
  echo "invalid prompt host" >&2
  exit 1
fi

if ! id "$USER_NAME" >/dev/null 2>&1; then
  useradd -M -s /bin/bash -d "/home/${USER_NAME}" -G sudo "$USER_NAME"
else
  usermod -aG sudo "$USER_NAME"
fi

mkdir -p "/home/${USER_NAME}"

if [ ! -f "/home/${USER_NAME}/README.txt" ]; then
  cat > "/home/${USER_NAME}/README.txt" << EOF
Workspace ${PROMPT_HOST}
Home directory: /home/${USER_NAME}
CPU limit: ${WORKSPACE_CPU:-unset}
RAM limit: ${WORKSPACE_RAM_MB:-unset} MB

Request a GPU before running a command that needs one.
The GPU is released after that command finishes.
EOF
fi

BASHRC="/home/${USER_NAME}/.bashrc"
touch "$BASHRC"
if grep -q '# MYSPACE START' "$BASHRC"; then
  sed -i '/# MYSPACE START/,/# MYSPACE END/d' "$BASHRC"
fi
cat >> "$BASHRC" << EOF
# MYSPACE START
export PS1='${USER_NAME}@${PROMPT_HOST}~:\$ '
cd ~
_myspace_needs_gpu() {
  printf '%s\n' "\$1" | grep -Eiq '(^|[^[:alnum:]_])(nvidia-smi|nvcc|nvtop|gpustat|rocm-smi|cuda-gdb|nsys|ncu|ollama|vllm|pycuda|cupy)([^[:alnum:]_]|\$)|(^|[^[:alnum:]_])cuda([^[:alnum:]_]|\$)|torch|tensorflow|CUDA_VISIBLE_DEVICES|--gpus'
}
_myspace_hook() {
  local cmd="\$1"
  if _myspace_needs_gpu "\$cmd"; then
    if [ ! -f /etc/myspace-gpu ]; then
      printf '%s\n' "This operation needs a GPU. Please request one."
      return 1
    fi
    : > /tmp/myspace-gpu-command
  fi
  return 0
}
_myspace_after() {
  [ -f /tmp/myspace-gpu-command ] || return 0
  rm -f /tmp/myspace-gpu-command
  : > /tmp/myspace-release-gpu
}
case \$- in
  *i*)
    shopt -s extdebug
    trap '_myspace_hook "\$BASH_COMMAND"' DEBUG
    PROMPT_COMMAND=_myspace_after
    ;;
esac
# MYSPACE END
EOF

if [ ! -f "/home/${USER_NAME}/.bash_profile" ]; then
  printf '%s\n' '. ~/.bashrc' > "/home/${USER_NAME}/.bash_profile"
fi

cat > /etc/profile.d/myspace-prompt.sh << EOF
export PS1='${USER_NAME}@${PROMPT_HOST}~:\$ '
EOF

if [ "${MYSPACE_GPU_MODE:-}" = "simulated" ]; then
  printf '%s\n' "${MYSPACE_GPU_INDEX}" > /etc/myspace-gpu
  ln -sfn /usr/local/bin/nvidia-smi-sim /usr/local/bin/nvidia-smi
elif [ "${MYSPACE_GPU_MODE:-}" = "nvidia" ]; then
  printf '%s\n' "${MYSPACE_GPU_INDEX}" > /etc/myspace-gpu
  rm -f /usr/local/bin/nvidia-smi
else
  rm -f /etc/myspace-gpu /usr/local/bin/nvidia-smi
fi

chown -R "${USER_NAME}:${USER_NAME}" "/home/${USER_NAME}"

if command -v code-server >/dev/null 2>&1 && [ -n "${MYSPACE_WORKSPACE_ID:-}" ]; then
  runuser -u "$USER_NAME" -- code-server \
    --bind-addr 0.0.0.0:8080 \
    --auth none \
    --disable-telemetry \
    --disable-update-check \
    "/home/${USER_NAME}" >/tmp/code-server.log 2>&1 &
fi

exec sleep infinity

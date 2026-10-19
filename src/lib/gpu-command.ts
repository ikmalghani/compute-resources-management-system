export const GPU_REQUEST_MESSAGE = "This operation needs a GPU. Please request one.";

const gpuCommand =
  /(?:^|[^A-Za-z0-9_])(?:nvidia-smi(?:-sim)?|nvcc|nvtop|gpustat|rocm-smi|cuda-gdb|nsys|ncu|ollama|vllm|pycuda|cupy)(?=$|[^A-Za-z0-9_])|(?:^|[^A-Za-z0-9_])cuda(?=$|[^A-Za-z0-9_])|\btorch\b|\btensorflow\b|CUDA_VISIBLE_DEVICES|--gpus\b/i;

export function commandNeedsGpu(command: string) {
  return gpuCommand.test(command);
}

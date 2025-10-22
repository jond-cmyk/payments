import { toast } from "sonner";

export const showSuccess = (message: string) => {
  toast.success(message);
};

export const showError = (error: any) => {
  let message = "An unexpected error occurred.";
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    message = error.message;
  } else if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') {
    message = error.error;
  } else {
    // Fallback for truly generic objects or other types
    try {
      message = JSON.stringify(error);
    } catch {
      message = String(error);
    }
  }
  toast.error(message);
};

export const showLoading = (message: string) => {
  return toast.loading(message);
};

export const dismissToast = (toastId: string | number) => {
  toast.dismiss(toastId);
};

export const showInfo = (message: string) => {
  toast.info(message);
};
/** Maps Google Gaxios / Drive API failures to stable client-visible codes + log text. */
export function classifyDriveUploadError(error: unknown): {
  clientCode: string;
  logLine: string;
} {
  const g = error as {
    message?: string;
    code?: string;
    response?: {
      status?: number;
      statusText?: string;
      data?: {
        error?: {
          message?: string;
          code?: number;
          errors?: Array<{ reason?: string; message?: string; domain?: string }>;
          status?: string;
        };
      };
    };
  };

  const status = g.response?.status;
  const payload = g.response?.data?.error;
  const firstReason = payload?.errors?.[0]?.reason;
  const apiMessage =
    payload?.message ?? payload?.errors?.[0]?.message ?? g.message ?? "";

  const logLine = [
    status && `HTTP ${status}`,
    firstReason,
    apiMessage,
    !status && !apiMessage ? String(error) : "",
  ]
    .filter(Boolean)
    .join(" — ");

  if (!status) {
    const msg = typeof g.message === "string" ? g.message.toLowerCase() : "";
    if (msg.includes("private key") || msg.includes("invalid_grant")) {
      return {
        clientCode: "DRIVE_BAD_CREDENTIALS",
        logLine: logLine || g.message || "JWT / credentials error",
      };
    }
  }

  if (status === 401 || status === 403) {
    if (firstReason === "storageQuotaExceeded") {
      return { clientCode: "DRIVE_QUOTA_OR_STORAGE", logLine };
    }
    // Share folder with service account, or Drive API blocked for the project
    if (
      typeof apiMessage === "string" &&
      apiMessage.toLowerCase().includes("access not configured")
    ) {
      return { clientCode: "DRIVE_API_DISABLED", logLine };
    }
    return { clientCode: "DRIVE_PERMISSION_DENIED", logLine };
  }

  if (status === 404) {
    return { clientCode: "DRIVE_FOLDER_NOT_FOUND", logLine };
  }

  return { clientCode: "UPLOAD_FAILED", logLine: logLine || "Unknown Drive error" };
}

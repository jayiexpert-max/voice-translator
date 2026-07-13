import { CONFIG } from "../config.js";

let toastRegion;

export function initToast(region) {
  toastRegion = region;
}

export function showToast(message, type = "info") {
  if (!toastRegion) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;

  toastRegion.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, CONFIG.toastDurationMs);
}

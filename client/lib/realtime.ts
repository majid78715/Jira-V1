import { API_BASE_URL } from "./apiClient";

const deriveSocketBase = () => {
  const custom = process.env.NEXT_PUBLIC_SOCKET_BASE_URL;
  if (custom) {
    return custom;
  }
  if (API_BASE_URL.endsWith("/api")) {
    return API_BASE_URL.replace(/\/api$/, "");
  }
  return API_BASE_URL.replace(/\/api\/?$/, "");
};

export const SOCKET_BASE_URL = deriveSocketBase();

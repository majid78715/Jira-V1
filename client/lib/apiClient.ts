export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = response.statusText;
    try {
      const payload = await response.json();
      // Handle validation errors with detailed error list
      if (payload?.errors && Array.isArray(payload.errors)) {
        const details = payload.errors.map((e: any) => e.message).join(", ");
        message = `${payload.message || "Validation failed"}: ${details}`;
      } else if (payload?.message) {
        message = payload.message;
      } else if (Array.isArray(payload)) {
        // Raw Zod error array
        message = payload.map((err: { message?: string }) => err.message).join(", ");
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const headers = new Headers(init?.headers ?? {});
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers,
    ...init
  });

  return handleResponse<T>(response);
}

import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "", // Leave blank if using relative routes
  withCredentials: true, // Important: allow sending/receiving cookies
  headers: {
    "Content-Type": "application/json",
  },
});

// Debug: Log when api instance is created
console.log("Axios instance created with withCredentials:", api.defaults.withCredentials);

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

// Attach accessToken from memory or localStorage
api.interceptors.request.use((config) => {
  // Since we're using HTTP-only cookies, tokens are sent automatically
  // No need to manually set Authorization header from localStorage
  // const token = localStorage.getItem("accessToken");
  // if (token) {
  //   config.headers["Authorization"] = `Bearer ${token}`;
  // }
  console.log("Making API request to:", config.url, "Method:", config.method);
  console.log("Request config withCredentials:", config.withCredentials);
  return config;
});

// Handle 401 errors and refresh accessToken
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    console.log("Response interceptor error:", error.response?.status, "URL:", error.config?.url);

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        console.log("Already refreshing, queueing request");
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            // Tokens are handled via cookies, no need to set headers manually
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;
      console.log("Starting token refresh...");

      try {
        // Call your refresh token API using the configured api instance
        console.log("Calling refresh endpoint with credentials...");
        const res = await api.post("/api/refresh");

        const newAccessToken = res.data.data.accessToken;

        console.log("Refresh successful, new access token received");

        // Since we're using HTTP-only cookies, tokens are handled automatically
        // No need to save to localStorage
        // localStorage.setItem("accessToken", newAccessToken);

        processQueue(null, newAccessToken);

        // Retry the original request - cookies are sent automatically
        console.log("Retrying original request");
        return api(originalRequest);
      } catch (refreshError) {
        console.error("Token refresh failed:", refreshError);
        processQueue(refreshError, null);
        console.error("Token refresh failed. Logging out...");

        // ✅ Clear user data and redirect to login
        localStorage.removeItem("user");
        window.location.href = "/auth/login";

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;

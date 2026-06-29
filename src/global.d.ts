import type { DashboardApi } from "../electron/shared/types";

declare global {
  interface Window {
    dashboard: DashboardApi;
  }
}

export {};

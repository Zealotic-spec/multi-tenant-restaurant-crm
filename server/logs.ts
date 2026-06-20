export interface ApiLog {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: any;
  status?: number;
  tenant_context?: string; // Tenant detected
  auth_type?: string; // Static Token vs JWT
  role?: string; // Role if JWT
}

class LogStore {
  private logs: ApiLog[] = [];

  addLog(log: Omit<ApiLog, "id" | "timestamp">) {
    const newLog: ApiLog = {
      id: `log_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toLocaleTimeString(),
      ...log,
    };
    this.logs.unshift(newLog); // New logs at front
    // Cap at 100 logs
    if (this.logs.length > 100) {
      this.logs.pop();
    }
  }

  getLogs() {
    return this.logs;
  }

  clear() {
    this.logs = [];
  }
}

export const sysLogs = new LogStore();

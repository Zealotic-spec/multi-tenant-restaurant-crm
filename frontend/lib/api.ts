// API-клиент для обращения к Express backend через /api proxy (next.config.ts rewrites).

const BASE = "/api/v1";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string>),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
    return undefined as unknown as T;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  user: { id: string; email: string; role: string; restaurant_id: string; restaurant_name?: string; restaurants?: Array<{ id: string; name: string; api_key: string }> };
}

export function login(email: string, password: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function getMe() {
  return request<LoginResponse["user"]>("/auth/me");
}

// ─── Настройки ресторана ──────────────────────────────────────────────────────

export interface RestaurantSettings {
  primary_color: string;
  logo_url: string | null;
  font_family: string;
  enabled_modules: string[];
}

export function getRestaurantSettings() {
  return request<RestaurantSettings>("/crm/restaurant/settings");
}

export function updateRestaurantSettings(data: Partial<RestaurantSettings>) {
  return request<{ message: string }>("/crm/restaurant/settings", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── iiko интеграция ──────────────────────────────────────────────────────────

export interface IikoStatus {
  connected: boolean;
  api_login: string | null;
  organization_ids: string[];
  last_sync_at: string | null;
  pos_type: string;
}

export function getIikoStatus() {
  return request<IikoStatus>("/crm/iiko/status");
}

export function saveIikoCredentials(data: { api_login: string; organization_ids: string[] }) {
  return request<{ message: string }>("/crm/iiko/credentials", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function triggerSync() {
  return request<{ message: string }>("/crm/iiko/sync", { method: "POST" });
}

// ─── Аналитика ────────────────────────────────────────────────────────────────

export interface AnalyticsResponse {
  summary: {
    revenue: number;
    profit: number;
    avg_check: number;
    guests_count: number;
    orders_count: number;
    food_cost_pct: number;
  };
  payment_methods: { cash: number; card: number; sbp: number; other: number };
  daily: Array<{
    date: string;
    revenue: number;
    profit: number;
    avg_check: number;
    guests_count: number;
    orders_count: number;
  }>;
}

export function getAnalytics(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return request<AnalyticsResponse>(`/crm/dashboard/analytics?${params}`);
}

// ─── Меню и Кухня ─────────────────────────────────────────────────────────────

export interface DishStat {
  dish_name: string;
  category: string;
  orders_count: number;
  revenue: number;
  avg_cook_time: number;
}

export interface MenuStatsResponse {
  top: DishStat[];
  bottom: DishStat[];
  all: DishStat[];
}

export function getMenuStats(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return request<MenuStatsResponse>(`/crm/dashboard/menu-stats?${params}`);
}

export interface StopListResponse {
  items: Array<{ name: string; reason: string }>;
  synced_at: string | null;
}

export function getStopList() {
  return request<StopListResponse>("/crm/dashboard/stop-list");
}

// ─── Зал ─────────────────────────────────────────────────────────────────────

export interface HallTable {
  number: number;
  status: "free" | "occupied" | "bill_requested";
  guests: number;
  waiter?: string;
}

export interface HallResponse {
  tables: HallTable[];
  synced_at: string | null;
}

export function getHallStatus() {
  return request<HallResponse>("/crm/dashboard/hall");
}

// ─── Персонал ─────────────────────────────────────────────────────────────────

export interface StaffKpiRow {
  waiter_id: string;
  waiter_name: string;
  orders_count: number;
  revenue: number;
  tips_amount: number;
  avg_service_time: number;
}

export function getStaffKpi(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return request<{ staff: StaffKpiRow[] }>(`/crm/dashboard/staff-kpi?${params}`);
}

// ─── Маркетинг ────────────────────────────────────────────────────────────────

export interface PeakHour {
  hour: number;
  guests_count: number;
  orders_count: number;
}

export function getPeakHours(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return request<{ hours: PeakHour[] }>(`/crm/dashboard/peak-hours?${params}`);
}

export interface FeedbackItem {
  id: string;
  rating: number;
  comment: string;
  source: string;
  guest_name: string;
  created_at: string;
}

export function getFeedback(offset = 0) {
  return request<{ feedback: FeedbackItem[]; avg_rating: number; total: number }>(
    `/crm/dashboard/feedback?offset=${offset}`
  );
}

// ─── Бронирования ─────────────────────────────────────────────────────────────

export interface Reservation {
  id: string;
  restaurant_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  date: string;
  time: string;
  guests_count: number;
  table_id: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  created_at: string;
}

export function getReservations(page = 1, limit = 50) {
  return request<{ reservations: Reservation[]; total: number; page: number; limit: number }>(
    `/crm/reservations?page=${page}&limit=${limit}`
  );
}

export function updateReservation(id: string, status: Reservation["status"]) {
  return request<{ reservation: Reservation }>(`/crm/reservations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function createReservation(data: {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  date: string;
  time: string;
  guests_count: number;
  table_id: string;
}) {
  return request<{ message: string; reservation: Reservation }>("/crm/reservations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Столы ────────────────────────────────────────────────────────────────────

export interface DiningTable {
  id: string;
  restaurant_id: string;
  table_number: number;
  capacity: number;
  x_pos: number;
  y_pos: number;
  current_status: "free" | "reserved" | "occupied";
}

export function getTables() {
  return request<{ tables: DiningTable[] }>("/crm/tables");
}

// ─── Заказы ───────────────────────────────────────────────────────────────────

export interface OrderItem {
  id: string;
  dish_name: string;
  quantity: number;
  price_per_unit: number;
}

export interface Order {
  id: string;
  restaurant_id: string;
  table_id?: string;
  delivery_type: "in_restaurant" | "takeaway";
  customer_name?: string;
  total_amount: number;
  payment_status: "pending" | "paid" | "failed";
  order_status: "new" | "cooking" | "ready" | "delivered";
  created_at: string;
  sla_minutes: number;
  items: OrderItem[];
}

export function getOrders(page = 1, limit = 50) {
  return request<{ orders: Order[]; total: number; page: number; limit: number }>(
    `/crm/orders?page=${page}&limit=${limit}`
  );
}

export function updateOrderStatus(id: string, order_status: Order["order_status"]) {
  return request<{ order: Order }>(`/crm/orders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ order_status }),
  });
}

// ─── Сотрудники ───────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  email: string;
  role: string;
}

export function getEmployees() {
  return request<{ staff: Employee[] }>("/crm/employees");
}

export function createEmployee(email: string, password: string, role: string) {
  return request<{ user: Employee }>("/crm/employees", {
    method: "POST",
    body: JSON.stringify({ email, password, role }),
  });
}

export function deleteEmployee(id: string) {
  return request<{ message: string }>(`/crm/employees/${id}`, { method: "DELETE" });
}

export function resetEmployeePassword(id: string) {
  return request<{ new_password: string; email: string }>(`/crm/employees/${id}/reset-password`, {
    method: "POST",
  });
}

// ─── Меню (CRUD) ──────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  restaurant_id: string;
  name: string;
  price: number;
  category?: string;
  is_available: boolean;
  description?: string;
  badge_label?: string;
  badge_color?: string;
}

export function getMenuItems() {
  return request<{ menu: MenuItem[] }>("/crm/menu");
}

export function createMenuItem(data: Partial<MenuItem>) {
  return request<{ item: MenuItem }>("/crm/menu", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateMenuItem(id: string, data: Partial<MenuItem>) {
  return request<{ item: MenuItem }>(`/crm/menu/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function deleteMenuItem(id: string) {
  return request<{ message: string }>(`/crm/menu/${id}`, { method: "DELETE" });
}

// ─── Переключение ресторана ───────────────────────────────────────────────────

export function switchRestaurant(restaurant_id: string) {
  return request<{ token: string; user: LoginResponse["user"] }>("/crm/founder/switch-restaurant", {
    method: "POST",
    body: JSON.stringify({ restaurant_id }),
  });
}

// ─── Уведомления (WhatsApp / Email / Webhook) ─────────────────────────────────
// Секреты приходят с бэкенда только в маскированном виде (первые 4 символа + ****).

export interface NotificationSettings {
  whatsapp_enabled: boolean;
  email_enabled: boolean;
  webhook_url: string | null;
  reminder_hours: number;
  twilio_account_sid: string | null;
  twilio_auth_token_masked: string | null;
  twilio_from: string | null;
  resend_api_key_masked: string | null;
}

export function getNotificationSettings() {
  return request<NotificationSettings>("/crm/notifications/settings");
}

export function saveNotificationSettings(data: {
  whatsapp_enabled?: boolean;
  email_enabled?: boolean;
  webhook_url?: string | null;
  reminder_hours?: number;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_from?: string;
  resend_api_key?: string;
}) {
  return request<{ message: string }>("/crm/notifications/settings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function testNotification(channel: "whatsapp" | "email" | "webhook", target?: string) {
  return request<{ success: boolean; error?: string }>("/crm/notifications/test", {
    method: "POST",
    body: JSON.stringify({ channel, target }),
  });
}

// ─── Super Admin ──────────────────────────────────────────────────────────────

export interface RestaurantAdmin {
  id: string;
  name: string;
  api_key: string;
  created_at: string;
  founder_id: string | null;
  archived_at: string | null;
}

export interface InviteCode {
  code: string;
  created_at: string;
  used_at: string | null;
  used_by_user_id: string | null;
  note: string | null;
}

export interface ApiLog {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  status?: number;
  tenant_context?: string;
  auth_type?: string;
  role?: string;
}

export function getAllRestaurants() {
  return request<{ restaurants: RestaurantAdmin[] }>("/crm/restaurants");
}

export function getAllInviteCodes() {
  return request<{ invite_codes: InviteCode[] }>("/crm/invite-codes");
}

export function createInviteCode(note?: string) {
  return request<{ message: string; invite_code: InviteCode }>("/crm/invite-codes", {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export function getSystemLogs() {
  return request<ApiLog[]>("/system/logs");
}

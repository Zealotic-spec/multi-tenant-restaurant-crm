// iikoCloud API client.
// Когда apiLogin не задан (нет учётных данных) — автоматически переключается на mock-данные.
// Реальные вызовы: https://api.iiko.services/api/1/*

import {
  generateMockAnalytics,
  generateMockMenuStats,
  generateMockStopList,
  generateMockHallStatus,
  generateMockStaffKpi,
  generateMockPeakHours,
  generateMockFeedback,
  type DayAnalytics,
  type MenuDayStat,
  type StopListItem,
  type HallTable,
  type StaffKpiRow,
  type PeakHourRow,
  type FeedbackItem,
} from "./mock.js";

const IIKO_BASE = "https://api.iiko.services";

// Токен живёт 1 час — кешируем per apiLogin.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getToken(apiLogin: string): Promise<string> {
  const cached = tokenCache.get(apiLogin);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const resp = await fetch(`${IIKO_BASE}/api/1/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiLogin }),
  });
  if (!resp.ok) throw new Error(`iiko auth failed: ${resp.status} ${await resp.text()}`);

  const data = await resp.json() as { token: string };
  tokenCache.set(apiLogin, { token: data.token, expiresAt: Date.now() + 55 * 60 * 1000 });
  return data.token;
}

async function iikoPost<T>(token: string, path: string, body: object): Promise<T> {
  const resp = await fetch(`${IIKO_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`iiko ${path} failed: ${resp.status} ${await resp.text()}`);
  return resp.json() as Promise<T>;
}

// ─── Публичный клиент ─────────────────────────────────────────────────────────

export interface IikoClientOptions {
  apiLogin: string | null;
  organizationIds: string[];
  restaurantId: string;
}

export async function fetchAnalytics(
  opts: IikoClientOptions,
  dateFrom: string,
  dateTo: string
): Promise<DayAnalytics[]> {
  if (!opts.apiLogin) return generateMockAnalytics(opts.restaurantId, dateFrom, dateTo);

  const token = await getToken(opts.apiLogin);
  const orgIds = opts.organizationIds;

  // iiko OLAP report — агрегация по дням
  const data = await iikoPost<IikoOlapResponse>(token, "/api/1/reports/olap", {
    organizationIds: orgIds,
    settings: {
      queryString: "",
      groupByRowFields: ["OpenDate.Typed"],
      aggregateFields: [
        "GuestNum",
        "OrderNum",
        "DishSumInt",
        "DishDiscountSumInt",
      ],
      filters: {
        "OpenDate.Typed": { filterType: "DateRange", periodType: "CUSTOM", from: dateFrom, to: dateTo },
      },
    },
  });

  return transformOlapToAnalytics(data);
}

export async function fetchMenuStats(
  opts: IikoClientOptions,
  dateFrom: string,
  dateTo: string
): Promise<MenuDayStat[]> {
  if (!opts.apiLogin) return generateMockMenuStats(opts.restaurantId, dateFrom, dateTo);

  const token = await getToken(opts.apiLogin);
  const data = await iikoPost<IikoOlapResponse>(token, "/api/1/reports/olap", {
    organizationIds: opts.organizationIds,
    settings: {
      queryString: "",
      groupByRowFields: ["OpenDate.Typed", "DishName", "DishCategory"],
      aggregateFields: ["DishAmountInt", "DishSumInt"],
      filters: {
        "OpenDate.Typed": { filterType: "DateRange", periodType: "CUSTOM", from: dateFrom, to: dateTo },
      },
    },
  });

  return transformOlapToMenuStats(data);
}

export async function fetchStopList(opts: IikoClientOptions): Promise<StopListItem[]> {
  if (!opts.apiLogin) return generateMockStopList();

  const token = await getToken(opts.apiLogin);
  const data = await iikoPost<{ stopListItems: Array<{ productName: string; balance: number }> }>(
    token, "/api/1/stop_lists", { organizationIds: opts.organizationIds }
  );

  return (data.stopListItems ?? []).map((item) => ({
    name: item.productName,
    reason: `Остаток: ${item.balance}`,
  }));
}

export async function fetchHallStatus(opts: IikoClientOptions): Promise<HallTable[]> {
  if (!opts.apiLogin) return generateMockHallStatus();

  const token = await getToken(opts.apiLogin);
  // iiko tables endpoint — текущий статус столов
  const data = await iikoPost<{ tables: Array<{ number: number; status: string; guestCount: number }> }>(
    token, "/api/1/table_map/tables", { organizationIds: opts.organizationIds }
  );

  return (data.tables ?? []).map((t) => ({
    number: t.number,
    status: mapIikoTableStatus(t.status),
    guests: t.guestCount ?? 0,
  }));
}

export async function fetchStaffKpi(
  opts: IikoClientOptions,
  dateFrom: string,
  dateTo: string
): Promise<StaffKpiRow[]> {
  if (!opts.apiLogin) return generateMockStaffKpi(opts.restaurantId, dateFrom, dateTo);

  const token = await getToken(opts.apiLogin);
  const data = await iikoPost<IikoOlapResponse>(token, "/api/1/reports/olap", {
    organizationIds: opts.organizationIds,
    settings: {
      queryString: "",
      groupByRowFields: ["OpenDate.Typed", "WaiterName", "WaiterId"],
      aggregateFields: ["OrderNum", "DishSumInt"],
      filters: {
        "OpenDate.Typed": { filterType: "DateRange", periodType: "CUSTOM", from: dateFrom, to: dateTo },
      },
    },
  });

  return transformOlapToStaffKpi(data);
}

export async function fetchPeakHours(
  opts: IikoClientOptions,
  dateFrom: string,
  dateTo: string
): Promise<PeakHourRow[]> {
  if (!opts.apiLogin) return generateMockPeakHours(opts.restaurantId, dateFrom, dateTo);

  const token = await getToken(opts.apiLogin);
  const data = await iikoPost<IikoOlapResponse>(token, "/api/1/reports/olap", {
    organizationIds: opts.organizationIds,
    settings: {
      queryString: "",
      groupByRowFields: ["OpenDate.Typed", "OpenDate.Hour"],
      aggregateFields: ["GuestNum", "OrderNum"],
      filters: {
        "OpenDate.Typed": { filterType: "DateRange", periodType: "CUSTOM", from: dateFrom, to: dateTo },
      },
    },
  });

  return transformOlapToPeakHours(data);
}

export { generateMockFeedback };

// ─── Трансформеры OLAP-ответа ─────────────────────────────────────────────────

interface IikoOlapResponse {
  data: Array<Record<string, string | number>>;
  columnNames: string[];
}

function transformOlapToAnalytics(raw: IikoOlapResponse): DayAnalytics[] {
  return (raw.data ?? []).map((row) => ({
    date: String(row["OpenDate.Typed"] ?? "").split("T")[0],
    revenue: Number(row["DishSumInt"] ?? 0) / 100,
    profit: Number(row["DishSumInt"] ?? 0) / 100 * 0.35,
    avg_check: Number(row["GuestNum"] ?? 1) > 0
      ? (Number(row["DishSumInt"] ?? 0) / 100) / Number(row["GuestNum"])
      : 0,
    guests_count: Number(row["GuestNum"] ?? 0),
    orders_count: Number(row["OrderNum"] ?? 0),
    food_cost_pct: 30,
    cash_amount: 0,
    card_amount: Number(row["DishSumInt"] ?? 0) / 100,
    sbp_amount: 0,
    other_amount: 0,
  }));
}

function transformOlapToMenuStats(raw: IikoOlapResponse): MenuDayStat[] {
  return (raw.data ?? []).map((row) => ({
    date: String(row["OpenDate.Typed"] ?? "").split("T")[0],
    dish_name: String(row["DishName"] ?? ""),
    category: String(row["DishCategory"] ?? ""),
    orders_count: Number(row["DishAmountInt"] ?? 0),
    revenue: Number(row["DishSumInt"] ?? 0) / 100,
    avg_cook_time: 0,
  }));
}

function transformOlapToStaffKpi(raw: IikoOlapResponse): StaffKpiRow[] {
  return (raw.data ?? []).map((row) => ({
    date: String(row["OpenDate.Typed"] ?? "").split("T")[0],
    waiter_id: String(row["WaiterId"] ?? ""),
    waiter_name: String(row["WaiterName"] ?? ""),
    orders_count: Number(row["OrderNum"] ?? 0),
    revenue: Number(row["DishSumInt"] ?? 0) / 100,
    tips_amount: 0,
    avg_service_time: 0,
  }));
}

function transformOlapToPeakHours(raw: IikoOlapResponse): PeakHourRow[] {
  return (raw.data ?? []).map((row) => ({
    date: String(row["OpenDate.Typed"] ?? "").split("T")[0],
    hour: Number(row["OpenDate.Hour"] ?? 0),
    guests_count: Number(row["GuestNum"] ?? 0),
    orders_count: Number(row["OrderNum"] ?? 0),
  }));
}

function mapIikoTableStatus(s: string): "free" | "occupied" | "bill_requested" {
  if (s === "Free") return "free";
  if (s === "BillRequested") return "bill_requested";
  return "occupied";
}

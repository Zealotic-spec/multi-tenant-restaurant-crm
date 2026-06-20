export interface Restaurant {
  id: string;
  name: string;
  api_key: string;
  created_at: string;
  founder_id?: string | null; // Владелец-основатель (может иметь несколько ресторанов)
  archived_at?: string | null; // Soft-delete метка — архивированный ресторан недоступен для входа
}

export interface User {
  id: string;
  restaurant_id: string; // Tenant isolation key
  email: string;
  password_hash: string;
  role: "super_admin" | "founder" | "manager" | "hostess" | "chef";
}

export interface DiningTable {
  id: string;
  restaurant_id: string; // Tenant isolation key
  table_number: number;
  capacity: number;
  x_pos: number; // For responsive layout simulation
  y_pos: number;
  current_status: "free" | "reserved" | "occupied";
}

export interface Reservation {
  id: string;
  restaurant_id: string; // Tenant isolation key
  customer_name: string;
  customer_phone: string;
  date: string; // Format: YYYY-MM-DD
  time: string; // Format: HH:MM
  guests_count: number;
  table_id: string; // Bound to visual table layout
  status: "pending" | "confirmed" | "completed" | "cancelled";
  created_at: string;
}

export interface Order {
  id: string;
  restaurant_id: string; // Tenant isolation key
  table_id?: string; // Links dining table if client is 'in_restaurant'
  delivery_type: "in_restaurant" | "takeaway" | "delivery";
  delivery_address?: string; // Required when delivery_type === 'delivery'
  customer_name?: string;
  customer_phone?: string; // Required when delivery_type === 'delivery' (courier contact)
  total_amount: number;
  payment_status: "pending" | "paid" | "failed";
  order_status: "new" | "cooking" | "ready" | "out_for_delivery" | "delivered";
  created_at: string;
  sla_minutes: number; // Pledged preparation SLA time
}

export interface OrderItem {
  id: string;
  order_id: string;
  dish_name: string;
  quantity: number;
  price_per_unit: number;
}

export interface PaymentTransaction {
  id: string;
  transaction_key: string; // Unique idempotency key to defend from double spending
  order_id: string;
  amount: number;
  status: "success" | "failed";
  created_at: string;
}

export interface MenuItem {
  id: string;
  restaurant_id: string; // Tenant isolation key
  name: string;
  price: number;
  category?: string;
  is_available: boolean;
}

// Client Side Interface wrappers
export interface TenantInfo {
  id: string;
  name: string;
  cuisine: string;
  api_key: string;
  menu: { name: string; price: number }[];
  zones: string[];
}

export interface ApiLog {
  id: string;
  method: string;
  url: string;
  timestamp: string;
  auth_type: string;
  status: number;
  headers: Record<string, string>;
  role?: string;
  tenant_context: string;
  body?: any;
}

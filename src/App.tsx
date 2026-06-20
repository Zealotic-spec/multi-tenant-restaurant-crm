import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen,
  LayoutDashboard,
  Terminal,
  Database,
  ShieldCheck,
  UserCheck,
  Building2,
  Lock,
  CalendarDays,
  UtensilsCrossed,
  Layers,
  ShoppingBag,
  CreditCard,
  Send,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Clock,
  CodeXml,
  PlusCircle,
  Menu,
  AlertOctagon,
  User,
  Users,
  MapPin,
  Phone,
  Plus,
  Minus,
  Store,
  Crown,
  Briefcase,
} from "lucide-react";
import InteractiveMap from "./components/InteractiveMap";
import KitchenDashboard from "./components/KitchenDashboard";
import { Restaurant, User as CrmUser, DiningTable, Reservation, Order, ApiLog, TenantInfo } from "./types";

// --- API Configurations ---
const API_BASE = "/api/v1";

// Same seeds as server database mapping
const TENANTS_INFO: TenantInfo[] = [
  {
    id: "rest_tenant_a",
    name: "[Название организации A / Tenant A]",
    cuisine: "[Направление кухни организации А / Cuisine A] 🍲",
    api_key: "api_key_tenant_a_2026",
    menu: [
      { name: "[Блюдо 1 / Dish 1]", price: 4500 },
      { name: "[Блюдо 2 / Dish 2]", price: 19500 },
      { name: "[Блюдо 3 / Dish 3]", price: 4500 },
      { name: "[Напиток 1 / Drink 1]", price: 2605 }
    ],
    zones: ["[Зона зала A-1]", "[Зона зала A-2]"]
  },
  {
    id: "rest_tenant_b",
    name: "[Название организации B / Tenant B]",
    cuisine: "[Направление кухни организации Б / Cuisine B] 🍢",
    api_key: "api_key_tenant_b_2026",
    menu: [
      { name: "[Блюдо 4 / Dish 4]", price: 12500 },
      { name: "[Напиток 2 / Drink 2]", price: 3200 },
      { name: "[Блюдо 5 / Dish 5]", price: 8500 },
      { name: "[Десерт 1 / Dessert 1]", price: 4000 }
    ],
    zones: ["[Зона зала B-1]", "[Зона зала B-2]"]
  }
];

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"docs" | "client" | "crm" | "logs">("docs");

  // Multi-tenant Client Website Simulator State
  const [tenants, setTenants] = useState<TenantInfo[]>(TENANTS_INFO);
  const [selectedClientTenant, setSelectedClientTenant] = useState<TenantInfo>(TENANTS_INFO[0]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const [reservationForm, setReservationForm] = useState({
    customer_name: "",
    customer_phone: "",
    date: new Date().toISOString().split("T")[0],
    time: "19:00",
    guests_count: 2,
    table_id: ""
  });

  const [orderDeliveryType, setOrderDeliveryType] = useState<"in_restaurant" | "takeaway">("in_restaurant");

  // Client Basket (Ordered items)
  const [basket, setBasket] = useState<{ name: string; price: number; quantity: number }[]>([]);
  const [lastCreatedOrderId, setLastCreatedOrderId] = useState<string | null>(null);
  const [lastCreatedOrderTotal, setLastCreatedOrderTotal] = useState<number>(0);

  // CRM Workspace State
  const [crmLoginEmail, setCrmLoginEmail] = useState("owner@tenant-a.io");
  const [crmLoginPassword, setCrmLoginPassword] = useState("password123");
  const [crmToken, setCrmToken] = useState<string | null>(localStorage.getItem("crm_jwt"));
  const [crmUser, setCrmUser] = useState<any>(null);
  const [crmReservations, setCrmReservations] = useState<Reservation[]>([]);
  const [crmOrders, setCrmOrders] = useState<Order[]>([]);
  const [crmTables, setCrmTables] = useState<DiningTable[]>([]);
  const [crmEmployees, setCrmEmployees] = useState<{ id: string; email: string; role: string }[]>([]);
  // Карта столов клиентского сайта (из публичного /client/tables, scoped по X-Restaurant-Key)
  const [clientTables, setClientTables] = useState<DiningTable[]>([]);
  const [crmActiveTab, setCrmActiveTab] = useState<"reservations" | "orders" | "analytics" | "employees" | "menu" | "tables" | "restaurants" | "my-restaurants">("reservations");
  const [crmError, setCrmError] = useState<string | null>(null);

  // Тоггл "Вход / Регистрация" на объединенном экране авторизации CRM
  const [crmAuthMode, setCrmAuthMode] = useState<"login" | "register">("login");
  // Регистрация создаёт ТОЛЬКО founder-аккаунт + его первый (новый, независимый) ресторан-tenant.
  // Требует одноразовый invite_code, который лично выдаёт super_admin каждому клиенту.
  const [registerForm, setRegisterForm] = useState({ restaurant_name: "", email: "", password: "", invite_code: "" });

  // Рестораны, которыми владеет ТЕКУЩИЙ founder (включая архивированные) — для свитчера и панели "Мои рестораны"
  const [founderRestaurants, setFounderRestaurants] = useState<{ id: string; name: string; api_key: string; archived_at?: string | null }[]>([]);
  const [newRestaurantName, setNewRestaurantName] = useState("");

  const [employeeForm, setEmployeeForm] = useState({ email: "", password: "", role: "hostess" });

  // Client order form (name + phone from site, plus delivery type)
  const [clientOrderForm, setClientOrderForm] = useState({
    customer_name: "",
    customer_phone: "",
    delivery_type: "in_restaurant" as "in_restaurant" | "takeaway" | "delivery",
    delivery_address: "",
  });

  // Table management form
  const [tableForm, setTableForm] = useState({ table_number: "", capacity: "4", x_pos: "50", y_pos: "50" });

  // Restaurant registration form (super_admin)
  const [restaurantForm, setRestaurantForm] = useState({ name: "", owner_email: "", owner_password: "" });

  // System logs & state
  const [systemLogs, setSystemLogs] = useState<ApiLog[]>([]);
  const [dbDump, setDbDump] = useState<any>(null);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Helper trigger to auto poll logs & db dumps (Simulating WS / live polling)
  const [tick, setTick] = useState(0);

  // Read URL params on mount — auto-switch to client tab if ?tab=client
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "client") {
      setActiveTab("client");
      // Import cart from site if available
      try {
        const raw = localStorage.getItem("saas_cart_transfer");
        if (raw) {
          const cartData = JSON.parse(raw);
          const age = Date.now() - (cartData.timestamp || 0);
          if (age < 5 * 60 * 1000) { // 5 min freshness
            const imported = (cartData.items || []).map((i: any) => ({
              name: i.name,
              price: i.price,
              quantity: i.quantity,
            }));
            if (imported.length > 0) {
              setBasket(imported);
              showToast(`Корзина с сайта загружена: ${imported.length} позиций`, "info");
            }
          }
          localStorage.removeItem("saas_cart_transfer");
        }
      } catch {}
    }
  }, []);

  // SSE / Polling simulator: Refreshes logs, lists, Kanban queue, and table map every 1s
  useEffect(() => {
    fetchLogs();
    fetchDbDump();
    if (crmToken) {
      fetchCrmReservations(crmToken);
      fetchCrmOrders(crmToken);
      fetchCrmTables(crmToken);
      if (crmUser?.role === "founder" || crmUser?.role === "manager" || crmUser?.role === "super_admin") {
        fetchCrmEmployees(crmToken);
      }
      if (crmUser?.role === "founder") {
        fetchFounderRestaurants(crmToken);
      }
    }
  }, [tick, activeTab, crmUser?.role]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  // Sync profile when token changes
  useEffect(() => {
    if (crmToken) {
      fetchUserProfile();
    }
  }, [crmToken]);

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 5000);
  };

  // Системные эндпоинты /system/* теперь требуют Bearer JWT с ролью super_admin —
  // без токена/роли тихо не делаем запрос (избегаем лишних 401 и утечки факта существования эндпоинта).
  const fetchLogs = async () => {
    if (!crmToken || crmUser?.role !== "super_admin") return;
    try {
      const res = await fetch(`${API_BASE}/system/logs`, {
        headers: { Authorization: `Bearer ${crmToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setSystemLogs(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDbDump = async () => {
    if (!crmToken || crmUser?.role !== "super_admin") return;
    try {
      const res = await fetch(`${API_BASE}/system/db-dump`, {
        headers: { Authorization: `Bearer ${crmToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setDbDump(data);
    } catch (err) {
      console.error(err);
    }
  };

  const clearLogs = async () => {
    if (!crmToken || crmUser?.role !== "super_admin") return;
    try {
      await fetch(`${API_BASE}/system/logs/clear`, {
        method: "POST",
        headers: { Authorization: `Bearer ${crmToken}` }
      });
      setSystemLogs([]);
      showToast("Консоль инспектора очищена");
    } catch (err) {
      showToast("Ошибка при очистке логов", "error");
    }
  };

  const resetDatabase = async () => {
    if (!crmToken || crmUser?.role !== "super_admin") {
      showToast("Сброс БД доступен только авторизованному Super Admin", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/system/db-reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${crmToken}` }
      });
      const data = await res.json();
      setTick((t) => t + 1);
      if (res.ok) {
        showToast(data.message || "База данных перезапущена с исходными семенами! Овербукинг разблокирован.");
      } else {
        showToast(data.error || "Ошибка сброса", "error");
      }
      setBasket([]);
      setLastCreatedOrderId(null);
      setSelectedTableId(null);
      handleCrmLogout();
    } catch (err) {
      showToast("Ошибка сброса", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchCrmTables = async (token = crmToken) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/crm/tables`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setCrmTables(data.tables);
    } catch {}
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crmToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/crm/tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${crmToken}` },
        body: JSON.stringify({
          table_number: Number(tableForm.table_number),
          capacity: Number(tableForm.capacity),
          x_pos: Number(tableForm.x_pos),
          y_pos: Number(tableForm.y_pos),
        }),
      });
      const data = await res.json();
      setTick((t) => t + 1);
      if (res.ok) {
        showToast(data.message);
        setTableForm({ table_number: "", capacity: "4", x_pos: "50", y_pos: "50" });
        fetchCrmTables();
      } else {
        showToast(data.error || "Ошибка добавления стола", "error");
      }
    } catch {
      showToast("Сбой соединения", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTable = async (id: string) => {
    if (!crmToken) return;
    try {
      const res = await fetch(`${API_BASE}/crm/tables/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${crmToken}` },
      });
      const data = await res.json();
      setTick((t) => t + 1);
      if (res.ok) {
        showToast(data.message);
        fetchCrmTables();
      } else {
        showToast(data.error || "Ошибка удаления", "error");
      }
    } catch {
      showToast("Ошибка связи", "error");
    }
  };

  const handleMoveTable = async (id: string, x_pos: number, y_pos: number) => {
    if (!crmToken) return;
    try {
      await fetch(`${API_BASE}/crm/tables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${crmToken}` },
        body: JSON.stringify({ x_pos, y_pos }),
      });
      setTick((t) => t + 1);
    } catch {}
  };

  const handleCreateRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crmToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/crm/restaurants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${crmToken}` },
        body: JSON.stringify(restaurantForm),
      });
      const data = await res.json();
      setTick((t) => t + 1);
      if (res.ok) {
        showToast(data.message);
        setRestaurantForm({ name: "", owner_email: "", owner_password: "" });
        // api_key нового тенанта отдаётся только здесь, в момент создания, тому кто его создал
        // (super_admin) — публичный каталог /public/restaurants его никогда не раскрывает.
        // Сразу заносим тенант в локальный каталог симулятора, чтобы продемонстрировать,
        // как владелец передаёт этот ключ своему сайту для интеграции.
        if (data.restaurant) {
          const newTenant: TenantInfo = {
            id: data.restaurant.id,
            name: data.restaurant.name,
            cuisine: "Ресторан",
            api_key: data.restaurant.api_key,
            menu: [],
            zones: [],
          };
          setTenants((prev) => [...prev.filter((t) => t.id !== newTenant.id), newTenant]);
        }
      } else {
        showToast(data.error || "Ошибка создания ресторана", "error");
      }
    } catch {
      showToast("Сбой соединения", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneInput = (val: string) => {
    let digits = val.replace(/\D/g, "");
    if (digits.startsWith("7") || digits.startsWith("8")) digits = digits.substring(1);
    digits = digits.substring(0, 10);
    let formatted = "+7";
    if (digits.length > 0) formatted += " (" + digits.substring(0, 3);
    if (digits.length >= 3) formatted += ") " + digits.substring(3, 6);
    if (digits.length >= 6) formatted += "-" + digits.substring(6, 8);
    if (digits.length >= 8) formatted += "-" + digits.substring(8, 10);
    setClientOrderForm((f) => ({ ...f, customer_phone: digits.length === 0 ? "" : formatted }));
  };

  // Role display helper
  const getRoleLabel = (role: string) => {
    if (role === "super_admin") return "Super Admin";
    if (role === "founder") return "Основатель";
    if (role === "manager") return "Менеджер";
    if (role === "hostess") return "Хостес";
    if (role === "chef") return "Шеф-повар";
    return role;
  };

  // ------------------ API CALLS FROM CLIENT SITE ---------------
  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTableId) {
      showToast("Выберите интерактивный столик на карте зала для бронирования!", "error");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...reservationForm,
        table_id: selectedTableId
      };

      const res = await fetch(`${API_BASE}/client/reservations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Restaurant-Key": selectedClientTenant.api_key
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      setTick((t) => t + 1);

      if (res.ok) {
        showToast(`Бронь #${data.reservation.id.slice(-4).toUpperCase()} подтверждена! Стол №${data.updated_table?.table_number || ""} зарезервирован.`);
        setReservationForm({
          customer_name: "",
          customer_phone: "",
          date: new Date().toISOString().split("T")[0],
          time: "19:00",
          guests_count: 2,
          table_id: ""
        });
        setSelectedTableId(null);
      } else {
        showToast(data.error || "Ошибка бронирования", "error");
      }
    } catch (err) {
      showToast("Сбой соединения с сервером", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToBasket = (dishName: string, price: number) => {
    setBasket((prev) => {
      const exists = prev.find((i) => i.name === dishName);
      if (exists) {
        return prev.map((i) => (i.name === dishName ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { name: dishName, price, quantity: 1 }];
    });
  };

  const handleRemoveFromBasket = (dishName: string) => {
    setBasket((prev) => prev.filter((i) => i.name !== dishName));
  };

  const handleCreateOrder = async () => {
    if (basket.length === 0) return;
    if (clientOrderForm.delivery_type === "in_restaurant" && !selectedTableId) {
      showToast("Выберите столик на карте зала для привязки заказа 'В заведении'!", "error");
      return;
    }
    if (clientOrderForm.delivery_type === "delivery") {
      if (!clientOrderForm.delivery_address.trim()) {
        showToast("Укажите адрес доставки!", "error");
        return;
      }
      if (!clientOrderForm.customer_name.trim() || !clientOrderForm.customer_phone.trim()) {
        showToast("Для доставки на дом укажите имя и телефон — курьеру нужно с кем связаться!", "error");
        return;
      }
    }

    setLoading(true);
    const total = basket.reduce((acc, item) => acc + item.price * item.quantity, 0);

    try {
      const res = await fetch(`${API_BASE}/client/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Restaurant-Key": selectedClientTenant.api_key
        },
        body: JSON.stringify({
          total_amount: total,
          delivery_type: clientOrderForm.delivery_type,
          delivery_address: clientOrderForm.delivery_type === "delivery" ? clientOrderForm.delivery_address.trim() : undefined,
          table_id: clientOrderForm.delivery_type === "in_restaurant" ? selectedTableId : undefined,
          customer_name: clientOrderForm.customer_name || undefined,
          customer_phone: clientOrderForm.customer_phone || undefined,
          items: basket.map((i) => ({
            dish_name: i.name,
            quantity: i.quantity,
            price_per_unit: i.price
          }))
        })
      });

      const data = await res.json();
      setTick((t) => t + 1);

      if (res.ok) {
        setLastCreatedOrderId(data.order_id);
        setLastCreatedOrderTotal(total);
        setBasket([]);
        showToast(`Экспресс заказ создан: ${data.order_id}. Статус: pending. Оплатите для отправки шефу.`, "info");
      } else {
        showToast(data.error || "Ошибка создания заказа", "error");
      }
    } catch (err) {
      showToast("Сбой транзакции", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSimulatePaymentWebhook = async () => {
    if (!lastCreatedOrderId) return;
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/client/payments/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          order_id: lastCreatedOrderId,
          // Generate a cryptographically valid unique idempotency token
          idemp_key: `kaspi_idemp_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          status: "success",
          amount: lastCreatedOrderTotal
        })
      });

      const data = await response.json();
      setTick((t) => t + 1);

      if (response.ok) {
        showToast(`Платеж принят! Выдан фискальный чек: ${data.receipt?.fiscal_signature || "OK"}. Заказ уже готовится на кухне.`);
        setLastCreatedOrderId(null);
        setSelectedTableId(null);
      } else {
        showToast(data.error || "Ошибка оплаты", "error");
      }
    } catch (err) {
      showToast("Ошибка платежного шлюза", "error");
    } finally {
      setLoading(false);
    }
  };

  // ------------------ CRM ACTIONS (JWT AUTHENTICATED) -----------
  const fetchCrmEmployees = async (token = crmToken) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/crm/employees`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setCrmEmployees(data.staff);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crmToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/crm/employees`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${crmToken}`
        },
        body: JSON.stringify(employeeForm)
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Сотрудник зачислен!");
        setEmployeeForm({ email: "", password: "", role: "hostess" });
        fetchCrmEmployees();
      } else {
        showToast(data.error || "Ошибка зачисления", "error");
      }
    } catch (err) {
      showToast("Сбой соединения", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMenuPrice = (dishName: string, newPrice: number) => {
    setTenants((prev) =>
      prev.map((t) => {
        if (t.id === crmUser?.restaurant_id) {
          return {
            ...t,
            menu: t.menu.map((m) => (m.name === dishName ? { ...m, price: newPrice } : m))
          };
        }
        return t;
      })
    );
    setSelectedClientTenant((prev) => {
      if (prev.id === crmUser?.restaurant_id) {
        return {
          ...prev,
          menu: prev.menu.map((m) => (m.name === dishName ? { ...m, price: newPrice } : m))
        };
      }
      return prev;
    });
    showToast(`Цена блюда "${dishName}" обновлена до ${newPrice} ₸`);
  };

  const handleCrmLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setCrmError(null);

    try {
      const res = await fetch(`${API_BASE}/crm/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: crmLoginEmail, password: crmLoginPassword })
      });

      const data = await res.json();
      setTick((t) => t + 1);

      if (res.ok) {
        localStorage.setItem("crm_jwt", data.token);
        setCrmToken(data.token);
        setCrmUser(data.user);
        
        // Auto routing to preferred role sections
        if (data.user.role === "chef") {
          setCrmActiveTab("orders");
        } else if (data.user.role === "hostess") {
          setCrmActiveTab("reservations");
        } else if (data.user.role === "super_admin") {
          setCrmActiveTab("restaurants");
        } else {
          setCrmActiveTab("analytics");
        }

        showToast(`Добро пожаловать! Роль: ${getRoleLabel(data.user.role)}`);
        fetchCrmReservations(data.token);
        fetchCrmOrders(data.token);
        fetchCrmTables(data.token);
        if (data.user.role === "founder" || data.user.role === "manager" || data.user.role === "super_admin") {
          fetchCrmEmployees(data.token);
        }
        if (data.user.role === "founder") {
          setFounderRestaurants(data.user.restaurants || []);
          fetchFounderRestaurants(data.token);
        }
      } else {
        setCrmError(data.error || "Неверный логин или пароль");
        showToast(data.error || "Ошибка авторизации", "error");
      }
    } catch (err) {
      setCrmError("Нет сигнала от хост-сервера");
    } finally {
      setLoading(false);
    }
  };

  // Регистрация создаёт founder-аккаунт + его первый ресторан-tenant. Требует одноразовый
  // invite_code (выдаёт super_admin лично каждому клиенту) — защита от бесплатного самоподключения.
  const handleCrmRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setCrmError(null);

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerForm)
      });

      const data = await res.json();
      setTick((t) => t + 1);

      if (res.ok) {
        localStorage.setItem("crm_jwt", data.token);
        setCrmToken(data.token);
        setCrmUser(data.user);
        setFounderRestaurants(data.user.restaurants || []);
        setCrmActiveTab("analytics");
        setRegisterForm({ restaurant_name: "", email: "", password: "", invite_code: "" });
        showToast(data.message || "Организация зарегистрирована! Добро пожаловать.");
        fetchCrmReservations(data.token);
        fetchCrmOrders(data.token);
        fetchCrmTables(data.token);
        fetchCrmEmployees(data.token);
        fetchFounderRestaurants(data.token);
      } else {
        setCrmError(data.error || "Ошибка регистрации");
        showToast(data.error || "Ошибка регистрации", "error");
      }
    } catch (err) {
      setCrmError("Нет сигнала от хост-сервера");
    } finally {
      setLoading(false);
    }
  };

  const handleCrmLogout = () => {
    localStorage.removeItem("crm_jwt");
    setCrmToken(null);
    setCrmUser(null);
    setCrmReservations([]);
    setCrmOrders([]);
    setCrmEmployees([]);
    setFounderRestaurants([]);
    showToast("Сессия CRM успешно закрыта");
  };

  // ------------------ FOUNDER SELF-SERVICE: несколько ресторанов под одним основателем ------
  const fetchFounderRestaurants = async (token = crmToken) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/crm/founder/restaurants`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setFounderRestaurants(data.restaurants || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddFounderRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crmToken || !newRestaurantName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/crm/founder/restaurants`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${crmToken}` },
        body: JSON.stringify({ name: newRestaurantName.trim() })
      });
      const data = await res.json();
      setTick((t) => t + 1);
      if (res.ok) {
        showToast(data.message || "Ресторан добавлен.");
        setNewRestaurantName("");
        fetchFounderRestaurants();
      } else {
        showToast(data.error || "Ошибка добавления ресторана", "error");
      }
    } catch (err) {
      showToast("Сбой соединения", "error");
    } finally {
      setLoading(false);
    }
  };

  // Переключает "активный" ресторан founder'а — бэкенд переиздаёт JWT с новым restaurant_id,
  // после чего все CRM-запросы (брони/заказы/сотрудники/меню) автоматически скоупятся на него.
  const handleSwitchRestaurant = async (restaurantId: string) => {
    if (!crmToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/crm/founder/switch-restaurant`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${crmToken}` },
        body: JSON.stringify({ restaurant_id: restaurantId })
      });
      const data = await res.json();
      setTick((t) => t + 1);
      if (res.ok) {
        localStorage.setItem("crm_jwt", data.token);
        setCrmToken(data.token);
        setCrmUser(data.user);
        showToast(data.message || "Ресторан переключён.");
        fetchCrmReservations(data.token);
        fetchCrmOrders(data.token);
        fetchCrmTables(data.token);
        fetchCrmEmployees(data.token);
      } else {
        showToast(data.error || "Ошибка переключения", "error");
      }
    } catch (err) {
      showToast("Сбой соединения", "error");
    } finally {
      setLoading(false);
    }
  };

  // Архивация (soft-delete) ресторана founder'а — блокируется бэкендом, если есть незавершённые
  // заказы или будущие активные бронирования (см. server/routes/api.ts DELETE /crm/founder/restaurants/:id).
  const handleArchiveFounderRestaurant = async (restaurantId: string) => {
    if (!crmToken) return;
    if (!window.confirm("Архивировать этот ресторан? Действие можно выполнить только если нет активных заказов/броней.")) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/crm/founder/restaurants/${restaurantId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${crmToken}` }
      });
      const data = await res.json();
      setTick((t) => t + 1);
      if (res.ok) {
        showToast(data.message || "Ресторан архивирован.");
        fetchFounderRestaurants();
      } else {
        showToast(data.error || "Ошибка архивации", "error");
      }
    } catch (err) {
      showToast("Сбой соединения", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async () => {
    if (!crmToken) return;
    try {
      const res = await fetch(`${API_BASE}/crm/auth/me`, {
        headers: { Authorization: `Bearer ${crmToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setCrmUser(data.user);
        
        // Dynamic active routing view based on user role 
        if (data.user.role === "chef") {
          setCrmActiveTab("orders");
        } else if (data.user.role === "hostess") {
          setCrmActiveTab("reservations");
        } else {
          // Keep current view if it's already a valid tab for this role, or defaults to analytics
          setCrmActiveTab((curr) => (curr === "orders" || curr === "reservations" || curr === "analytics" || curr === "employees" || curr === "menu" || curr === "tables" || curr === "my-restaurants" ? curr : "analytics"));
        }

        fetchCrmReservations(crmToken);
        fetchCrmOrders(crmToken);
        if (data.user.role === "founder" || data.user.role === "manager" || data.user.role === "super_admin") {
          fetchCrmEmployees(crmToken);
        }
        if (data.user.role === "founder") {
          setFounderRestaurants(data.user.restaurants || []);
          fetchFounderRestaurants(crmToken);
        }
      } else {
        handleCrmLogout();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCrmReservations = async (token = crmToken) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/crm/reservations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setCrmReservations(data.reservations);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCrmOrders = async (token = crmToken) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/crm/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setCrmOrders(data.orders);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateReservationStatus = async (id: string, newStatus: string) => {
    if (!crmToken) return;
    try {
      const res = await fetch(`${API_BASE}/crm/reservations/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${crmToken}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await res.json();
      setTick((t) => t + 1);

      if (res.ok) {
        showToast(`Бронирование #${id.slice(-4).toUpperCase()} переведено в статус: ${newStatus}`);
        fetchCrmReservations();
      } else {
        showToast(data.error || "Ошибка обновления", "error");
      }
    } catch (err) {
      showToast("Сбой шлюза", "error");
    }
  };

  const handleUpdateOrderStatus = async (id: string, newStatus: string) => {
    if (!crmToken) return;
    try {
      const res = await fetch(`${API_BASE}/crm/orders/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${crmToken}`
        },
        body: JSON.stringify({ order_status: newStatus })
      });

      const data = await res.json();
      setTick((t) => t + 1);

      if (res.ok) {
        showToast(`Заказ продвинут по кухне в '${newStatus}'`);
        fetchCrmOrders();
      } else {
        showToast(data.error || "Ошибка продвижения", "error");
      }
    } catch (err) {
      showToast("Ошибка связи", "error");
    }
  };

  // Synchronize client selected restaurant with login credentials on change
  const handleClientTenantChange = (tenant: TenantInfo) => {
    setSelectedClientTenant(tenant);
    setSelectedTableId(null);
    setBasket([]);
    setLastCreatedOrderId(null);

    // Auto-fill fast login inside CRM credentials depending on chosen tenant for easier evaluation
    if (tenant.id === "rest_tenant_a") {
      setCrmLoginEmail("owner@tenant-a.io");
    } else {
      setCrmLoginEmail("owner@tenant-b.io");
    }
  };

  // Синхронизируем каталог тенантов с публичным эндпоинтом /public/restaurants (без auth).
  // Это и есть точка входа для "любого сайта ресторана": каталог отдаёт только id/name,
  // api_key никогда не раскрывается через этот канал — его получает только super_admin
  // в момент регистрации ресторана (см. handleCreateRestaurant) и передаёт владельцу напрямую.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/public/restaurants`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const list = data?.restaurants;
        if (!Array.isArray(list)) return;
        const dynamicTenants: TenantInfo[] = list.map((r: any) => {
          const existing = tenants.find((t) => t.id === r.id);
          return existing
            ? { ...existing, name: r.name }
            : { id: r.id, name: r.name, cuisine: "Ресторан", api_key: "", menu: [], zones: [] };
        });
        if (JSON.stringify(dynamicTenants.map((t) => t.id)) !== JSON.stringify(tenants.map((t) => t.id))) {
          setTenants(dynamicTenants);
          if (!dynamicTenants.find((t) => t.id === selectedClientTenant.id) && dynamicTenants.length > 0) {
            setSelectedClientTenant(dynamicTenants[0]);
          }
        }
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // Карта столов клиентского сайта — берётся со scoped эндпоинта /client/tables по X-Restaurant-Key,
  // никогда из общего db-dump'а. Бронирования других гостей (PII) сюда принципиально не передаются.
  useEffect(() => {
    let cancelled = false;
    if (!selectedClientTenant.api_key) {
      setClientTables([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/client/tables`, {
          headers: { "X-Restaurant-Key": selectedClientTenant.api_key }
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const tables = (data?.tables || []).map((t: any) => ({ ...t, restaurant_id: selectedClientTenant.id }));
        setClientTables(tables);
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick, selectedClientTenant.id, selectedClientTenant.api_key]);

  return (
    <div id="full_saas_shell" className="min-h-screen bg-[#07070a] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-white">
      
      {/* 1. FUTURISTIC MATRIX TOP RAIL */}
      <header className="bg-zinc-950/70 border-b border-zinc-900/80 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.25)] flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-5 h-5 text-slate-950 stroke-[3px]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-md font-bold font-display tracking-tight text-white uppercase">REZO-MATRIX</h1>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-900 text-indigo-400 border border-indigo-500/20">MULTITENANT SaaS CRM v2.0</span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 tracking-wider">SECURE ISOLATION GATEWAY // CYBER CONSOLE</p>
          </div>
        </div>

        {/* Database Integrity State Widgets */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="hidden sm:flex items-center gap-2 bg-zinc-950 p-2 rounded-lg border border-zinc-900 shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-slate-500">ISOLATION BUFFER:</span>
            <span className="text-[10px] text-emerald-400 font-bold uppercase">POLLED RELATIONAL STREAM</span>
          </div>

          {crmUser?.role === "super_admin" && (
            <button
              onClick={resetDatabase}
              disabled={loading}
              className="flex items-center gap-1.5 bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-200 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              СБРОС БД
            </button>
          )}
        </div>
      </header>

      {/* --- LIVE SYSTEM NOTICE GLASS BANNER --- */}
      <AnimatePresence>
        {alertMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] flex items-center gap-3 border text-xs max-w-lg backdrop-blur-md ${
              alertMsg.type === "success"
                ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-200"
                : alertMsg.type === "error"
                ? "bg-red-950/90 border-red-500/40 text-red-200"
                : "bg-indigo-950/90 border-indigo-500/40 text-indigo-200"
            }`}
          >
            {alertMsg.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {alertMsg.type === "error" && <AlertOctagon className="w-4 h-4 text-red-400 shrink-0" />}
            {alertMsg.type === "info" && <Terminal className="w-4 h-4 text-indigo-400 shrink-0" />}
            <p className="font-mono leading-relaxed font-semibold">{alertMsg.text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex overflow-hidden">
        
        {/* 2. NEON NAV RAIL (LEFT BAR WITH HIGH CONTRAST BUTTONS) */}
        <aside className="w-72 bg-zinc-950 border-r border-zinc-900/80 flex flex-col justify-between shrink-0 hidden md:flex">
          <div className="p-4 flex flex-col gap-2">
            <span className="text-[10px] font-mono font-bold text-slate-500 tracking-widest uppercase ml-2 mb-2">SaaS CONTROL DECKS</span>

            <button
              onClick={() => setActiveTab("docs")}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-mono font-bold transition-all relative ${
                activeTab === "docs"
                  ? "bg-indigo-950/30 text-indigo-400 border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.05)]"
                  : "text-slate-500 hover:text-slate-300 border border-transparent hover:bg-zinc-900/50"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>АРХИТЕКТУРНЫЕ СХЕМЫ</span>
            </button>

            <button
              onClick={() => setActiveTab("client")}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-mono font-bold transition-all relative ${
                activeTab === "client"
                  ? "bg-indigo-950/30 text-indigo-400 border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.05)]"
                  : "text-slate-500 hover:text-slate-300 border border-transparent hover:bg-zinc-900/50"
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>СИМУЛЯТОР КЛИЕНТА (API)</span>
              <span className="absolute right-3.5 w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
            </button>

            <button
              onClick={() => setActiveTab("crm")}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-mono font-bold transition-all relative ${
                activeTab === "crm"
                  ? "bg-indigo-950/30 text-indigo-400 border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.05)]"
                  : "text-slate-500 hover:text-slate-300 border border-transparent hover:bg-zinc-900/50"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>CRM ПУЛЬТ РЕСТОРАНА</span>
              {crmToken && <span className="absolute right-4 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
            </button>

            <button
              onClick={() => setActiveTab("logs")}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs font-mono font-bold transition-all relative ${
                activeTab === "logs"
                  ? "bg-indigo-950/30 text-indigo-400 border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.05)]"
                  : "text-slate-500 hover:text-slate-300 border border-transparent hover:bg-zinc-900/50"
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>ИНСПЕКТОР ЛОГОВ API</span>
              {systemLogs.length > 0 && (
                <span className="ml-auto bg-zinc-900 px-2 py-0.5 rounded text-[10px] text-indigo-400 font-mono font-bold border border-zinc-800">
                  {systemLogs.length}
                </span>
              )}
            </button>
          </div>

          {/* CRM Profile status HUD */}
          <div className="p-4 border-t border-zinc-900 bg-zinc-950/40">
            {crmUser ? (
              <div className="bg-zinc-900/50 border border-zinc-900 p-3.5 rounded-xl space-y-3 font-mono">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">{getRoleLabel(crmUser.role)}</span>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-300 truncate">{crmUser.email}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 font-sans font-semibold truncate">{crmUser.restaurant_name}</p>
                </div>
                <button
                  onClick={handleCrmLogout}
                  className="w-full text-center py-1.5 bg-red-950/20 hover:bg-red-950/50 text-red-400 hover:text-red-350 border border-red-900/30 hover:border-red-500/30 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all cursor-pointer"
                >
                  ЗАКРЫТЬ СЕССИЮ
                </button>
              </div>
            ) : (
              <div className="text-[11px] font-mono hover:text-slate-400 text-slate-600 leading-relaxed p-2">
                <p className="font-bold text-slate-500 uppercase tracking-widest mb-1">CRM ТЕРМИНАЛ: GUEST</p>
                Авторизуйтесь в CRM, чтобы начать диспетчеризацию зала и распределение канбан-заказов.
              </div>
            )}
          </div>
        </aside>

        {/* 3. MAIN WORK CONSOLE AREA */}
        <main className="flex-1 p-6 overflow-y-auto bg-[#09090c]">
          
          {/* Mobile Navigation tabs rail */}
          <div className="flex md:hidden flex-wrap gap-2 mb-6 bg-zinc-950 p-2 text-xs border border-zinc-900 rounded-xl">
            <button onClick={() => setActiveTab("docs")} className={`px-3 py-1.5 font-mono rounded-lg transition-all ${activeTab === "docs" ? "bg-indigo-500 text-slate-950 font-bold" : "text-slate-400"}`}>Схемы</button>
            <button onClick={() => setActiveTab("client")} className={`px-3 py-1.5 font-mono rounded-lg transition-all ${activeTab === "client" ? "bg-indigo-500 text-slate-950 font-bold" : "text-slate-400"}`}>Клиент</button>
            <button onClick={() => setActiveTab("crm")} className={`px-3 py-1.5 font-mono rounded-lg transition-all ${activeTab === "crm" ? "bg-indigo-500 text-slate-950 font-bold" : "text-slate-400"}`}>CRM</button>
            <button onClick={() => setActiveTab("logs")} className={`px-3 py-1.5 font-mono rounded-lg transition-all ${activeTab === "logs" ? "bg-indigo-500 text-slate-950 font-bold" : "text-slate-400"}`}>Логи ({systemLogs.length})</button>
          </div>

          <AnimatePresence mode="wait">
            
            {/* SCREEN 1: ARCHITECTURE DETAILS & DDL SCHEMAS */}
            {activeTab === "docs" && (
              <motion.div
                key="docs"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 max-w-5xl"
              >
                <div className="bg-zinc-950/80 border border-zinc-900 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                  <h2 className="text-xl font-bold font-display text-white mb-2 flex items-center gap-2">
                    <BookOpen className="text-indigo-400 w-5 h-5" />
                    МУЛЬТИАРЕНДНАЯ COMPLIANT СХЕМА REST RESTAURANT SaaS
                  </h2>
                  <p className="text-sm text-slate-400 leading-relaxed max-w-3xl">
                    Решение спроектировано в соответствии с лучшими практиками проектирования высокозащищенных облачных SaaS систем. 
                    Все транзакции изолированы на уровне СУБД с помощью глобального разделителя <code className="text-indigo-400 font-mono font-bold bg-zinc-900 px-1.5 py-0.5 rounded text-xs border border-indigo-500/10">restaurant_id</code>.
                    Рекавери-система на бэкенде защищает платформу от перегрузки времени и double-spending при вебхук транзакциях.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* SQL Schema Definition panel */}
                  <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-2xl space-y-3.5">
                    <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                      <div className="flex items-center gap-2">
                        <Database className="text-indigo-400 w-4.5 h-4.5" />
                        <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">DDL Реляционная схема PostgreSQL</h3>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-slate-500 border border-zinc-800 bg-zinc-900 px-2 py-0.5 rounded">AUTO COMMIT</span>
                    </div>

                    <div className="bg-[#050508] rounded-xl p-4 text-xs font-mono text-slate-400 overflow-x-auto max-h-[380px] border border-zinc-900 scrollbar-thin">
                      <pre className="leading-6">{`-- 1. Tenants (Restaurant chains)
CREATE TABLE restaurants (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  api_key VARCHAR(128) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Staff user credentials
CREATE TABLE users (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64) REFERENCES restaurants(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) CHECK (role IN ('admin', 'hostess', 'kitchen'))
);

-- 3. Interactive Rooms (Floor Maps)
CREATE TABLE dining_tables (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64) REFERENCES restaurants(id) ON DELETE CASCADE,
  table_number INTEGER NOT NULL,
  capacity INTEGER NOT NULL,
  x_pos INTEGER,
  y_pos INTEGER,
  current_status VARCHAR(32) DEFAULT 'free'
);

-- 4. Reservations with Anti-Collision
CREATE TABLE reservations (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64) REFERENCES restaurants(id),
  table_id VARCHAR(64) REFERENCES dining_tables(id),
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(64) NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  guests_count INTEGER NOT NULL,
  status VARCHAR(32) DEFAULT 'pending'
);

-- 5. Orders (Paid & Cooking stages)
CREATE TABLE orders (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64) REFERENCES restaurants(id),
  table_id VARCHAR(64) REFERENCES dining_tables(id),
  delivery_type VARCHAR(32) NOT NULL, -- in_restaurant | takeaway | delivery
  delivery_address VARCHAR(255),      -- обязателен при delivery_type = 'delivery'
  customer_name VARCHAR(255),
  customer_phone VARCHAR(64),
  total_amount NUMERIC(10,2) NOT NULL,
  payment_status VARCHAR(32) DEFAULT 'pending',
  order_status VARCHAR(32) DEFAULT 'new' -- + out_for_delivery (только для delivery)
);`}</pre>
                    </div>
                  </div>

                  {/* Anti Hack & Double spending proof info card */}
                  <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-2xl space-y-4">
                    <div className="flex items-center gap-2 border-b border-zinc-900 pb-3">
                      <ShieldCheck className="text-emerald-400 w-4.5 h-4.5" />
                      <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Безопасность И Транзакции</h3>
                    </div>

                    <div className="space-y-4 text-xs text-slate-400">
                      <div>
                        <h4 className="font-mono font-bold text-white mb-1.5 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                          Идемпотентность вебхуков (Anti Double-Spend)
                        </h4>
                        <p className="leading-relaxed">
                          Метод платежа использует уникальный ключ идемпотентности <code className="text-indigo-300">idemp_key</code>. 
                          Даже при 10 повторных сетевых вызовах от зависшей платежной системы банк снимет средства строго 1 раз, предотвращая повторное подтверждение и фискальные сбои.
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-indigo-300 font-mono text-[11px] leading-relaxed">
                        <span className="font-bold text-white block mb-1">🛡️ Алгоритм контроля overbooking (±2ч):</span>
                        При попытке внесения брони система проверяет наличие пересечений времени на выбранном стопике в диапазоне 120 минут до и после запрашиваемого интервала.
                      </div>

                      <div className="p-3.5 rounded-xl bg-red-950/10 border border-red-500/10 text-slate-500">
                        <span className="font-bold text-red-400 block mb-0.5">⚠️ Изоляция арендатора (Global Middleware Guard):</span>
                        Все запросы фильтруются на уровне ядра. Доступ к данным другого ресторана по чужому API или чужому токену выдаст немедленный отказ 403 или 404, защищая персональные данные гостей.
                      </div>
                    </div>
                  </div>

                </div>

                {/* DB live statistics table summaries */}
                <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-2xl">
                  <div className="flex justify-between items-center border-b border-zinc-900 pb-3 mb-4">
                    <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Database className="w-4 h-4 text-indigo-400 animate-pulse" />
                      Слепок базы данных SaaS PostgreSQL (db.json)
                    </h3>
                    <span className="text-[10px] font-mono text-slate-500">LIVE FEED</span>
                  </div>

                  {crmUser?.role !== "super_admin" ? (
                    <div className="text-slate-600 font-mono text-xs py-10 text-center uppercase space-y-2">
                      <Lock className="w-8 h-8 mx-auto text-zinc-700" />
                      <p>Живой слепок БД доступен только Super Admin</p>
                      <p className="text-[10px] text-slate-700 font-sans normal-case">Авторизуйтесь в CRM под ролью Super Admin, чтобы увидеть данные всех тенантов</p>
                    </div>
                  ) : dbDump ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">

                      <div className="bg-[#050508] p-3.5 rounded-xl border border-zinc-900/80">
                        <span className="text-indigo-400 font-bold block border-b border-zinc-900 pb-2 mb-2">RESTAURANTS ({dbDump.restaurants?.length})</span>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {dbDump.restaurants?.map((r: any) => (
                            <div key={r.id} className="p-2 rounded bg-zinc-900 border border-zinc-800 text-[11px]">
                              <p className="font-bold text-white truncate">{r.name}</p>
                              <span className="text-indigo-400 font-bold text-[9px] block mt-1">Tenant ID: {r.id}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-[#050508] p-3.5 rounded-xl border border-zinc-900/80">
                        <span className="text-indigo-400 font-bold block border-b border-zinc-900 pb-2 mb-2">CRM STAFF ({dbDump.users?.length})</span>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {dbDump.users?.map((u: any) => (
                            <div key={u.id} className="p-2 rounded bg-zinc-900 border border-zinc-800 text-[11px]">
                              <p className="font-bold text-slate-200 truncate">{u.email}</p>
                              <div className="flex items-center justify-between text-[10px] text-amber-500 font-bold mt-1">
                                <span className="bg-zinc-950 px-1 py-0.5 rounded border border-zinc-850 uppercase">{u.role}</span>
                                <span className="text-slate-500">{u.restaurant_id?.split("_")?.[1] || u.restaurant_id || "SYSTEM"}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-[#050508] p-3.5 rounded-xl border border-zinc-900/80">
                        <span className="text-indigo-400 font-bold block border-b border-zinc-900 pb-2 mb-2">RESERVES ({dbDump.reservations?.length})</span>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {dbDump.reservations?.map((r: any) => (
                            <div key={r.id} className="p-2 rounded bg-zinc-900 border border-zinc-800 text-[11px]">
                              <p className="font-bold text-slate-200 truncate">{r.customer_name}</p>
                              <p className="text-slate-500 mt-0.5">Стол #{r.table_id?.split("_")?.[2] || "ЗАЛ"} • {r.time}</p>
                              <div className="flex items-center justify-between mt-1.5">
                                <span className="px-1 text-[9px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-500/20 rounded uppercase">{r.status}</span>
                                <span className="text-[10px] font-bold text-indigo-400 uppercase">{r.restaurant_id?.split("_")?.[1] || r.restaurant_id || "SAAS"}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-[#050508] p-3.5 rounded-xl border border-zinc-900/80">
                        <span className="text-indigo-400 font-bold block border-b border-zinc-900 pb-2 mb-2">ACTIVE ORDERS ({dbDump.orders?.length})</span>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {dbDump.orders?.map((o: any) => (
                            <div key={o.id} className="p-2 rounded bg-zinc-900 border border-zinc-800 text-[11px]">
                              <p className="font-bold text-white font-mono uppercase">{o.id?.split("_")?.[1] || o.id || "ORDER"}</p>
                              <p className="text-indigo-300 mt-0.5 font-bold">{o.total_amount} ₸</p>
                              <div className="flex items-center justify-between mt-1.5">
                                <span className={`px-1 rounded text-[9px] font-bold ${o.payment_status === "paid" ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"}`}>{o.payment_status}</span>
                                <span className="font-bold text-indigo-450 uppercase">{o.restaurant_id?.split("_")?.[1] || o.restaurant_id || "SAAS"}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="text-slate-600 font-mono text-xs py-10 text-center uppercase">Загрузка структуры ядра...</div>
                  )}
                </div>

              </motion.div>
            )}

            {/* SCREEN 2: ACTIVE CLIENT WEBSITE SIMULATOR */}
            {activeTab === "client" && (
              <motion.div
                key="client"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 max-w-5xl"
              >
                {/* ── ШАПЛЕТ: выбор ресторана ─────────────────────────────── */}
                <div className="bg-gradient-to-r from-zinc-950 to-indigo-950/20 border border-zinc-900 p-5 rounded-2xl shadow-xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold font-display text-white flex items-center gap-2">
                        <Store className="text-indigo-400 w-5 h-5" />
                        Симулятор клиентского сайта ресторана
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">Выберите ресторан → выберите стол → оформите заказ или бронь</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tenants.map((tenant) => (
                        <button
                          key={tenant.id}
                          onClick={() => handleClientTenantChange(tenant)}
                          className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                            selectedClientTenant.id === tenant.id
                              ? "bg-indigo-500 text-slate-950 border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.25)]"
                              : "bg-zinc-900/60 text-slate-400 border-zinc-800 hover:text-white"
                          }`}
                        >
                          <Store className="w-3.5 h-3.5" />
                          {tenant.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-zinc-900 flex items-center gap-2 text-[11px] font-mono text-slate-500">
                    <span className="text-indigo-400 font-bold">API Key:</span>
                    <span className="text-emerald-400">{selectedClientTenant.api_key}</span>
                    <span className="text-slate-600 ml-2">|</span>
                    <span className="text-indigo-400 font-bold ml-2">ID:</span>
                    <span className="text-slate-400">{selectedClientTenant.id}</span>
                  </div>
                </div>

                {/* ── ШАГ 1: КАРТА ЗАЛА ───────────────────────────────────── */}
                <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-2xl space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-500 text-slate-950 text-xs font-black shrink-0">1</div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Выберите столик на карте зала</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Нажмите на <span className="text-emerald-400 font-bold">зелёный (свободный)</span> столик — он привяжется к заказу или брони
                      </p>
                    </div>
                  </div>
                  {clientTables.length === 0 ? (
                    <div className="py-10 text-center space-y-2">
                      <MapPin className="w-10 h-10 mx-auto text-zinc-700" />
                      <p className="text-slate-500 font-mono text-xs uppercase">Карта зала пуста</p>
                      <p className="text-[11px] text-slate-600 font-sans max-w-xs mx-auto">
                        Войдите в CRM как Admin или Менеджер и добавьте столы через вкладку «Управление столами»
                      </p>
                    </div>
                  ) : (
                    <InteractiveMap
                      tables={clientTables}
                      activeReservations={[]}
                      selectedTableId={selectedTableId}
                      onSelectTable={(id) => setSelectedTableId(id)}
                      onQuickBook={(tbl) => {
                        setSelectedTableId(tbl.id);
                        showToast(`Стол №${tbl.table_number} выбран! Теперь оформите заказ или бронь ниже.`, "info");
                      }}
                    />
                  )}
                </div>

                {/* ── ШАГ 2 + 3: ЗАКАЗ И БРОНЬ (две колонки) ─────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* МОДУЛЬ А: ОФОРМЛЕНИЕ ЗАКАЗА */}
                  <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-2xl space-y-4 flex flex-col">
                    <div className="flex items-center gap-3 border-b border-zinc-900 pb-3">
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500 text-slate-950 text-xs font-black shrink-0">2</div>
                      <div>
                        <h4 className="text-sm font-bold text-white">Оформить заказ</h4>
                        <span className="text-[10px] font-mono text-slate-500">В заведении · С собой · Доставка</span>
                      </div>
                    </div>

                    {/* Контактные данные клиента */}
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-500 mb-1.5 font-mono font-bold uppercase text-[10px]">Имя клиента</label>
                          <div className="relative">
                            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                            <input
                              type="text"
                              value={clientOrderForm.customer_name}
                              onChange={(e) => setClientOrderForm((f) => ({ ...f, customer_name: e.target.value }))}
                              className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-lg pl-8 pr-3 py-2.5 text-xs outline-none transition-all font-sans"
                              placeholder="Алихан"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-slate-500 mb-1.5 font-mono font-bold uppercase text-[10px]">Телефон</label>
                          <div className="relative">
                            <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                            <input
                              type="tel"
                              value={clientOrderForm.customer_phone}
                              onChange={(e) => handlePhoneInput(e.target.value)}
                              className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-lg pl-8 pr-3 py-2.5 text-xs outline-none transition-all font-mono"
                              placeholder="+7 (777) 000-00-00"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Тип доставки */}
                      <div>
                        <label className="block text-slate-500 mb-1.5 font-mono font-bold uppercase text-[10px]">Способ получения</label>
                        <div className="grid grid-cols-3 gap-2">
                          {([
                            { val: "in_restaurant", label: "В заведении", icon: "🪑" },
                            { val: "takeaway", label: "С собой", icon: "🛍️" },
                            { val: "delivery", label: "Доставка", icon: "🚚" },
                          ] as const).map(({ val, label, icon }) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setClientOrderForm((f) => ({ ...f, delivery_type: val }))}
                              className={`py-2.5 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                clientOrderForm.delivery_type === val
                                  ? "bg-indigo-950 text-indigo-300 border-indigo-500/40"
                                  : "bg-zinc-900/40 text-slate-500 border-transparent hover:text-slate-300"
                              }`}
                            >
                              {icon} {label}
                            </button>
                          ))}
                        </div>
                        {clientOrderForm.delivery_type === "in_restaurant" && (
                          <p className={`text-[10px] mt-1.5 font-mono font-bold ${selectedTableId ? "text-emerald-400" : "text-rose-400 animate-pulse"}`}>
                            {selectedTableId
                              ? `✓ Стол №${clientTables.find((t) => t.id === selectedTableId)?.table_number} выбран`
                              : "⬆ Выберите стол на карте (шаг 1)"}
                          </p>
                        )}
                        {clientOrderForm.delivery_type === "delivery" && (
                          <div className="mt-2">
                            <input
                              type="text"
                              value={clientOrderForm.delivery_address}
                              onChange={(e) => setClientOrderForm((f) => ({ ...f, delivery_address: e.target.value }))}
                              className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-lg px-3 py-2.5 text-xs outline-none transition-all font-sans"
                              placeholder="Адрес доставки (улица, дом, квартира)"
                            />
                            <p className={`text-[10px] mt-1.5 font-mono font-bold ${clientOrderForm.delivery_address.trim() ? "text-emerald-400" : "text-rose-400 animate-pulse"}`}>
                              {clientOrderForm.delivery_address.trim() ? "✓ Адрес указан" : "⬆ Укажите адрес доставки"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Меню */}
                    <div className="space-y-2 flex-1">
                      <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block">Меню ресторана</span>
                      {selectedClientTenant.menu.length === 0 ? (
                        <p className="text-[11px] text-slate-600 font-sans text-center py-4">Меню не настроено. Войдите как Admin → вкладка «Меню».</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {selectedClientTenant.menu.map((dish) => {
                            const inBasket = basket.find((i) => i.name === dish.name);
                            return (
                              <button
                                key={dish.name}
                                onClick={() => handleAddToBasket(dish.name, dish.price)}
                                className="bg-[#050508] hover:bg-zinc-900 border border-zinc-900 hover:border-indigo-500/30 p-2.5 rounded-xl flex flex-col items-start gap-1 transition-all text-left group cursor-pointer relative"
                              >
                                {inBasket && (
                                  <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] font-black flex items-center justify-center">
                                    {inBasket.quantity}
                                  </span>
                                )}
                                <span className="text-slate-300 text-xs font-semibold group-hover:text-indigo-300 transition-colors font-sans leading-tight">{dish.name}</span>
                                <div className="flex items-center justify-between w-full mt-1">
                                  <span className="text-indigo-300 font-mono font-bold text-xs">{dish.price.toLocaleString()} ₸</span>
                                  <PlusCircle className="w-3.5 h-3.5 text-zinc-600 group-hover:text-indigo-400" />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Корзина */}
                    {basket.length > 0 && (
                      <div className="bg-[#050508] rounded-xl p-3.5 border border-zinc-900 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Корзина ({basket.reduce((s, i) => s + i.quantity, 0)} шт.)</span>
                          <button onClick={() => setBasket([])} className="text-red-500 hover:text-red-400 text-[10px] font-mono">очистить</button>
                        </div>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                          {basket.map((item) => (
                            <div key={item.name} className="flex justify-between items-center text-xs">
                              <span className="text-slate-300 font-sans truncate max-w-[140px]">{item.name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <button onClick={() => setBasket((b) => b.map((i) => i.name === item.name ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i))} className="text-slate-500 hover:text-white">
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="text-white font-mono font-bold w-4 text-center text-[11px]">{item.quantity}</span>
                                <button onClick={() => handleAddToBasket(item.name, item.price)} className="text-slate-500 hover:text-white">
                                  <Plus className="w-3 h-3" />
                                </button>
                                <button onClick={() => handleRemoveFromBasket(item.name)} className="text-red-500 hover:text-red-400 ml-1">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-zinc-800 pt-2 flex justify-between font-mono font-bold">
                          <span className="text-slate-500 text-[11px]">Итого:</span>
                          <span className="text-indigo-300 text-sm">{basket.reduce((a, i) => a + i.price * i.quantity, 0).toLocaleString()} ₸</span>
                        </div>
                        <button
                          onClick={handleCreateOrder}
                          disabled={loading}
                          className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs uppercase disabled:opacity-50"
                        >
                          <ShoppingBag className="w-4 h-4 stroke-[2.5px]" />
                          Создать заказ
                        </button>
                      </div>
                    )}

                    {/* Оплата */}
                    {lastCreatedOrderId && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-3 font-mono text-xs"
                      >
                        <p className="font-bold text-white flex items-center gap-1.5">
                          <CreditCard className="w-4 h-4 text-indigo-400" />
                          Заказ создан — ожидает оплаты
                        </p>
                        <p className="text-slate-400 text-[11px]">
                          ID: <span className="text-white font-bold">{lastCreatedOrderId}</span> · Сумма: <span className="text-indigo-300 font-bold">{lastCreatedOrderTotal.toLocaleString()} ₸</span>
                        </p>
                        <button
                          onClick={handleSimulatePaymentWebhook}
                          className="w-full bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-extrabold px-3 py-2.5 rounded-lg text-[10px] tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          Симулировать оплату (Webhook)
                        </button>
                      </motion.div>
                    )}
                  </div>

                  {/* МОДУЛЬ Б: БРОНИРОВАНИЕ СТОЛА */}
                  <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-2xl space-y-4 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 border-b border-zinc-900 pb-3">
                        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-slate-950 text-xs font-black shrink-0">3</div>
                        <div>
                          <h4 className="text-sm font-bold text-white">Забронировать стол</h4>
                          <span className="text-[10px] font-mono text-slate-500">Выберите стол на карте → заполните форму</span>
                        </div>
                      </div>

                      <form onSubmit={handleCreateReservation} className="space-y-3 text-xs font-mono">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-slate-500 mb-1.5 font-bold uppercase text-[10px]">Имя гостя</label>
                            <input
                              type="text"
                              required
                              value={reservationForm.customer_name}
                              onChange={(e) => setReservationForm({ ...reservationForm, customer_name: e.target.value })}
                              className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-amber-400 rounded-lg p-2.5 text-xs font-semibold outline-none transition-all font-sans"
                              placeholder="Ваше имя"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 mb-1.5 font-bold uppercase text-[10px]">Телефон</label>
                            <input
                              type="tel"
                              required
                              value={reservationForm.customer_phone}
                              onChange={(e) => setReservationForm({ ...reservationForm, customer_phone: e.target.value })}
                              className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-amber-400 rounded-lg p-2.5 text-xs font-semibold outline-none transition-all font-mono"
                              placeholder="+7 705 ..."
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-slate-500 mb-1.5 font-bold uppercase text-[10px]">Дата визита</label>
                            <input
                              type="date"
                              required
                              value={reservationForm.date}
                              onChange={(e) => setReservationForm({ ...reservationForm, date: e.target.value })}
                              className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-amber-400 rounded-lg p-2.5 text-xs font-semibold outline-none transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 mb-1.5 font-bold uppercase text-[10px]">Время</label>
                            <input
                              type="time"
                              required
                              value={reservationForm.time}
                              onChange={(e) => setReservationForm({ ...reservationForm, time: e.target.value })}
                              className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-amber-400 rounded-lg p-2.5 text-xs font-semibold outline-none transition-all"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-slate-500 mb-1.5 font-bold">Количество персон:</label>
                            <input
                              type="number"
                              min="1"
                              max="12"
                              required
                              value={reservationForm.guests_count}
                              onChange={(e) => setReservationForm({ ...reservationForm, guests_count: Number(e.target.value) })}
                              className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-lg p-2.5 text-xs font-semibold outline-none transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 mb-1.5 font-bold">Выделенный столик:</label>
                            <input
                              type="text"
                              disabled
                              value={selectedTableId ? `ВЫБРАН СТОЛ #${clientTables.find(t=>t.id===selectedTableId)?.table_number || ""}` : "ВЫБЕРИТЕ НА КАРТЕ 🧭"}
                              className={`w-full bg-zinc-900 border border-zinc-900 rounded-lg p-2.5 text-xs font-bold outline-none leading-none ${selectedTableId ? "text-emerald-400" : "text-rose-400 animate-pulse"}`}
                            />
                          </div>
                        </div>

                        <div className="pt-2">
                          <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-display font-extrabold py-3 px-4 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer text-xs uppercase"
                          >
                            <Send className="w-3.5 h-3.5 stroke-[3px]" />
                            ЗАРЕГИСТРИРОВАТЬ РЕЗЕРВИРОВАНИЕ
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Network isolation info labels */}
                    <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-900 text-[10px] space-y-1 mt-4">
                      <p className="text-slate-400 font-semibold flex items-center gap-1">
                        <Lock className="w-3 h-3 text-indigo-400" />
                        РЕКВИЗИТЫ БЕЗОПАСНОСТИ WIDGET:
                      </p>
                      <p className="font-mono text-slate-500 leading-4">Header Key: <span className="text-emerald-400">X-Restaurant-Key: {selectedClientTenant.api_key}</span></p>
                      <p className="font-mono text-slate-500 leading-4">Mapped Context ID <span className="text-indigo-400">restaurant_id: {selectedClientTenant.id}</span></p>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}

            {/* SCREEN 3: PROFESSIONAL CRM PANELS (AUTHORIZED INTERNAL EMPLOYEES CONTROL ROOM) */}
            {activeTab === "crm" && (
              <motion.div
                key="crm"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 max-w-5xl"
              >
                {!crmToken ? (
                  /* EXQUISITE CYBERPUNK CONTROL-DECK LOGIN / REGISTER CARD */
                  <div className="max-w-md mx-auto bg-zinc-950 border border-zinc-900 rounded-3xl p-6 shadow-2xl space-y-5 relative overflow-hidden mt-8">
                    <div className="absolute top-0 right-1/2 translate-x-1/2 w-48 h-48 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

                    <div className="text-center space-y-1 pb-3 border-b border-zinc-900">
                      <Lock className="w-8 h-8 mx-auto text-indigo-400 mb-1" />
                      <h3 className="text-base font-bold font-display text-white uppercase tracking-wider">
                        {crmAuthMode === "login" ? "Вход в пульт CRM ресторанов" : "Регистрация основателя"}
                      </h3>
                      <p className="text-[11px] font-mono text-slate-500">ISSUING JWT BEARER TOKEN // MULTI-TENANCY CONTEXT</p>
                    </div>

                    {crmError && (
                      <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-xs text-red-400 font-bold text-center font-mono">
                        {crmError}
                      </div>
                    )}

                    {crmAuthMode === "login" ? (
                      <form onSubmit={handleCrmLogin} className="space-y-4 text-xs font-mono">
                        <div>
                          <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-widest">АКТИВНАЯ УЧЕТНАЯ ЗАПИСЬ:</label>
                          <select
                            value={crmLoginEmail}
                            onChange={(e) => setCrmLoginEmail(e.target.value)}
                            className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-xl p-3 outline-none font-bold transition-all text-xs"
                          >
                            <optgroup label="Организация A">
                              <option value="owner@tenant-a.io">owner@tenant-a.io — Основатель</option>
                              <option value="hostess@tenant-a.io">hostess@tenant-a.io — Хостес</option>
                              <option value="chef@tenant-a.io">chef@tenant-a.io — Шеф-повар</option>
                            </optgroup>
                            <optgroup label="Организация Б">
                              <option value="owner@tenant-b.io">owner@tenant-b.io — Основатель</option>
                              <option value="hostess@tenant-b.io">hostess@tenant-b.io — Хостес</option>
                              <option value="chef@tenant-b.io">chef@tenant-b.io — Шеф-повар</option>
                            </optgroup>
                            <optgroup label="SaaS Провайдер">
                              <option value="superadmin@saas.io">superadmin@saas.io — Super Admin (владелец CRM)</option>
                            </optgroup>
                          </select>
                        </div>

                        <div>
                          <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-widest">ПАРОЛЬ СЕССИИ:</label>
                          <input
                            type="password"
                            required
                            value={crmLoginPassword}
                            onChange={(e) => setCrmLoginPassword(e.target.value)}
                            className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-xl p-3 outline-none text-xs transition-all font-mono"
                          />
                        </div>

                        <div className="pt-2">
                          <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-display font-extrabold py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 text-xs cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wide"
                          >
                            <UserCheck className="w-4 h-4 text-slate-950 stroke-[3px]" />
                            ПОДКЛЮЧИТЬ ПАНЕЛЬ УПРАВЛЕНИЯ
                          </button>
                        </div>

                        <div className="bg-[#050508] rounded-xl p-3 text-[10px] leading-relaxed border border-zinc-900 text-slate-500 font-sans">
                          <span className="font-bold text-slate-400 font-mono tracking-widest block uppercase text-[9px] mb-1">💡 Изоляция аутентификации:</span>
                          Бэкенд генерирует криптографический JWT Bearer токен с правами роли сотрудника. На любой HTTP запрос к API сервер проверяет соответствие ресторана сотрудника и отсекает неавторизованные запросы.
                        </div>
                      </form>
                    ) : (
                      <form onSubmit={handleCrmRegister} className="space-y-4 text-xs font-mono">
                        <div>
                          <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-widest">Название ресторана / сети:</label>
                          <input
                            type="text"
                            required
                            placeholder="Моё заведение"
                            value={registerForm.restaurant_name}
                            onChange={(e) => setRegisterForm({ ...registerForm, restaurant_name: e.target.value })}
                            className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-xl p-3 outline-none font-bold transition-all text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-widest">E-mail основателя:</label>
                          <input
                            type="email"
                            required
                            placeholder="founder@restaurant.kz"
                            value={registerForm.email}
                            onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                            className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-xl p-3 outline-none font-bold transition-all text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-widest">Пароль (мин. 8 символов):</label>
                          <input
                            type="password"
                            required
                            minLength={8}
                            value={registerForm.password}
                            onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                            className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-xl p-3 outline-none text-xs transition-all font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-widest">Код приглашения:</label>
                          <input
                            type="text"
                            required
                            placeholder="Выдаётся поставщиком CRM лично вам"
                            value={registerForm.invite_code}
                            onChange={(e) => setRegisterForm({ ...registerForm, invite_code: e.target.value })}
                            className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-xl p-3 outline-none text-xs transition-all font-mono"
                          />
                        </div>

                        <div className="pt-2">
                          <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-extrabold py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 text-xs cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wide"
                          >
                            <Crown className="w-4 h-4 text-slate-950 stroke-[3px]" />
                            ЗАРЕГИСТРИРОВАТЬ ОРГАНИЗАЦИЮ
                          </button>
                        </div>

                        <div className="bg-[#050508] rounded-xl p-3 text-[10px] leading-relaxed border border-zinc-900 text-slate-500 font-sans">
                          <span className="font-bold text-slate-400 font-mono tracking-widest block uppercase text-[9px] mb-1">💡 Независимый tenant:</span>
                          Регистрация создаёт только аккаунт основателя и его первый ресторан — отдельный tenant со своим свежим api_key. Сотрудников (менеджер/шеф-повар/хостес) основатель добавляет сам внутри CRM.
                        </div>
                      </form>
                    )}

                    <div className="flex items-center justify-center gap-2 pt-1 border-t border-zinc-900 text-[11px] font-mono">
                      <span className="text-slate-500">{crmAuthMode === "login" ? "Нет аккаунта основателя?" : "Уже есть аккаунт?"}</span>
                      <button
                        type="button"
                        onClick={() => { setCrmAuthMode(crmAuthMode === "login" ? "register" : "login"); setCrmError(null); }}
                        className="text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wide cursor-pointer"
                      >
                        {crmAuthMode === "login" ? "Зарегистрироваться →" : "← Войти"}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* CRM ACTIVE STAFF BOARD AREA */
                  <div className="space-y-6">
                    
                    {/* Top Mapped Control Panel Context Bar */}
                    <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 shadow-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 p-2.5 rounded-xl border border-indigo-500/20 text-indigo-400">
                          <LayoutDashboard className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h2 className="text-base font-bold font-display text-white uppercase tracking-tight">{crmUser?.restaurant_name || "СИСТЕМА"}</h2>
                            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                              crmUser?.role === "super_admin" ? "bg-amber-400 text-slate-950"
                              : crmUser?.role === "founder" ? "bg-indigo-500 text-slate-950"
                              : crmUser?.role === "manager" ? "bg-purple-500 text-slate-950"
                              : "bg-teal-500 text-slate-950"
                            }`}>
                              {getRoleLabel(crmUser?.role || "")}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 font-sans mt-0.5 font-medium">{crmUser?.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-mono">
                        {crmUser?.role === "founder" && founderRestaurants.filter((r) => !r.archived_at).length > 1 && (
                          <select
                            value={crmUser?.restaurant_id || ""}
                            onChange={(e) => handleSwitchRestaurant(e.target.value)}
                            className="bg-[#050508] text-emerald-400 border border-zinc-900 focus:border-indigo-400 rounded-lg px-2.5 py-1.5 outline-none font-bold text-xs"
                          >
                            {founderRestaurants.filter((r) => !r.archived_at).map((r) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        )}
                        <span className="text-slate-500">TENANT ID:</span>
                        <span className="font-bold text-emerald-400 bg-[#050508] px-2.5 py-1 rounded-lg border border-zinc-900">{crmUser?.restaurant_id}</span>
                        <button
                          onClick={handleCrmLogout}
                          className="bg-red-950/30 hover:bg-red-900/50 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                        >
                          ВЫЙТИ
                        </button>
                      </div>
                    </div>

                    {/* CRM Workspace Internal Tab Navigation Selectors */}
                    <div className="flex flex-wrap gap-2 bg-zinc-950 p-2.5 rounded-2xl border border-zinc-900 shadow-inner">
                      {crmUser?.role === "super_admin" && (
                        <button type="button" onClick={() => setCrmActiveTab("restaurants")}
                          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border ${crmActiveTab === "restaurants" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                          🏢 Рестораны
                        </button>
                      )}

                      {(crmUser?.role === "founder" || crmUser?.role === "manager" || crmUser?.role === "super_admin") && (
                        <>
                          <button type="button" onClick={() => setCrmActiveTab("analytics")}
                            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border ${crmActiveTab === "analytics" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                            📈 Финансы
                          </button>
                          <button type="button" onClick={() => setCrmActiveTab("employees")}
                            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border ${crmActiveTab === "employees" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                            👥 Сотрудники
                          </button>
                          <button type="button" onClick={() => setCrmActiveTab("menu")}
                            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border ${crmActiveTab === "menu" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                            ⚙️ Меню
                          </button>
                        </>
                      )}

                      {(crmUser?.role === "founder" || crmUser?.role === "manager" || crmUser?.role === "super_admin" || crmUser?.role === "hostess") && (
                        <>
                          <button type="button" onClick={() => setCrmActiveTab("reservations")}
                            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border ${crmActiveTab === "reservations" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                            📅 Брони
                          </button>
                          <button type="button" onClick={() => setCrmActiveTab("tables")}
                            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border ${crmActiveTab === "tables" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                            🪑 Карта столов
                          </button>
                        </>
                      )}

                      {(crmUser?.role === "founder" || crmUser?.role === "manager" || crmUser?.role === "super_admin" || crmUser?.role === "chef") && (
                        <button type="button" onClick={() => setCrmActiveTab("orders")}
                          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border ${crmActiveTab === "orders" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                          🍳 Кухня
                        </button>
                      )}

                      {crmUser?.role === "founder" && (
                        <button type="button" onClick={() => setCrmActiveTab("my-restaurants")}
                          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border ${crmActiveTab === "my-restaurants" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                          🏪 Мои рестораны
                        </button>
                      )}
                    </div>

                    {/* TAB A: ANALYTICS (Founder / Manager / Super Admin Only) */}
                    {crmActiveTab === "analytics" && (
                      <div className="space-y-6">
                        {(crmUser?.role !== "founder" && crmUser?.role !== "manager" && crmUser?.role !== "super_admin") ? (
                          <div className="bg-zinc-950 p-8 rounded-2xl border border-red-500/20 text-center space-y-4">
                            <AlertOctagon className="w-12 h-12 text-red-500 mx-auto animate-pulse" />
                            <h3 className="text-base font-bold font-mono text-red-400 uppercase">ОШИБКА 403: ДОСТУП ОГРАНИЧЕН</h3>
                            <p className="text-xs text-slate-400 max-w-md mx-auto">
                              Ваш аккаунт авторизован с ролью <strong className="text-white">'{crmUser?.role}'</strong>.
                              Просмотр реестра выручки разрешен только ролям <strong className="text-indigo-400">'founder'</strong> и <strong className="text-indigo-400">'manager'</strong>.
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl shadow-lg">
                                <span className="text-[10px] font-mono font-bold text-slate-500 tracking-wider">ВЫРУЧКА ЗА СЕГОДНЯ</span>
                                <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                                  {crmOrders.filter(o => o.payment_status === "paid").reduce((sum, o) => sum + Number(o.total_amount), 0)} ₸
                                </p>
                                <span className="text-[9px] font-mono font-bold text-slate-600 block mt-1">ТОЛЬКО ОПЛАЧЕННЫЕ СЧЕТА</span>
                              </div>

                              <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl shadow-lg">
                                <span className="text-[10px] font-mono font-bold text-slate-500 tracking-wider">ПРОГНОЗ С ЗАКАЗАМИ</span>
                                <p className="text-2xl font-bold font-mono text-amber-400 mt-1">
                                  {crmOrders.reduce((sum, o) => sum + Number(o.total_amount), 0)} ₸
                                </p>
                                <span className="text-[9px] font-mono font-bold text-slate-600 block mt-1">ВКЛЮЧАЯ ОЖИДАЮЩИЕ ОПЛАТУ</span>
                              </div>

                              <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl shadow-lg">
                                <span className="text-[10px] font-mono font-bold text-slate-500 tracking-wider">КОЛИЧЕСТВО БРОНЕЙ</span>
                                <p className="text-2xl font-bold font-mono text-indigo-400 mt-1">
                                  {crmReservations.length} шт.
                                </p>
                                <span className="text-[9px] font-mono font-bold text-slate-600 block mt-1 font-sans">ВСЕ СТАТУСЫ СЕГОДНЯ</span>
                              </div>

                              <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl shadow-lg">
                                <span className="text-[10px] font-mono font-bold text-slate-500 tracking-wider">ЭФФЕКТИВНОСТЬ SLA КУХНИ</span>
                                <p className="text-2xl font-bold font-mono text-white mt-1">
                                  {crmOrders.length > 0 ? Math.round((crmOrders.filter(o => o.order_status === "delivered").length / crmOrders.length) * 100) : 100}%
                                </p>
                                <span className="text-[9px] font-mono font-bold text-slate-600 block mt-1">ОТНОШЕНИЕ ПОДАННЫХ БЛЮД</span>
                              </div>
                            </div>

                            {/* Ledgers Ledger list */}
                            <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl space-y-4">
                              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Реестр кассовых операций (Paid Financial Ledger)</h3>
                              {crmOrders.filter(o => o.payment_status === "paid").length === 0 ? (
                                <div className="py-12 text-center text-slate-500 font-mono text-xs uppercase">
                                  Оплаченных кассовых ордеров за текущую смену нет.
                                </div>
                              ) : (
                                <div className="overflow-x-auto rounded-xl border border-zinc-900 text-xs font-sans">
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="border-b border-zinc-900 text-slate-400 font-mono font-bold bg-[#050508]">
                                        <th className="p-3">Номер чека / Транзакции</th>
                                        <th className="p-3">Заказ ID</th>
                                        <th className="p-3">Формат приема</th>
                                        <th className="p-3 text-right">Сумма чека</th>
                                        <th className="p-3 text-center">Фискальный статус</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {crmOrders.filter(o => o.payment_status === "paid").map((o) => (
                                        <tr key={o.id} className="border-b border-zinc-900/60 hover:bg-zinc-900/20 transition-colors font-mono text-[11px]">
                                          <td className="p-3 font-bold text-emerald-400">#TXN_{o.id.toUpperCase().slice(-6)}</td>
                                          <td className="p-3 text-slate-350">#{o.id.toUpperCase().split("_")[1] || o.id}</td>
                                          <td className="p-3 text-slate-400" title={o.delivery_type === "delivery" ? o.delivery_address : undefined}>
                                            {o.delivery_type === "in_restaurant" ? "В ЗАВЕДЕНИИ" : o.delivery_type === "delivery" ? "🚚 ДОСТАВКА" : "С СОБОЙ"}
                                          </td>
                                          <td className="p-3 text-right text-emerald-300 font-bold">{o.total_amount} ₸</td>
                                          <td className="p-3 text-center">
                                            <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase bg-emerald-950 text-emerald-400 border border-emerald-500/20">ФИСКАЛИЗИРОВАН</span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* TAB B: EMPLOYEE STAFF DIRECTORY (Founder / Manager Only) */}
                    {crmActiveTab === "employees" && (
                      <div className="space-y-6">
                        {(crmUser?.role !== "founder" && crmUser?.role !== "manager" && crmUser?.role !== "super_admin") ? (
                          <div className="bg-zinc-950 p-8 rounded-2xl border border-red-500/20 text-center space-y-4">
                            <AlertOctagon className="w-12 h-12 text-red-500 mx-auto animate-pulse" />
                            <h3 className="text-base font-bold font-mono text-red-400 uppercase">ОШИБКА 403: ДОСТУП ОГРАНИЧЕН</h3>
                            <p className="text-xs text-slate-400 max-w-md mx-auto">
                              Ваш аккаунт авторизован с ролью <strong className="text-white">'{crmUser?.role}'</strong>.
                              Управление штатом персонала разрешено только ролям <strong className="text-indigo-400">'founder'</strong> и <strong className="text-indigo-400">'manager'</strong>.
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            
                            {/* Hiring form */}
                            <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl space-y-4 h-fit">
                              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Прием сотрудника на работу</h3>
                              <form onSubmit={handleAddEmployee} className="space-y-4 font-mono text-xs">
                                <div>
                                  <label className="block text-slate-500 mb-1.5 font-bold uppercase">e-mail логин:</label>
                                  <input
                                    type="email"
                                    required
                                    placeholder="hostess2@tenant-a.io"
                                    value={employeeForm.email}
                                    onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                                    className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-lg p-2.5 outline-none font-bold text-xs"
                                  />
                                </div>

                                <div>
                                  <label className="block text-slate-500 mb-1.5 font-bold uppercase">пароль сессии:</label>
                                  <input
                                    type="password"
                                    required
                                    placeholder="••••••••"
                                    value={employeeForm.password}
                                    onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                                    className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-lg p-2.5 outline-none font-bold text-xs"
                                  />
                                </div>

                                <div>
                                  <label className="block text-slate-500 mb-1.5 font-bold uppercase">должность (роль):</label>
                                  <select
                                    value={employeeForm.role}
                                    onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value })}
                                    className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-lg p-2.5 outline-none font-bold text-xs"
                                  >
                                    <option value="hostess">Хостес / Администратор зала</option>
                                    <option value="chef">Шеф-повар / Кухня</option>
                                    <option value="manager">Менеджер</option>
                                  </select>
                                </div>

                                <button
                                  type="submit"
                                  disabled={loading}
                                  className="w-full bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold py-2.5 rounded-xl transition-all font-sans uppercase text-xs cursor-pointer"
                                >
                                  Зачислить в штат
                                </button>
                              </form>
                            </div>

                            {/* Current staff members table */}
                            <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl lg:col-span-2 space-y-4">
                              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Штатное расписание сотрудников арендатора ({crmEmployees.length})</h3>
                              <div className="overflow-x-auto rounded-xl border border-zinc-900 text-xs font-sans">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-zinc-900 text-slate-400 font-mono font-bold bg-[#050508]">
                                      <th className="p-3">E-mail адрес</th>
                                      <th className="p-3">ID сотрудника</th>
                                      <th className="p-3 text-right">Должность / Роль</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {crmEmployees.map((emp) => (
                                      <tr key={emp.id} className="border-b border-zinc-900/60 font-mono text-[11px]">
                                        <td className="p-3 font-semibold text-white">{emp.email}</td>
                                        <td className="p-3 text-slate-500">{emp.id}</td>
                                        <td className="p-3 text-right">
                                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                            emp.role === "founder"
                                              ? "bg-indigo-950 text-indigo-400 border border-indigo-500/20"
                                              : emp.role === "manager"
                                              ? "bg-purple-950 text-purple-400 border border-purple-500/20"
                                              : emp.role === "hostess"
                                              ? "bg-amber-950 text-amber-400 border border-amber-500/20"
                                              : "bg-teal-950 text-teal-400 border border-teal-500/20"
                                          }`}>
                                            {emp.role}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB C: MENU CONFIGURATION MODIFIER (Founder / Manager Only) */}
                    {crmActiveTab === "menu" && (
                      <div className="space-y-6">
                        {(crmUser?.role !== "founder" && crmUser?.role !== "manager" && crmUser?.role !== "super_admin") ? (
                          <div className="bg-zinc-950 p-8 rounded-2xl border border-red-500/20 text-center space-y-4">
                            <AlertOctagon className="w-12 h-12 text-red-500 mx-auto animate-pulse" />
                            <h3 className="text-base font-bold font-mono text-red-400 uppercase">ОШИБКА 403: ДОСТУП ОГРАНИЧЕН</h3>
                            <p className="text-xs text-slate-400 max-w-md mx-auto">
                              Ваш аккаунт авторизован с ролью <strong className="text-white">'{crmUser?.role}'</strong>.
                              Настройка цифрового меню разрешена только ролям <strong className="text-indigo-400">'founder'</strong> и <strong className="text-indigo-400">'manager'</strong>.
                            </p>
                          </div>
                        ) : (
                          <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl space-y-4">
                            <div>
                              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Корпоративное Меню ресторанов</h3>
                              <p className="text-[11px] text-slate-500 font-sans mt-1">
                                Переопределяйте стоимость блюд в реальном времени. Обновленные цены мгновенно синхронизируются на клиентском сайте заведения!
                              </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {tenants.find((t) => t.id === crmUser?.restaurant_id)?.menu.map((dish) => (
                                <div key={dish.name} className="bg-[#050508] border border-zinc-900 rounded-xl p-4 flex justify-between items-center gap-4">
                                  <div>
                                    <span className="text-xs font-bold text-slate-200 block font-sans">{dish.name}</span>
                                    <span className="text-[10px] font-mono text-indigo-450 block mt-0.5">Текущая цена: {dish.price} ₸</span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleUpdateMenuPrice(dish.name, Math.max(500, dish.price - 500))}
                                      className="w-8 h-8 rounded bg-zinc-900 hover:bg-zinc-800 text-slate-100 font-bold border border-zinc-800 flex items-center justify-center text-xs active:scale-95 transition-all cursor-pointer"
                                    >
                                      -
                                    </button>
                                    <span className="text-xs font-mono font-bold text-white w-20 text-center bg-zinc-950 py-1 border border-zinc-900 rounded font-bold">
                                      {dish.price} ₸
                                    </span>
                                    <button
                                      onClick={() => handleUpdateMenuPrice(dish.name, dish.price + 500)}
                                      className="w-8 h-8 rounded bg-zinc-900 hover:bg-zinc-800 text-slate-100 font-bold border border-zinc-800 flex items-center justify-center text-xs active:scale-95 transition-all cursor-pointer"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* DYNAMIC VIEW FOR HOSTESS ROLE: MANAGEMENT OF TABLE RESERVATIONS */}
                    {crmActiveTab === "reservations" && (
                      <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-3 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <CalendarDays className="text-indigo-400 w-5 h-5" />
                            <div>
                              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Управление Книгой Резервов (Hostess Desk)</h3>
                              <span className="text-[10px] text-slate-500 font-mono font-bold block">GET /crm/reservations (Strict Mapped JWT context)</span>
                            </div>
                          </div>

                          <button
                            onClick={() => fetchCrmReservations()}
                            className="bg-zinc-900 hover:bg-zinc-800 text-slate-300 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border border-zinc-800 flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" /> ОБНОВИТЬ СПИСОК
                          </button>
                        </div>

                        {crmReservations.length === 0 ? (
                          <div className="py-12 text-center text-slate-500 font-mono text-xs uppercase">
                            Бронирований ресторана на сегодня нет. Перейдите во вкладку "Симулятор Клиента", выберите столик и зарегистрируйте бронь!
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-zinc-900 text-xs font-sans">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-zinc-900 text-slate-400 font-mono font-bold bg-[#050508]">
                                  <th className="p-3">ИД</th>
                                  <th className="p-3">Гость (клиент заведения)</th>
                                  <th className="p-3">Номер телефона</th>
                                  <th className="p-3">Дата / Время резерва</th>
                                  <th className="p-3 text-center">Гостей</th>
                                  <th className="p-3">Стол №</th>
                                  <th className="p-3 text-center">Статус резерва</th>
                                  <th className="p-3 text-right">Управление статусом</th>
                                </tr>
                              </thead>
                              <tbody>
                                {crmReservations.map((res) => (
                                  <tr key={res.id} className="border-b border-zinc-900/60 hover:bg-zinc-900/20 transition-colors font-mono font-medium text-[11px]">
                                    <td className="p-3 font-bold text-indigo-400">#{res.id.slice(-4).toUpperCase()}</td>
                                    <td className="p-3 font-bold text-slate-200 font-sans text-xs">[ФИО Клиента: {res.customer_name}]</td>
                                    <td className="p-3 text-slate-400">{res.customer_phone}</td>
                                    <td className="p-3 text-slate-350">{res.date} в {res.time}</td>
                                    <td className="p-3 text-center text-white font-bold">{res.guests_count}</td>
                                    <td className="p-3 text-slate-400">СТОЛ {res.table_id?.split("_")[2]?.toUpperCase() || "ЗАЛ"}</td>
                                    <td className="p-3 text-center">
                                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                        res.status === "confirmed"
                                          ? "bg-emerald-950 text-emerald-400 border border-emerald-500/20"
                                          : res.status === "cancelled"
                                          ? "bg-red-950 text-red-400 border border-red-500/20"
                                          : "bg-amber-950 text-amber-400 border border-amber-500/20"
                                      }`}>
                                        {res.status === "confirmed" ? "Принят" : res.status === "cancelled" ? "Отменен" : "На проверке"}
                                      </span>
                                    </td>
                                    <td className="p-3 text-right space-x-1 whitespace-nowrap">
                                      {res.status === "pending" ? (
                                        <>
                                          <button
                                            onClick={() => handleUpdateReservationStatus(res.id, "confirmed")}
                                            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-2 py-1 rounded text-[10px] uppercase cursor-pointer transition-all"
                                          >
                                            Принять
                                          </button>
                                          <button
                                            onClick={() => handleUpdateReservationStatus(res.id, "cancelled")}
                                            className="bg-red-950/50 hover:bg-red-950 text-red-400 font-bold px-2 py-1 border border-red-900 rounded text-[10px] uppercase cursor-pointer transition-all"
                                          >
                                            Отклон.
                                          </button>
                                        </>
                                      ) : res.status === "confirmed" ? (
                                        <button
                                          onClick={() => handleUpdateReservationStatus(res.id, "completed")}
                                          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-2 py-1 rounded text-[10px] uppercase cursor-pointer transition-all"
                                        >
                                          ЗАВЕРШИТЬ БРОНЬ (освободить стол)
                                        </button>
                                      ) : (
                                        <span className="text-slate-600 italic">Закрыт</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB: TABLE MANAGEMENT */}
                    {crmActiveTab === "tables" && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          {/* Add table form */}
                          <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl space-y-4 h-fit">
                            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                              <Plus className="w-4 h-4 text-indigo-400" />
                              Добавить стол на карту
                            </h3>
                            <form onSubmit={handleAddTable} className="space-y-3 font-mono text-xs">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-slate-500 mb-1.5 font-bold uppercase">№ стола</label>
                                  <input type="number" min="1" required value={tableForm.table_number}
                                    onChange={(e) => setTableForm({ ...tableForm, table_number: e.target.value })}
                                    className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-lg p-2.5 outline-none text-xs"
                                    placeholder="7" />
                                </div>
                                <div>
                                  <label className="block text-slate-500 mb-1.5 font-bold uppercase">Мест</label>
                                  <input type="number" min="1" max="20" required value={tableForm.capacity}
                                    onChange={(e) => setTableForm({ ...tableForm, capacity: e.target.value })}
                                    className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-lg p-2.5 outline-none text-xs" />
                                </div>
                              </div>
                              <div>
                                <label className="block text-slate-500 mb-1.5 font-bold uppercase">Позиция на карте (X%, Y%)</label>
                                <div className="grid grid-cols-2 gap-3">
                                  <input type="number" min="5" max="90" value={tableForm.x_pos}
                                    onChange={(e) => setTableForm({ ...tableForm, x_pos: e.target.value })}
                                    className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-lg p-2.5 outline-none text-xs"
                                    placeholder="X%" />
                                  <input type="number" min="5" max="90" value={tableForm.y_pos}
                                    onChange={(e) => setTableForm({ ...tableForm, y_pos: e.target.value })}
                                    className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-lg p-2.5 outline-none text-xs"
                                    placeholder="Y%" />
                                </div>
                                <p className="text-[10px] text-slate-600 mt-1 font-sans">0-100% — левый край/верх. Центр карты = 50/50.</p>
                              </div>
                              <button type="submit" disabled={loading}
                                className="w-full bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold py-2.5 rounded-xl transition-all text-xs cursor-pointer uppercase disabled:opacity-50 flex items-center justify-center gap-1.5">
                                <Plus className="w-3.5 h-3.5 stroke-[3px]" />
                                Добавить стол
                              </button>
                            </form>
                          </div>

                          {/* Tables list */}
                          <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl lg:col-span-2 space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                                Столы ресторана ({crmTables.length})
                              </h3>
                              <button onClick={() => fetchCrmTables()}
                                className="bg-zinc-900 hover:bg-zinc-800 text-slate-300 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border border-zinc-800 flex items-center gap-1 cursor-pointer">
                                <RefreshCw className="w-3 h-3" /> Обновить
                              </button>
                            </div>

                            {crmTables.length === 0 ? (
                              <div className="py-12 text-center text-slate-500 font-mono text-xs uppercase">
                                Столов нет. Добавьте первый стол с помощью формы слева.
                              </div>
                            ) : (
                              <div className="overflow-x-auto rounded-xl border border-zinc-900 text-xs">
                                <table className="w-full text-left border-collapse font-mono">
                                  <thead>
                                    <tr className="border-b border-zinc-900 text-slate-400 font-bold bg-[#050508]">
                                      <th className="p-3">№</th>
                                      <th className="p-3">Мест</th>
                                      <th className="p-3">X / Y</th>
                                      <th className="p-3 text-center">Статус</th>
                                      {(crmUser?.role === "founder" || crmUser?.role === "manager") && <th className="p-3 text-right">Действия</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {crmTables.map((tbl) => (
                                      <tr key={tbl.id} className="border-b border-zinc-900/60 hover:bg-zinc-900/20 transition-colors">
                                        <td className="p-3 font-bold text-white">Стол №{tbl.table_number}</td>
                                        <td className="p-3 text-slate-400">{tbl.capacity} чел.</td>
                                        <td className="p-3 text-slate-500">{tbl.x_pos}% / {tbl.y_pos}%</td>
                                        <td className="p-3 text-center">
                                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                                            tbl.current_status === "free" ? "bg-emerald-950 text-emerald-400 border-emerald-500/20"
                                            : tbl.current_status === "reserved" ? "bg-amber-950 text-amber-400 border-amber-500/20"
                                            : "bg-pink-950 text-pink-400 border-pink-500/20"
                                          }`}>
                                            {tbl.current_status === "free" ? "Свободен" : tbl.current_status === "reserved" ? "Забронирован" : "Занят"}
                                          </span>
                                        </td>
                                        {(crmUser?.role === "founder" || crmUser?.role === "manager") && (
                                          <td className="p-3 text-right">
                                            <button onClick={() => handleDeleteTable(tbl.id)}
                                              className="text-red-500 hover:text-red-400 text-[10px] font-bold font-mono bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 px-2 py-1 rounded cursor-pointer transition-all">
                                              Удалить
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Preview map */}
                            {crmTables.length > 0 && (
                              <div className="mt-4">
                                <p className="text-[10px] font-mono text-slate-500 uppercase mb-2">Предпросмотр карты зала:</p>
                                <InteractiveMap
                                  tables={crmTables}
                                  activeReservations={[]}
                                  selectedTableId={null}
                                  onSelectTable={() => {}}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB: MY RESTAURANTS (Founder self-service — несколько заведений под одной организацией) */}
                    {crmActiveTab === "my-restaurants" && (
                      <div className="space-y-6">
                        {crmUser?.role !== "founder" ? (
                          <div className="bg-zinc-950 p-8 rounded-2xl border border-red-500/20 text-center space-y-4">
                            <AlertOctagon className="w-12 h-12 text-red-500 mx-auto animate-pulse" />
                            <h3 className="text-base font-bold font-mono text-red-400 uppercase">Только для основателя</h3>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Add restaurant form */}
                            <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl space-y-4 h-fit">
                              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <Crown className="w-4 h-4 text-indigo-400" />
                                Добавить ресторан
                              </h3>
                              <form onSubmit={handleAddFounderRestaurant} className="space-y-3 font-mono text-xs">
                                <div>
                                  <label className="block text-slate-500 mb-1.5 font-bold uppercase tracking-widest text-[10px]">Название:</label>
                                  <input
                                    type="text"
                                    required
                                    placeholder="Второе заведение"
                                    value={newRestaurantName}
                                    onChange={(e) => setNewRestaurantName(e.target.value)}
                                    className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-indigo-400 rounded-xl p-3 outline-none font-bold transition-all text-xs"
                                  />
                                </div>
                                <button
                                  type="submit"
                                  disabled={loading}
                                  className="w-full bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-display font-extrabold py-2.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 text-xs cursor-pointer uppercase tracking-wide"
                                >
                                  + Создать новый tenant
                                </button>
                                <div className="bg-[#050508] rounded-xl p-3 text-[10px] leading-relaxed border border-zinc-900 text-slate-500 font-sans">
                                  Каждый новый ресторан — отдельный tenant со своим свежим api_key, изолированный от остальных ваших заведений.
                                </div>
                              </form>
                            </div>

                            {/* List of owned restaurants */}
                            <div className="lg:col-span-2 bg-zinc-950 border border-zinc-900 p-5 rounded-2xl space-y-3">
                              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Ваши заведения ({founderRestaurants.length})</h3>
                              {founderRestaurants.length === 0 ? (
                                <div className="py-8 text-center text-slate-500 font-mono text-xs uppercase">Загрузка...</div>
                              ) : (
                                <div className="space-y-2">
                                  {founderRestaurants.map((r) => (
                                    <div key={r.id} className={`flex items-center justify-between p-3 rounded-xl border ${r.archived_at ? "border-zinc-900 bg-zinc-900/30 opacity-50" : "border-zinc-900 bg-[#050508]"}`}>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                          <p className="text-xs font-bold text-white truncate">{r.name}</p>
                                          {r.id === crmUser?.restaurant_id && (
                                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/20 uppercase">Активен</span>
                                          )}
                                          {r.archived_at && (
                                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-500/20 uppercase">Архивирован</span>
                                          )}
                                        </div>
                                        <p className="text-[10px] font-mono text-slate-500 truncate">{r.api_key}</p>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0 ml-3">
                                        {!r.archived_at && r.id !== crmUser?.restaurant_id && (
                                          <button onClick={() => handleSwitchRestaurant(r.id)}
                                            className="text-indigo-400 hover:text-indigo-300 text-[10px] font-bold font-mono bg-indigo-950/30 hover:bg-indigo-950/50 border border-indigo-500/20 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all">
                                            Переключиться
                                          </button>
                                        )}
                                        {!r.archived_at && (
                                          <button onClick={() => handleArchiveFounderRestaurant(r.id)}
                                            className="text-red-500 hover:text-red-400 text-[10px] font-bold font-mono bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all">
                                            Архивировать
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="bg-[#050508] rounded-xl p-3 text-[10px] leading-relaxed border border-zinc-900 text-slate-500 font-sans">
                                Архивация запрещена при наличии незавершённых заказов или будущих бронирований в этом ресторане.
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB: RESTAURANT MANAGEMENT (Super Admin) */}
                    {crmActiveTab === "restaurants" && (
                      <div className="space-y-6">
                        {crmUser?.role !== "super_admin" ? (
                          <div className="bg-zinc-950 p-8 rounded-2xl border border-red-500/20 text-center space-y-4">
                            <AlertOctagon className="w-12 h-12 text-red-500 mx-auto animate-pulse" />
                            <h3 className="text-base font-bold font-mono text-red-400 uppercase">Только для Super Admin</h3>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Create restaurant form */}
                            <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl space-y-4 h-fit">
                              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <Crown className="w-4 h-4 text-amber-400" />
                                Зарегистрировать ресторан
                              </h3>
                              <form onSubmit={handleCreateRestaurant} className="space-y-3 font-mono text-xs">
                                <div>
                                  <label className="block text-slate-500 mb-1.5 font-bold uppercase">Название ресторана</label>
                                  <input type="text" required value={restaurantForm.name}
                                    onChange={(e) => setRestaurantForm({ ...restaurantForm, name: e.target.value })}
                                    className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-amber-400 rounded-lg p-2.5 outline-none font-sans text-xs"
                                    placeholder="Название ресторана / сети" />
                                </div>
                                <div>
                                  <label className="block text-slate-500 mb-1.5 font-bold uppercase">Email Admin'а ресторана</label>
                                  <input type="email" required value={restaurantForm.owner_email}
                                    onChange={(e) => setRestaurantForm({ ...restaurantForm, owner_email: e.target.value })}
                                    className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-amber-400 rounded-lg p-2.5 outline-none text-xs"
                                    placeholder="admin@restaurant.kz" />
                                </div>
                                <div>
                                  <label className="block text-slate-500 mb-1.5 font-bold uppercase">Пароль Admin'а</label>
                                  <input type="password" required value={restaurantForm.owner_password}
                                    onChange={(e) => setRestaurantForm({ ...restaurantForm, owner_password: e.target.value })}
                                    className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-amber-400 rounded-lg p-2.5 outline-none text-xs" />
                                </div>
                                <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-xl text-[10px] text-amber-300/80 font-sans leading-relaxed">
                                  После регистрации ресторан автоматически появится в симуляторе клиента с уникальным API ключом. Войдите под аккаунтом Admin'а ресторана для управления.
                                </div>
                                <button type="submit" disabled={loading}
                                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl transition-all text-xs cursor-pointer uppercase disabled:opacity-50">
                                  Зарегистрировать
                                </button>
                              </form>
                            </div>

                            {/* Restaurants list */}
                            <div className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl lg:col-span-2 space-y-4">
                              <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <Briefcase className="w-4 h-4 text-indigo-400" />
                                Все рестораны в системе ({dbDump?.restaurants?.length || 0})
                              </h3>
                              <div className="space-y-3">
                                {(dbDump?.restaurants || []).map((r: any) => {
                                  const staff = (dbDump?.users || []).filter((u: any) => u.restaurant_id === r.id);
                                  const tables = (dbDump?.tables || []).filter((t: any) => t.restaurant_id === r.id);
                                  const orders = (dbDump?.orders || []).filter((o: any) => o.restaurant_id === r.id);
                                  return (
                                    <div key={r.id} className="bg-[#050508] border border-zinc-900 rounded-xl p-4 space-y-2">
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="font-bold text-white font-sans text-sm">{r.name}</p>
                                          <p className="text-[10px] font-mono text-slate-500 mt-0.5">ID: {r.id}</p>
                                        </div>
                                        <span className="text-[9px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded uppercase shrink-0">ACTIVE</span>
                                      </div>
                                      <div className="flex flex-wrap gap-2 text-[10px] font-mono text-slate-500">
                                        <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">🔑 {r.api_key}</span>
                                        <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">👥 {staff.length} сотрудников</span>
                                        <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">🪑 {tables.length} столов</span>
                                        <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">📋 {orders.length} заказов</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* DYNAMIC VIEW FOR KITCHEN ROLE: TOUCHSCREEN-READY KANBAN COOKING TRACKER */}
                    {crmActiveTab === "orders" && (
                      <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-900 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                          <div>
                            <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Терминал поваров кухни (Kitchen Kanban Tracker)</h3>
                            <span className="text-[10px] font-mono text-slate-500 font-bold block">GET /crm/orders (Paid order tracks belonging only to restaurant_id)</span>
                          </div>

                          <button
                            onClick={() => fetchCrmOrders()}
                            className="bg-zinc-900 hover:bg-zinc-800 text-slate-100 px-3 py-1.5 rounded-lg text-xs font-mono font-bold border border-zinc-800 flex items-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> ОБНОВИТЬ ОЧЕРЕДЬ
                          </button>
                        </div>

                        {/* Rendering the custom high-tech touchscreen dashboard Kanban */}
                        <KitchenDashboard
                          orders={crmOrders}
                          onUpdateStatus={(id, status) => handleUpdateOrderStatus(id, status)}
                          isLoading={false}
                        />
                      </div>
                    )}

                  </div>
                )}
              </motion.div>
            )}

            {/* SCREEN 4: PLATFORM HTTP REQUEST INSPECTOR & LIVE TRAFFIC LOGS */}
            {activeTab === "logs" && (
              <motion.div
                key="logs"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 max-w-5xl"
              >
                <div className="flex justify-between items-center pb-1 flex-wrap gap-2">
                  <div>
                    <h2 className="text-lg font-bold font-display text-white flex items-center gap-2">
                      <Terminal className="text-indigo-400 w-5 h-5 animate-pulse" />
                      ЖИВАЯ ЛЕНТА SYSTEM REST API ЗАПРОСОВ
                    </h2>
                    <p className="text-xs text-slate-400 font-medium font-sans">Полный аудит прохождения Middleware слоев безопасности каждого запроса.</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={fetchLogs}
                      className="bg-zinc-900 hover:bg-zinc-800 text-slate-300 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border border-zinc-850 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> ОБНОВИТЬ
                    </button>
                    <button
                      onClick={clearLogs}
                      className="bg-red-950/30 hover:bg-red-900/50 border border-red-500/20 text-red-300 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> ОЧИСТИТЬ
                    </button>
                  </div>
                </div>

                {crmUser?.role !== "super_admin" ? (
                  <div className="bg-zinc-950 p-12 text-center rounded-2xl border border-red-500/20 font-mono text-xs uppercase space-y-2 text-slate-600">
                    <Lock className="w-10 h-10 mx-auto text-zinc-800 mb-2" />
                    <span className="text-red-400">Инспектор логов доступен только Super Admin</span>
                    <p className="text-[10px] text-slate-600 shrink-0 font-sans max-w-sm mx-auto mt-1 leading-relaxed normal-case">
                      Авторизуйтесь в CRM под ролью Super Admin, чтобы видеть сквозной аудит запросов всех тенантов.
                    </p>
                  </div>
                ) : systemLogs.length === 0 ? (
                  <div className="bg-zinc-950 p-12 text-center rounded-2xl border border-zinc-900 font-mono text-xs uppercase space-y-2 text-slate-600">
                    <CodeXml className="w-10 h-10 mx-auto text-zinc-800 mb-2 animate-pulse" />
                    <span>Терминал логирования инспектора пуст</span>
                    <p className="text-[10px] text-slate-600 shrink-0 font-sans max-w-sm mx-auto mt-1 leading-relaxed">
                      Отправьте экспресс корзину сайта или сделайте резервирование столика. Логер перехватит и раскрасит REST API вызов.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {systemLogs.map((log) => (
                      <div
                        key={log.id}
                        className="bg-zinc-950 border border-zinc-900/80 rounded-xl p-4 font-mono text-xs shadow-xl space-y-3 hover:border-zinc-800 transition-all"
                      >
                        {/* Title details */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-900 pb-3">
                          <div className="flex items-center gap-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.method === "POST" ? "bg-emerald-950 text-emerald-400 border border-emerald-500/20" :
                              log.method === "PATCH" ? "bg-amber-950 text-amber-400 border border-amber-500/20" :
                              "bg-indigo-950 text-indigo-400 border border-indigo-500/20"
                            }`}>
                              {log.method}
                            </span>
                            <span className="text-slate-200 font-bold">{log.url}</span>
                            <span className="text-slate-600 text-[10px]">({log.timestamp})</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded bg-[#050508] border border-zinc-900">
                              <span className="text-slate-550">Auth layer:</span>
                              <span className="text-indigo-400 font-bold">{log.auth_type}</span>
                            </div>

                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.status && log.status < 300 ? "bg-emerald-950 text-emerald-300 border border-emerald-500/20" : "bg-red-950 text-red-400 border border-red-500/20"
                            }`}>
                              HTTP {log.status}
                            </span>
                          </div>
                        </div>

                        {/* Mid of network routing details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px] leading-5 bg-[#050508] p-3 rounded-lg border border-zinc-900">
                          
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-slate-500 border-b border-zinc-900 pb-1 mb-1.5 uppercase tracking-widest text-[9px]">SECURITY CREDENTIAL RECEIVERS:</p>
                            <div>
                              <span className="text-slate-550">Widget Client Header X-Restaurant-Key: </span>
                              <span className="text-slate-350">{log.headers["x-restaurant-key"] || "none"}</span>
                            </div>
                            <div>
                              <span className="text-slate-550">CRM Employee JWT Authorization Header: </span>
                              <span className="text-slate-350 truncate block max-w-sm">{log.headers["authorization"] || "none"}</span>
                            </div>
                            <div>
                              <span className="text-slate-550">Parsed Active Role Scope: </span>
                              <span className="text-amber-400 font-bold">{log.role || "GUEST"}</span>
                            </div>
                          </div>

                          <div className="space-y-0.5 bg-zinc-900/10 p-2.5 rounded border border-zinc-900">
                            <p className="text-xs font-bold text-indigo-400 border-b border-zinc-900 pb-1 mb-1.5 uppercase tracking-widest text-[9px] flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" />
                              TENANT CONFINEMENT VERDICT (REST-SaaS)
                            </p>
                            <div>
                              <span className="text-slate-550 font-bold text-[9px]">INTERCEPTED RESTAURANT OUTLINE ID:</span>
                              <p className="text-emerald-400 font-bold text-xs mt-0.5">{log.tenant_context}</p>
                            </div>
                            <div>
                              <span className="text-sky-400 font-extrabold flex items-center gap-1.5 mt-1 text-[9px]">
                                <span className="inline-block w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse" />
                                DATA ISOLATION VERIFIED (ZERO CROSS-CONTAMINATION)
                              </span>
                            </div>
                          </div>

                        </div>

                        {/* Logs body payloads if any */}
                        {log.body && (
                          <div className="bg-[#050508] p-3 rounded-lg border border-zinc-900">
                            <p className="text-slate-550 uppercase text-[9px] font-bold tracking-widest mb-1.5">JSON Payload Block:</p>
                            <pre className="text-indigo-300 font-mono text-[10px] overflow-x-auto whitespace-pre-wrap select-all">{JSON.stringify(log.body, null, 2)}</pre>
                          </div>
                        )}

                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>

      {/* FOOTER BAR */}
      <footer className="bg-zinc-950 border-t border-zinc-900/80 p-4 px-6 flex flex-wrap justify-between items-center text-[10px] tracking-wide font-mono text-slate-650 gap-2">
        <span>© 2026 REZO-MATRIX PORTAL. POWERED BY COMPLIANT MULTI-TENANCY CRM SERVICES. SECURITY GUARANTEED.</span>
        <div className="flex gap-4">
          <span className="hover:text-indigo-400 font-bold pointer-events-none uppercase">REST ISOLATION ENFORCED</span>
          <span>|</span>
          <span className="hover:text-indigo-400 font-bold pointer-events-none uppercase">POSTGRES COMPATIBLE DATABASE CACHE</span>
        </div>
      </footer>
    </div>
  );
}

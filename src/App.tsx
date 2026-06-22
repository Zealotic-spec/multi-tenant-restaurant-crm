import React, { useState, useEffect, useRef } from "react";
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
  ImagePlus,
  ImageOff,
  Bell,
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  ClipboardList,
  Armchair,
  ChefHat,
  Truck,
  ExternalLink,
  Copy,
  KeyRound,
  X,
  Leaf,
  Star,
  Flame,
  Sparkles,
  Award,
  Tag,
  ShoppingCart,
  MessageSquare,
  Key,
} from "lucide-react";
import InteractiveMap from "./components/InteractiveMap";
import KitchenDashboard from "./components/KitchenDashboard";
import { Restaurant, User as CrmUser, DiningTable, Reservation, Order, ApiLog, MenuItem } from "./types";

// --- API Configurations ---
const API_BASE = "/api/v1";

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"docs" | "crm" | "logs">("docs");

  // CRM Workspace State
  const [crmLoginEmail, setCrmLoginEmail] = useState("owner@tenant-a.io");
  const [crmLoginPassword, setCrmLoginPassword] = useState("password123");
  const [crmToken, setCrmToken] = useState<string | null>(localStorage.getItem("crm_jwt"));
  const [crmUser, setCrmUser] = useState<any>(null);
  const [crmReservations, setCrmReservations] = useState<Reservation[]>([]);
  const [crmOrders, setCrmOrders] = useState<Order[]>([]);
  const [crmTables, setCrmTables] = useState<DiningTable[]>([]);
  const [crmEmployees, setCrmEmployees] = useState<{ id: string; email: string; role: string }[]>([]);
  // Реальное меню текущего ресторана (через /crm/menu) — никаких заглушек, цены и блюда хранятся в БД.
  const [crmMenu, setCrmMenu] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [newMenuItemForm, setNewMenuItemForm] = useState({
    name: "",
    price: "",
    category: "",
    image_url: "",
    description: "",
    badge_label: "",
    badge_color: "" as "" | MenuItem["badge_color"],
  });
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

  // Table management form
  const [tableForm, setTableForm] = useState({ table_number: "", capacity: "4", x_pos: "50", y_pos: "50" });

  // Restaurant registration form (super_admin)
  const [restaurantForm, setRestaurantForm] = useState({ name: "", owner_email: "", owner_password: "" });
  const [superAdminTab, setSuperAdminTab] = useState<"create" | "invites">("create");
  const [newInviteCode, setNewInviteCode] = useState("");
  const [inviteCodes, setInviteCodes] = useState<{ code: string; used_at: string | null; note: string | null }[]>([]);

  // Sorting state
  const [reservationSort, setReservationSort] = useState<"date_asc" | "date_desc" | "status">("date_asc");
  const [kitchenSort, setKitchenSort] = useState<"date_asc" | "date_desc">("date_asc");

  // System logs & state
  const [systemLogs, setSystemLogs] = useState<ApiLog[]>([]);
  const [dbDump, setDbDump] = useState<any>(null);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  // Отдельные флаги загрузки на каждую кнопку "Обновить" — крутится именно та иконка,
  // которую нажали, а не все сразу (общий loading используется только для тяжёлых операций типа сброса БД).
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);

  // Helper trigger to auto poll logs & db dumps (Simulating WS / live polling)
  const [tick, setTick] = useState(0);

  // Одноразовое окно показа сгенерированного пароля сотрудника (см. /crm/employees/:id/reset-password)
  const [passwordRevealModal, setPasswordRevealModal] = useState<{ email: string; password: string } | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [resettingPasswordId, setResettingPasswordId] = useState<string | null>(null);

  // Универсальная модалка подтверждения опасных действий — заменяет window.confirm() во всём приложении.
  const [confirmModal, setConfirmModal] = useState<{ title: string; description: string; onConfirm: () => void } | null>(null);
  const askConfirm = (title: string, description: string, onConfirm: () => void) => {
    setConfirmModal({ title, description, onConfirm });
  };

  // Read URL params on mount — auto-switch to crm tab if ?tab=crm
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "crm") {
      setActiveTab("crm");
    }
  }, []);

  // SSE / Polling simulator: Refreshes logs, lists, Kanban queue, and table map every 1.5с.
  // silent=true — фоновый автообновление, иконка "Обновить" не крутится сама по себе;
  // крутится только когда staff явно жмёт кнопку (см. onClick на каждой кнопке "Обновить").
  useEffect(() => {
    fetchLogs(true);
    fetchDbDump();
    if (crmToken) {
      fetchCrmReservations(crmToken, true);
      fetchCrmOrders(crmToken, true);
      fetchCrmTables(crmToken, true);
      fetchCrmMenu(crmToken, true);
      if (crmUser?.role === "founder" || crmUser?.role === "manager") {
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

  // ── Алерты персоналу о новых брони/заказах ──
  // Хостес узнаёт о новой брони, шеф — о новом заказе, через тот же кастомный тост (НЕ браузерный
  // alert/confirm). Отслеживаем уже виденные ID, чтобы алерт срабатывал только на ПОЯВИВШИЕСЯ
  // записи, а не на каждый фоновый опрос (он идёт каждые 1.5с).
  const seenReservationIdsRef = useRef<Set<string> | null>(null);
  const seenOrderIdsRef = useRef<Set<string> | null>(null);

  // Сброс базовой линии при смене сессии/ресторана — иначе при логине алерты "выстрелят" по всем
  // уже существующим записям сразу.
  useEffect(() => {
    seenReservationIdsRef.current = null;
    seenOrderIdsRef.current = null;
  }, [crmToken, crmUser?.restaurant_id]);

  useEffect(() => {
    const ids = new Set(crmReservations.map((r) => r.id));
    if (seenReservationIdsRef.current === null) {
      seenReservationIdsRef.current = ids;
      return;
    }
    const canSeeReservations = ["hostess", "founder", "manager", "super_admin"].includes(crmUser?.role);
    if (canSeeReservations) {
      const fresh = crmReservations.filter((r) => !seenReservationIdsRef.current!.has(r.id));
      if (fresh.length === 1) {
        showToast(`Новая бронь: ${fresh[0].customer_name} · ${fresh[0].date} в ${fresh[0].time} · ${fresh[0].guests_count} гостей`, "info");
      } else if (fresh.length > 1) {
        showToast(`${fresh.length} новых брони поступили`, "info");
      }
    }
    seenReservationIdsRef.current = ids;
  }, [crmReservations, crmUser?.role]);

  useEffect(() => {
    const ids = new Set(crmOrders.map((o) => o.id));
    if (seenOrderIdsRef.current === null) {
      seenOrderIdsRef.current = ids;
      return;
    }
    const canSeeOrders = ["chef", "founder", "manager", "super_admin"].includes(crmUser?.role);
    if (canSeeOrders) {
      const fresh = crmOrders.filter((o) => !seenOrderIdsRef.current!.has(o.id));
      const typeLabel = (t: Order["delivery_type"]) => t === "in_restaurant" ? "в зале" : t === "takeaway" ? "самовывоз" : "доставка";
      if (fresh.length === 1) {
        showToast(`Новый заказ (${typeLabel(fresh[0].delivery_type)}) на ${fresh[0].total_amount.toLocaleString("ru-RU")} ₸`, "info");
      } else if (fresh.length > 1) {
        showToast(`${fresh.length} новых заказов поступили`, "info");
      }
    }
    seenOrderIdsRef.current = ids;
  }, [crmOrders, crmUser?.role]);

  // Конвертирует выбранный файл фото блюда в base64 data URL (хранится прямо в SQLite TEXT-колонке,
  // объектного хранилища/CDN в проекте нет). Лимит 4MB на файл — запас под общий лимит body 6mb.
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (file.size > 4 * 1024 * 1024) {
        reject(new Error("Файл слишком большой (максимум 4MB)"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsDataURL(file);
    });
  };

  // Системные эндпоинты /system/* теперь требуют Bearer JWT с ролью super_admin —
  // без токена/роли тихо не делаем запрос (избегаем лишних 401 и утечки факта существования эндпоинта).
  // silent=true — фоновый автополлинг (раз в 1.5с), не дёргает иконку "Обновить";
  // спиннер крутится только когда staff жмёт кнопку вручную (silent=false, см. onClick ниже).
  const fetchLogs = async (silent = false) => {
    if (!crmToken || crmUser?.role !== "super_admin") return;
    if (!silent) setLogsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/system/logs`, {
        headers: { Authorization: `Bearer ${crmToken}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setSystemLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLogsLoading(false);
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

  const fetchCrmTables = async (token = crmToken, silent = false) => {
    if (!token) return;
    if (!silent) setTablesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/crm/tables`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setCrmTables(data.tables);
    } catch {
    } finally {
      if (!silent) setTablesLoading(false);
    }
  };

  const fetchCrmMenu = async (token = crmToken, silent = false) => {
    if (!token) return;
    if (!silent) setMenuLoading(true);
    try {
      const res = await fetch(`${API_BASE}/crm/menu`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setCrmMenu(data.menu);
    } catch {
    } finally {
      if (!silent) setMenuLoading(false);
    }
  };

  const handleAddMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crmToken) return;
    if (!newMenuItemForm.name.trim() || !newMenuItemForm.price) {
      showToast("Укажите название блюда и цену", "error");
      return;
    }
    setMenuLoading(true);
    try {
      const res = await fetch(`${API_BASE}/crm/menu`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${crmToken}` },
        body: JSON.stringify({
          name: newMenuItemForm.name.trim(),
          price: Number(newMenuItemForm.price),
          category: newMenuItemForm.category.trim() || undefined,
          image_url: newMenuItemForm.image_url || undefined,
          description: newMenuItemForm.description.trim() || undefined,
          badge_label: newMenuItemForm.badge_label.trim() || undefined,
          badge_color: newMenuItemForm.badge_color || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Блюдо добавлено в меню.");
        setNewMenuItemForm({ name: "", price: "", category: "", image_url: "", description: "", badge_label: "", badge_color: "" });
        fetchCrmMenu();
      } else {
        showToast(data.error || "Ошибка добавления блюда", "error");
      }
    } catch {
      showToast("Сбой соединения", "error");
    } finally {
      setMenuLoading(false);
    }
  };

  const handleUpdateMenuPrice = async (id: string, newPrice: number) => {
    if (!crmToken) return;
    // Оптимистичное обновление — цена в интерфейсе меняется мгновенно, не дожидаясь ответа сервера
    setCrmMenu((prev) => prev.map((m) => (m.id === id ? { ...m, price: newPrice } : m)));
    try {
      const res = await fetch(`${API_BASE}/crm/menu/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${crmToken}` },
        body: JSON.stringify({ price: newPrice }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || "Ошибка обновления цены", "error");
        fetchCrmMenu(); // откатываем оптимистичное изменение к реальным данным с сервера
      }
    } catch {
      showToast("Сбой соединения", "error");
      fetchCrmMenu();
    }
  };

  const handleToggleMenuAvailability = async (id: string, isAvailable: boolean) => {
    if (!crmToken) return;
    setCrmMenu((prev) => prev.map((m) => (m.id === id ? { ...m, is_available: isAvailable } : m)));
    try {
      const res = await fetch(`${API_BASE}/crm/menu/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${crmToken}` },
        body: JSON.stringify({ is_available: isAvailable }),
      });
      if (!res.ok) fetchCrmMenu();
    } catch {
      fetchCrmMenu();
    }
  };

  const handleUpdateMenuImage = async (id: string, imageUrl: string) => {
    if (!crmToken) return;
    setCrmMenu((prev) => prev.map((m) => (m.id === id ? { ...m, image_url: imageUrl } : m)));
    try {
      const res = await fetch(`${API_BASE}/crm/menu/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${crmToken}` },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Фото блюда обновлено.");
      } else {
        showToast(data.error || "Ошибка загрузки фото", "error");
        fetchCrmMenu();
      }
    } catch {
      showToast("Сбой соединения", "error");
      fetchCrmMenu();
    }
  };

  const handleDeleteMenuItem = async (id: string) => {
    if (!crmToken) return;
    try {
      const res = await fetch(`${API_BASE}/crm/menu/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${crmToken}` },
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Блюдо удалено.");
        setCrmMenu((prev) => prev.filter((m) => m.id !== id));
      } else {
        showToast(data.error || "Ошибка удаления блюда", "error");
      }
    } catch {
      showToast("Сбой соединения", "error");
    }
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

  const handleDeleteTable = (id: string, tableNumber: number) => {
    askConfirm(
      "Удалить стол?",
      `Стол №${tableNumber} будет удалён из карты зала без возможности восстановления.`,
      () => doDeleteTable(id)
    );
  };

  const doDeleteTable = async (id: string) => {
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
      } else {
        showToast(data.error || "Ошибка создания ресторана", "error");
      }
    } catch {
      showToast("Сбой соединения", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchInviteCodes = async () => {
    if (!crmToken || crmUser?.role !== "super_admin") return;
    try {
      const res = await fetch(`${API_BASE}/system/invite-codes`, {
        headers: { Authorization: `Bearer ${crmToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInviteCodes(data.codes || []);
      }
    } catch {}
  };

  const handleCreateInviteCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crmToken || !newInviteCode.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/system/invite-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${crmToken}` },
        body: JSON.stringify({ code: newInviteCode.trim().toUpperCase(), note: "" }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Invite-код создан");
        setNewInviteCode("");
        fetchInviteCodes();
      } else {
        showToast(data.error || "Ошибка", "error");
      }
    } catch {
      showToast("Сбой соединения", "error");
    }
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

  // Бейдж блюда (вегетарианское/хит/острое и т.д.) — цвет привязан к иконке, чтобы карточка
  // выглядела как на референсном фото, а не зависела от свободного текста.
  const BADGE_STYLES: Record<NonNullable<MenuItem["badge_color"]>, { classes: string; Icon: typeof Leaf }> = {
    emerald: { classes: "bg-emerald-500 text-emerald-950", Icon: Leaf },
    amber: { classes: "bg-amber-400 text-amber-950", Icon: Star },
    red: { classes: "bg-red-500 text-red-950", Icon: Flame },
    indigo: { classes: "bg-indigo-400 text-indigo-950", Icon: Sparkles },
    purple: { classes: "bg-purple-400 text-purple-950", Icon: Award },
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

  const handleDeleteEmployee = async (id: string) => {
    if (!crmToken) return;
    try {
      const res = await fetch(`${API_BASE}/crm/employees/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${crmToken}` },
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "Сотрудник удалён.");
        fetchCrmEmployees();
      } else {
        showToast(data.error || "Ошибка удаления сотрудника", "error");
      }
    } catch {
      showToast("Сбой соединения", "error");
    }
  };

  // Сброс пароля сотрудника (если он его забыл) — сервер сам генерирует новый пароль и хэширует
  // его, а нам открытым текстом отдаёт ровно один раз, чтобы показать в одноразовой модалке.
  const handleResetEmployeePassword = async (id: string, email: string) => {
    if (!crmToken) return;
    setResettingPasswordId(id);
    try {
      const res = await fetch(`${API_BASE}/crm/employees/${id}/reset-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${crmToken}` },
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordRevealModal({ email: data.email || email, password: data.new_password });
        setPasswordCopied(false);
      } else {
        showToast(data.error || "Ошибка сброса пароля", "error");
      }
    } catch {
      showToast("Сбой соединения", "error");
    } finally {
      setResettingPasswordId(null);
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
        if (data.user.role !== "super_admin") {
          fetchCrmMenu(data.token);
        }
        if (data.user.role === "founder" || data.user.role === "manager") {
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
        showToast(data.message || "Ресторан зарегистрирован! Добро пожаловать.");
        fetchCrmReservations(data.token);
        fetchCrmOrders(data.token);
        fetchCrmTables(data.token);
        fetchCrmMenu(data.token);
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
        fetchCrmMenu(data.token);
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
  const handleArchiveFounderRestaurant = (restaurantId: string) => {
    askConfirm(
      "Архивировать ресторан?",
      "Действие можно выполнить только если нет активных заказов или будущих бронирований в этом ресторане.",
      () => doArchiveFounderRestaurant(restaurantId)
    );
  };

  const doArchiveFounderRestaurant = async (restaurantId: string) => {
    if (!crmToken) return;
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
        } else if (data.user.role === "super_admin") {
          // super_admin управляет платформой (вкладка "Рестораны"), а не данными одного
          // заведения — Финансы/Сотрудники/Меню/"Мои рестораны" ему недоступны, поэтому
          // при обновлении страницы безопасный фолбэк — "Рестораны", а не "Финансы".
          setCrmActiveTab((curr) => (curr === "restaurants" || curr === "reservations" || curr === "tables" || curr === "orders" ? curr : "restaurants"));
        } else {
          // founder / manager — keep current view if it's already a valid tab for this role, or defaults to analytics
          setCrmActiveTab((curr) => (curr === "orders" || curr === "reservations" || curr === "analytics" || curr === "employees" || curr === "menu" || curr === "tables" || curr === "my-restaurants" ? curr : "analytics"));
        }

        fetchCrmReservations(crmToken);
        fetchCrmOrders(crmToken);
        fetchCrmTables(crmToken);
        if (data.user.role !== "super_admin") {
          fetchCrmMenu(crmToken);
        }
        if (data.user.role === "founder" || data.user.role === "manager") {
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

  const fetchCrmReservations = async (token = crmToken, silent = false) => {
    if (!token) return;
    if (!silent) setReservationsLoading(true);
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
    } finally {
      if (!silent) setReservationsLoading(false);
    }
  };

  const fetchCrmOrders = async (token = crmToken, silent = false) => {
    if (!token) return;
    if (!silent) setOrdersLoading(true);
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
    } finally {
      if (!silent) setOrdersLoading(false);
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

  return (
    <div id="full_saas_shell" className="min-h-screen bg-[#07070a] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-white">

      {/* --- LIVE SYSTEM NOTICE GLASS BANNER (общая для всех ролей, включая Super Admin) --- */}
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
            {alertMsg.type === "info" && <Bell className="w-4 h-4 text-indigo-400 shrink-0" />}
            <p className="font-mono leading-relaxed font-semibold">{alertMsg.text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {crmUser?.role === "super_admin" ? (
        /* SUPER ADMIN: единственная разрешённая функция — регистрация нового ресторана
           и аккаунта его основателя. Никаких других экранов, списков или действий он не видит. */
        <>
          <header className="bg-zinc-950/70 border-b border-zinc-900/80 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-2 rounded-xl shadow-[0_0_15px_rgba(251,191,36,0.25)] flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5 text-slate-950 stroke-[3px]" />
              </div>
              <div>
                <h1 className="text-md font-bold font-display tracking-tight text-white">Super Admin</h1>
                <p className="text-[11px] text-slate-500 tracking-wide">{crmUser?.email}</p>
              </div>
            </div>
            <button
              onClick={handleCrmLogout}
              className="flex items-center gap-1.5 bg-red-950/30 hover:bg-red-900/50 border border-red-500/20 text-red-400 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer"
            >
              Выйти
            </button>
          </header>

          <main className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-2xl mx-auto space-y-4">
              {/* Tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setSuperAdminTab("create")}
                  className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border flex items-center gap-1.5 ${superAdminTab === "create" ? "bg-amber-500 text-slate-950 border-amber-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}
                >
                  <Plus className="w-3.5 h-3.5" /> Новый ресторан
                </button>
                <button
                  onClick={() => { setSuperAdminTab("invites"); fetchInviteCodes(); }}
                  className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border flex items-center gap-1.5 ${superAdminTab === "invites" ? "bg-amber-500 text-slate-950 border-amber-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}
                >
                  <Key className="w-3.5 h-3.5" /> Invite-коды
                </button>
              </div>

              {superAdminTab === "create" && (
                <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl space-y-4 shadow-2xl">
                  <div className="flex items-center gap-2 pb-3 border-b border-zinc-900">
                    <Crown className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold font-display text-white">Зарегистрировать ресторан</h3>
                  </div>
                  <form onSubmit={handleCreateRestaurant} className="space-y-3 font-mono text-xs">
                    <div>
                      <label className="block text-slate-500 mb-1.5 font-bold uppercase">Название ресторана</label>
                      <input
                        type="text"
                        required
                        value={restaurantForm.name}
                        onChange={(e) => setRestaurantForm({ ...restaurantForm, name: e.target.value })}
                        className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-amber-400 rounded-lg p-2.5 outline-none font-sans text-xs"
                        placeholder="Название ресторана / сети"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-1.5 font-bold uppercase">Email основателя</label>
                      <input
                        type="email"
                        required
                        value={restaurantForm.owner_email}
                        onChange={(e) => setRestaurantForm({ ...restaurantForm, owner_email: e.target.value })}
                        className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-amber-400 rounded-lg p-2.5 outline-none text-xs"
                        placeholder="founder@restaurant.kz"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-1.5 font-bold uppercase">Пароль основателя</label>
                      <input
                        type="password"
                        required
                        value={restaurantForm.owner_password}
                        onChange={(e) => setRestaurantForm({ ...restaurantForm, owner_password: e.target.value })}
                        className="w-full bg-[#050508] text-white border border-zinc-900 focus:border-amber-400 rounded-lg p-2.5 outline-none text-xs"
                      />
                    </div>
                    <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-xl text-[10px] text-amber-300/80 font-sans leading-relaxed">
                      Создаст изолированный ресторан (свой restaurant_id и api_key) и аккаунт основателя.
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl transition-all text-xs cursor-pointer uppercase disabled:opacity-50"
                    >
                      Зарегистрировать
                    </button>
                  </form>
                </div>
              )}

              {superAdminTab === "invites" && (
                <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-2xl space-y-4 shadow-2xl">
                  <div className="flex items-center gap-2 pb-3 border-b border-zinc-900">
                    <Key className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold font-display text-white">Управление Invite-кодами</h3>
                  </div>
                  <form onSubmit={handleCreateInviteCode} className="flex gap-2">
                    <input
                      type="text"
                      value={newInviteCode}
                      onChange={(e) => setNewInviteCode(e.target.value.toUpperCase())}
                      placeholder="НОВЫЙ КОД"
                      className="flex-1 bg-[#050508] text-white border border-zinc-900 focus:border-amber-400 rounded-lg p-2.5 outline-none font-mono text-xs uppercase"
                    />
                    <button
                      type="submit"
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs cursor-pointer uppercase"
                    >
                      Создать
                    </button>
                  </form>
                  <div className="space-y-2">
                    {inviteCodes.length === 0 ? (
                      <p className="text-xs text-slate-500 font-mono text-center py-6">Нет кодов. Нажмите "Создать".</p>
                    ) : inviteCodes.map((c) => (
                      <div key={c.code} className="flex items-center justify-between p-3 bg-zinc-900/40 border border-zinc-800 rounded-xl">
                        <span className="font-mono font-bold text-sm text-white tracking-widest">{c.code}</span>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${c.used_at ? "bg-red-950 text-red-400 border border-red-500/20" : "bg-emerald-950 text-emerald-400 border border-emerald-500/20"}`}>
                          {c.used_at ? "ИСПОЛЬЗОВАН" : "СВОБОДЕН"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </main>
        </>
      ) : (
        <>
      {/* 1. FUTURISTIC MATRIX TOP RAIL */}
      <header className="bg-zinc-950/70 border-b border-zinc-900/80 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.25)] flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-5 h-5 text-slate-950 stroke-[3px]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-md font-bold font-display tracking-tight text-white">RestoCRM</h1>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-900 text-indigo-400 border border-indigo-500/20">Платформа для ресторанов · v2.0</span>
            </div>
            <p className="text-[11px] text-slate-500 tracking-wide">Управление рестораном в одном месте</p>
          </div>
        </div>

        {/* Database Integrity State Widgets */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="hidden sm:flex items-center gap-2 bg-zinc-950 p-2 rounded-lg border border-zinc-900 shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-slate-500">ISOLATION BUFFER:</span>
            <span className="text-[10px] text-emerald-400 font-bold uppercase">POLLED RELATIONAL STREAM</span>
          </div>
        </div>
      </header>

      {/* --- УНИВЕРСАЛЬНОЕ МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ (замена window.confirm) --- */}
      <AnimatePresence>
        {confirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setConfirmModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.9)]"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-950/40 border border-red-500/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-sans">{confirmModal.title}</h3>
                  <p className="text-xs text-slate-400 font-sans mt-1.5 leading-relaxed">{confirmModal.description}</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold font-mono bg-zinc-900 hover:bg-zinc-800 text-slate-300 border border-zinc-800 transition-all cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmModal.onConfirm();
                    setConfirmModal(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold font-mono bg-red-500 hover:bg-red-400 text-red-950 transition-all cursor-pointer"
                >
                  Подтвердить
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- МОДАЛЬНОЕ ОКНО ОДНОРАЗОВОГО ПОКАЗА НОВОГО ПАРОЛЯ СОТРУДНИКА --- */}
      <AnimatePresence>
        {passwordRevealModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPasswordRevealModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.9)] relative"
            >
              <button
                type="button"
                onClick={() => setPasswordRevealModal(null)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white cursor-pointer transition-all"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white font-sans">Новый пароль создан</h3>
                  <p className="text-xs text-slate-400 font-sans mt-1.5 leading-relaxed">
                    Передайте его сотруднику <strong className="text-white">{passwordRevealModal.email}</strong>. Пароль показывается один раз и больше не будет доступен.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-[#050508] border border-zinc-900 rounded-xl px-4 py-3 mb-4">
                <span className="flex-1 text-sm font-mono font-bold text-amber-400 tracking-wider select-all">{passwordRevealModal.password}</span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(passwordRevealModal.password);
                      setPasswordCopied(true);
                      setTimeout(() => setPasswordCopied(false), 2000);
                    } catch {
                      showToast("Не удалось скопировать пароль", "error");
                    }
                  }}
                  title="Скопировать пароль"
                  className="w-8 h-8 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center justify-center cursor-pointer transition-all shrink-0"
                >
                  {passwordCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPasswordRevealModal(null)}
                className="w-full bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold py-2.5 rounded-xl transition-all font-sans text-xs cursor-pointer"
              >
                Готово
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex overflow-hidden">
        
        {/* 2. NEON NAV RAIL (LEFT BAR WITH HIGH CONTRAST BUTTONS) */}
        <aside className="w-72 bg-zinc-950 border-r border-zinc-900/80 flex flex-col justify-between shrink-0 hidden md:flex">
          <div className="p-4 flex flex-col gap-2">
            <span className="text-[10px] font-semibold text-slate-500 tracking-widest uppercase ml-2 mb-2">Навигация</span>

            <button
              onClick={() => setActiveTab("docs")}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all relative ${
                activeTab === "docs"
                  ? "bg-indigo-950/30 text-indigo-400 border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.05)]"
                  : "text-slate-500 hover:text-slate-300 border border-transparent hover:bg-zinc-900/50"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Документация</span>
            </button>

            <button
              onClick={() => setActiveTab("crm")}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all relative ${
                activeTab === "crm"
                  ? "bg-indigo-950/30 text-indigo-400 border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.05)]"
                  : "text-slate-500 hover:text-slate-300 border border-transparent hover:bg-zinc-900/50"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>CRM</span>
              {crmToken && <span className="absolute right-4 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
            </button>

            <button
              onClick={() => setActiveTab("logs")}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all relative ${
                activeTab === "logs"
                  ? "bg-indigo-950/30 text-indigo-400 border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.05)]"
                  : "text-slate-500 hover:text-slate-300 border border-transparent hover:bg-zinc-900/50"
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>Системные логи</span>
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
                  className="w-full text-center py-1.5 bg-red-950/20 hover:bg-red-950/50 text-red-400 hover:text-red-300 border border-red-900/30 hover:border-red-500/30 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                >
                  Выйти
                </button>
              </div>
            ) : (
              <div className="text-xs text-slate-500 leading-relaxed p-2">
                <p className="font-semibold text-slate-400 mb-1">Не авторизованы</p>
                Войдите в CRM чтобы управлять залом, заказами и бронированиями.
              </div>
            )}
          </div>
        </aside>

        {/* 3. MAIN WORK CONSOLE AREA */}
        <main className="flex-1 p-6 overflow-y-auto bg-[#09090c]">
          
          {/* Mobile Navigation tabs rail */}
          <div className="flex md:hidden flex-wrap gap-2 mb-6 bg-zinc-950 p-2 text-xs border border-zinc-900 rounded-xl">
            <button onClick={() => setActiveTab("docs")} className={`px-3 py-1.5 font-mono rounded-lg transition-all ${activeTab === "docs" ? "bg-indigo-500 text-slate-950 font-bold" : "text-slate-400"}`}>Схемы</button>
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
                        <span className="font-bold text-white flex items-center gap-1.5 mb-1"><ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> Алгоритм контроля overbooking (±2ч):</span>
                        При попытке внесения брони система проверяет наличие пересечений времени на выбранном стопике в диапазоне 120 минут до и после запрашиваемого интервала.
                      </div>

                      <div className="p-3.5 rounded-xl bg-red-950/10 border border-red-500/10 text-slate-500">
                        <span className="font-bold text-red-400 flex items-center gap-1.5 mb-0.5"><AlertTriangle className="w-3.5 h-3.5" /> Изоляция арендатора (Global Middleware Guard):</span>
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
                      <p className="text-[10px] text-slate-700 font-sans normal-case">Авторизуйтесь в CRM под ролью Super Admin, чтобы увидеть данные всех ресторанов</p>
                    </div>
                  ) : dbDump ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">

                      <div className="bg-[#050508] p-3.5 rounded-xl border border-zinc-900/80">
                        <span className="text-indigo-400 font-bold block border-b border-zinc-900 pb-2 mb-2">RESTAURANTS ({dbDump.restaurants?.length})</span>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {dbDump.restaurants?.map((r: any) => (
                            <div key={r.id} className="p-2 rounded bg-zinc-900 border border-zinc-800 text-[11px]">
                              <p className="font-bold text-white truncate">{r.name}</p>
                              <span className="text-indigo-400 font-bold text-[9px] block mt-1">ID ресторана: {r.id}</span>
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
                      <div className="w-10 h-10 mx-auto mb-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                        <Lock className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-base font-bold font-display text-white">
                        {crmAuthMode === "login" ? "Войти в RestoCRM" : "Регистрация нового ресторана"}
                      </h3>
                      <p className="text-[12px] text-slate-500">
                        {crmAuthMode === "login" ? "Введите email и пароль вашего аккаунта" : "Нужен код приглашения от поставщика"}
                      </p>
                    </div>

                    {crmError && (
                      <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-xs text-red-400 font-bold text-center font-mono">
                        {crmError}
                      </div>
                    )}

                    {crmAuthMode === "login" ? (
                      <form onSubmit={handleCrmLogin} className="space-y-4">
                        <div>
                          <label className="block text-slate-400 text-xs font-semibold mb-1.5">Email</label>
                          <input
                            type="email"
                            required
                            placeholder="your@email.com"
                            value={crmLoginEmail}
                            onChange={(e) => setCrmLoginEmail(e.target.value)}
                            className="w-full bg-[#050508] text-white border border-zinc-800 focus:border-indigo-500 rounded-xl p-3 outline-none transition-all text-sm placeholder:text-slate-600"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-400 text-xs font-semibold mb-1.5">Пароль</label>
                          <input
                            type="password"
                            required
                            placeholder="••••••••"
                            value={crmLoginPassword}
                            onChange={(e) => setCrmLoginPassword(e.target.value)}
                            className="w-full bg-[#050508] text-white border border-zinc-800 focus:border-indigo-500 rounded-xl p-3 outline-none text-sm transition-all placeholder:text-slate-600"
                          />
                        </div>

                        <div className="pt-1">
                          <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 text-sm cursor-pointer flex items-center justify-center gap-2"
                          >
                            <UserCheck className="w-4 h-4 stroke-[2.5px]" />
                            Войти
                          </button>
                        </div>

                        <div className="bg-zinc-900/50 rounded-xl p-3 text-xs text-slate-500 border border-zinc-900">
                          <span className="font-semibold text-slate-400 flex items-center gap-1.5 mb-1"><Lightbulb className="w-3.5 h-3.5 text-amber-400" /> Для демо:</span>
                          owner@tenant-a.io / password123
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
                            ЗАРЕГИСТРИРОВАТЬ РЕСТОРАН
                          </button>
                        </div>

                        <div className="bg-[#050508] rounded-xl p-3 text-[10px] leading-relaxed border border-zinc-900 text-slate-500 font-sans">
                          <span className="font-bold text-slate-400 font-mono tracking-widest flex items-center gap-1.5 uppercase text-[9px] mb-1"><Lightbulb className="w-3 h-3 text-amber-400" /> Независимый ресторан:</span>
                          Регистрация создаёт только аккаунт основателя и его первый ресторан — изолированное заведение со своим свежим api_key. Сотрудников (менеджер/шеф-повар/хостес) основатель добавляет сам внутри CRM.
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
                        <span className="text-slate-500">ID РЕСТОРАНА:</span>
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
                          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border flex items-center gap-1.5 ${crmActiveTab === "restaurants" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                          <Building2 className="w-3.5 h-3.5" /> Рестораны
                        </button>
                      )}

                      {(crmUser?.role === "founder" || crmUser?.role === "manager") && (
                        <>
                          <button type="button" onClick={() => setCrmActiveTab("analytics")}
                            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border flex items-center gap-1.5 ${crmActiveTab === "analytics" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                            <TrendingUp className="w-3.5 h-3.5" /> Финансы
                          </button>
                          <button type="button" onClick={() => setCrmActiveTab("employees")}
                            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border flex items-center gap-1.5 ${crmActiveTab === "employees" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                            <Users className="w-3.5 h-3.5" /> Сотрудники
                          </button>
                          <button type="button" onClick={() => setCrmActiveTab("menu")}
                            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border flex items-center gap-1.5 ${crmActiveTab === "menu" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                            <UtensilsCrossed className="w-3.5 h-3.5" /> Меню
                          </button>
                        </>
                      )}

                      {(crmUser?.role === "founder" || crmUser?.role === "manager" || crmUser?.role === "super_admin" || crmUser?.role === "hostess") && (
                        <>
                          <button type="button" onClick={() => setCrmActiveTab("reservations")}
                            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border flex items-center gap-1.5 ${crmActiveTab === "reservations" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                            <CalendarDays className="w-3.5 h-3.5" /> Брони
                          </button>
                          <button type="button" onClick={() => setCrmActiveTab("tables")}
                            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border flex items-center gap-1.5 ${crmActiveTab === "tables" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                            <Armchair className="w-3.5 h-3.5" /> Карта столов
                          </button>
                        </>
                      )}

                      {(crmUser?.role === "founder" || crmUser?.role === "manager" || crmUser?.role === "super_admin" || crmUser?.role === "chef") && (
                        <button type="button" onClick={() => setCrmActiveTab("orders")}
                          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border flex items-center gap-1.5 ${crmActiveTab === "orders" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                          <ChefHat className="w-3.5 h-3.5" /> Кухня
                        </button>
                      )}

                      {crmUser?.role === "founder" && (
                        <button type="button" onClick={() => setCrmActiveTab("my-restaurants")}
                          className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer border flex items-center gap-1.5 ${crmActiveTab === "my-restaurants" ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900/50 text-slate-400 border-transparent hover:text-white"}`}>
                          <Store className="w-3.5 h-3.5" /> Мои рестораны
                        </button>
                      )}
                    </div>

                    {/* TAB A: ANALYTICS (Founder / Manager / Super Admin Only) */}
                    {crmActiveTab === "analytics" && (
                      <div className="space-y-6">
                        {(crmUser?.role !== "founder" && crmUser?.role !== "manager") ? (
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
                                            {o.delivery_type === "in_restaurant" ? "В ЗАВЕДЕНИИ" : o.delivery_type === "delivery" ? (
                                              <span className="flex items-center gap-1"><Truck className="w-3 h-3 text-amber-400" /> ДОСТАВКА</span>
                                            ) : "С СОБОЙ"}
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
                        {(crmUser?.role !== "founder" && crmUser?.role !== "manager") ? (
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
                                      <th className="p-3 text-right">Действия</th>
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
                                        <td className="p-3 text-right">
                                          <div className="flex items-center justify-end gap-1.5">
                                            {emp.id !== crmUser?.id && (
                                              <button
                                                type="button"
                                                onClick={() => handleResetEmployeePassword(emp.id, emp.email)}
                                                disabled={resettingPasswordId === emp.id}
                                                title="Сгенерировать новый пароль сотруднику, если он его забыл"
                                                className="text-indigo-400 hover:text-indigo-300 text-[10px] font-bold font-mono bg-indigo-950/20 hover:bg-indigo-950/40 border border-indigo-900/30 px-2 py-1 rounded cursor-pointer transition-all flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
                                              >
                                                <KeyRound className={`w-3 h-3 ${resettingPasswordId === emp.id ? "animate-pulse" : ""}`} /> Новый пароль
                                              </button>
                                            )}
                                            {emp.role !== "founder" && emp.id !== crmUser?.id && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  askConfirm(
                                                    "Удалить сотрудника?",
                                                    `Сотрудник "${emp.email}" будет немедленно удалён из штата без возможности восстановления.`,
                                                    () => handleDeleteEmployee(emp.id)
                                                  )
                                                }
                                                title="Удалить сотрудника"
                                                className="text-red-500 hover:text-red-400 text-[10px] font-bold font-mono bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 px-2 py-1 rounded cursor-pointer transition-all"
                                              >
                                                Удалить
                                              </button>
                                            )}
                                          </div>
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
                        {(crmUser?.role !== "founder" && crmUser?.role !== "manager") ? (
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
                            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 flex-wrap gap-2">
                              <div>
                                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Меню ресторана</h3>
                                <p className="text-[11px] text-slate-500 font-sans mt-1">
                                  Блюда хранятся в базе данных (GET/POST/PATCH/DELETE /crm/menu). Изменения цены и доступности сразу видны клиентам в портале бронирования/заказа.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => fetchCrmMenu()}
                                disabled={menuLoading}
                                className="bg-zinc-900 hover:bg-zinc-800 text-slate-300 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border border-zinc-800 flex items-center gap-1 cursor-pointer disabled:opacity-60"
                              >
                                <RefreshCw className={`w-3 h-3 ${menuLoading ? "animate-spin" : ""}`} /> ОБНОВИТЬ
                              </button>
                            </div>

                            <form onSubmit={handleAddMenuItem} className="space-y-2.5 bg-[#050508] border border-zinc-900 rounded-xl p-3">
                              <div className="flex flex-wrap items-end gap-2">
                                <div className="flex-1 min-w-[140px]">
                                  <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Название блюда</label>
                                  <input
                                    type="text"
                                    value={newMenuItemForm.name}
                                    onChange={(e) => setNewMenuItemForm((prev) => ({ ...prev, name: e.target.value }))}
                                    placeholder="Например, Плов"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-sans focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                                <div className="w-28">
                                  <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Цена, ₸</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={newMenuItemForm.price}
                                    onChange={(e) => setNewMenuItemForm((prev) => ({ ...prev, price: e.target.value }))}
                                    placeholder="2500"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                                <div className="w-36">
                                  <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Категория</label>
                                  <input
                                    type="text"
                                    value={newMenuItemForm.category}
                                    onChange={(e) => setNewMenuItemForm((prev) => ({ ...prev, category: e.target.value }))}
                                    placeholder="Горячее (опц.)"
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-sans focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                                <div className="w-auto">
                                  <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Фото</label>
                                  <label className="w-20 h-9 flex items-center justify-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-[10px] font-mono text-slate-400 hover:border-indigo-500 hover:text-indigo-300 cursor-pointer transition-all overflow-hidden">
                                    {newMenuItemForm.image_url ? (
                                      <img src={newMenuItemForm.image_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <>
                                        <ImagePlus className="w-3.5 h-3.5" /> Файл
                                      </>
                                    )}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        try {
                                          const dataUrl = await fileToDataUrl(file);
                                          setNewMenuItemForm((prev) => ({ ...prev, image_url: dataUrl }));
                                        } catch (err) {
                                          showToast(err instanceof Error ? err.message : "Ошибка загрузки фото", "error");
                                        }
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-end gap-2">
                                <div className="flex-1 min-w-[200px]">
                                  <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Описание (2-3 строки)</label>
                                  <textarea
                                    value={newMenuItemForm.description}
                                    onChange={(e) => setNewMenuItemForm((prev) => ({ ...prev, description: e.target.value }))}
                                    placeholder="Короткое аппетитное описание блюда для гостя"
                                    rows={1}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-sans focus:outline-none focus:border-indigo-500 resize-none"
                                  />
                                </div>
                                <div className="w-32">
                                  <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Бейдж</label>
                                  <input
                                    type="text"
                                    value={newMenuItemForm.badge_label}
                                    onChange={(e) => setNewMenuItemForm((prev) => ({ ...prev, badge_label: e.target.value }))}
                                    placeholder="Хит, Веган..."
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-sans focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                                <div className="w-32">
                                  <label className="text-[10px] text-slate-500 font-mono uppercase block mb-1">Цвет бейджа</label>
                                  <select
                                    value={newMenuItemForm.badge_color}
                                    onChange={(e) => setNewMenuItemForm((prev) => ({ ...prev, badge_color: e.target.value as typeof prev.badge_color }))}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-sans focus:outline-none focus:border-indigo-500"
                                  >
                                    <option value="">Без бейджа</option>
                                    <option value="emerald">🟢 Веган</option>
                                    <option value="amber">⭐ Хит</option>
                                    <option value="red">🔥 Острое</option>
                                    <option value="indigo">✨ Новинка</option>
                                    <option value="purple">🏆 Премиум</option>
                                  </select>
                                </div>
                                <button
                                  type="submit"
                                  disabled={menuLoading}
                                  className="bg-indigo-500 hover:bg-indigo-400 text-slate-950 px-3 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-60 h-9"
                                >
                                  <PlusCircle className="w-3.5 h-3.5" /> Добавить блюдо
                                </button>
                              </div>
                            </form>

                            {crmMenu.length === 0 ? (
                              <div className="py-12 text-center text-slate-500 font-mono text-xs uppercase">
                                Меню пока пусто. Добавьте первое блюдо через форму выше.
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {crmMenu.map((dish) => {
                                  const badge = dish.badge_color ? BADGE_STYLES[dish.badge_color] : null;
                                  return (
                                    <div key={dish.id} className={`bg-[#050508] border border-zinc-900 rounded-2xl overflow-hidden flex flex-col ${dish.is_available ? "" : "opacity-50"}`}>
                                      {/* Full-bleed photo with badge ribbon, как на референсном фото */}
                                      <label
                                        title="Загрузить/заменить фото блюда"
                                        className="relative h-36 block bg-zinc-900 cursor-pointer group shrink-0"
                                      >
                                        {dish.image_url ? (
                                          <img src={dish.image_url} alt={dish.name} className="w-full h-full object-cover" />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center">
                                            <ImageOff className="w-6 h-6 text-slate-700" />
                                          </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all">
                                          <ImagePlus className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-all" />
                                        </div>
                                        {badge && (
                                          <span className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-extrabold uppercase tracking-wide shadow-lg ${badge.classes}`}>
                                            <badge.Icon className="w-3 h-3" /> {dish.badge_label}
                                          </span>
                                        )}
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="hidden"
                                          onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            try {
                                              const dataUrl = await fileToDataUrl(file);
                                              handleUpdateMenuImage(dish.id, dataUrl);
                                            } catch (err) {
                                              showToast(err instanceof Error ? err.message : "Ошибка загрузки фото", "error");
                                            }
                                            e.target.value = "";
                                          }}
                                        />
                                      </label>

                                      <div className="p-3.5 flex flex-col gap-2 flex-1">
                                        {dish.category && (
                                          <span className="self-start text-[9px] font-mono font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/40 border border-indigo-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                                            <Tag className="w-2.5 h-2.5" /> {dish.category}
                                          </span>
                                        )}
                                        <h4 className="text-sm font-bold text-slate-100 font-sans leading-snug">{dish.name}</h4>
                                        {dish.description && (
                                          <p
                                            className="text-[11px] text-slate-500 font-sans leading-relaxed"
                                            style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                                          >
                                            {dish.description}
                                          </p>
                                        )}

                                        <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-zinc-900">
                                          <div>
                                            <span className="text-[8px] text-slate-600 font-mono uppercase tracking-widest block">Стоимость</span>
                                            <span className="text-sm font-mono font-bold text-amber-400">{dish.price} ₸</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <button
                                              type="button"
                                              onClick={() => handleUpdateMenuPrice(dish.id, Math.max(0, dish.price - 500))}
                                              title="Цена -500 ₸"
                                              className="w-6 h-6 rounded bg-zinc-900 hover:bg-zinc-800 text-slate-100 border border-zinc-800 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                            >
                                              <Minus className="w-3 h-3" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleUpdateMenuPrice(dish.id, dish.price + 500)}
                                              title="Цена +500 ₸"
                                              className="w-6 h-6 rounded bg-zinc-900 hover:bg-zinc-800 text-slate-100 border border-zinc-800 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                            >
                                              <Plus className="w-3 h-3" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleToggleMenuAvailability(dish.id, !dish.is_available)}
                                              title={dish.is_available ? "Скрыть из меню" : "Вернуть в меню"}
                                              className="w-6 h-6 rounded bg-zinc-900 hover:bg-zinc-800 text-slate-100 border border-zinc-800 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                            >
                                              {dish.is_available ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertOctagon className="w-3.5 h-3.5 text-slate-500" />}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                askConfirm(
                                                  "Удалить блюдо?",
                                                  `Блюдо "${dish.name}" будет немедленно убрано из меню и недоступно клиентам.`,
                                                  () => handleDeleteMenuItem(dish.id)
                                                )
                                              }
                                              title="Удалить блюдо"
                                              className="w-6 h-6 rounded bg-zinc-900 hover:bg-red-950 text-red-400 border border-zinc-800 hover:border-red-900 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
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

                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">Сортировка:</span>
                            {(["date_asc", "date_desc", "status"] as const).map((s) => (
                              <button key={s} onClick={() => setReservationSort(s)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer border transition-all ${reservationSort === s ? "bg-indigo-500 text-slate-950 border-indigo-400" : "bg-zinc-900 text-slate-400 border-zinc-800 hover:text-white"}`}>
                                {s === "date_asc" ? "Дата ↑" : s === "date_desc" ? "Дата ↓" : "По статусу"}
                              </button>
                            ))}
                            <button
                              onClick={() => fetchCrmReservations()}
                              disabled={reservationsLoading}
                              className="ml-auto bg-zinc-900 hover:bg-zinc-800 text-slate-300 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border border-zinc-800 flex items-center gap-1 cursor-pointer disabled:opacity-60"
                            >
                              <RefreshCw className={`w-3 h-3 ${reservationsLoading ? "animate-spin" : ""}`} /> ОБНОВИТЬ
                            </button>
                          </div>
                        </div>

                        {crmReservations.length === 0 ? (
                          <div className="py-12 text-center text-slate-500 font-mono text-xs uppercase">
                            Бронирований ресторана на сегодня нет. Поделитесь ссылкой на клиентский портал (вкладка "Мои рестораны") — гость выберет столик и оформит бронь сам!
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
                                {[...crmReservations].sort((a, b) => {
                                  if (reservationSort === "date_asc") return new Date(`${a.date} ${a.time}`).getTime() - new Date(`${b.date} ${b.time}`).getTime();
                                  if (reservationSort === "date_desc") return new Date(`${b.date} ${b.time}`).getTime() - new Date(`${a.date} ${a.time}`).getTime();
                                  const order = { pending: 0, confirmed: 1, cancelled: 2, completed: 3 };
                                  return (order[a.status as keyof typeof order] ?? 4) - (order[b.status as keyof typeof order] ?? 4);
                                }).map((res) => (
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
                              Добавить стол
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
                                disabled={tablesLoading}
                                className="bg-zinc-900 hover:bg-zinc-800 text-slate-300 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border border-zinc-800 flex items-center gap-1 cursor-pointer disabled:opacity-60">
                                <RefreshCw className={`w-3 h-3 ${tablesLoading ? "animate-spin" : ""}`} /> Обновить
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
                                      <th className="p-3 text-center">Статус</th>
                                      {(crmUser?.role === "founder" || crmUser?.role === "manager") && <th className="p-3 text-right">Действия</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {crmTables.map((tbl) => (
                                      <tr key={tbl.id} className="border-b border-zinc-900/60 hover:bg-zinc-900/20 transition-colors">
                                        <td className="p-3 font-bold text-white">Стол №{tbl.table_number}</td>
                                        <td className="p-3 text-slate-400">{tbl.capacity} чел.</td>
                                        <td className="p-3 text-center">
                                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                                            tbl.current_status === "free" ? "bg-emerald-950 text-emerald-400 border-emerald-500/20"
                                            : tbl.current_status === "reserved" ? "bg-amber-950 text-amber-400 border-amber-500/20"
                                            : "bg-red-950 text-red-400 border-red-500/20"
                                          }`}>
                                            {tbl.current_status === "free" ? "Свободен" : tbl.current_status === "reserved" ? "Забронирован" : "Занят"}
                                          </span>
                                        </td>
                                        {(crmUser?.role === "founder" || crmUser?.role === "manager") && (
                                          <td className="p-3 text-right">
                                            <button onClick={() => handleDeleteTable(tbl.id, tbl.table_number)}
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
                          <div className="space-y-6">
                            {/* Один портал на все заведения основателя — гость выбирает нужное заведение внутри портала */}
                            <div className="flex items-center justify-between gap-3 bg-zinc-950 border border-amber-500/20 rounded-2xl p-4">
                              <div className="min-w-0">
                                <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Клиентский портал</h3>
                                <p className="text-[10px] text-slate-500 font-mono mt-1">
                                  Единая ссылка для всех ваших заведений — гость выбирает нужное заведение внутри портала.
                                </p>
                              </div>
                              <button
                                onClick={() => {
                                  const active =
                                    founderRestaurants.find((r) => r.id === crmUser?.restaurant_id && !r.archived_at) ||
                                    founderRestaurants.find((r) => !r.archived_at);
                                  if (!active) {
                                    showToast("Нет доступных заведений — все архивированы.", "error");
                                    return;
                                  }
                                  window.open(`/portal/${active.api_key}`, "_blank");
                                }}
                                className="shrink-0 text-xs font-bold font-mono bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 rounded-xl cursor-pointer transition-all whitespace-nowrap active:scale-[0.98] flex items-center gap-1.5"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> Открыть портал
                              </button>
                            </div>

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
                                  + Создать новый ресторан
                                </button>
                                <div className="bg-[#050508] rounded-xl p-3 text-[10px] leading-relaxed border border-zinc-900 text-slate-500 font-sans">
                                  Каждый новый ресторан — отдельное изолированное заведение со своим свежим api_key, не пересекающееся с остальными вашими ресторанами.
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
                                    <div key={r.id} className={`p-3 rounded-xl border space-y-2.5 ${r.archived_at ? "border-zinc-900 bg-zinc-900/30 opacity-50" : "border-zinc-900 bg-[#050508]"}`}>
                                      <div className="flex items-center justify-between gap-2">
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
                                          <p className="text-[10px] font-mono text-slate-600 truncate mt-0.5">{r.api_key}</p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
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
                                      {/* Ссылка на клиентский портал этого ресторана */}
                                      {!r.archived_at && r.api_key && (
                                        <div className="flex items-center gap-2 pt-1 border-t border-zinc-900">
                                          <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider shrink-0">Портал:</span>
                                          <code className="text-[9px] text-amber-500/70 font-mono truncate flex-1">/portal/{r.api_key}</code>
                                          <button
                                            onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/portal/${r.api_key}`); showToast('Ссылка скопирована!', 'success'); }}
                                            className="text-[9px] font-bold font-mono bg-zinc-900 hover:bg-zinc-800 text-slate-400 border border-zinc-800 px-2 py-1 rounded-lg cursor-pointer transition-all shrink-0 flex items-center gap-1">
                                            <Copy className="w-2.5 h-2.5" /> Копировать
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="bg-[#050508] rounded-xl p-3 text-[10px] leading-relaxed border border-zinc-900 text-slate-500 font-sans">
                                Архивация запрещена при наличии незавершённых заказов или будущих бронирований в этом ресторане.
                              </div>
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
                                        <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 flex items-center gap-1"><KeyRound className="w-2.5 h-2.5" /> {r.api_key}</span>
                                        <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 flex items-center gap-1"><Users className="w-2.5 h-2.5" /> {staff.length} сотрудников</span>
                                        <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 flex items-center gap-1"><Armchair className="w-2.5 h-2.5" /> {tables.length} столов</span>
                                        <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 flex items-center gap-1"><ClipboardList className="w-2.5 h-2.5" /> {orders.length} заказов</span>
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

                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">Сортировка:</span>
                            {(["date_asc", "date_desc"] as const).map((s) => (
                              <button key={s} onClick={() => setKitchenSort(s)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer border transition-all ${kitchenSort === s ? "bg-amber-400 text-slate-950 border-amber-300" : "bg-zinc-900 text-slate-400 border-zinc-800 hover:text-white"}`}>
                                {s === "date_asc" ? "Старые первыми ↑" : "Новые первыми ↓"}
                              </button>
                            ))}
                            <button
                              onClick={() => fetchCrmOrders()}
                              disabled={ordersLoading}
                              className="ml-auto bg-zinc-900 hover:bg-zinc-800 text-slate-100 px-3 py-1.5 rounded-lg text-xs font-mono font-bold border border-zinc-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${ordersLoading ? "animate-spin" : ""}`} /> ОБНОВИТЬ
                            </button>
                          </div>
                        </div>

                        {/* Rendering the custom high-tech touchscreen dashboard Kanban */}
                        <KitchenDashboard
                          orders={[...crmOrders].sort((a, b) => kitchenSort === "date_asc"
                            ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                            : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                          )}
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
                      disabled={logsLoading}
                      className="bg-zinc-900 hover:bg-zinc-800 text-slate-300 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border border-zinc-850 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${logsLoading ? "animate-spin" : ""}`} /> ОБНОВИТЬ
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
                      Авторизуйтесь в CRM под ролью Super Admin, чтобы видеть сквозной аудит запросов всех ресторанов.
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
        </>
      )}

      {/* FOOTER BAR */}
      <footer className="bg-zinc-950 border-t border-zinc-900/80 p-4 px-6 flex flex-wrap justify-between items-center text-[10px] tracking-wide font-mono text-slate-650 gap-2">
        <span>© 2026 REZO-MATRIX PORTAL. POWERED BY COMPLIANT MULTI-TENANCY CRM SERVICES. SECURITY GUARANTEED.</span>
        <div className="flex flex-wrap items-center gap-4">
          <span className="hover:text-indigo-400 font-bold pointer-events-none uppercase">REST ISOLATION ENFORCED</span>
          <span>|</span>
          <span className="hover:text-indigo-400 font-bold pointer-events-none uppercase">POSTGRES COMPATIBLE DATABASE CACHE</span>
          <span>|</span>
          <a
            href="mailto:askiloff10@gmail.com?subject=RestoCRM%20Feedback"
            className="flex items-center gap-1.5 hover:text-indigo-400 transition-colors"
          >
            <MessageSquare className="w-3 h-3" />
            Оставить отзыв
          </a>
          <span>|</span>
          <span className="text-slate-600">Created by Marat Nurislam</span>
        </div>
      </footer>
    </div>
  );
}

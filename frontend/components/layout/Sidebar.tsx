"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  BarChart3,
  UtensilsCrossed,
  LayoutGrid,
  Users,
  TrendingUp,
  Settings,
  LogOut,
  CalendarDays,
  ChefHat,
  UserCog,
  BookOpen,
  ChevronDown,
  Check,
  Menu,
  X,
  Shield,
} from "lucide-react";
import { switchRestaurant } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/dashboard/analytics", label: "Аналитика", icon: BarChart3, module: "analytics" },
  { href: "/dashboard/menu", label: "Меню и Кухня", icon: UtensilsCrossed, module: "menu" },
  { href: "/dashboard/hall", label: "Зал", icon: LayoutGrid, module: "hall" },
  { href: "/dashboard/staff", label: "Персонал", icon: Users, module: "staff" },
  { href: "/dashboard/marketing", label: "Маркетинг", icon: TrendingUp, module: "marketing" },
  { href: "/dashboard/reservations", label: "Бронирования", icon: CalendarDays, module: "reservations" },
  { href: "/dashboard/orders", label: "Кухня / Заказы", icon: ChefHat, module: "orders" },
  { href: "/dashboard/employees", label: "Сотрудники", icon: UserCog, module: "employees" },
  { href: "/dashboard/menu-editor", label: "Редактор меню", icon: BookOpen, module: "menu-editor" },
];

interface SidebarProps {
  restaurantName: string;
  enabledModules: string[];
  primaryColor: string;
}

export default function Sidebar({ restaurantName, enabledModules, primaryColor }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const [userRole, setUserRole] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<Array<{ id: string; name: string; api_key: string }>>([]);
  const [activeRestaurantId, setActiveRestaurantId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return;
      const user = JSON.parse(raw);
      setUserRole(user.role ?? null);
      setRestaurants(user.restaurants ?? []);
      setActiveRestaurantId(user.restaurant_id ?? null);
    } catch { /* ignore */ }
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  }

  async function handleSwitch(restaurantId: string) {
    if (restaurantId === activeRestaurantId || switching) return;
    setSwitching(true);
    setDropdownOpen(false);
    try {
      const data = await switchRestaurant(restaurantId);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  }

  const visibleItems = NAV_ITEMS.filter((item) => enabledModules.includes(item.module));
  const canSwitchRestaurant = userRole === "founder" && restaurants.length > 1;
  const activeRestaurant = restaurants.find((r) => r.id === activeRestaurantId);

  return (
    <>
      {/* Mobile hamburger trigger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 lg:hidden bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-zinc-400 hover:text-white transition"
        aria-label="Открыть меню"
      >
        <Menu size={18} />
      </button>

      {/* Backdrop overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50 lg:z-auto
          w-60 flex-shrink-0 h-screen flex flex-col bg-zinc-900 border-r border-zinc-800
          transition-transform duration-200 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Логотип / Название */}
        <div className="px-5 py-5 border-b border-zinc-800 relative">
          {/* Mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute top-3 right-3 lg:hidden text-zinc-400 hover:text-white transition"
            aria-label="Закрыть меню"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              {restaurantName.charAt(0).toUpperCase()}
            </div>
            <span className="text-white font-semibold text-sm truncate">{restaurantName}</span>
          </div>
          <p className="text-zinc-500 text-xs mt-1 ml-11">Dashboard</p>

          {/* Переключатель ресторана для founder с несколькими ресторанами */}
          {canSwitchRestaurant && (
            <div className="mt-3 relative">
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                disabled={switching}
                className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition"
              >
                <span className="truncate">{activeRestaurant?.name ?? restaurantName}</span>
                <ChevronDown size={12} className={`flex-shrink-0 ml-1 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {dropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden z-50 shadow-xl">
                  {restaurants.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => handleSwitch(r.id)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-zinc-700 transition text-left"
                    >
                      <span className={`truncate ${r.id === activeRestaurantId ? "text-white font-medium" : "text-zinc-400"}`}>
                        {r.name}
                      </span>
                      {r.id === activeRestaurantId && <Check size={12} className="text-indigo-400 flex-shrink-0 ml-1" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Навигация */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
                style={active ? { backgroundColor: primaryColor + "22", color: primaryColor } : {}}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Нижние ссылки */}
        <div className="px-3 pb-4 border-t border-zinc-800 pt-3 space-y-1">
          {userRole === "super_admin" && (
            <Link
              href="/dashboard/super-admin"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                pathname.startsWith("/dashboard/super-admin")
                  ? "text-amber-400 bg-amber-500/10"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              <Shield size={16} />
              Super Admin
            </Link>
          )}
          <Link
            href="/dashboard/settings"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <Settings size={16} />
            Настройки
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
          >
            <LogOut size={16} />
            Выйти
          </button>
        </div>
      </aside>
    </>
  );
}

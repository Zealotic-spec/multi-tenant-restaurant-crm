"use client";

import { useEffect, useState, CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import { getRestaurantSettings, type RestaurantSettings } from "@/lib/api";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [restaurantName, setRestaurantName] = useState("Мой Ресторан");

  useEffect(() => {
    // Проверяем авторизацию
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    // Читаем имя ресторана из JWT payload (decode без библиотек)
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.restaurant_name) setRestaurantName(payload.restaurant_name);
    } catch {}

    // Загружаем настройки бренда
    getRestaurantSettings()
      .then(setSettings)
      .catch(() => {
        // Настроек нет — используем дефолтные
        setSettings({
          primary_color: "#6366F1",
          logo_url: null,
          font_family: "Inter",
          enabled_modules: ["analytics", "menu", "hall", "staff", "marketing"],
        });
      });
  }, [router]);

  if (!settings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f13]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const themeStyle = {
    "--color-primary": settings.primary_color,
    "--font-family": settings.font_family,
  } as CSSProperties;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0f13]" style={themeStyle}>
      <Sidebar
        restaurantName={restaurantName}
        enabledModules={settings.enabled_modules}
        primaryColor={settings.primary_color}
      />
      <main className="flex-1 overflow-y-auto pt-12 lg:pt-0">{children}</main>
    </div>
  );
}

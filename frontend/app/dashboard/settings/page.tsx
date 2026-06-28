"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Save, Check, MessageCircle, Mail, Webhook, Send } from "lucide-react";
import {
  getRestaurantSettings,
  updateRestaurantSettings,
  getIikoStatus,
  saveIikoCredentials,
  triggerSync,
  getNotificationSettings,
  saveNotificationSettings,
  testNotification,
  type RestaurantSettings,
  type IikoStatus,
  type NotificationSettings,
} from "@/lib/api";

export default function SettingsPage() {
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [iiko, setIiko] = useState<IikoStatus | null>(null);
  const [apiLogin, setApiLogin] = useState("");
  const [orgIds, setOrgIds] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6366F1");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // ── Уведомления ──
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [reminderHours, setReminderHours] = useState(2);
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [twilioFrom, setTwilioFrom] = useState("");
  const [resendKey, setResendKey] = useState("");
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ channel: string; success: boolean; error?: string } | null>(null);
  const [savingNotif, setSavingNotif] = useState(false);

  useEffect(() => {
    Promise.all([getRestaurantSettings(), getIikoStatus(), getNotificationSettings()])
      .then(([s, i, n]) => {
        setSettings(s);
        setIiko(i);
        setPrimaryColor(s.primary_color);
        if (i.api_login) setApiLogin(i.api_login);
        if (i.organization_ids.length > 0) setOrgIds(i.organization_ids.join(", "));

        setNotifSettings(n);
        setWhatsappEnabled(n.whatsapp_enabled);
        setEmailEnabled(n.email_enabled);
        setWebhookUrl(n.webhook_url ?? "");
        setReminderHours(n.reminder_hours);
        setTwilioSid(n.twilio_account_sid ?? "");
        setTwilioFrom(n.twilio_from ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);

  async function handleSaveNotifications() {
    setSavingNotif(true);
    setError("");
    try {
      await saveNotificationSettings({
        whatsapp_enabled: whatsappEnabled,
        email_enabled: emailEnabled,
        webhook_url: webhookUrl || null,
        reminder_hours: reminderHours,
        // Секреты отправляем только если пользователь их ввёл — пустое поле не затирает сохранённый ключ.
        ...(twilioSid && { twilio_account_sid: twilioSid }),
        ...(twilioToken && { twilio_auth_token: twilioToken }),
        ...(twilioFrom && { twilio_from: twilioFrom }),
        ...(resendKey && { resend_api_key: resendKey }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // Перечитываем, чтобы поля-секреты вернулись как обновлённые маски.
      const fresh = await getNotificationSettings();
      setNotifSettings(fresh);
      setTwilioToken("");
      setResendKey("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSavingNotif(false);
    }
  }

  async function handleTest(channel: "whatsapp" | "email" | "webhook", target?: string) {
    setTestingChannel(channel);
    setTestResult(null);
    try {
      const result = await testNotification(channel, target);
      setTestResult({ channel, success: result.success, error: result.error });
    } catch (e) {
      setTestResult({ channel, success: false, error: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setTestingChannel(null);
      setTimeout(() => setTestResult(null), 3000);
    }
  }

  async function handleSaveSettings() {
    setSaving(true);
    setError("");
    try {
      await updateRestaurantSettings({ primary_color: primaryColor });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveIiko() {
    setSaving(true);
    setError("");
    try {
      const ids = orgIds.split(",").map((s) => s.trim()).filter(Boolean);
      await saveIikoCredentials({ api_login: apiLogin, organization_ids: ids });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      const updated = await getIikoStatus();
      setIiko(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError("");
    try {
      await triggerSync();
      const updated = await getIikoStatus();
      setIiko(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка синка");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-white">Настройки</h1>
        <p className="text-zinc-400 text-sm mt-0.5">iiko интеграция и бренд ресторана</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* iiko */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold">iiko / iikoCloud</h2>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            iiko?.connected
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-zinc-800 text-zinc-400"
          }`}>
            {iiko?.connected ? "Подключено" : "Не подключено"}
          </span>
        </div>

        {iiko?.last_sync_at && (
          <p className="text-zinc-500 text-xs">
            Последний синк: {new Date(iiko.last_sync_at).toLocaleString("ru")}
          </p>
        )}

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">apiLogin (ключ iikoCloud)</label>
          <input
            type="text"
            value={apiLogin}
            onChange={(e) => setApiLogin(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
            placeholder="Введите ваш apiLogin из личного кабинета iiko"
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Organization IDs (через запятую)</label>
          <input
            type="text"
            value={orgIds}
            onChange={(e) => setOrgIds(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
            placeholder="uuid1, uuid2, ..."
          />
          <p className="text-zinc-600 text-xs mt-1">
            UUID точек из вашего аккаунта iiko. Оставьте пустым — загрузятся все.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSaveIiko}
            disabled={saving || !apiLogin}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg transition"
          >
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? "Сохранено" : "Сохранить"}
          </button>

          <button
            onClick={handleSync}
            disabled={syncing || !iiko?.connected}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-300 text-sm rounded-lg transition"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            Синхронизировать сейчас
          </button>
        </div>
      </section>

      {/* Бренд */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-white font-semibold">Бренд и тема</h2>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">Основной цвет</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer bg-zinc-800 border border-zinc-700 p-0.5"
            />
            <span className="text-zinc-300 text-sm font-mono">{primaryColor}</span>
          </div>
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg transition"
        >
          {saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? "Сохранено" : "Сохранить тему"}
        </button>
      </section>

      {/* Уведомления для гостей */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <h2 className="text-white font-semibold">Уведомления для гостей</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-medium">Beta</span>
        </div>

        {/* ── WhatsApp ── */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <button
              type="button"
              onClick={() => setWhatsappEnabled((v) => !v)}
              className="flex items-start gap-3 text-left"
            >
              <span
                className={`relative mt-0.5 w-11 h-6 rounded-full transition shrink-0 ${
                  whatsappEnabled ? "bg-emerald-600" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    whatsappEnabled ? "translate-x-5" : ""
                  }`}
                />
              </span>
              <span>
                <span className="flex items-center gap-2 text-white text-sm font-medium">
                  <MessageCircle size={15} className="text-emerald-400" /> WhatsApp уведомления
                </span>
                <span className="block text-zinc-500 text-xs mt-0.5">
                  Гость получит подтверждение и напоминание
                </span>
              </span>
            </button>

            <button
              onClick={() => handleTest("whatsapp")}
              disabled={testingChannel === "whatsapp"}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-xs rounded-lg transition shrink-0"
            >
              <Send size={12} className={testingChannel === "whatsapp" ? "animate-pulse" : ""} />
              Тест
            </button>
          </div>

          {whatsappEnabled && (
            <div className="space-y-3 pl-14">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Twilio Account SID</label>
                <input
                  type="text"
                  value={twilioSid}
                  onChange={(e) => setTwilioSid(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                  placeholder="ACxxxx... — оставьте пустым для системного аккаунта"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Twilio Auth Token</label>
                <input
                  type="password"
                  value={twilioToken}
                  onChange={(e) => setTwilioToken(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                  placeholder={notifSettings?.twilio_auth_token_masked ?? "Введите Auth Token"}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">Номер отправителя</label>
                <input
                  type="text"
                  value={twilioFrom}
                  onChange={(e) => setTwilioFrom(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                  placeholder="whatsapp:+14155238886"
                />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800" />

        {/* ── Email ── */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <button
              type="button"
              onClick={() => setEmailEnabled((v) => !v)}
              className="flex items-start gap-3 text-left"
            >
              <span
                className={`relative mt-0.5 w-11 h-6 rounded-full transition shrink-0 ${
                  emailEnabled ? "bg-indigo-600" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    emailEnabled ? "translate-x-5" : ""
                  }`}
                />
              </span>
              <span>
                <span className="flex items-center gap-2 text-white text-sm font-medium">
                  <Mail size={15} className="text-indigo-400" /> Email уведомления
                </span>
                <span className="block text-zinc-500 text-xs mt-0.5">
                  Письмо гостю, если указан e-mail при брони
                </span>
              </span>
            </button>

            <button
              onClick={() => handleTest("email")}
              disabled={testingChannel === "email"}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-xs rounded-lg transition shrink-0"
            >
              <Send size={12} className={testingChannel === "email" ? "animate-pulse" : ""} />
              Тест
            </button>
          </div>

          {emailEnabled && (
            <div className="space-y-2 pl-14">
              <label className="block text-xs text-zinc-400 mb-1.5">Resend API Key</label>
              <input
                type="password"
                value={resendKey}
                onChange={(e) => setResendKey(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
                placeholder={notifSettings?.resend_api_key_masked ?? "re_xxxxxxxx"}
              />
              <p className="text-zinc-600 text-xs">
                Получить ключ на{" "}
                <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                  resend.com
                </a>{" "}
                — 3000 писем/месяц бесплатно.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800" />

        {/* ── Webhook ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-white text-sm font-medium">
              <Webhook size={15} className="text-amber-400" /> Webhook URL
            </label>
            <button
              onClick={() => handleTest("webhook", webhookUrl)}
              disabled={testingChannel === "webhook"}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-xs rounded-lg transition shrink-0"
            >
              <Send size={12} className={testingChannel === "webhook" ? "animate-pulse" : ""} />
              Тест
            </button>
          </div>
          <input
            type="text"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition"
            placeholder="https://your-n8n.com/webhook/bookings"
          />
          <p className="text-zinc-600 text-xs">
            Совместим с n8n, Zapier, Make. Мы отправим POST при каждом событии брони.
          </p>
        </div>

        <div className="border-t border-zinc-800" />

        {/* ── Напоминание за ── */}
        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">Напоминание за</label>
          <select
            value={reminderHours}
            onChange={(e) => setReminderHours(Number(e.target.value))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 transition"
          >
            {[1, 2, 3, 6, 24].map((h) => (
              <option key={h} value={h}>
                {h} {h === 1 ? "час" : h < 5 ? "часа" : "часов"} до визита
              </option>
            ))}
          </select>
        </div>

        {/* ── Результат теста ── */}
        {testResult !== null && (
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              testResult.success
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                : "bg-red-500/10 border border-red-500/30 text-red-400"
            }`}
          >
            {testResult.success ? "Тест отправлен успешно ✓" : `Ошибка: ${testResult.error ?? "не удалось отправить"}`}
          </div>
        )}

        <button
          onClick={handleSaveNotifications}
          disabled={savingNotif}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg transition"
        >
          {savingNotif ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          {savingNotif ? "Сохранение..." : "Сохранить настройки уведомлений"}
        </button>
      </section>
    </div>
  );
}
